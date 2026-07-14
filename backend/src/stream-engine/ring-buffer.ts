/**
 * Ring Buffer — v7
 *
 * THE FIX FOR THE LOOP-TO-START DEFECT.
 *
 * Design principles (from PRD FR-5, FR-6, FR-7):
 *
 * 1. Logical write position (`writePos`) is ALWAYS monotonically increasing.
 *    It is a bigint that NEVER resets — not even on FFmpeg respawn.
 *
 * 2. Physical storage wraps underneath (circular array of chunks), but this
 *    is completely invisible to subscribers.
 *
 * 3. On FFmpeg respawn, the new process's output is written into the buffer
 *    at the NEXT logical position. Subscribers reading at their prior
 *    `readPos` see a seamless continuation — they never re-receive previously
 *    delivered data.
 *
 * 4. Each subscriber tracks its own independent, monotonically-advancing
 *    readPos. A subscriber is NEVER re-served a byte range it already received.
 *
 * 5. Buffer capacity: ~45 seconds of live content.
 */

type Chunk = {
  pos: bigint;     // logical write position of this chunk
  data: Buffer;
};

type Subscriber = {
  callback: (data: Buffer, pos: bigint) => void;
  readPos: bigint;
};

export class RingBuffer {
  private readonly capacity: number;
  private readonly chunks: Chunk[] = [];
  private writePos: bigint = 0n;
  private readonly subscribers = new Map<string, Subscriber>();
  private subscriberIdCounter = 0;

  constructor(capacityMs = 45000) {
    // ~45s at 8 Mbps ≈ 45 MB. We store by chunk count (dynamic sizing).
    this.capacity = capacityMs; // used to evict old chunks
  }

  /**
   * Writes a buffer of MPEG-TS data (already timestamp-adjusted) into the ring buffer.
   * This is called by the ChannelWorker for every chunk of FFmpeg stdout.
   * writePos advances monotonically — never resets.
   */
  write(data: Buffer): void {
    const chunk: Chunk = {
      pos: this.writePos,
      data,
    };
    this.writePos += BigInt(data.length);
    this.chunks.push(chunk);

    // Evict old chunks: keep last ~45s worth
    // Evict if we have more than 300 chunks (heuristic, ~1MB chunks = ~300MB, actually chunks are ~64KB)
    // Better: evict chunks whose end position is more than 45MB behind current writePos
    const evictThreshold = this.writePos - BigInt(45 * 1024 * 1024); // 45 MB
    while (this.chunks.length > 0 && this.chunks[0].pos < evictThreshold) {
      this.chunks.shift();
    }

    // Notify all subscribers of the new chunk
    for (const sub of this.subscribers.values()) {
      if (sub.readPos <= chunk.pos) {
        sub.readPos = this.writePos;
        try {
          sub.callback(data, chunk.pos);
        } catch {
          // subscriber disconnected — will be cleaned up by unsubscribe()
        }
      }
    }
  }

  /**
   * Subscribes to the ring buffer.
   * @param callback Called with each new chunk as it arrives.
   * @param backfillMs How many ms of recent data to replay immediately (default 3s).
   * @returns unsubscribe function — call when viewer disconnects.
   */
  subscribe(
    callback: (data: Buffer, pos: bigint) => void,
    backfillMs = 3000,
  ): () => void {
    const id = `sub-${++this.subscriberIdCounter}`;

    // Compute approximate backfill bytes (8 Mbps = 1 MB/s)
    const backfillBytes = BigInt(Math.floor((backfillMs / 1000) * 1_000_000));
    const backfillFrom = this.writePos > backfillBytes
      ? this.writePos - backfillBytes
      : 0n;

    // Replay buffered chunks that fall within backfill window
    let replayed = 0;
    for (const chunk of this.chunks) {
      if (chunk.pos >= backfillFrom) {
        try {
          callback(chunk.data, chunk.pos);
          replayed += chunk.data.length;
        } catch {
          // ignore
        }
      }
    }

    const sub: Subscriber = {
      callback,
      readPos: this.writePos, // start from current live edge going forward
    };

    this.subscribers.set(id, sub);

    return () => {
      this.subscribers.delete(id);
    };
  }

  /**
   * Returns current buffer stats for health/observability.
   */
  getStats() {
    return {
      writePos: this.writePos.toString(),
      chunksStored: this.chunks.length,
      subscriberCount: this.subscribers.size,
      bufferedBytes: this.chunks.reduce((s, c) => s + c.data.length, 0),
    };
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  destroy(): void {
    this.subscribers.clear();
    this.chunks.length = 0;
  }
}
