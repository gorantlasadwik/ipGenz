// ─── IPGenZ Live Player v3 — Buffer Manager ──────────────────────────────────
// Monitors buffer health every second.
// Gates initial playback until MIN_START_SEC is buffered.
// Emits buffer events so the Controller can decide whether to show a spinner.
// Never touches the DOM or player directly.

import type { EventManager } from './EventManager'

export type BufferHealth = 'filling' | 'ok' | 'low' | 'critical'

export interface BufferReport {
  health: BufferHealth
  bufferedSec: number
  currentTime: number
  readyState: number
  networkState: number
}

export class BufferManager {
  // ── Thresholds (tuned for ring buffer burst-fill strategy) ───────────
  /**
   * Wait for 6s before starting playback.
   * With ring buffer burst fill, browser receives 8-15s of data in 1-2s,
   * so this threshold is hit quickly while ensuring a deep starting buffer.
   */
  static readonly MIN_START_SEC = 6
  /** Ideal steady-state buffer (provider cache keeps this filled). */
  static readonly TARGET_SEC = 10
  /** Maximum buffer (above this, mpegts.js can slow downloads). */
  static readonly MAX_SEC = 30
  /** Below this → show loading spinner. */
  static readonly LOW_SEC = 2
  /** Below this → critical, full recovery needed. */
  static readonly CRITICAL_SEC = 0.5

  private videoEl: HTMLVideoElement | null = null
  private intervalId: any = null
  private readyToPlay = false   // latched once buffer hits MIN_START_SEC
  private onReadyCallback: (() => void) | null = null

  constructor(private events: EventManager) {}

  attach(el: HTMLVideoElement) {
    this.videoEl = el
  }

  /** Register a callback that fires exactly once when the initial buffer is ready. */
  onBufferReady(cb: () => void) {
    this.onReadyCallback = cb
  }

  start() {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.poll(), 1000)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  /** Current buffer ahead of playhead in seconds. */
  getBufferedSec(): number {
    const el = this.videoEl
    if (!el) return 0
    try {
      const buf = el.buffered
      if (buf.length === 0) return 0
      // Use the last buffered range end (most conservative for live)
      return Math.max(0, buf.end(buf.length - 1) - el.currentTime)
    } catch {
      return 0
    }
  }

  private poll() {
    const el = this.videoEl
    if (!el) return

    const bufferedSec = this.getBufferedSec()
    const health = this.classify(bufferedSec)

    const report: BufferReport = {
      health,
      bufferedSec,
      currentTime: el.currentTime,
      readyState: el.readyState,
      networkState: el.networkState,
    }

    this.events.emit('BUFFER_REPORT', report)

    // Fire the "ready to start" callback exactly once
    if (!this.readyToPlay && bufferedSec >= BufferManager.MIN_START_SEC) {
      this.readyToPlay = true
      console.log(`[BufferManager] Initial buffer ready (${bufferedSec.toFixed(1)}s ≥ ${BufferManager.MIN_START_SEC}s) — starting playback`)
      this.onReadyCallback?.()
    }
  }

  private classify(sec: number): BufferHealth {
    if (!this.readyToPlay && sec < BufferManager.MIN_START_SEC) return 'filling'
    if (sec >= BufferManager.LOW_SEC) return 'ok'
    if (sec >= BufferManager.CRITICAL_SEC) return 'low'
    return 'critical'
  }

  reset() {
    this.readyToPlay = false
  }

  destroy() {
    this.stop()
    this.videoEl = null
    this.onReadyCallback = null
  }
}
