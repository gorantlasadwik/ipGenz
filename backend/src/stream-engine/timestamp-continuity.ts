/**
 * Timestamp Continuity Engine — v7
 *
 * THE CORE FIX for "Non-monotonic DTS" and "Stream Connection Lost" errors.
 *
 * Root cause: IPTV providers give ~20-30s session-based streams. When an FFmpeg
 * process reconnects to the provider, the new process resets PTS/DTS to 0 or a
 * small value. The browser MSE SourceBuffer REJECTS non-monotonic timestamps,
 * causing stream disconnections and the "Stream Connection Lost" error.
 *
 * This engine intercepts every MPEG-TS packet from FFmpeg stdout, tracks the
 * last emitted PTS/DTS, and on every respawn applies a computed additive offset
 * so that output timestamps are ALWAYS strictly monotonically increasing,
 * regardless of how many times the provider session expires and reconnects.
 */

import { Logger } from '@nestjs/common';

const MPEG_TS_PACKET_SIZE = 188;
const SYNC_BYTE = 0x47;
const PCR_PID_MASK = 0x1FFF;
const HAS_PCR_FLAG = 0x10;
const PCR_FIELD_FLAG = 0x10;

// 90kHz clock (standard MPEG-TS / PES timestamp resolution)
const TS_CLOCK = 90000n;

// Maximum PTS/DTS value before wrap (33-bit)
const MAX_PTS = 0x1FFFFFFFFn;
const HALF_MAX_PTS = MAX_PTS / 2n;

/**
 * Parses a 33-bit PTS/DTS value from 5 bytes at given offset in a Buffer.
 */
function parsePts(buf: Buffer, offset: number): bigint {
  const b0 = BigInt(buf[offset]);
  const b1 = BigInt(buf[offset + 1]);
  const b2 = BigInt(buf[offset + 2]);
  const b3 = BigInt(buf[offset + 3]);
  const b4 = BigInt(buf[offset + 4]);
  // bits: [2:0] of b0 (upper 3), all of b1, [7:1] of b2, all of b3, [7:1] of b4
  return (
    ((b0 & 0x0En) << 29n) |
    (b1 << 22n) |
    ((b2 & 0xFEn) << 14n) |
    (b3 << 7n) |
    ((b4 & 0xFEn) >> 1n)
  );
}

/**
 * Writes a 33-bit PTS/DTS value into 5 bytes at the given offset.
 * Preserves the marker bits from the original.
 */
function writePts(buf: Buffer, offset: number, pts: bigint, markerBits: number): void {
  pts = pts & MAX_PTS; // clamp to 33 bits
  buf[offset]     = (markerBits & 0xF0) | Number((pts >> 29n) & 0x0En) | 0x01;
  buf[offset + 1] = Number((pts >> 22n) & 0xFFn);
  buf[offset + 2] = Number(((pts >> 14n) & 0xFEn) | 0x01n);
  buf[offset + 3] = Number((pts >> 7n) & 0xFFn);
  buf[offset + 4] = Number(((pts << 1n) & 0xFEn) | 0x01n);
}

export class TimestampContinuityEngine {
  private readonly logger = new Logger('TimestampContinuity');

  /** The additive offset applied to all PTS/DTS in the current session. */
  private ptsOffset: bigint = 0n;

  /** The last PTS/DTS value we emitted (post-offset) — used to compute next offset. */
  private lastEmittedPts: bigint | null = null;

  /** Number of provider reconnects processed. */
  private reconnectCount = 0;

  /** Leftover partial TS packet from previous chunk. */
  private remainder: Buffer = Buffer.alloc(0);

  /**
   * Called when FFmpeg exits (provider EOF / reconnect).
   * Must be called BEFORE the new FFmpeg process starts writing output.
   * Sets the offset so that the first PTS from the new session continues
   * seamlessly from the last emitted PTS.
   * We add a small "gap" (2 frames ≈ 2 * 3003 = 6006 ticks at 29.97fps) to avoid
   * exact timestamp collision while keeping the stream contiguous.
   */
  onRespawn(): void {
    this.reconnectCount++;

    if (this.lastEmittedPts !== null) {
      // We'll detect the first PTS in the new session and compute the real offset then.
      // For now, mark that we need to recompute.
      this.ptsOffset = this.lastEmittedPts + 6006n; // approx 2-frame gap
      this.logger.log(
        `[TCE] Reconnect #${this.reconnectCount}: new offset base = ${this.ptsOffset}`
      );
    }

    // Reset the "first PTS seen in new session" flag
    this._firstPtsInSession = null;
    this.remainder = Buffer.alloc(0);
  }

  private _firstPtsInSession: bigint | null = null;

  /**
   * Processes a raw Buffer of FFmpeg stdout data.
   * Returns a new Buffer with all PTS/DTS timestamps adjusted to be monotonic.
   */
  process(input: Buffer): Buffer {
    // Prepend any leftover bytes from previous call
    const data = this.remainder.length > 0
      ? Buffer.concat([this.remainder, input])
      : input;

    // Find sync byte alignment
    let start = 0;
    while (start < data.length && data[start] !== SYNC_BYTE) start++;

    const output: Buffer[] = [];

    for (let i = start; i + MPEG_TS_PACKET_SIZE <= data.length; i += MPEG_TS_PACKET_SIZE) {
      // Verify packet integrity
      if (data[i] !== SYNC_BYTE) {
        // Lost sync — scan for next sync byte
        let resync = i + 1;
        while (resync < data.length && data[resync] !== SYNC_BYTE) resync++;
        i = resync - MPEG_TS_PACKET_SIZE; // will be incremented by loop
        continue;
      }

      const pkt = Buffer.from(data.slice(i, i + MPEG_TS_PACKET_SIZE));
      this._processPacket(pkt);
      output.push(pkt);
    }

    // Store leftover incomplete packet
    const processed = start + Math.floor((data.length - start) / MPEG_TS_PACKET_SIZE) * MPEG_TS_PACKET_SIZE;
    this.remainder = data.slice(processed);

    return output.length > 0 ? Buffer.concat(output) : Buffer.alloc(0);
  }

  /**
   * Mutates a single 188-byte TS packet in-place, adjusting PES PTS/DTS if present.
   */
  private _processPacket(pkt: Buffer): void {
    // Bytes 1-2: transport_error | payload_start | priority | PID (13 bits)
    const payloadStart = (pkt[1] & 0x40) !== 0;
    const hasAdaptation = (pkt[3] & 0x20) !== 0;
    const hasPayload = (pkt[3] & 0x10) !== 0;

    // Skip adaptation field to find payload start
    let payloadOffset = 4;
    if (hasAdaptation) {
      const adaptLen = pkt[4];
      payloadOffset = 5 + adaptLen;
    }

    if (!hasPayload || !payloadStart || payloadOffset + 9 > MPEG_TS_PACKET_SIZE) return;

    // Check for PES start code: 0x000001
    if (pkt[payloadOffset] !== 0x00 || pkt[payloadOffset + 1] !== 0x00 || pkt[payloadOffset + 2] !== 0x01) return;

    const streamId = pkt[payloadOffset + 3];
    // Only video (0xE0-0xEF) and audio (0xC0-0xDF) PES streams carry PTS/DTS
    const isVideoAudio = (streamId >= 0xC0 && streamId <= 0xDF) || (streamId >= 0xE0 && streamId <= 0xEF);
    if (!isVideoAudio) return;

    const ptsDtsFlags = (pkt[payloadOffset + 7] >> 6) & 0x03;
    const headerDataLen = pkt[payloadOffset + 8];

    let pos = payloadOffset + 9;

    if (ptsDtsFlags === 0x02 || ptsDtsFlags === 0x03) {
      // Has PTS
      if (pos + 5 > MPEG_TS_PACKET_SIZE) return;
      const rawPts = parsePts(pkt, pos);
      const adjustedPts = this._adjustTimestamp(rawPts);
      writePts(pkt, pos, adjustedPts, pkt[pos]);
      this.lastEmittedPts = adjustedPts;
      pos += 5;
    }

    if (ptsDtsFlags === 0x03) {
      // Has DTS
      if (pos + 5 > MPEG_TS_PACKET_SIZE) return;
      const rawDts = parsePts(pkt, pos);
      const adjustedDts = this._adjustTimestamp(rawDts);
      writePts(pkt, pos, adjustedDts, pkt[pos]);
      pos += 5;
    }
  }

  /**
   * Adjusts a raw timestamp from the current FFmpeg session using the computed offset.
   * On the first PTS seen in a new session, calibrates the offset precisely.
   */
  private _adjustTimestamp(rawTs: bigint): bigint {
    if (this._firstPtsInSession === null) {
      // First packet from this FFmpeg session
      this._firstPtsInSession = rawTs;

      if (this.lastEmittedPts === null) {
        // Very first packet ever — no adjustment needed
        this.ptsOffset = 0n;
      } else {
        // Compute exact offset: we want rawTs + offset = lastEmittedPts + gap
        this.ptsOffset = this.lastEmittedPts + 6006n - rawTs;
        this.logger.log(
          `[TCE] Calibrated offset for session ${this.reconnectCount + 1}: ${this.ptsOffset} (rawFirst=${rawTs}, lastEmitted=${this.lastEmittedPts})`
        );
      }
    }

    return rawTs + this.ptsOffset;
  }

  getStats() {
    return {
      reconnectCount: this.reconnectCount,
      ptsOffset: this.ptsOffset.toString(),
      lastEmittedPts: this.lastEmittedPts?.toString() ?? null,
    };
  }

  reset(): void {
    this.ptsOffset = 0n;
    this.lastEmittedPts = null;
    this._firstPtsInSession = null;
    this.reconnectCount = 0;
    this.remainder = Buffer.alloc(0);
  }
}
