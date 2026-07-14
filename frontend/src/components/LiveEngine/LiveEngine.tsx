'use client'

/**
 * LiveEngine — v7 Unified Player
 *
 * Single, unified live TV player replacing all three previous players.
 *
 * Architecture:
 * 1. Fetches stream metadata from /stream-engine/live/:id/info
 * 2. Resolves decode path (native → WebCodecs → WASM → server transcode)
 * 3. Streams via /stream-engine/live/:id (monotonic MPEG-TS from ring buffer)
 * 4. LiveSyncController drives playback rate correction
 * 5. Reconnect-with-backoff: always resumes at live tail, never at stored offset
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import { api } from '@/lib/api'
import { LiveSyncController } from './LiveSyncController'
import { resolveDecodePath, DecodePath } from './DecodePathResolver'

// ── Types ─────────────────────────────────────────────────────────────────────

interface AudioTrack {
  index: number
  codec: string
  language: string
}

interface StreamInfo {
  videoCodec: string
  audioTracks: AudioTrack[]
  subtitleTracks: any[]
  container: string
}

interface LiveEngineProps {
  channelId: string
  channelName: string
  autoplay?: boolean
}

type PlayerState =
  | 'resolving'    // detecting capabilities & fetching metadata
  | 'loading'      // mpegts.js loading first chunks
  | 'live'         // playing normally
  | 'buffering'    // rebuffering / short stall
  | 'reconnecting' // backend connection lost, retrying
  | 'error'        // unrecoverable (user sees message)
  | 'unsupported'  // codec not decodable on this device

// ── Constants ─────────────────────────────────────────────────────────────────

const RECONNECT_DELAYS = [1000, 2000, 4000, 8000, 16000] // ms
const MAX_RECONNECTS = 10

// ── Component ─────────────────────────────────────────────────────────────────

export function LiveEngine({ channelId, channelName, autoplay = true }: LiveEngineProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const mpegtsPlayerRef = useRef<any>(null)
  const liveSyncRef = useRef<LiveSyncController | null>(null)
  const bufferIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const reconnectCountRef = useRef(0)
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const destroyedRef = useRef(false)

  const [state, setState] = useState<PlayerState>('resolving')
  const [statusText, setStatusText] = useState('Initializing...')
  const [streamInfo, setStreamInfo] = useState<StreamInfo | null>(null)
  const [decodePath, setDecodePath] = useState<string>('')
  const [selectedAudioTrack, setSelectedAudioTrack] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [bufferHealth, setBufferHealth] = useState(0)

  const containerRef = useRef<HTMLDivElement>(null)

  // ── Cleanup ────────────────────────────────────────────────────────────────

  const destroyPlayer = useCallback(() => {
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current)
      reconnectTimerRef.current = null
    }
    if (bufferIntervalRef.current) {
      clearInterval(bufferIntervalRef.current)
      bufferIntervalRef.current = null
    }
    if (liveSyncRef.current) {
      liveSyncRef.current.destroy()
      liveSyncRef.current = null
    }
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.pause()
        mpegtsPlayerRef.current.unload()
        mpegtsPlayerRef.current.detachMediaElement()
        mpegtsPlayerRef.current.destroy()
      } catch {}
      mpegtsPlayerRef.current = null
    }
  }, [])

  // ── Reconnect logic ────────────────────────────────────────────────────────

  const scheduleReconnect = useCallback(() => {
    if (destroyedRef.current) return
    const count = reconnectCountRef.current
    if (count >= MAX_RECONNECTS) {
      setState('error')
      setErrorMessage('Unable to connect to the stream after multiple attempts. Please try again later.')
      return
    }
    const delay = RECONNECT_DELAYS[Math.min(count, RECONNECT_DELAYS.length - 1)]
    setState('reconnecting')
    setStatusText(`Reconnecting... (attempt ${count + 1})`)
    reconnectCountRef.current++
    reconnectTimerRef.current = setTimeout(() => {
      if (!destroyedRef.current) initPlayer()
    }, delay)
  }, [])

  // ── Init native MSE player (mpegts.js) ────────────────────────────────────

  const initPlayer = useCallback(async () => {
    if (destroyedRef.current || !videoRef.current) return

    destroyPlayer()

    const video = videoRef.current

    try {
      // Dynamic import of mpegts.js to avoid SSR issues
      const mpegts = await import('mpegts.js')
      if (!mpegts.default.isSupported()) {
        setState('unsupported')
        setErrorMessage('Your browser does not support the required video APIs (MSE). Please use a modern desktop browser.')
        return
      }

      let streamUrl = api.streamEngineUrl(channelId)
      if (streamUrl.startsWith('/')) {
        if (typeof window !== 'undefined') {
          streamUrl = `${window.location.origin}${streamUrl}`
        }
      }

      const player = mpegts.default.createPlayer(
        {
          type: 'mpegts',
          isLive: true,
          url: streamUrl,
        },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,
          lazyLoad: false,
          // Live sync settings
          liveBufferLatencyChasing: true,
          liveSync: true,
          liveSyncMaxLatency: 14.0,
          liveSyncPlaybackRate: 1.1,
          // Robustness
          autoCleanupSourceBuffer: true,
          autoCleanupMaxBackwardDuration: 60,
          autoCleanupMinBackwardDuration: 30,
        }
      )

      mpegtsPlayerRef.current = player
      player.attachMediaElement(video)
      player.load()

      // ── Event handlers ──────────────────────────────────────────────────────

      player.on(mpegts.default.Events.MEDIA_INFO, () => {
        setState('loading')
        setStatusText('Buffering...')
      })

      player.on(mpegts.default.Events.ERROR, (errType: any, errDetail: any) => {
        console.error('[LiveEngine] mpegts error:', errType, errDetail)
        scheduleReconnect()
      })

      video.addEventListener('playing', () => {
        reconnectCountRef.current = 0 // reset on successful play
        setState('live')
        setStatusText('')
      })

      video.addEventListener('waiting', () => {
        if (state !== 'reconnecting') setState('buffering')
      })

      video.addEventListener('stalled', () => {
        if (state !== 'reconnecting') setState('buffering')
      })

      video.addEventListener('error', () => {
        scheduleReconnect()
      })

      // ── LiveSyncController ─────────────────────────────────────────────────
      const liveSync = new LiveSyncController({
        targetLatencyMs: 9000,
        smallMarginMs: 1500,
        maxLatencyMs: 28000,
      })
      liveSync.attachVideo(video)
      liveSyncRef.current = liveSync

      // ── Buffer health monitor ──────────────────────────────────────────────
      bufferIntervalRef.current = setInterval(() => {
        if (video.buffered.length > 0) {
          const bufferedAhead = video.buffered.end(video.buffered.length - 1) - video.currentTime
          setBufferHealth(Math.min(100, Math.round((bufferedAhead / 15) * 100)))
        }
      }, 2000)

      if (autoplay) {
        video.play().catch(() => {
          // Autoplay blocked — user interaction needed
          video.muted = true
          video.play().catch(() => {})
        })
      }

      setState('loading')
      setStatusText('Buffering...')

    } catch (err: any) {
      console.error('[LiveEngine] Init error:', err)
      scheduleReconnect()
    }
  }, [channelId, autoplay, destroyPlayer, scheduleReconnect])

  // ── Main init sequence ─────────────────────────────────────────────────────

  useEffect(() => {
    destroyedRef.current = false

    const init = async () => {
      setState('resolving')
      setStatusText('Analyzing stream capabilities...')

      // 1. Fetch stream metadata
      let info: StreamInfo
      try {
        info = await api.getLiveEngineInfo(channelId)
        setStreamInfo(info)
      } catch {
        info = {
          videoCodec: 'h264',
          audioTracks: [{ index: 0, codec: 'aac', language: 'default' }],
          subtitleTracks: [],
          container: 'mpegts',
        }
        setStreamInfo(info)
      }

      // 2. Resolve decode path
      const primaryAudio = info.audioTracks[0]?.codec || 'aac'
      const pathResult = await resolveDecodePath(info.videoCodec, primaryAudio)
      setDecodePath(pathResult.details)
      console.log('[LiveEngine] Decode path:', pathResult.details)

      if (pathResult.video === DecodePath.UNSUPPORTED) {
        setState('unsupported')
        setErrorMessage(`Your browser cannot decode ${info.videoCodec} video. Please use Chrome, Firefox, or Edge on desktop.`)
        return
      }

      // 3. Start the player (native MSE via mpegts.js is always first attempt)
      await initPlayer()
    }

    init()

    return () => {
      destroyedRef.current = true
      destroyPlayer()
    }
  }, [channelId])

  // ── UI helpers ─────────────────────────────────────────────────────────────

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen()
    } else {
      document.exitFullscreen()
    }
  }

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = parseFloat(e.target.value)
    setVolume(v)
    if (videoRef.current) videoRef.current.volume = v
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  const overlayColor = state === 'live' ? 'bg-red-600' : 'bg-yellow-500'

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black flex flex-col group"
    >
      {/* ── Video Element ── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={isMuted}
      />

      {/* ── Status Overlay (shown when not live) ── */}
      {state !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          {state === 'error' || state === 'unsupported' ? (
            <div className="text-center px-8 max-w-md">
              <div className="w-16 h-16 mb-4 mx-auto rounded-full bg-red-500/20 flex items-center justify-center">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <h3 className="text-white text-lg font-semibold mb-2">
                {state === 'unsupported' ? 'Not Supported' : 'Stream Error'}
              </h3>
              <p className="text-zinc-400 text-sm">{errorMessage}</p>
              {state === 'error' && (
                <button
                  onClick={() => { reconnectCountRef.current = 0; initPlayer() }}
                  className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 text-white rounded-lg text-sm transition"
                >
                  Try Again
                </button>
              )}
            </div>
          ) : (
            <div className="text-center">
              {(state === 'loading' || state === 'resolving' || state === 'buffering') && (
                <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mb-4 mx-auto" />
              )}
              {state === 'reconnecting' && (
                <div className="w-12 h-12 mb-4 mx-auto flex items-center justify-center">
                  <svg className="w-10 h-10 text-white animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                </div>
              )}
              <p className="text-white/80 text-sm font-medium">{statusText}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Top Bar: Channel info + live badge ── */}
      <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4 bg-gradient-to-b from-black/70 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        <div className="flex items-center gap-3">
          <span className={`w-2.5 h-2.5 rounded-full ${state === 'live' ? 'bg-red-500 animate-pulse' : 'bg-yellow-400'}`} />
          <span className="text-white text-sm font-semibold">{channelName}</span>
          {state === 'live' && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-red-600 text-white rounded uppercase tracking-wider">
              Live
            </span>
          )}
        </div>
        {bufferHealth > 0 && state === 'live' && (
          <div className="flex items-center gap-2 text-xs text-white/60">
            <div className="w-16 h-1 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${bufferHealth}%` }} />
            </div>
            <span>Buffer</span>
          </div>
        )}
      </div>

      {/* ── Bottom Controls ── */}
      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-4 p-4 bg-gradient-to-t from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity z-20">
        {/* Volume */}
        <button onClick={toggleMute} className="text-white hover:text-white/80 transition">
          {isMuted || volume === 0 ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 3.663 12 4.109 12 5v14c0 .891-1.077 1.337-1.707.707L5.586 15z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.536 8.464a5 5 0 010 7.072M12 6v12m-3.536-9.536a5 5 0 000 7.072" />
            </svg>
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={handleVolumeChange}
          className="w-20 accent-white"
        />

        {/* Audio track picker */}
        {streamInfo && streamInfo.audioTracks.length > 1 && (
          <select
            value={selectedAudioTrack}
            onChange={(e) => setSelectedAudioTrack(parseInt(e.target.value))}
            className="bg-black/60 text-white text-xs border border-white/20 rounded px-2 py-1"
          >
            {streamInfo.audioTracks.map((t, i) => (
              <option key={i} value={i}>
                🔊 {t.language} ({t.codec})
              </option>
            ))}
          </select>
        )}

        <div className="flex-1" />

        {/* Fullscreen */}
        <button onClick={toggleFullscreen} className="text-white hover:text-white/80 transition">
          {isFullscreen ? (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9V4.5M9 9H4.5M15 9h4.5M15 9V4.5M15 15v4.5M15 15h4.5M9 15H4.5M9 15v4.5" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5v-4m0 4h-4m4 0l-5-5" />
            </svg>
          )}
        </button>
      </div>
    </div>
  )
}
