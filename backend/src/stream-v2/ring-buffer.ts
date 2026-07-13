import { Logger } from '@nestjs/common';

export interface BufferChunk {
  data: Buffer;
  timestamp: number;
}

export class RingBuffer {
  private readonly logger = new Logger(RingBuffer.name);
  private chunks: BufferChunk[] = [];
  private totalBytes = 0;
  private subscribers = new Set<(chunk: Buffer) => void>();

  constructor(
    private readonly channelId: string,
    private readonly windowMs: number = 45000, // 45 seconds rolling window
  ) {}

  /**
   * Push a chunk of TS data into the buffer.
   */
  push(data: Buffer): void {
    const timestamp = Date.now();
    this.chunks.push({ data, timestamp });
    this.totalBytes += data.length;

    // Prune old chunks
    const cutoff = timestamp - this.windowMs;
    let prunedCount = 0;
    while (this.chunks.length > 0 && this.chunks[0].timestamp < cutoff) {
      const removed = this.chunks.shift();
      if (removed) {
        this.totalBytes -= removed.data.length;
        prunedCount++;
      }
    }

    // Broadcast to subscribers
    for (const sub of this.subscribers) {
      try {
        sub(data);
      } catch (err: any) {
        this.logger.error(`[Buffer:${this.channelId}] Error writing to subscriber: ${err.message}`);
      }
    }
  }

  /**
   * Subscribe a new viewer to the buffer.
   * Feeds the viewer historical data from `backfillMs` ago (default 20 seconds)
   * to immediately populate their playback buffer, then pipes new data in real-time.
   */
  subscribe(
    onData: (chunk: Buffer) => void,
    backfillMs: number = 20000,
  ): () => void {
    this.subscribers.add(onData);

    // Backfill historical chunks
    const cutoff = Date.now() - backfillMs;
    const history = this.chunks.filter((c) => c.timestamp >= cutoff);
    
    for (const chunk of history) {
      try {
        onData(chunk.data);
      } catch (err: any) {
        this.logger.error(`[Buffer:${this.channelId}] Error backfilling chunk to subscriber: ${err.message}`);
      }
    }

    // Return unsubscribe callback
    return () => {
      this.subscribers.delete(onData);
    };
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  get bufferSizeMs(): number {
    if (this.chunks.length < 2) return 0;
    return this.chunks[this.chunks.length - 1].timestamp - this.chunks[0].timestamp;
  }

  get bufferSizeBytes(): number {
    return this.totalBytes;
  }

  clear(): void {
    this.chunks = [];
    this.totalBytes = 0;
    this.subscribers.clear();
  }
}
