"use client"

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Wifi, WifiOff, RefreshCw, Radio, Activity,
  ChevronDown, Music2, AlertTriangle, Cpu, Layers
} from 'lucide-react'
import { api } from '@/lib/api'

export interface LivePlayerV3Props {
  channelId: string;
  streamUrl: string; // fallback or legacy
  channelName: string;
  autoplay?: boolean;
  onStateChange?: (state: string) => void;
  onError?: (error: string) => void;
}

export function LivePlayerV3({
  channelId,
  channelName,
  autoplay = true,
  onStateChange,
  onError,
}: LivePlayerV3Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  
  // Refs for tracking playback engines and loops
  const mpegtsPlayerRef = useRef<any>(null)
  const decodeWorkerRef = useRef<Worker | null>(null)
  const streamReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null)
  const viewerIdRef = useRef<string | null>(null)
  
  // Timers
  const hideControlsTimer = useRef<any>(null)
  const reconnectTimer = useRef<any>(null)
  const statsTimer = useRef<any>(null)
  const renderLoopRef = useRef<any>(null)

  // Player configurations
  const [mpegtsLib, setMpegtsLib] = useState<any>(null)
  const [state, setState] = useState<string>('idle') // idle, loading, playing, buffering, reconnecting, error
  const [decodePath, setDecodePath] = useState<'NATIVE_MSE' | 'WEBCODECS_CANVAS' | 'WASM_CANVAS' | 'PENDING'>('PENDING')
  
  // Audio tracks & codecs from PMT metadata
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [selectedTrackPid, setSelectedTrackPid] = useState<string>('')
  
  // States
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [reconnectAttempts, setReconnectAttempts] = useState(0)

  // Codec Info
  const [detectedVideoCodec, setDetectedVideoCodec] = useState<string>('')
  const [detectedAudioCodec, setDetectedAudioCodec] = useState<string>('')
  const [resolution, setResolution] = useState<string>('')

  // Statistics
  const [bufferLength, setBufferLength] = useState<number>(0)
  const [fps, setFps] = useState<number>(0)
  const [bitrate, setBitrate] = useState<number>(0)

  // Non-Native playback queue
  const videoFrameQueue = useRef<any[]>([])
  const targetFps = useRef<number>(30)

  // Initialize unique viewer ID once per session
  if (typeof window !== 'undefined' && !viewerIdRef.current) {
    viewerIdRef.current = 'v3-' + Math.random().toString(36).substring(2, 15)
  }

  // Load mpegts.js for the native MSE decode path
  useEffect(() => {
    import('mpegts.js').then((mod) => {
      setMpegtsLib(mod.default)
    }).catch(err => {
      console.warn('[LivePlayerV3] Failed to load mpegts.js:', err)
    })
  }, [])

  const updateState = (s: string) => {
    setState(s)
    onStateChange?.(s)
  }

  // 1. Capability & Decode-Path Resolver
  const resolvePlaybackPipeline = useCallback(async () => {
    updateState('loading')
    setDecodePath('PENDING')

    try {
      // Query PMT stream info from backend
      const info = await api.getLiveStreamInfoV3(channelId)
      const tracks = info?.allAudioStreams || []
      setAudioTracks(tracks)

      // Get codecs
      let videoCodec = 'h264'
      let audioCodec = 'aac'

      // Probe stream info to detect codecs
      // For now, fallback to H.264 if none. If we find AC3, DTS, or HEVC, resolve accordingly.
      const hasHevc = tracks.some((t: any) => t.codec?.toLowerCase().includes('hevc') || t.codec?.toLowerCase().includes('h265'))
      const hasAc3 = tracks.some((t: any) => t.codec?.toLowerCase().includes('ac3'))
      const hasDts = tracks.some((t: any) => t.codec?.toLowerCase().includes('dts'))

      // Simple browser checks
      const isChrome = typeof window !== 'undefined' && /Chrome/.test(navigator.userAgent) && /Google Inc/.test(navigator.vendor)
      const isSafari = typeof window !== 'undefined' && /^((?!chrome|android).)*safari/i.test(navigator.userAgent)

      let selectedPath: 'NATIVE_MSE' | 'WEBCODECS_CANVAS' | 'WASM_CANVAS' = 'NATIVE_MSE'

      // HEVC or AC3/DTS is typically not supported natively in Chrome MSE
      if (hasHevc || hasAc3 || hasDts) {
        if (typeof VideoDecoder !== 'undefined') {
          selectedPath = 'WEBCODECS_CANVAS'
          videoCodec = hasHevc ? 'hevc' : 'h264'
          audioCodec = hasAc3 ? 'ac3' : (hasDts ? 'dts' : 'aac')
        } else {
          selectedPath = 'WASM_CANVAS'
        }
      } else {
        // Standard H.264 and AAC -> Native MSE
        selectedPath = 'NATIVE_MSE'
      }

      // Safeguard: WebCodecs is always better than WASM, resolve to WebCodecs if MSE is unsupported
      if (selectedPath === 'NATIVE_MSE' && !mpegtsLib) {
        if (typeof VideoDecoder !== 'undefined') {
          selectedPath = 'WEBCODECS_CANVAS'
        } else {
          selectedPath = 'WASM_CANVAS'
        }
      }

      setDecodePath(selectedPath)
      setDetectedVideoCodec(videoCodec.toUpperCase())
      setDetectedAudioCodec(audioCodec.toUpperCase())
      setResolution(hasHevc ? '1920x1080' : '1280x720')

      console.log(`[LivePlayerV3] Resolved Decode Path: ${selectedPath}. Video: ${videoCodec}, Audio: ${audioCodec}`)

    } catch (err: any) {
      console.warn('[LivePlayerV3] Failed to resolve pipeline from PMT, defaulting to NATIVE_MSE:', err)
      setDecodePath('NATIVE_MSE')
      setDetectedVideoCodec('H264')
      setDetectedAudioCodec('AAC')
    }
  }, [channelId, mpegtsLib])

  useEffect(() => {
    resolvePlaybackPipeline()
  }, [resolvePlaybackPipeline])

  // 2. Destructor
  const destroyPipeline = () => {
    // Stop native mpegts
    if (mpegtsPlayerRef.current) {
      try {
        mpegtsPlayerRef.current.pause()
        mpegtsPlayerRef.current.unload()
        mpegtsPlayerRef.current.detachMediaElement()
        mpegtsPlayerRef.current.destroy()
      } catch (e) {}
      mpegtsPlayerRef.current = null
    }

    // Stop Reader
    if (streamReaderRef.current) {
      try { streamReaderRef.current.cancel(); } catch (e) {}
      streamReaderRef.current = null;
    }

    // Terminate Worker
    if (decodeWorkerRef.current) {
      decodeWorkerRef.current.terminate()
      decodeWorkerRef.current = null
    }

    // Cancel Canvas render loop
    if (renderLoopRef.current) {
      cancelAnimationFrame(renderLoopRef.current)
      renderLoopRef.current = null
    }

    // Clear buffer queue
    videoFrameQueue.current = []

    if (statsTimer.current) {
      clearInterval(statsTimer.current)
      statsTimer.current = null
    }
  }

  // 3. Initialize Playback Engine
  const startPipeline = useCallback(() => {
    destroyPipeline()

    if (decodePath === 'PENDING') return

    if (decodePath === 'NATIVE_MSE') {
      initNativeMse()
    } else {
      initClientDecoder()
    }
  }, [decodePath, channelId])

  useEffect(() => {
    startPipeline()
    return () => destroyPipeline()
  }, [decodePath, startPipeline])

  // Path A: Native MSE via mpegts.js
  const initNativeMse = () => {
    if (!mpegtsLib || !videoRef.current) return

    updateState('loading')
    const mediaUrl = api.streamLiveUrlV3(channelId, viewerIdRef.current || undefined)

    try {
      const player = mpegtsLib.createPlayer(
        { type: 'mpegts', isLive: true, url: mediaUrl },
        {
          enableWorker: true,
          enableStashBuffer: true,
          stashInitialSize: 512 * 1024,
          lazyLoad: false,
          liveBufferLatencyChasing: false,
          liveSync: true,
          liveSyncMinLatency: 8.0,
          liveSyncMaxLatency: 15.0,
          liveSyncPlaybackRate: 1.1,
        }
      )

      mpegtsPlayerRef.current = player
      player.attachMediaElement(videoRef.current)

      player.on(mpegtsLib.Events.MEDIA_INFO, () => {
        const info = player.mediaInfo
        setResolution(`${info.width || 0}x${info.height || 0}`)
        if (info.fps) targetFps.current = info.fps
      })

      player.on(mpegtsLib.Events.ERROR, (type: any, detail: any) => {
        handleReconnect(`Native Player Error: ${detail}`)
      })

      player.load()
      
      if (autoplay) {
        player.play().catch(() => {})
      }

      updateState('playing')

      // Stats monitoring
      statsTimer.current = setInterval(() => {
        if (!videoRef.current || !player) return
        try {
          const video = videoRef.current
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
          setFps(player.statisticsInfo.currentFps || 0)
          setBitrate(player.statisticsInfo.speed || 0)
        } catch (e) {}
      }, 1000)

    } catch (err: any) {
      handleReconnect(`Native MSE init failed: ${err.message}`)
    }
  }

  // Path B: WebCodecs/WASM Canvas Decoding
  const initClientDecoder = async () => {
    updateState('loading')

    // Create decode worker
    const worker = new Worker(new URL('./decode-worker.ts', import.meta.url))
    decodeWorkerRef.current = worker

    // Post initialization to Web Worker
    worker.postMessage({
      type: 'init',
      data: {
        videoCodec: detectedVideoCodec.toLowerCase(),
        audioCodec: detectedAudioCodec.toLowerCase(),
        vPid: null,
        aPid: null,
      },
    })

    // Listen to worker outputs
    worker.onmessage = (e) => {
      const { type, frame, timestamp, message } = e.data

      if (type === 'video-frame') {
        // Enqueue decoded frame
        videoFrameQueue.current.push(frame)
      } else if (type === 'wasm-video-frame') {
        // WASM frame rendering fallback trigger
        self.postMessage({ type: 'trigger-render' })
      } else if (type === 'error') {
        console.warn('[LivePlayerV3 Worker]', message)
      }
    }

    // Launch render loop for Canvas
    startCanvasRenderLoop()

    // Fetch the stream via fetch API
    const mediaUrl = api.streamLiveUrlV3(channelId, viewerIdRef.current || undefined)
    
    try {
      const res = await fetch(mediaUrl, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
        },
      })

      if (!res.body) {
        throw new Error('Response body is empty')
      }

      const reader = res.body.getReader()
      streamReaderRef.current = reader

      updateState('playing')
      setReconnectAttempts(0)

      let bytesReceived = 0
      let lastBytesTime = Date.now()

      // Pull stream data loop
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        // Forward chunk to decode worker
        worker.postMessage({ type: 'chunk', data: value.buffer }, [value.buffer])

        bytesReceived += value.length
        const elapsed = Date.now() - lastBytesTime
        if (elapsed >= 1000) {
          setBitrate(Math.round((bytesReceived / 1024) / (elapsed / 1000)))
          bytesReceived = 0
          lastBytesTime = Date.now()
        }
      }

    } catch (err: any) {
      handleReconnect(`Fetch stream error: ${err.message}`)
    }
  }

  // Canvas Pacing and Catch-up Logic (FR-13)
  const startCanvasRenderLoop = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let lastFrameTime = performance.now()

    const render = (now: number) => {
      renderLoopRef.current = requestAnimationFrame(render)

      const queue = videoFrameQueue.current
      setBufferLength(queue.length / targetFps.current)

      if (queue.length === 0) return

      // Pacing catch-up correction:
      // If buffer is building up (> 2.0s worth of frames), draw frames faster
      // If buffer is running dry (< 0.5s), slow down slightly
      let delay = 1000 / targetFps.current // base interval (e.g. 33.3ms for 30fps)
      if (queue.length > targetFps.current * 2) {
        delay *= 0.85; // play faster (catch up)
      } else if (queue.length < targetFps.current * 0.5) {
        delay *= 1.15; // slow down slightly to smooth out playback
      }

      const elapsed = now - lastFrameTime
      if (elapsed >= delay) {
        const frame = queue.shift()
        if (frame) {
          ctx.drawImage(frame, 0, 0, canvas.width, canvas.height)
          frame.close() // Close VideoFrame immediately to release GPU memory

          setFps((prev) => {
            // Smooth calculation
            return Math.round(1000 / elapsed)
          })
        }
        lastFrameTime = now
      }
    }

    renderLoopRef.current = requestAnimationFrame(render)
  }

  // 4. Reconnect with exponential backoff and viewerId tracking
  const handleReconnect = (reason: string) => {
    destroyPipeline()
    updateState('reconnecting')

    setReconnectAttempts((prev) => {
      const nextAttempt = prev + 1
      const delay = Math.min(1000 * Math.pow(2, prev), 10000)
      console.log(`[LivePlayerV3] Reconnecting in ${delay}ms (Attempt ${nextAttempt}). Reason: ${reason}`)

      if (reconnectTimer.current) clearTimeout(reconnectTimer.current)
      reconnectTimer.current = setTimeout(() => {
        startPipeline()
      }, delay)

      return nextAttempt
    })
  }

  // 5. Volume and Controls
  const handlePlayPause = () => {
    if (decodePath === 'NATIVE_MSE') {
      if (videoRef.current) {
        if (videoRef.current.paused) videoRef.current.play().catch(() => {})
        else {
          videoRef.current.pause()
          updateState('paused')
        }
      }
    } else {
      if (state === 'playing') {
        updateState('paused')
        if (renderLoopRef.current) {
          cancelAnimationFrame(renderLoopRef.current)
          renderLoopRef.current = null
        }
      } else {
        updateState('playing')
        startCanvasRenderLoop()
      }
    }
  }

  const handleMuteToggle = () => {
    if (videoRef.current) {
      const mute = !isMuted
      videoRef.current.muted = mute
      setIsMuted(mute)
    }
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

  return (
    <div
      ref={containerRef}
      onMouseMove={() => resetHideTimer()}
      onMouseLeave={() => state === 'playing' && setShowControls(false)}
      className="relative w-full h-full bg-black group select-none overflow-hidden flex items-center justify-center text-white"
    >
      {/* Target Render Element depending on Decode Path */}
      {decodePath === 'NATIVE_MSE' ? (
        <video
          ref={videoRef}
          onPlay={() => updateState('playing')}
          onWaiting={() => updateState('buffering')}
          className="w-full h-full object-contain"
          playsInline
        />
      ) : (
        <canvas
          ref={canvasRef}
          width={1280}
          height={720}
          className="w-full h-full object-contain bg-zinc-950"
        />
      )}

      {/* Loading Overlay */}
      {(state === 'loading' || state === 'buffering' || decodePath === 'PENDING') && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
          <div className="w-10 h-10 border-4 border-violet-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-medium tracking-wide text-zinc-300">
            {state === 'loading' ? 'Analyzing Client Capabilities...' : 'Buffering frames...'}
          </span>
        </div>
      )}

      {/* Reconnecting Overlay */}
      {state === 'reconnecting' && (
        <div className="absolute inset-0 bg-black/70 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-6 z-30">
          <RefreshCw className="w-10 h-10 text-violet-400 animate-spin" />
          <div>
            <h3 className="text-lg font-bold text-white">Stream Disturbed</h3>
            <p className="text-sm text-zinc-400 mt-1">Reconnecting dynamically (Attempt {reconnectAttempts})...</p>
          </div>
        </div>
      )}

      {/* Error Overlay */}
      {state === 'error' && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center gap-4 text-center p-6 z-30">
          <AlertTriangle className="w-12 h-12 text-red-500" />
          <div>
            <h3 className="text-lg font-bold text-white">Device Decode Failure</h3>
            <p className="text-sm text-zinc-400 mt-1">{errorMsg || 'Your device does not support client decoding of this codec.'}</p>
          </div>
          <button
            onClick={() => {
              setReconnectAttempts(0)
              resolvePlaybackPipeline()
            }}
            className="px-5 py-2 bg-violet-600 hover:bg-violet-700 transition rounded-xl text-sm font-semibold text-white"
          >
            Retry capability scan
          </button>
        </div>
      )}

      {/* Controls Overlay */}
      {showControls && (
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-black/40 flex flex-col justify-between p-4 transition-opacity duration-300 z-20">
          
          {/* Top Panel */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-bold bg-violet-600 rounded-md text-white">
                <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                PLAYER 3 (BETA)
              </span>
              <span className="text-sm font-semibold tracking-wide text-zinc-100 drop-shadow-md">
                {channelName} — Client-Side Decode
              </span>
            </div>
            
            <div className="flex items-center gap-3">
              {/* Telemetry trigger */}
              <button
                onClick={() => setShowStats(!showStats)}
                className={`p-2 rounded-xl transition backdrop-blur-md border ${
                  showStats 
                    ? 'bg-violet-600/30 border-violet-500 text-violet-300' 
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title="Capability Metrics"
              >
                <Activity size={18} />
              </button>

              {/* Settings toggle */}
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-2 rounded-xl transition backdrop-blur-md border ${
                  showSettings
                    ? 'bg-violet-600/30 border-violet-500 text-violet-300'
                    : 'bg-white/5 border-white/10 text-white/80 hover:bg-white/10 hover:text-white'
                }`}
                title="Audio Tracks"
              >
                <Settings size={18} />
              </button>
            </div>
          </div>

          {/* Center Play Button Overlay */}
          {state === 'paused' && (
            <button
              onClick={handlePlayPause}
              className="absolute self-center p-5 bg-violet-600 text-white hover:bg-violet-500 hover:scale-105 transition duration-200 rounded-full shadow-2xl"
            >
              <Play size={32} className="fill-current ml-0.5" />
            </button>
          )}

          {/* Bottom Control Bar */}
          <div className="flex items-center justify-between gap-4 mt-auto">
            <div className="flex items-center gap-4">
              <button
                onClick={handlePlayPause}
                className="p-2 hover:bg-white/15 rounded-xl transition text-white"
              >
                {state === 'paused' ? <Play size={20} className="fill-current" /> : <Pause size={20} className="fill-current" />}
              </button>

              {/* Volume */}
              {decodePath === 'NATIVE_MSE' && (
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
                    onChange={(e) => {
                      const vol = parseFloat(e.target.value)
                      if (videoRef.current) {
                        videoRef.current.volume = vol
                        videoRef.current.muted = vol === 0
                      }
                      setVolume(vol)
                      setIsMuted(vol === 0)
                    }}
                    className="w-0 group-hover/volume:w-20 transition-all duration-300 h-1 accent-violet-500 rounded-lg appearance-none cursor-pointer bg-zinc-600"
                  />
                </div>
              )}
            </div>

            {/* Pacing Info */}
            <div className="flex items-center gap-2 text-xs font-mono text-zinc-400">
              <Radio size={14} className="text-violet-400 animate-pulse" />
              <span>Canvas Buffer: {bufferLength.toFixed(1)}s</span>
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

      {/* Floating Settings Drawer */}
      {showSettings && (
        <div className="absolute right-4 top-16 w-72 bg-zinc-950/90 backdrop-blur-lg border border-white/10 rounded-2xl p-4 shadow-2xl z-50">
          <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
            <h4 className="font-bold text-sm text-zinc-100 flex items-center gap-2">
              <Music2 size={16} className="text-violet-400" />
              PMT Audio Stream Selector
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
                Available PMT Tracks ({audioTracks.length})
              </label>
              {audioTracks.length === 0 ? (
                <p className="text-xs text-zinc-500 italic p-2 bg-white/5 rounded-xl">
                  Extracting tracks from parser...
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
                        selectedTrackPid === String(track.id)
                          ? 'bg-violet-600/20 text-violet-400 font-bold border border-violet-500/30'
                          : 'bg-white/5 text-zinc-300 hover:bg-white/10 border border-transparent'
                      }`}
                    >
                      <span className="truncate">
                        PID {track.id} ({(track.language || 'und').toUpperCase()}) [{track.codec}]
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-white/5 pt-3 flex items-center justify-between text-xs text-zinc-400">
              <span>Client Audio Decode</span>
              <span className="px-2 py-0.5 rounded text-[10px] bg-violet-600/20 text-violet-400 font-bold">
                ACTIVE (WASM/WebCodecs)
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
              <Cpu size={14} className="text-violet-400" />
              Client Capability Resolver
            </h4>
            <button
              onClick={() => setShowStats(false)}
              className="text-zinc-500 hover:text-white"
            >
              ✕
            </button>
          </div>
          <div className="flex justify-between">
            <span>Decode Path:</span>
            <span className="text-violet-400 font-semibold">{decodePath}</span>
          </div>
          <div className="flex justify-between">
            <span>Video Codec:</span>
            <span className="text-zinc-200">{detectedVideoCodec || 'PASSTHROUGH'}</span>
          </div>
          <div className="flex justify-between">
            <span>Audio Codec:</span>
            <span className="text-zinc-200">{detectedAudioCodec || 'PASSTHROUGH'}</span>
          </div>
          <div className="flex justify-between">
            <span>Estimated FPS:</span>
            <span className="text-zinc-200">{fps} fps</span>
          </div>
          <div className="flex justify-between">
            <span>Download Speed:</span>
            <span className="text-zinc-200">{bitrate} KB/s</span>
          </div>
          <div className="flex justify-between">
            <span>Decoder Buffer:</span>
            <span className="text-zinc-200">{bufferLength.toFixed(1)}s</span>
          </div>
          <div className="flex justify-between text-zinc-500 italic mt-2 border-t border-white/5 pt-2">
            <span>WebCodecs API:</span>
            <span>{typeof VideoDecoder !== 'undefined' ? 'Supported' : 'Unsupported'}</span>
          </div>
        </div>
      )}
    </div>
  )
}
