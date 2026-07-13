import { Logger } from '@nestjs/common';

export interface BufferChunk {
  data: Buffer;
  timestamp: number;
  sequence: number;
}

export class RingBuffer {
  private readonly logger = new Logger(RingBuffer.name);
  private chunks: BufferChunk[] = [];
  private totalBytes = 0;
  private nextSequence = 1;
  private subscribers = new Set<(chunk: Buffer, seq: number) => void>();

  constructor(
    private readonly channelId: string,
    private readonly windowMs: number = 45000, // 45 seconds rolling window
  ) {}

  /**
   * Push a chunk of TS data into the buffer.
   */
  push(data: Buffer): void {
    const timestamp = Date.now();
    const sequence = this.nextSequence++;
    this.chunks.push({ data, timestamp, sequence });
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
        sub(data, sequence);
      } catch (err: any) {
        this.logger.error(`[Buffer:${this.channelId}] Error writing to subscriber: ${err.message}`);
      }
    }
  }

  /**
   * Subscribe a new viewer to the buffer.
   * Feeds the viewer historical data either starting after fromSequence or from backfillMs ago
   */
  subscribe(
    onData: (chunk: Buffer, seq: number) => void,
    startFrom: number | { fromSequence: number } = 20000,
  ): () => void {
    this.subscribers.add(onData);

    let history: BufferChunk[] = [];

    if (typeof startFrom === 'object' && startFrom !== null) {
      const targetSeq = startFrom.fromSequence;
      history = this.chunks.filter((c) => c.sequence > targetSeq);
      
      // Fallback: if sequence number requested was already evicted from ring buffer
      if (history.length === 0 && this.chunks.length > 0 && targetSeq < this.chunks[0].sequence) {
        this.logger.warn(`[Buffer:${this.channelId}] Requested sequence ${targetSeq} evicted (min sequence: ${this.chunks[0].sequence}). Falling back to live edge.`);
        // Fall back to a 2 second buffer
        const cutoff = Date.now() - 2000;
        history = this.chunks.filter((c) => c.timestamp >= cutoff);
      }
    } else {
      const cutoff = Date.now() - startFrom;
      history = this.chunks.filter((c) => c.timestamp >= cutoff);
    }
    
    for (const chunk of history) {
      try {
        onData(chunk.data, chunk.sequence);
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
