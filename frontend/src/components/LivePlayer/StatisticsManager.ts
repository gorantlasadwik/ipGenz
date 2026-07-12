// ─── IPGenZ Live Player v2 — Statistics Manager ──────────────────────────────
// Tracks playback quality metrics. Feeds the debug panel and onStats callback.

import type { PlayerStats, PlayerState, HealthStatus } from './types'
import type { EventManager } from './EventManager'

export class StatisticsManager {
  private stats: PlayerStats = {
    fps: 0,
    droppedFrames: 0,
    resolution: '—',
    bitrate: 0,
    bufferSizeMs: 0,
    latencyMs: 0,
    reconnectCount: 0,
    playbackTimeSec: 0,
    videoCodec: '—',
    audioCodec: '—',
    state: 'idle',
    health: 'healthy',
  }

  private startTime: number | null = null
  private playbackTimer: any = null
  private videoEl: HTMLVideoElement | null = null

  constructor(private events: EventManager) {}

  attachVideo(el: HTMLVideoElement) {
    this.videoEl = el
  }

  startPlaybackTimer() {
    if (this.playbackTimer) return
    this.startTime = Date.now()
    this.playbackTimer = setInterval(() => {
      if (this.startTime !== null) {
        this.stats.playbackTimeSec = Math.floor((Date.now() - this.startTime) / 1000)
      }
      this.collectVideoStats()
    }, 1000)
  }

  stopPlaybackTimer() {
    if (this.playbackTimer) {
      clearInterval(this.playbackTimer)
      this.playbackTimer = null
    }
    this.startTime = null
  }

  private collectVideoStats() {
    if (!this.videoEl) return
    try {
      const quality = (this.videoEl as any).getVideoPlaybackQuality?.()
      if (quality) {
        this.stats.droppedFrames = quality.droppedVideoFrames || 0
        this.stats.fps = quality.totalVideoFrames > 0
          ? Math.round(quality.totalVideoFrames / Math.max(1, this.stats.playbackTimeSec))
          : 0
      }
      // Buffer size
      const buffered = this.videoEl.buffered
      if (buffered.length > 0) {
        const bufEnd = buffered.end(buffered.length - 1)
        const bufStart = this.videoEl.currentTime
        this.stats.bufferSizeMs = Math.max(0, (bufEnd - bufStart) * 1000)
      }
    } catch {}
    this.events.emit('STATS_UPDATE', { ...this.stats })
  }

  increment(field: 'reconnectCount') {
    this.stats[field]++
  }

  update(partial: Partial<PlayerStats>) {
    Object.assign(this.stats, partial)
    this.events.emit('STATS_UPDATE', { ...this.stats })
  }

  getSnapshot(): PlayerStats {
    return { ...this.stats }
  }

  reset() {
    this.stats.droppedFrames = 0
    this.stats.fps = 0
    this.stats.bufferSizeMs = 0
    this.stats.latencyMs = 0
  }

  destroy() {
    this.stopPlaybackTimer()
    this.videoEl = null
  }
}
