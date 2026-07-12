// ─── IPGenZ Live Player v2 — Health Monitor ──────────────────────────────────
// Runs every second. Checks player vitals. Outputs health status.
// Never makes decisions — only reports. RecoveryManager acts on those reports.

import type { HealthStatus } from './types'
import type { EventManager } from './EventManager'

export interface HealthReport {
  status: HealthStatus
  currentTime: number
  readyState: number
  networkState: number
  bufferedSec: number
  isStalled: boolean
  isPaused: boolean
}

export class HealthMonitor {
  private intervalId: any = null
  private videoEl: HTMLVideoElement | null = null
  private lastCurrentTime = -1
  private stallCount = 0
  // Stall = currentTime hasn't moved for > 3 consecutive checks while not paused
  private readonly STALL_THRESHOLD = 3

  constructor(
    private events: EventManager,
    private intervalMs = 1000,
  ) {}

  attach(el: HTMLVideoElement) {
    this.videoEl = el
  }

  start() {
    if (this.intervalId) return
    this.intervalId = setInterval(() => this.check(), this.intervalMs)
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
    this.stallCount = 0
    this.lastCurrentTime = -1
  }

  private check() {
    const el = this.videoEl
    if (!el) return

    const readyState = el.readyState
    const networkState = el.networkState
    const currentTime = el.currentTime
    const isPaused = el.paused

    let bufferedSec = 0
    try {
      if (el.buffered.length > 0) {
        bufferedSec = Math.max(0, el.buffered.end(el.buffered.length - 1) - currentTime)
      }
    } catch {}

    // Stall detection: time not moving while not paused
    let isStalled = false
    if (!isPaused && readyState >= 2) {
      if (Math.abs(currentTime - this.lastCurrentTime) < 0.05) {
        this.stallCount++
      } else {
        this.stallCount = 0
      }
      isStalled = this.stallCount >= this.STALL_THRESHOLD
    }
    this.lastCurrentTime = currentTime

    // Determine health status
    let status: HealthStatus = 'healthy'
    if (networkState === 3) {
      status = 'disconnected'
    } else if (isStalled) {
      status = 'stalled'
    } else if (readyState < 3 && !isPaused) {
      status = 'buffering'
    }

    const report: HealthReport = {
      status,
      currentTime,
      readyState,
      networkState,
      bufferedSec,
      isStalled,
      isPaused,
    }

    this.events.emit('HEALTH_REPORT', report)
  }

  resetStallCount() {
    this.stallCount = 0
    this.lastCurrentTime = -1
  }

  destroy() {
    this.stop()
    this.videoEl = null
  }
}
