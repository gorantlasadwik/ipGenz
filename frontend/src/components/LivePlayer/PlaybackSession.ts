// ─── IPGenZ Live Player v4 — Playback Session ────────────────────────────────
// Each playback is an isolated session. Sessions are disposable.
// Uses mpegts.js for direct, zero-disk-IO memory streaming.

import type { SessionConfig, AudioTrack } from './types'
import type { EventManager } from './EventManager'
import type { CodecManager } from './CodecManager'
import type { BufferManager } from './BufferManager'

export class PlaybackSession {
  private mpegtsPlayer: any = null
  private mpegtsLib: any = null
  private destroyed = false
  private playStarted = false
  private transcodeTriggered = false
  private mseErrorCount = 0
  private static readonly MAX_MSE_ERRORS = 5
  readonly id: string

  /** The stream URL currently being played. */
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

    try {
      const mpegtsModule = await import('mpegts.js')
      this.mpegtsLib = mpegtsModule.default
    } catch (e) {
      this.events.emit('ERROR', 'Failed to load mpegts.js player engine')
      return
    }

    if (this.destroyed) return

    if (this.mpegtsLib.getFeatureList().mseLivePlayback) {
      this.createMpegtsPlayer(this.activeUrl)
    } else {
      this.events.emit('ERROR', 'MSE (MPEG-TS) live playback not supported in this browser')
    }
  }

  private createMpegtsPlayer(url: string): void {
    if (this.destroyed || !this.mpegtsLib || !this.videoEl) return

    this.resetVideoElement()

    const player = this.mpegtsLib.createPlayer(
      { type: 'mpegts', isLive: true, url },
      {
        enableWorker: true,
        enableStashBuffer: true,
        stashInitialSize: 1024 * 1024,
        lazyLoad: false,
        liveBufferLatencyChasing: false,
        liveSync: false,
      }
    )

    this.mpegtsPlayer = player
    player.attachMediaElement(this.videoEl)

    // ── Codec and Audio Track Detection ──────────────────────────────────────
    player.on(this.mpegtsLib.Events.MEDIA_INFO, () => {
      if (this.destroyed) return
      try {
        const info = player.mediaInfo as any
        const rawAudio = (info?.audioCodec || '').toLowerCase()
        const audioCodec = this.codecManager.parseAudioCodecFromMediaInfo(rawAudio)
        const videoCodec = this.codecManager.parseVideoCodecFromMediaInfo(info?.videoCodec || '')

        const audioTracks: AudioTrack[] = []
        if (info?.audioStreams?.length > 0) {
          info.audioStreams.forEach((s: any, idx: number) => {
            audioTracks.push({
              id: idx,
              label: `Track ${idx + 1} (${(s.language || 'und').toUpperCase()}) [${this.codecManager.parseAudioCodecFromMediaInfo(s.codec || '')}]`,
              language: s.language || 'und',
              codec: this.codecManager.parseAudioCodecFromMediaInfo(s.codec || ''),
              active: idx === 0,
            })
          })
        } else {
          audioTracks.push({ id: 0, label: 'Default Audio', language: 'und', codec: audioCodec, active: true })
        }

        this.events.emit('CODEC_DETECTED', { audioCodec, videoCodec, resolution: `${info?.width || 0}x${info?.height || 0}` })
        this.events.emit('AUDIO_TRACKS_READY', audioTracks)

        // Request server-side transcode if audio codec is AC3/EAC3/DTS and not yet triggered
        if (!this.codecManager.browserCanPlayAudio(audioCodec) && !this.transcodeTriggered) {
          this.transcodeTriggered = true
          console.log(`[PlaybackSession:${this.id}] Unsupported codec '${audioCodec}' — requesting audio transcode`)
          this.events.emit('TRANSCODE_NEEDED', audioCodec)
        }
      } catch (e) {
        console.warn(`[PlaybackSession:${this.id}] MEDIA_INFO parse error:`, e)
      }
    })

    // ── Error recovery ───────────────────────────────────────────────────────
    player.on(this.mpegtsLib.Events.ERROR, (type: string, detail: string, info: any) => {
      if (this.destroyed) return
      console.warn(`[PlaybackSession:${this.id}] mpegts.js error:`, type, detail)

      this.mseErrorCount++

      // Hard cap: if we've hit too many errors, stop looping and surface the error
      if (this.mseErrorCount >= PlaybackSession.MAX_MSE_ERRORS) {
        console.error(`[PlaybackSession:${this.id}] Max MSE error retries (${PlaybackSession.MAX_MSE_ERRORS}) reached. Giving up.`)
        this.events.emit('PLAYER_ERROR', { type, detail, info })
        return
      }

      const isMseCodecError = type === 'MediaError' && detail === 'MediaMSEError'
      if (isMseCodecError && !this.transcodeTriggered) {
        this.transcodeTriggered = true
        this.events.emit('TRANSCODE_NEEDED', 'UNKNOWN')
        return
      }

      this.events.emit('PLAYER_ERROR', { type, detail, info })
    })

    player.load()
    this.events.emit('STATE_CHANGE', 'buffering')

    if (this.config.autoplay) {
      this.bufferManager.reset()
      this.bufferManager.onBufferReady(() => {
        if (this.destroyed || this.playStarted) return
        this.playStarted = true
        console.log(`[PlaybackSession:${this.id}] Buffer ready — playing`)
        const pp = player.play()
        if (pp && typeof pp.catch === 'function') {
          pp.catch((err: any) => {
            if (err?.name === 'NotAllowedError') {
              this.events.emit('AUTOPLAY_BLOCKED')
            }
          })
        }
      })
    }
  }

  private resetVideoElement(): void {
    try {
      this.videoEl.pause()
      this.videoEl.removeAttribute('src')
      this.videoEl.load()
    } catch {}
  }

  play(): void {
    this.playStarted = true
    try { this.mpegtsPlayer?.play() } catch {}
  }

  pause(): void {
    try { this.mpegtsPlayer?.pause() } catch {}
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    console.log(`[PlaybackSession:${this.id}] Destroying session`)
    
    this.resetVideoElement()

    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.unload()
        this.mpegtsPlayer.detachMediaElement()
        this.mpegtsPlayer.destroy()
      } catch {}
      this.mpegtsPlayer = null
    }
    this.mpegtsLib = null
  }
}
