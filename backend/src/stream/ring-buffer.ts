/**
 * RingBuffer — Circular in-memory buffer for live channel output.
 *
 * HOW YOUTUBE/HOTSTAR/TWITCH WORK (and how we replicate it):
 *
 *   CDN platforms store video segments on edge servers. When you open a
 *   channel, you download 10-30 seconds of pre-encoded segments at full
 *   network speed (e.g., 50 Mbps download for 8 Mbps video = 6x faster).
 *   This fills the browser buffer in ~2 seconds, then playback starts.
 *   Live data continues at 1x speed, maintaining the buffer.
 *
 *   For IPTV, the provider keeps a rolling cache of the last 20-30 seconds.
 *   When our worker connects, the provider sends that cache at full network
 *   speed. We store it in this ring buffer.
 *
 *   CRITICAL: When a new browser subscribes, we FIRST send it ALL the
 *   cached data from the ring buffer (the provider's historical cache burst)
 *   at full network speed. This fills the browser buffer in 1-2 seconds.
 *   Then we continue feeding live data at 1x speed.
 *
 *   Result: Browser starts with 8-15 seconds of buffer. Playback is smooth.
 *   Provider reconnects are absorbed by the buffer — browser never knows.
 *
 * Capacity: 16MB default (~16s at 8Mbps, ~8s at 16Mbps).
 */

import { PassThrough } from 'stream';
import { Logger } from '@nestjs/common';

export class RingBuffer {
  private readonly logger = new Logger('RingBuffer');

  /** The underlying circular buffer. */
  private readonly buf: Buffer;

  /** Current write position (next byte goes here). */
  private writePos = 0;

  /** Total bytes ever written. Used to know if buffer has wrapped. */
  private totalWritten = 0;

  /** Active subscribers — only receive live data going forward. */
  private readonly subscribers = new Set<PassThrough>();

  private destroyed = false;

  /** capacityBytes: total ring size. Default 16MB. */
  constructor(private readonly capacityBytes = 16 * 1024 * 1024) {
    this.buf = Buffer.alloc(capacityBytes);
  }

  /**
   * Write a chunk into the ring. Fan-out to all live subscribers.
   */
  write(chunk: Buffer): void {
    if (this.destroyed) return;
    if (chunk.length === 0) return;

    // Write into ring (wrapping around if needed)
    let remaining = chunk.length;
    let srcOffset = 0;
    while (remaining > 0) {
      const space = this.capacityBytes - this.writePos;
      const toWrite = Math.min(remaining, space);
      chunk.copy(this.buf, this.writePos, srcOffset, srcOffset + toWrite);
      this.writePos = (this.writePos + toWrite) % this.capacityBytes;
      srcOffset += toWrite;
      remaining -= toWrite;
    }
    this.totalWritten += chunk.length;

    // Fan-out to all live subscribers
    for (const sub of this.subscribers) {
      if (!sub.destroyed && sub.writable) {
        try {
          sub.write(chunk);
        } catch (_) {
          this.subscribers.delete(sub);
        }
      } else {
        this.subscribers.delete(sub);
      }
    }
  }

  /**
   * Subscribe a new browser client.
   *
   * Strategy: Immediately send all cached ring buffer contents (provider burst)
   * at full network speed, then continue with live data.
   *
   * This gives the browser a head start — it receives 8-15 seconds of video
   * data much faster than real-time, fills its buffer, then playback begins.
   */
  addSubscriber(): PassThrough {
    const pt = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });

    // ── BURST FILL: Replay cached ring buffer contents ─────────────────────
    // Send all buffered data immediately (at network speed).
    // This is equivalent to a CDN edge cache dump — the browser gets
    // 8-15 seconds of pre-buffered video in 1-2 seconds of real time.
    const cached = this.readAll();
    if (cached.length > 0) {
      this.logger.log(
        `[RingBuffer] New subscriber — replaying ${(cached.length / 1024).toFixed(0)}KB of cached data (burst fill)`
      );
      // Write synchronously — the PassThrough internal buffer accepts it
      // and the browser will drain it at maximum network speed
      pt.write(cached);
    }

    // Now add to live fan-out for future writes
    this.subscribers.add(pt);
    pt.on('close', () => this.subscribers.delete(pt));
    pt.on('error', () => this.subscribers.delete(pt));

    this.logger.log(`[RingBuffer] Subscriber added. Total: ${this.subscribers.size}`);
    return pt;
  }

  removeSubscriber(pt: PassThrough): void {
    this.subscribers.delete(pt);
    try { pt.destroy(); } catch (_) {}
    this.logger.log(`[RingBuffer] Subscriber removed. Total: ${this.subscribers.size}`);
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  get bytesWritten(): number {
    return this.totalWritten;
  }

  getBufferedBytes(): number {
    return Math.min(this.totalWritten, this.capacityBytes);
  }

  /**
   * Read all currently buffered bytes in order (oldest → newest).
   * Returns a Buffer containing the full ring buffer contents.
   *
   * If less than capacityBytes has been written: returns bytes [0, writePos).
   * If fully wrapped: returns bytes [writePos, end] + [0, writePos).
   */
  private readAll(): Buffer {
    if (this.totalWritten === 0) return Buffer.alloc(0);

    if (this.totalWritten <= this.capacityBytes) {
      // Buffer hasn't wrapped yet — return everything from 0 to writePos
      return Buffer.from(this.buf.slice(0, this.writePos));
    } else {
      // Buffer has wrapped — oldest data starts at writePos
      // Return: [writePos → end] + [0 → writePos]
      const part1 = Buffer.from(this.buf.slice(this.writePos));
      const part2 = Buffer.from(this.buf.slice(0, this.writePos));
      return Buffer.concat([part1, part2]);
    }
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const sub of this.subscribers) {
      try { sub.destroy(); } catch (_) {}
    }
    this.subscribers.clear();
    this.logger.log('[RingBuffer] Destroyed.');
  }
}
