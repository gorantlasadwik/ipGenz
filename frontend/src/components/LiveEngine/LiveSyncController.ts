/**
 * LiveSyncController — v7
 *
 * Shared live-sync pacing module used by BOTH rendering paths:
 * - Native MSE path: drives video.playbackRate
 * - Canvas render path: drives frame-feed timing interval
 *
 * Single implementation, consumed by both paths, to prevent divergent logic.
 *
 * Algorithm:
 * - Target: 9s behind live edge
 * - Tolerance band: ±1.5s
 * - If too far behind (latency > 10.5s): speed up to 1.07x
 * - If within band: maintain 1.0x
 * - Hard ceiling at 28s: corrective jump to (liveEdge - targetLatency)
 */

export interface LiveSyncOptions {
  targetLatencyMs?: number;
  smallMarginMs?: number;
  minBufferMs?: number;
  maxLatencyMs?: number;
  onPlaybackRate?: (rate: number) => void;
}

export class LiveSyncController {
  private readonly targetLatencyMs: number;
  private readonly smallMarginMs: number;
  private readonly maxLatencyMs: number;

  private liveEdgeMs: number = 0;
  private lastChunkArrival: number = 0;
  private tickInterval: ReturnType<typeof setInterval> | null = null;
  private videoEl: HTMLVideoElement | null = null;
  private onPlaybackRate?: (rate: number) => void;

  constructor(opts: LiveSyncOptions = {}) {
    this.targetLatencyMs = opts.targetLatencyMs ?? 9000;
    this.smallMarginMs = opts.smallMarginMs ?? 1500;
    this.maxLatencyMs = opts.maxLatencyMs ?? 28000;
    this.onPlaybackRate = opts.onPlaybackRate;
  }

  /**
   * Attach to a native <video> element.
   * The controller adjusts video.playbackRate to maintain target latency.
   */
  attachVideo(el: HTMLVideoElement): void {
    this.videoEl = el;
    this.startTicking();
  }

  /**
   * Called when a new chunk arrives (for live edge tracking in canvas path).
   */
  onChunkReceived(): void {
    this.lastChunkArrival = Date.now();
    this.liveEdgeMs = this.lastChunkArrival;
  }

  /**
   * For native MSE path: returns the target start time relative to buffered end.
   */
  getTargetPlaybackOffset(): number {
    return this.targetLatencyMs / 1000;
  }

  /**
   * For canvas path: returns the current correction rate multiplier.
   * Canvas render loop should use this to adjust its frame-feed timing.
   */
  getCorrectionRate(): number {
    if (!this.videoEl) return 1.0;
    return this.videoEl.playbackRate;
  }

  private startTicking(): void {
    if (this.tickInterval) return;
    this.tickInterval = setInterval(() => this.tick(), 2000);
  }

  private tick(): void {
    if (!this.videoEl) return;

    const video = this.videoEl;
    const buffered = video.buffered;
    if (buffered.length === 0) return;

    const bufferedEnd = buffered.end(buffered.length - 1);
    const currentTime = video.currentTime;
    const latencyMs = (bufferedEnd - currentTime) * 1000;

    if (latencyMs > this.maxLatencyMs) {
      // Hard corrective jump — never to raw live edge, always to target
      const target = bufferedEnd - (this.targetLatencyMs / 1000);
      if (target > currentTime) {
        video.currentTime = target;
      }
      video.playbackRate = 1.0;
      this.onPlaybackRate?.(1.0);
      return;
    }

    let rate = 1.0;
    if (latencyMs > this.targetLatencyMs + this.smallMarginMs) {
      // Too far behind — speed up imperceptibly
      rate = 1.07;
    } else if (latencyMs < this.targetLatencyMs - this.smallMarginMs) {
      // Ahead of target — no need to slow down for live TV
      rate = 1.0;
    }

    if (video.playbackRate !== rate) {
      video.playbackRate = rate;
      this.onPlaybackRate?.(rate);
    }
  }

  destroy(): void {
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    this.videoEl = null;
  }
}
