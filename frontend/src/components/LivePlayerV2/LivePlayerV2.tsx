"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Wifi, WifiOff, RefreshCw, Radio, Activity,
  ChevronDown, Music2, AlertTriangle
} from 'lucide-react'
import { api } from '@/lib/api'

export interface LivePlayerV2Props {
  channelId: string;
  streamUrl: string; // fallback or legacy
  channelName: string;
  autoplay?: boolean;
  onStateChange?: (state: string) => void;
  onError?: (error: string) => void;
}

export function LivePlayerV2({
  channelId,
  channelName,
  autoplay = true,
  onStateChange,
  onError,
}: LivePlayerV2Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const mpegtsPlayerRef = useRef<any>(null)
  const hideControlsTimer = useRef<any>(null)
  const reconnectTimer = useRef<any>(null)
  const statsTimer = useRef<any>(null)
  const viewerIdRef = useRef<string | null>(null)

  if (typeof window !== 'undefined' && !viewerIdRef.current) {
    viewerIdRef.current = 'v2-' + Math.random().toString(36).substring(2, 15)
  }

  // Player States
  const [mpegtsLib, setMpegtsLib] = useState<any>(null)
  const [state, setState] = useState<string>('idle') // idle, loading, playing, buffering, reconnecting, error
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)

  // Track & Codec Metadata
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [selectedTrackPid, setSelectedTrackPid] = useState<string>('')
  const [isTranscoding, setIsTranscoding] = useState(false)
  const [detectedAudioCodec, setDetectedAudioCodec] = useState<string>('')
  const [detectedVideoCodec, setDetectedVideoCodec] = useState<string>('')
  const [resolution, setResolution] = useState<string>('')
  
  // Buffering Stats
  const [bufferLength, setBufferLength] = useState<number>(0)
  const [fps, setFps] = useState<number>(0)
  const [bitrate, setBitrate] = useState<number>(0)

  // Reconnect state
  const [reconnectAttempts, setReconnectAttempts] = useState(0)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // 1. Dynamic import of mpegts.js to prevent Next.js SSR build issues
  useEffect(() => {
    import('mpegts.js').then((mod) => {
      setMpegtsLib(mod.default)
    }).catch(err => {
      console.error('[LivePlayerV2] Failed to load mpegts.js:', err)
      setErrorMsg('Failed to load player engine')
      updateState('error')
    })
  }, [])

  // State update wrapper
  const updateState = (s: string) => {
    setState(s)
    onStateChange?.(s)
  }

  // 2. Fetch Audio Tracks metadata on mount or channel change
  const fetchTracks = useCallback(async () => {
    try {
      const info = await api.getLiveStreamInfoV2(channelId)
      if (info?.allAudioStreams?.length > 0) {
        setAudioTracks(info.allAudioStreams)
      } else {
        setAudioTracks([])
      }
    } catch (err) {
      console.warn('[LivePlayerV2] Failed to load track info:', err)
    }
  }, [channelId])

  useEffect(() => {
    fetchTracks()
  }, [fetchTracks])

  // 3. Player initialization and connection
  const destroyPlayer = () => {
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.pause()
        mpegtsPlayerRef.current.unload()
        mpegtsPlayerRef.current.detachMediaElement()
        mpegtsPlayerRef.current.destroy()
      } catch (e) {}
      mpegtsPlayerRef.current = null
    }
    if (statsTimer.current) {
      clearInterval(statsTimer.current)
      statsTimer.current = null
    }
  }

  const initPlayer = useCallback(() => {
    if (!mpegtsLib || !videoRef.current) return

    destroyPlayer()
    updateState('loading')

    const mediaUrl = api.streamLiveUrlV2(
      channelId,
      selectedTrackPid || undefined,
      isTranscoding ? 'audio' : undefined,
      viewerIdRef.current || undefined
    )

    console.log(`[LivePlayerV2] Initializing mpegts.js player. Source URL: ${mediaUrl}`)

    try {
      const player = mpegtsLib.createPlayer(
        {
          type: 'mpegts',
          isLive: true,
          url: mediaUrl,
        },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,
          lazyLoad: false,
          liveBufferLatencyChasing: false,
          liveSync: true, // playbackRate adjustment for latency correction
          liveSyncMinLatency: 8.0,
          liveSyncMaxLatency: 15.0,
          liveSyncPlaybackRate: 1.1,
        }
      )

      mpegtsPlayerRef.current = player
      player.attachMediaElement(videoRef.current)

      // Media Info Event (Codec detection)
      player.on(mpegtsLib.Events.MEDIA_INFO, () => {
        try {
          const info = player.mediaInfo
          setDetectedVideoCodec(info.videoCodec || 'h264')
          setDetectedAudioCodec(info.audioCodec || 'aac')
          setResolution(`${info.width || 0}x${info.height || 0}`)

          // Transcode check: AC3/DTS/DCA is generally unsupported in standard browser MSE (e.g. Chrome)
          const rawAudioCodec = (info.audioCodec || '').toLowerCase()
          const needsTranscode = rawAudioCodec.includes('ac3') || rawAudioCodec.includes('dts') || rawAudioCodec.includes('dca')
          
          if (needsTranscode && !isTranscoding) {
            console.log(`[LivePlayerV2] Unsupported codec ${rawAudioCodec} detected. Requesting audio transcoding.`)
            setIsTranscoding(true)
            // The trigger of isTranscoding state will trigger the useEffect to rebuild player
          }
        } catch (e) {}
      })

      // Error Event
      player.on(mpegtsLib.Events.ERROR, (type: string, detail: string, info: any) => {
        console.warn(`[LivePlayerV2] Player error. Type: ${type}, Detail: ${detail}`)
        
        // Check if it's a codec decode error, which might require transcoding
        const isMSEError = detail === 'MediaMSEError' || type === 'MediaError'
        if (isMSEError && !isTranscoding) {
          setIsTranscoding(true)
          return
        }

        handleReconnect(`Player Error: ${detail || type}`)
      })

      player.load()

      if (autoplay) {
        const playPromise = player.play()
        if (playPromise && typeof playPromise.catch === 'function') {
          playPromise.catch((err: any) => {
            console.warn('[LivePlayerV2] Autoplay blocked or interrupted:', err)
          })
        }
      }

      // Start buffer level statistics logger
      statsTimer.current = setInterval(() => {
        if (!videoRef.current || !player) return
        try {
          const video = videoRef.current
          // Calculate buffer duration
          let currentBuffer = 0
          if (video.buffered.length > 0) {
            const currentTime = video.currentTime
            for (let i = 0; i < video.buffered.length; i++) {
              if (currentTime >= video.buffered.start(i) && currentTime <= video.buffered.end(i)) {
                currentBuffer = video.buffered.end(i) - currentTime
                break
              }
            }
          }
          setBufferLength(currentBuffer)

          // Fetch mpegts statistics
          if (player.statisticsInfo) {
            setFps(player.statisticsInfo.currentFps || 0)
            setBitrate(player.statisticsInfo.speed || 0)
          }
        } catch (e) {}
      }, 1000)

    } catch (err: any) {
      console.error('[LivePlayerV2] Failed to initialize mpegts player:', err)
      handleReconnect(`Initialization error: ${err.message}`)
    }
  }, [mpegtsLib, channelId, selectedTrackPid, isTranscoding, autoplay])

  // Trigger initialization when library or source configs change
  useEffect(() => {
    if (mpegtsLib) {
      initPlayer()
    }
    return () => destroyPlayer()
  }, [mpegtsLib, initPlayer])

  // 4. Reconnect logic with exponential backoff
  const handleReconnect = (reason: string) => {
    destroyPlayer()
    updateState('reconnecting')
    
    setReconnectAttempts((prev) => {
      const nextAttempt = prev + 1
      const delay = Math.min(1000 * Math.pow(2, prev), 10000)
      console.log(`[LivePlayerV2] Reconnecting in ${delay}ms (Attempt ${nextAttempt}). Reason: ${reason}`)

      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      reconnectTimer.current = setTimeout(() => {
        initPlayer()
      }, delay)

      return nextAttempt
    })
  }

  // Clear timers on unmount
  useEffect(() => {
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current)
      if (statsTimer.current) clearInterval(statsTimer.current)
    }
  }, [])

  // 5. Video Element Native Listeners
  const onPlay = () => {
    updateState('playing')
    setReconnectAttempts(0)
    setErrorMsg(null)
  }

  const onWaiting = () => {
    updateState('buffering')
  }

  // 6. User Interaction Handlers
  const handlePlayPause = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
      updateState('paused')
    }
  }

  const handleMuteToggle = () => {
    if (!videoRef.current) return
    const mute = !isMuted
    videoRef.current.muted = mute
    setIsMuted(mute)
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return
    const vol = parseFloat(e.target.value)
    videoRef.current.volume = vol
    setVolume(vol)
    setIsMuted(vol === 0)
    videoRef.current.muted = vol === 0
  }

  const handleFullscreenToggle = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(() => {})
    } else {
      document.exitFullscreen().then(() => {
        setIsFullscreen(false)
      }).catch(() => {})
    }
  }

  // Controls auto-hide
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (state === 'playing') setShowControls(false)
    }, 3500)
  }, [state])

  useEffect(() => {
    if (state !== 'playing') {
      setShowControls(true)
    } else {
      resetHideTimer()
    }
  }, [state, resetHideTimer])

  const handleMouseMove = () => {
    resetHideTimer()
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseLeave={() => state === 'playing' && setShowControls(false)}
      className="relative w-full h-full bg-black group select-none overflow-hidden flex items-center justify-center text-white"
    >
      {/* HTML5 Video Element */}
      <video
        ref={videoRef}
        onPlay={onPlay}
        onPlaying={onPlay}
        onWaiting={onWaiting}
        className="w-full h-full object-contain"
        playsInline
      />

      {/* Loading Overlay */}
      {(state === 'loading' || state === 'buffering') && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
          <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium tracking-wide text-zinc-300">
            {state === 'loading' ? 'Connecting to Stream...' : 'Buffering...'}
          </span>
        </div>
      )}

      {/* Reconnecting Overlay */}
      {state === 'reconnecting' && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-6">
          <RefreshCw className="w-10 h-10 text-primary animate-spin" />
          <div>
            <h3 className="text-lg font-bold text-white">Stream Connection Lost</h3>
            <p className="text-sm text-zinc-400 mt-1">Reconnecting dynamically (Attempt {reconnectAttempts})...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {state === 'error' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-6">
          <AlertTriangle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-bold text-white">Playback Error</h3>
            <p className="text-sm text-zinc-400 mt-1">{errorMsg || 'An unknown error occurred while playing stream.'}</p>
          </div>
          <button
            onClick={() => {
              setReconnectAttempts(0)
              setIsTranscoding(false)
              initPlayer()
            }}
            className="px-5 py-2 bg-primary hover:bg-primary/80 transition rounded-xl text-sm font-semibold text-black"
          >
            Retry Stream
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40 flex flex-col justify-between p-4 transition-opacity duration-300">
          
          {/* Top Panel */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-red-600 rounded-md text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                LIVE
              </span>
              <span className="text-sm font-semibold tracking-wide text-zinc-100 drop-shadow-md">
                {channelName} (Player 2 Beta)
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Stats button */}
              <button
                onClick={() => setShowStats(!showStats)}
                className={`p-2 rounded-xl transition backdrop-blur-md border ${
                  showStats 
                    ? 'bg-primary/20 border-primary text-primary' 
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title="Telemetry Stats"
              >
                <Activity size={18} />
              </button>

              {/* Settings button */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition backdrop-blur-md border ${
                  showSettings
                    ? 'bg-primary/20 border-primary text-primary'
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title="Settings"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Center Play Button Overlay (when paused) */}
          {state === 'paused' && (
            <button
              onClick={handlePlayPause}
              className="absolute self-center p-5 bg-primary/95 text-black hover:bg-primary hover:scale-105 transition duration-200 rounded-full shadow-2xl"
            >
              <Play size={32} className="fill-current ml-0.5" />
            </button>
          )}

          {/* Bottom Control Bar */}
          <div className="flex items-center justify-between gap-4 mt-auto">
            {/* Play/Pause & Volume */}
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayPause}
                className="p-2 hover:bg-white/15 rounded-xl transition text-white"
              >
                {state === 'paused' ? <Play size={20} className="fill-current" /> : <Pause size={20} className="fill-current" />}
              </button>

              <div className="flex items-center gap-2 group/volume">
                <button
                  onClick={handleMuteToggle}
                  className="p-2 hover:bg-white/15 rounded-xl transition text-white"
                >
                  {isMuted ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/volume:w-20 transition-all duration-300 h-1 accent-primary rounded-lg appearance-none cursor-pointer bg-zinc-600"
                />
              </div>
            </div>

            {/* Live Buffer indicator */}
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Radio size={14} className="text-zinc-500 animate-pulse" />
              <span>Buffer: {bufferLength.toFixed(1)}s</span>
            </div>

            {/* Fullscreen */}
            <button
              onClick={handleFullscreenToggle}
              className="p-2 hover:bg-white/15 rounded-xl transition text-white"
            >
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
            </button>
          </div>
        </div>
      )}

      {/* Floating Settings Drawer (Glassmorphic panel) */}
      {showSettings && (
        <div className="absolute right-4 top-16 w-72 bg-zinc-950/90 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-2xl z-50">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
              <Music2 size={16} className="text-primary" />
              Audio Settings
            </h4>
            <button
              onClick={() => setShowSettings(false)}
              className="text-xs text-zinc-400 hover:text-white"
            >
              Close
            </button>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-zinc-400 block mb-2">
                Available Audio Tracks ({audioTracks.length})
              </label>
              {audioTracks.length === 0 ? (
                <p className="text-xs text-zinc-500 italic p-2 bg-white/5 rounded-xl">
                  Detecting audio tracks...
                </p>
              ) : (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {audioTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => {
                        setSelectedTrackPid(String(track.id))
                        setShowSettings(false)
                      }}
                      className={`w-full flex items-center justify-between text-left p-2 rounded-xl text-xs transition ${
                        selectedTrackPid === String(track.id) || (selectedTrackPid === '' && track.id === audioTracks[0].id)
                          ? 'bg-primary/20 text-primary font-bold border border-primary/20'
                          : 'bg-white/5 text-zinc-300 hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <span className="truncate">
                        Track {track.id} ({(track.language || 'und').toUpperCase()}) [{track.codec}]
                      </span>
                      {selectedTrackPid === String(track.id) && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>On-Demand Transcoding</span>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${isTranscoding ? 'bg-amber-500/20 text-amber-500' : 'bg-green-500/20 text-green-500'}`}>
                {isTranscoding ? 'ACTIVE (AAC)' : 'DIRECT COPY'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Floating Statistics Panel */}
      {showStats && (
        <div className="absolute left-4 top-16 w-80 bg-zinc-950/95 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-2xl z-50 text-xs font-mono text-zinc-400 space-y-2">
          <div className="flex items-center justify-between border-b border-white/5 pb-2 mb-2">
            <h4 className="font-bold text-zinc-200 flex items-center gap-1.5 font-sans">
              <Activity size={14} className="text-primary" />
              Stream Telemetry V2
            </h4>
            <button
              onClick={() => setShowStats(false)}
              className="text-zinc-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex justify-between">
            <span>Video Resolution:</span>
            <span className="text-zinc-200">{resolution || 'calculating...'}</span>
          </div>
          <div className="flex justify-between">
            <span>Video Codec:</span>
            <span className="text-zinc-200">{detectedVideoCodec || 'copy'}</span>
          </div>
          <div className="flex justify-between">
            <span>Audio Codec:</span>
            <span className="text-zinc-200">{detectedAudioCodec || 'copy'}</span>
          </div>
          <div className="flex justify-between">
            <span>FPS:</span>
            <span className="text-zinc-200">{fps} fps</span>
          </div>
          <div className="flex justify-between">
            <span>Bitrate:</span>
            <span className="text-zinc-200">{(bitrate / 1024).toFixed(0)} KB/s</span>
          </div>
          <div className="flex justify-between">
            <span>Buffer Length:</span>
            <span className="text-zinc-200">{bufferLength.toFixed(1)}s</span>
          </div>
          <div className="flex justify-between">
            <span>Reconnect count:</span>
            <span className="text-zinc-200">{reconnectAttempts}</span>
          </div>
        </div>
      )}
    </div>
  )
}
