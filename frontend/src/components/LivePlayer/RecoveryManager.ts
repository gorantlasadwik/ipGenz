// ─── IPGenZ Live Player v2 — Recovery Manager ────────────────────────────────
// Listens to health reports and player errors.
// Decides when and how to recover. Notifies PlayerController.
// Never touches the DOM directly.

import type { RecoveryReason } from './types'
import type { EventManager } from './EventManager'
import type { HealthReport } from './HealthMonitor'

interface RecoveryConfig {
  maxAttempts: number
  baseDelayMs: number
  maxDelayMs: number
  stallRecoveryThreshold: number
}

export class RecoveryManager {
  private attempts = 0
  private pendingTimeout: any = null
  private lastRecoveryTime = 0
  private disabled = false

  private readonly defaults: RecoveryConfig = {
    maxAttempts: 10,
    baseDelayMs: 1000,
    maxDelayMs: 16000,
    stallRecoveryThreshold: 3,
  }

  constructor(
    private events: EventManager,
    private config: Partial<RecoveryConfig> = {},
  ) {}

  private get cfg(): RecoveryConfig {
    return { ...this.defaults, ...this.config }
  }

  /** Wire up to event bus. Call once after construction. */
  start(): void {
    this.events.on('HEALTH_REPORT', (report: HealthReport) => this.onHealthReport(report))
    this.events.on('PLAYER_ERROR', ({ type, detail }: any) => this.onPlayerError(type, detail))
    this.events.on('PLAYING', () => this.onPlaybackRestored())
  }

  private onHealthReport(report: HealthReport): void {
    if (this.disabled || this.pendingTimeout) return
    if (report.isVideoFrozen) {
      console.warn(`[RecoveryManager] Video frozen detected — scheduling recovery`)
      this.scheduleRecovery('decoder_error')
    } else if (report.isStalled) {
      console.warn(`[RecoveryManager] Stall detected — scheduling recovery`)
      this.scheduleRecovery('stall')
    } else if (report.status === 'disconnected') {
      this.scheduleRecovery('network_error')
    }
  }

  private onPlayerError(type: string, detail: string): void {
    if (this.disabled || this.pendingTimeout) return
    // Codec errors are handled at session level — don't double-recover
    if (type === 'MediaError' && detail === 'MediaMSEError') return
    console.warn(`[RecoveryManager] Player error '${type}/${detail}' — scheduling recovery`)
    this.scheduleRecovery('decoder_error')
  }

  private onPlaybackRestored(): void {
    const now = Date.now()
    if (now - this.lastRecoveryTime < 5000) {
      // Confirmed recovery
      console.log(`[RecoveryManager] Playback restored after recovery (attempt ${this.attempts})`)
      this.events.emit('RECOVERED')
    }
    this.attempts = 0
    this.cancelPending()
  }

  scheduleRecovery(reason: RecoveryReason): void {
    if (this.disabled || this.pendingTimeout) return

    if (this.attempts >= this.cfg.maxAttempts) {
      console.error(`[RecoveryManager] Max reconnect attempts (${this.cfg.maxAttempts}) reached`)
      this.events.emit('ERROR', `Max reconnect attempts reached after ${this.attempts} tries`)
      return
    }

    const delay = Math.min(this.cfg.baseDelayMs * Math.pow(2, this.attempts), this.cfg.maxDelayMs)
    console.log(`[RecoveryManager] Recovery #${this.attempts + 1} in ${delay}ms (reason: ${reason})`)
    this.events.emit('RECONNECTING', { attempt: this.attempts + 1, delay, reason })

    this.pendingTimeout = setTimeout(() => {
      this.pendingTimeout = null
      this.attempts++
      this.lastRecoveryTime = Date.now()
      this.events.emit('DO_RECOVERY', reason)
    }, delay)
  }

  cancelPending(): void {
    if (this.pendingTimeout) {
      clearTimeout(this.pendingTimeout)
      this.pendingTimeout = null
    }
  }

  resetAttempts(): void {
    this.attempts = 0
  }

  disable(): void {
    this.disabled = true
    this.cancelPending()
  }

  enable(): void {
    this.disabled = false
  }

  destroy(): void {
    this.disable()
    this.events.removeAll()
  }
}
