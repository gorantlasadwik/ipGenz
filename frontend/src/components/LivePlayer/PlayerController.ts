// ─── IPGenZ Live Player v2 — Player Controller ───────────────────────────────
// The orchestrator. Coordinates all managers and sessions.
// Owns the lifecycle: create → initialize → play → recover → destroy.
// Single source of truth for player state.

import type { PlayerState, AudioTrack, PlayerConfig, SessionConfig } from './types'
import { EventManager } from './EventManager'
import { CodecManager } from './CodecManager'
import { StatisticsManager } from './StatisticsManager'
import { HealthMonitor } from './HealthMonitor'
import { RecoveryManager } from './RecoveryManager'
import { StreamManager } from './StreamManager'
import { PlaybackSession } from './PlaybackSession'

export class PlayerController {
  readonly events: EventManager
  private codec: CodecManager
  private stats: StatisticsManager
  private health: HealthMonitor
  private recovery: RecoveryManager
  private stream: StreamManager

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

  constructor(
    private config: PlayerConfig = {},
  ) {
    this.events = new EventManager()
    this.codec = new CodecManager(this.events)
    this.stats = new StatisticsManager(this.events)
    this.health = new HealthMonitor(this.events, config.healthCheckIntervalMs ?? 1000)
    this.recovery = new RecoveryManager(this.events, {
      maxAttempts: config.maxReconnectAttempts ?? 10,
    })
    this.channelId = ''
    this.baseStreamUrl = ''

    this.stream = new StreamManager(this.channelId)
    this.wireInternalEvents()
  }

  private wireInternalEvents(): void {
    // Health → state change
    this.events.on('HEALTH_REPORT', (report: any) => {
      if (this.destroyed) return
      this.stats.update({ health: report.status, bufferSizeMs: report.bufferedSec * 1000 })
      if (report.status === 'buffering' && this.state === 'playing') {
        this.setState('buffering')
      }
    })

    // Video element native events → emit on bus
    // (connected after video element is attached)

    // Transcode needed → rebuild URL and switch session
    this.events.on('TRANSCODE_NEEDED', (codec: string) => {
      if (this.transcodeTriggered || this.destroyed) return
      this.transcodeTriggered = true
      console.log(`[PlayerController] Transcode needed for codec '${codec}' — rebuilding session`)
      this.transcodeAudio = true
      this.rebuildSession()
    })

    // Recovery manager fires DO_RECOVERY
    this.events.on('DO_RECOVERY', (reason: string) => {
      if (this.destroyed) return
      console.log(`[PlayerController] Executing recovery (reason: ${reason})`)
      this.stats.increment('reconnectCount')
      this.rebuildSession()
    })

    // Session player errors
    this.events.on('PLAYER_ERROR', () => {
      if (this.state !== 'recovering') this.setState('recovering')
    })

    // Audio tracks ready from session
    this.events.on('AUDIO_TRACKS_READY', (tracks: AudioTrack[]) => {
      this.currentAudioTracks = tracks
    })

    // Codec info for stats
    this.events.on('CODEC_DETECTED', ({ audioCodec, videoCodec, resolution }: any) => {
      this.stats.update({ audioCodec, videoCodec, resolution })
    })
  }

  /** Attach the HTML video element. Must be called before load(). */
  attachVideoElement(el: HTMLVideoElement): void {
    this.videoEl = el
    this.stats.attachVideo(el)
    this.health.attach(el)

    // Wire native video element events to the event bus
    el.addEventListener('playing', () => {
      this.setState('playing')
      this.health.resetStallCount()
      this.recovery.resetAttempts()
      this.stats.startPlaybackTimer()
      this.events.emit('PLAYING')
    })
    el.addEventListener('waiting', () => {
      if (this.state === 'playing') this.setState('waiting')
      this.events.emit('WAITING')
    })
    el.addEventListener('pause', () => this.events.emit('PAUSE'))
    el.addEventListener('ended', () => {
      // Provider EOF — soft recovery (reconnect without full teardown)
      console.log('[PlayerController] Video ended event — triggering reconnect')
      this.recovery.scheduleRecovery('provider_eof')
    })
  }

  /** Load a channel. This is the main entry point. */
  async load(channelId: string, streamUrl: string): Promise<void> {
    if (this.destroyed) return
    console.log(`[PlayerController] Loading channel: ${channelId}`)

    // If switching channels, destroy previous session fully
    if (this.channelId && this.channelId !== channelId) {
      this.transcodeTriggered = false
      this.transcodeAudio = false
      this.selectedAudioTrack = null
      this.currentAudioTracks = []
      this.stats.reset()
      this.recovery.resetAttempts()
      this.events.emit('CHANNEL_CHANGED', channelId)
    }

    this.channelId = channelId
    this.baseStreamUrl = streamUrl
    this.stream = new StreamManager(channelId)

    this.setState('loading')

    // Run client-side codec detection (user's IP, never Render's)
    this.runCodecDetection()

    await this.startNewSession()
    this.recovery.start()
    this.health.start()
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
          console.log(`[PlayerController] Client-side PMT: unsupported codec '${primary.codec}' — will transcode`)
          this.transcodeTriggered = true
          this.transcodeAudio = true
          // Rebuild session with transcode URL
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

    // Destroy existing session first
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

    const session = new PlaybackSession(this.videoEl, cfg, this.events, this.codec)
    this.currentSession = session
    await session.initialize()
  }

  private rebuildSession(): void {
    if (this.destroyed) return
    console.log('[PlayerController] Rebuilding session')
    this.setState('recovering')
    // Small delay to let any in-flight operations settle
    setTimeout(() => {
      if (!this.destroyed) this.startNewSession()
    }, 300)
  }

  /** Select an audio track. Rebuilds the session with audioTrack= param. */
  selectAudioTrack(trackId: number): void {
    if (this.destroyed) return
    this.selectedAudioTrack = trackId
    this.currentAudioTracks = this.currentAudioTracks.map(t => ({ ...t, active: t.id === trackId }))
    this.rebuildSession()
  }

  /** Switch to audio transcoding mode. */
  enableAudioTranscode(): void {
    if (this.transcodeTriggered) return
    this.transcodeTriggered = true
    this.transcodeAudio = true
    this.rebuildSession()
  }

  play(): void {
    this.currentSession?.play()
    if (this.videoEl?.paused) {
      this.videoEl.play().catch(() => {})
    }
  }

  pause(): void {
    this.currentSession?.pause()
  }

  getState(): PlayerState { return this.state }
  getAudioTracks(): AudioTrack[] { return this.currentAudioTracks }
  getStats() { return this.stats.getSnapshot() }
  isTranscoding(): boolean { return this.transcodeAudio }
  getCurrentUrl(): string { return this.buildCurrentUrl() }

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
    this.stats.destroy()
    this.currentSession?.destroy()
    this.currentSession = null
    this.events.destroy()
  }
}
