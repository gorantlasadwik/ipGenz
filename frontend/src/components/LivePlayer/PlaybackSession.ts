// ─── IPGenZ Live Player v3 — Playback Session ────────────────────────────────
// Each playback is an isolated session. Sessions are disposable.
// Never reuse a session. Create a new one on every channel switch or fatal error.
// v3 upgrade: load() immediately but gate play() behind buffer readiness.
// Owns: the mpegts.js player instance, MediaSource lifecycle, and all event listeners.

import type { SessionConfig, AudioTrack } from './types'
import type { EventManager } from './EventManager'
import type { CodecManager } from './CodecManager'
import type { BufferManager } from './BufferManager'

export class PlaybackSession {
  private mpegtsPlayer: any = null
  private mpegtsLib: any = null
  private destroyed = false
  private transcodeTriggered = false
  private playStarted = false
  readonly id: string

  /** The URL currently being played (may differ from config.streamUrl if transcoding). */
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

    if (!this.mpegtsLib.getFeatureList().mseLivePlayback) {
      this.events.emit('ERROR', 'MSE not supported in this browser')
      return
    }

    if (this.destroyed) return
    this.createPlayer(this.activeUrl)
  }

  private createPlayer(url: string): void {
    if (this.destroyed || !this.mpegtsLib || !this.videoEl) return

    // Reset video element cleanly
    try {
      this.videoEl.pause()
      this.videoEl.removeAttribute('src')
      this.videoEl.load()
    } catch {}

    const player = this.mpegtsLib.createPlayer(
      { type: 'mpegts', isLive: true, url },
      {
        enableWorker: true,
        enableStashBuffer: true,
        // 512KB stash — fills fast so playback starts within 1-2s
        stashInitialSize: 512 * 1024,
        // Don't throttle downloads — let the backend ring buffer saturate the stash
        lazyLoad: false,
        // Chase the live edge so we don't drift too far behind
        liveBufferLatencyChasing: true,
        liveSync: true,
        // Target 6 seconds behind live (matches ring buffer depth)
        liveSyncTargetLatency: 6,
        // Start chasing if we exceed 12 seconds behind
        liveSyncMaxLatency: 12,
        liveBufferLatencyChasingStartBoundary: 12,
      }
    )

    this.mpegtsPlayer = player
    player.attachMediaElement(this.videoEl)

    // ── Codec detection via mpegts MEDIA_INFO event ─────────────────────────
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

        // AC3/EAC3/MP2 → request server-side transcode, but only once
        if (!this.codecManager.browserCanPlayAudio(audioCodec) && !this.transcodeTriggered) {
          this.transcodeTriggered = true
          console.log(`[PlaybackSession:${this.id}] Unsupported codec '${audioCodec}' — requesting transcode`)
          this.events.emit('TRANSCODE_NEEDED', audioCodec)
        }
      } catch (e) {
        console.warn(`[PlaybackSession:${this.id}] MEDIA_INFO parse error:`, e)
      }
    })

    // ── MSE/network errors ───────────────────────────────────────────────────
    player.on(this.mpegtsLib.Events.ERROR, (type: string, detail: string, info: any) => {
      if (this.destroyed) return
      const isMseCodecError = type === 'MediaError' && detail === 'MediaMSEError'
      if (isMseCodecError && !this.transcodeTriggered) {
        this.transcodeTriggered = true
        this.events.emit('TRANSCODE_NEEDED', 'UNKNOWN')
        return
      }
      console.warn(`[PlaybackSession:${this.id}] Player error:`, type, detail)
      this.events.emit('PLAYER_ERROR', { type, detail, info })
    })

    // ── Load immediately (data flows into buffer) ────────────────────────────
    player.load()
    this.events.emit('STATE_CHANGE', 'buffering')

    // ── v3: Gate play() until the buffer is filled ───────────────────────────
    // BufferManager emits the "ready" callback once MIN_START_SEC is buffered.
    // This means the user sees a brief loading state at startup, but playback
    // then runs smoothly and provider reconnects are hidden by the buffer.
    if (this.config.autoplay) {
      this.bufferManager.reset()
      this.bufferManager.onBufferReady(() => {
        if (this.destroyed || this.playStarted) return
        this.playStarted = true
        console.log(`[PlaybackSession:${this.id}] Buffer ready — starting play`)
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

  /** Switch to a different URL (e.g. transcode URL) without destroying the session. */
  switchUrl(newUrl: string): void {
    if (this.destroyed) return
    this.activeUrl = newUrl
    this.playStarted = false
    console.log(`[PlaybackSession:${this.id}] Switching URL to: ${newUrl}`)
    if (this.mpegtsPlayer) {
      try {
        this.mpegtsPlayer.unload()
        this.mpegtsPlayer.detachMediaElement()
        this.mpegtsPlayer.destroy()
      } catch {}
      this.mpegtsPlayer = null
    }
    this.createPlayer(newUrl)
  }

  play(): void {
    this.playStarted = true
    try { this.mpegtsPlayer?.play() } catch {}
  }

  pause(): void {
    try { this.mpegtsPlayer?.pause() } catch {}
  }

  getMpegtsPlayer(): any {
    return this.mpegtsPlayer
  }

  isDestroyed(): boolean {
    return this.destroyed
  }

  destroy(): void {
    if (this.destroyed) return
    this.destroyed = true
    console.log(`[PlaybackSession:${this.id}] Destroying session`)
    try {
      this.mpegtsPlayer?.unload()
      this.mpegtsPlayer?.detachMediaElement()
      this.mpegtsPlayer?.destroy()
    } catch {}
    this.mpegtsPlayer = null
    this.mpegtsLib = null
  }
}
