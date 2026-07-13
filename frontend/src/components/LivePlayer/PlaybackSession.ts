// ─── IPGenZ Live Player v4 — Playback Session ────────────────────────────────
// Each playback is an isolated session. Sessions are disposable.
// Uses hls.js for Chrome/Firefox/Edge and native HTML5 HLS for Safari/iOS.
// Owns: the hls.js instance, event bindings, and audio track switching.

import type { SessionConfig, AudioTrack } from './types'
import type { EventManager } from './EventManager'
import type { CodecManager } from './CodecManager'
import type { BufferManager } from './BufferManager'

export class PlaybackSession {
  private hlsPlayer: any = null
  private HlsLib: any = null
  private destroyed = false
  private playStarted = false
  readonly id: string

  /** The HLS playlist URL currently being played. */
  activeUrl: string

  constructor(
    private videoEl: HTMLVideoElement,
    private config: SessionConfig,
    private events: EventManager,
    private codecManager: CodecManager,
    private bufferManager: BufferManager,
  ) {
    this.id = `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    this.activeUrl = config.streamUrl
  }

  async initialize(): Promise<void> {
    if (this.destroyed) return
    this.events.emit('STATE_CHANGE', 'initializing')

    // 1. Try loading hls.js
    try {
      const hlsModule = await import('hls.js')
      this.HlsLib = hlsModule.default
    } catch (e) {
      this.loggerWarn('Failed to import hls.js pack')
    }

    if (this.destroyed) return

    // 2. Choose player engine (hls.js vs Native Safari)
    if (this.HlsLib && this.HlsLib.isSupported()) {
      this.createHlsPlayer(this.activeUrl)
    } else if (this.videoEl.canPlayType('application/vnd.apple.mpegurl')) {
      this.createNativePlayer(this.activeUrl)
    } else {
      this.events.emit('ERROR', 'HLS playback is not supported in this browser.')
    }
  }

  private createHlsPlayer(url: string): void {
    if (this.destroyed || !this.HlsLib || !this.videoEl) return

    this.resetVideoElement()

    const hls = new this.HlsLib({
      enableWorker: true,
      lowLatencyMode: false,
      // Play 3 segments behind live (~6 seconds) for maximum stability
      liveSyncDurationCount: 3,
      // Smoothly catch up to the live edge if network lags slightly
      maxLiveSyncPlaybackRate: 1.1,
      // Discontinuities are handled natively by stitching segments
      manifestLoadingMaxRetry: 10,
      manifestLoadingRetryDelay: 1000,
    })

    this.hlsPlayer = hls
    hls.attachMedia(this.videoEl)

    hls.on(this.HlsLib.Events.MEDIA_ATTACHED, () => {
      hls.loadSource(url)
    })

    // ── Codec and Audio Track Detection ──────────────────────────────────────
    hls.on(this.HlsLib.Events.MANIFEST_PARSED, (event: any, data: any) => {
      if (this.destroyed) return

      const audioCodec = 'AAC' // Backend converts AC3/EAC3/DTS to AAC
      const videoCodec = 'H264'
      this.events.emit('CODEC_DETECTED', { audioCodec, videoCodec, resolution: 'Auto' })

      // Emit audio tracks if present
      this.emitHlsAudioTracks()

      this.events.emit('STATE_CHANGE', 'buffering')

      if (this.config.autoplay) {
        this.bufferManager.reset()
        this.bufferManager.onBufferReady(() => {
          if (this.destroyed || this.playStarted) return
          this.playStarted = true
          console.log(`[PlaybackSession:${this.id}] HLS buffer ready — playing`)
          this.videoEl.play().catch((err: any) => {
            if (err?.name === 'NotAllowedError') {
              this.events.emit('AUTOPLAY_BLOCKED')
            }
          })
        })
      }
    })

    hls.on(this.HlsLib.Events.AUDIO_TRACKS_UPDATED, () => {
      this.emitHlsAudioTracks()
    })

    // ── Error recovery ───────────────────────────────────────────────────────
    hls.on(this.HlsLib.Events.ERROR, (event: any, data: any) => {
      if (this.destroyed) return
      console.warn(`[PlaybackSession:${this.id}] hls.js error:`, data.type, data.details, data.fatal)

      if (data.fatal) {
        switch (data.type) {
          case this.HlsLib.ErrorTypes.NETWORK_ERROR:
            console.log(`[PlaybackSession:${this.id}] Fatal network error — retrying connection`)
            hls.startLoad()
            break;
          case this.HlsLib.ErrorTypes.MEDIA_ERROR:
            console.log(`[PlaybackSession:${this.id}] Fatal media error — trying recovery`)
            hls.recoverMediaError()
            break;
          default:
            this.events.emit('PLAYER_ERROR', { type: data.type, detail: data.details })
            break;
        }
      }
    })
  }

  private emitHlsAudioTracks(): void {
    if (!this.hlsPlayer) return
    const tracks = this.hlsPlayer.audioTracks || []
    const mapped: AudioTrack[] = tracks.map((t: any, idx: number) => ({
      id: idx,
      label: t.name || `Track ${idx + 1} (${(t.lang || 'und').toUpperCase()})`,
      language: t.lang || 'und',
      codec: 'AAC',
      active: idx === this.hlsPlayer.audioTrack,
    }))
    if (mapped.length > 0) {
      this.events.emit('AUDIO_TRACKS_READY', mapped)
    }
  }

  private createNativePlayer(url: string): void {
    if (this.destroyed || !this.videoEl) return

    this.resetVideoElement()

    this.videoEl.src = url
    this.videoEl.load()

    this.videoEl.addEventListener('loadedmetadata', () => {
      if (this.destroyed) return

      // Parse native audio tracks if browser supports it
      const nativeTracks = (this.videoEl as any).audioTracks
      if (nativeTracks && nativeTracks.length > 0) {
        const tracks: AudioTrack[] = []
        for (let i = 0; i < nativeTracks.length; i++) {
          tracks.push({
            id: i,
            label: nativeTracks[i].label || `Track ${i + 1} (${(nativeTracks[i].language || 'und').toUpperCase()})`,
            language: nativeTracks[i].language || 'und',
            codec: 'AAC',
            active: nativeTracks[i].enabled,
          })
        }
        this.events.emit('AUDIO_TRACKS_READY', tracks)
      }

      if (this.config.autoplay) {
        this.bufferManager.reset()
        this.bufferManager.onBufferReady(() => {
          if (this.destroyed || this.playStarted) return
          this.playStarted = true
          this.videoEl.play().catch((err: any) => {
            if (err?.name === 'NotAllowedError') {
              this.events.emit('AUTOPLAY_BLOCKED')
            }
          })
        })
      }
    })
  }

  private resetVideoElement(): void {
    try {
      this.videoEl.pause()
      this.videoEl.removeAttribute('src')
      this.videoEl.load()
    } catch {}
  }

  /**
   * Switch the active audio track on the client side (instant, zero buffer reset).
   */
  selectAudioTrack(trackId: number): void {
    if (this.destroyed) return

    if (this.hlsPlayer) {
      this.loggerLog(`Switching hls.js audio track to ${trackId}`)
      this.hlsPlayer.audioTrack = trackId
    } else {
      const nativeTracks = (this.videoEl as any).audioTracks
      if (nativeTracks && nativeTracks.length > trackId) {
        this.loggerLog(`Switching native audio track to ${trackId}`)
        for (let i = 0; i < nativeTracks.length; i++) {
          nativeTracks[i].enabled = i === trackId
        }
      }
    }
  }

  play(): void {
    this.playStarted = true
    this.videoEl?.play().catch(() => {})
  }

  pause(): void {
    this.videoEl?.pause()
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  private loggerLog(msg: string): void {
    console.log(`[PlaybackSession:${this.id}] ${msg}`)
  }

  private loggerWarn(msg: string): void {
    console.warn(`[PlaybackSession:${this.id}] ${msg}`)
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    this.loggerLog('Destroying session')

    this.resetVideoElement()

    if (this.hlsPlayer) {
      try {
        this.hlsPlayer.destroy()
      } catch {}
      this.hlsPlayer = null
    }
  }
}
