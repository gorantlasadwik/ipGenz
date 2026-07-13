/**
 * RingBuffer — Circular in-memory buffer for live channel output.
 *
 * HOW YOUTUBE/HOTSTAR/TWITCH WORK (adapted for IPTV):
 *
 *   CDN platforms pre-cache segments. When you open a channel, you download
 *   the last few segments at full network speed (burst), building 6-10 seconds
 *   of buffer quickly. Playback then runs at 1x, download continues at 1x.
 *
 *   For IPTV, the provider sends a real-time burst of ~20-30s when you first
 *   connect. Our ring buffer stores this. When a browser subscriber joins,
 *   we send only the MOST RECENT 6MB (last ~6s at 8Mbps) as a burst fill.
 *   This builds the browser buffer quickly WITHOUT overflowing the MSE buffer.
 *
 * WHY WE LIMIT THE BURST TO 6MB (NOT ALL 16MB):
 *   - Chrome's MSE SourceBuffer has a ~12MB hard limit per stream
 *   - Sending 16MB causes Chrome to immediately evict old segments → "going back" jitter
 *   - 6MB = ~6s at 8Mbps: enough to fill browser buffer, not enough to overflow MSE
 *
 * WHY WE HAVE A clear() METHOD:
 *   When FFmpeg respawns, it resets timestamps to 0. Old cached data has
 *   timestamps 0→16s. New data would also start at 0→Xs. This creates a
 *   timestamp discontinuity in the ring buffer. Calling clear() before
 *   the new FFmpeg instance produces output prevents serving discontinuous data.
 */

import { PassThrough } from 'stream';
import { Logger } from '@nestjs/common';

/** How many bytes to burst-fill to new subscribers. ~6s at 8Mbps. */
const BURST_FILL_BYTES = 6 * 1024 * 1024;

export class RingBuffer {
  private readonly logger = new Logger('RingBuffer');

  private readonly buf: Buffer;
  private writePos = 0;
  private totalWritten = 0;
  private readonly subscribers = new Set<PassThrough>();
  private destroyed = false;

  constructor(private readonly capacityBytes = 16 * 1024 * 1024) {
    this.buf = Buffer.alloc(capacityBytes);
  }

  /**
   * Write a chunk into the ring. Fan-out to all live subscribers.
   */
  write(chunk: Buffer): void {
    if (this.destroyed) return;
    if (chunk.length === 0) return;

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
   * Reset the ring buffer. Called when FFmpeg respawns to prevent serving
   * data with timestamp discontinuities (old timestamps mixed with new 0-based timestamps).
   */
  clear(): void {
    this.writePos = 0;
    this.totalWritten = 0;
    this.logger.log('[RingBuffer] Cleared (FFmpeg respawn — preventing timestamp discontinuity).');
  }

  /**
   * Subscribe a new browser client.
   *
   * Burst-fills the subscriber with the most recent BURST_FILL_BYTES of cached data
   * (not the entire ring buffer — that would overflow Chrome's MSE SourceBuffer).
   * Then adds to live fan-out for all future writes.
   */
  addSubscriber(): PassThrough {
    const pt = new PassThrough({ highWaterMark: 4 * 1024 * 1024 });

    // Burst fill: most recent BURST_FILL_BYTES only
    const cached = this.readLast(BURST_FILL_BYTES);
    if (cached.length > 0) {
      this.logger.log(
        `[RingBuffer] New subscriber — burst filling ${(cached.length / 1024).toFixed(0)}KB of recent cache`
      );
      pt.write(cached);
    }

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
   * Read the most recent `bytes` bytes from the ring buffer.
   * Returns data in temporal order (oldest → newest within the requested window).
   *
   * This is safer than readAll() because:
   * - It never exceeds Chrome's MSE SourceBuffer size limit
   * - It always returns the most RECENT data (closest to live edge)
   * - Old stale data is naturally excluded
   */
  private readLast(bytes: number): Buffer {
    const available = Math.min(this.totalWritten, this.capacityBytes);
    if (available === 0) return Buffer.alloc(0);

    const toRead = Math.min(bytes, available);

    if (this.totalWritten <= this.capacityBytes) {
      // Buffer hasn't wrapped — data lives at [0, writePos)
      // Take the last `toRead` bytes from that
      const start = Math.max(0, this.writePos - toRead);
      return Buffer.from(this.buf.slice(start, this.writePos));
    } else {
      // Buffer has wrapped — most recent data ends just before writePos
      // (writePos is where we write NEXT, so [writePos-1] is the newest byte)
      if (toRead <= this.writePos) {
        // All requested data is in the region [writePos-toRead, writePos)
        return Buffer.from(this.buf.slice(this.writePos - toRead, this.writePos));
      } else {
        // Need to wrap around: take from end + beginning
        const fromEnd = toRead - this.writePos;
        const startInEnd = this.capacityBytes - fromEnd;
        const part1 = Buffer.from(this.buf.slice(startInEnd));   // end of ring (older)
        const part2 = Buffer.from(this.buf.slice(0, this.writePos)); // start of ring (newer)
        return Buffer.concat([part1, part2]);
      }
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
