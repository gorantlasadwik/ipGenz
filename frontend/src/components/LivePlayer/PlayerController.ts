// ─── IPGenZ Live Player v3 — Player Controller ───────────────────────────────
// The orchestrator. Coordinates all managers and sessions.
// v3 upgrade: buffer-aware state transitions.
// If buffer is healthy (>5s), provider reconnects are invisible to the user.
// The "recovering" UI state is only shown when the buffer is actually exhausted.

import type { PlayerState, AudioTrack, PlayerConfig, SessionConfig } from './types'
import { EventManager } from './EventManager'
import { CodecManager } from './CodecManager'
import { StatisticsManager } from './StatisticsManager'
import { HealthMonitor } from './HealthMonitor'
import { RecoveryManager } from './RecoveryManager'
import { StreamManager } from './StreamManager'
import { PlaybackSession } from './PlaybackSession'
import { BufferManager } from './BufferManager'
import type { BufferReport } from './BufferManager'

export class PlayerController {
  readonly events: EventManager
  private codec: CodecManager
  private stats: StatisticsManager
  private health: HealthMonitor
  private recovery: RecoveryManager
  private stream: StreamManager
  private buffer: BufferManager

  private currentSession: PlaybackSession | null = null
  private state: PlayerState = 'idle'
  private videoEl: HTMLVideoElement | null = null
  private destroyed = false

  // Stream state
  private channelId: string
  private baseStreamUrl: string
  private transcodeAudio = false
  private selectedAudioTrack: number | null = null
  private currentAudioTracks: AudioTrack[] = []
  private transcodeTriggered = false

  // v3: buffer level for smart state decisions
  private currentBufferedSec = 0

  constructor(private config: PlayerConfig = {}) {
    this.events = new EventManager()
    this.codec = new CodecManager(this.events)
    this.stats = new StatisticsManager(this.events)
    this.health = new HealthMonitor(this.events, config.healthCheckIntervalMs ?? 1000)
    this.recovery = new RecoveryManager(this.events, {
      maxAttempts: config.maxReconnectAttempts ?? 10,
    })
    this.buffer = new BufferManager(this.events)
    this.channelId = ''
    this.baseStreamUrl = ''
    this.stream = new StreamManager(this.channelId)

    this.wireInternalEvents()
  }

  private wireInternalEvents(): void {
    // ── Buffer reports ────────────────────────────────────────────────────────
    this.events.on('BUFFER_REPORT', (report: BufferReport) => {
      if (this.destroyed) return
      this.currentBufferedSec = report.bufferedSec
      this.stats.update({ bufferSizeMs: report.bufferedSec * 1000, health: report.health === 'ok' ? 'healthy' : report.health === 'filling' ? 'buffering' : 'stalled' })

      // Show buffering state only when we are actually starved
      if (report.health === 'filling' && this.state !== 'loading' && this.state !== 'initializing') {
        this.setState('buffering')
      }
    })

    // ── Health reports ────────────────────────────────────────────────────────
    this.events.on('HEALTH_REPORT', (report: any) => {
      if (this.destroyed) return
      // Only enter "waiting" state if buffer is actually empty
      if (report.isStalled && this.currentBufferedSec < BufferManager.LOW_SEC) {
        if (this.state === 'playing') this.setState('waiting')
      }
    })

    // ── Transcode escalation ─────────────────────────────────────────────────
    this.events.on('TRANSCODE_NEEDED', (codec: string) => {
      if (this.transcodeTriggered || this.destroyed) return
      this.transcodeTriggered = true
      console.log(`[PlayerController] Transcode needed for codec '${codec}' — rebuilding session`)
      this.transcodeAudio = true
      this.rebuildSession()
    })

    // ── Recovery ─────────────────────────────────────────────────────────────
    this.events.on('DO_RECOVERY', (reason: string) => {
      if (this.destroyed) return
      console.log(`[PlayerController] Recovery triggered (reason: ${reason}, buffer: ${this.currentBufferedSec.toFixed(1)}s)`)
      this.stats.increment('reconnectCount')

      // KEY v3 BEHAVIOR:
      // If we still have a healthy buffer, rebuild silently — no visual change.
      // Only show "recovering" overlay if the buffer is actually dry.
      const bufferIsHealthy = this.currentBufferedSec >= BufferManager.LOW_SEC
      if (!bufferIsHealthy) {
        this.setState('recovering')
      } else {
        console.log(`[PlayerController] Buffer healthy (${this.currentBufferedSec.toFixed(1)}s) — silent reconnect`)
      }

      this.rebuildSession()
    })

    // ── Player errors ────────────────────────────────────────────────────────
    this.events.on('PLAYER_ERROR', () => {
      if (this.destroyed) return
      if (this.currentBufferedSec < BufferManager.LOW_SEC) {
        this.setState('recovering')
      }
    })

    // ── Audio/codec events ───────────────────────────────────────────────────
    this.events.on('AUDIO_TRACKS_READY', (tracks: AudioTrack[]) => {
      this.currentAudioTracks = tracks
    })

    this.events.on('CODEC_DETECTED', ({ audioCodec, videoCodec, resolution }: any) => {
      this.stats.update({ audioCodec, videoCodec, resolution })
    })
  }

  /** Attach the HTML video element. Must be called before load(). */
  attachVideoElement(el: HTMLVideoElement): void {
    this.videoEl = el
    this.stats.attachVideo(el)
    this.health.attach(el)
    this.buffer.attach(el)

    // Wire native video element events
    el.addEventListener('playing', () => {
      this.setState('playing')
      this.health.resetStallCount()
      this.recovery.resetAttempts()
      this.stats.startPlaybackTimer()
      this.events.emit('PLAYING')
    })
    el.addEventListener('waiting', () => {
      // Only surface "waiting" if buffer is critically low
      if (this.currentBufferedSec < BufferManager.LOW_SEC && this.state === 'playing') {
        this.setState('waiting')
      }
      this.events.emit('WAITING')
    })
    el.addEventListener('pause', () => this.events.emit('PAUSE'))
    el.addEventListener('ended', () => {
      console.log('[PlayerController] Video ended — scheduling reconnect')
      this.recovery.scheduleRecovery('provider_eof')
    })
  }

  /** Load a channel. Main entry point. */
  async load(channelId: string, streamUrl: string): Promise<void> {
    if (this.destroyed) return
    console.log(`[PlayerController] Loading channel: ${channelId}`)

    if (this.channelId && this.channelId !== channelId) {
      // Channel switch — full reset
      this.transcodeTriggered = false
      this.transcodeAudio = false
      this.selectedAudioTrack = null
      this.currentAudioTracks = []
      this.currentBufferedSec = 0
      this.stats.reset()
      this.recovery.resetAttempts()
      this.events.emit('CHANNEL_CHANGED', channelId)
    }

    this.channelId = channelId
    this.baseStreamUrl = streamUrl
    this.stream = new StreamManager(channelId)

    this.setState('loading')

    // Client-side PMT codec detection (uses user's IP, not Render's)
    this.runCodecDetection()

    await this.startNewSession()
    this.recovery.start()
    this.health.start()
    this.buffer.start()
  }

  private async runCodecDetection(): Promise<void> {
    try {
      const url = this.buildCurrentUrl()
      const tracks = await this.codec.detectFromStream(url)
      if (tracks.length > 0) {
        this.currentAudioTracks = tracks
        this.events.emit('AUDIO_TRACKS_READY', tracks)
        const primary = tracks[0]
        if (!this.codec.browserCanPlayAudio(primary.codec) && !this.transcodeTriggered) {
          console.log(`[PlayerController] Client PMT: unsupported codec '${primary.codec}' — will transcode`)
          this.transcodeTriggered = true
          this.transcodeAudio = true
          this.rebuildSession()
        }
      }
    } catch (e) {
      console.warn('[PlayerController] Codec detection error (non-fatal):', e)
    }
  }

  private buildCurrentUrl(): string {
    return this.stream.buildUrl({
      baseUrl: this.baseStreamUrl,
      audioTrackId: this.selectedAudioTrack,
      transcodeAudio: this.transcodeAudio,
    })
  }

  private async startNewSession(): Promise<void> {
    if (this.destroyed || !this.videoEl) return

    if (this.currentSession) {
      this.currentSession.destroy()
      this.currentSession = null
    }

    const url = this.buildCurrentUrl()
    console.log(`[PlayerController] Starting new session → ${url}`)

    const cfg: SessionConfig = {
      channelId: this.channelId,
      streamUrl: url,
      autoplay: true,
    }

    const session = new PlaybackSession(this.videoEl, cfg, this.events, this.codec, this.buffer)
    this.currentSession = session
    await session.initialize()
  }

  private rebuildSession(): void {
    if (this.destroyed) return
    console.log('[PlayerController] Rebuilding session')
    setTimeout(() => {
      if (!this.destroyed) this.startNewSession()
    }, 300)
  }

  /** Select an audio track by ID. */
  selectAudioTrack(trackId: number): void {
    if (this.destroyed) return
    this.selectedAudioTrack = trackId
    this.currentAudioTracks = this.currentAudioTracks.map(t => ({ ...t, active: t.id === trackId }))
    this.rebuildSession()
  }

  enableAudioTranscode(): void {
    if (this.transcodeTriggered) return
    this.transcodeTriggered = true
    this.transcodeAudio = true
    this.rebuildSession()
  }

  play(): void {
    this.currentSession?.play()
    if (this.videoEl?.paused) this.videoEl.play().catch(() => {})
  }

  pause(): void {
    this.currentSession?.pause()
  }

  getState(): PlayerState { return this.state }
  getAudioTracks(): AudioTrack[] { return this.currentAudioTracks }
  getStats() { return this.stats.getSnapshot() }
  isTranscoding(): boolean { return this.transcodeAudio }
  getCurrentBufferedSec(): number { return this.currentBufferedSec }

  private setState(s: PlayerState): void {
    if (this.state === s) return
    this.state = s
    this.stats.update({ state: s })
    this.events.emit('STATE_CHANGE', s)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    console.log('[PlayerController] Destroying')
    this.recovery.disable()
    this.health.destroy()
    this.buffer.destroy()
    this.stats.destroy()
    this.currentSession?.destroy()
    this.currentSession = null
    this.events.destroy()
  }
}
