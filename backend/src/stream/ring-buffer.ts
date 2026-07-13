/**
 * RingBuffer — Circular in-memory buffer for live channel output.
 *
 * Decouples provider reconnects from browser delivery.
 * Multiple browser clients can subscribe independently.
 * Each subscriber gets a PassThrough that is continuously fed
 * from the current write position onwards.
 *
 * Capacity: configurable, default 10MB (~10s of 8Mbps video).
 */

import { PassThrough } from 'stream';
import { Logger } from '@nestjs/common';

export class RingBuffer {
  private readonly logger = new Logger('RingBuffer');
  private readonly buf: Buffer;
  private writePos = 0;
  private totalWritten = 0;
  private readonly subscribers = new Set<PassThrough>();
  private destroyed = false;

  /** capacityBytes: total ring size in bytes (default 10MB) */
  constructor(private readonly capacityBytes = 10 * 1024 * 1024) {
    this.buf = Buffer.alloc(capacityBytes);
  }

  /**
   * Write a chunk into the ring. Fan-out to all live subscribers.
   */
  write(chunk: Buffer): void {
    if (this.destroyed) return;
    if (chunk.length === 0) return;

    // Write into ring (wrapping around)
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

    // Fan-out to all subscribers
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
   * Returns a PassThrough that will receive all future data.
   */
  addSubscriber(): PassThrough {
    const pt = new PassThrough({ highWaterMark: 2 * 1024 * 1024 });
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

  /** Total bytes written since creation (for bitrate monitoring). */
  get bytesWritten(): number {
    return this.totalWritten;
  }

  /** Estimated buffered seconds based on recent throughput. */
  getBufferedBytes(): number {
    return Math.min(this.totalWritten, this.capacityBytes);
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
