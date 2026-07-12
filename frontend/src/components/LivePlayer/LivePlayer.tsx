"use client"

// ─── IPGenZ Live Player v2 — Main React Component ────────────────────────────
// UI layer only. Zero playback logic here.
// Mounts the PlayerController, renders controls, exposes stats.

import React, { useEffect, useRef, useState, useCallback } from 'react'
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  Settings, Wifi, WifiOff, RefreshCw, Radio, Activity,
  ChevronDown, Music2, AlertTriangle
} from 'lucide-react'
import { PlayerController } from './PlayerController'
import type { PlayerState, AudioTrack, PlayerStats, LivePlayerProps } from './types'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fmtTime(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

function fmtBuffer(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

// ─── Component ───────────────────────────────────────────────────────────────

export function LivePlayer({
  channelId,
  streamUrl,
  channelName,
  autoplay = true,
  onStateChange,
  onStats,
  onError,
}: LivePlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const controllerRef = useRef<PlayerController | null>(null)
  const hideControlsTimer = useRef<any>(null)

  const [state, setState] = useState<PlayerState>('idle')
  const [audioTracks, setAudioTracks] = useState<AudioTrack[]>([])
  const [stats, setStats] = useState<PlayerStats | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [showStats, setShowStats] = useState(false)
  const [autoplayBlocked, setAutoplayBlocked] = useState(false)
  const [isTranscoding, setIsTranscoding] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [reconnectInfo, setReconnectInfo] = useState<{ attempt: number; reason: string } | null>(null)
  // v3: live buffer level — drives overlay visibility decisions
  const [bufferedSec, setBufferedSec] = useState(0)
  const [bufferHealth, setBufferHealth] = useState<string>('filling')

  // ── Controller init ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!videoRef.current) return

    const controller = new PlayerController({
      healthCheckIntervalMs: 1000,
      maxReconnectAttempts: 10,
    })
    controllerRef.current = controller

    // Subscribe to events
    const unsubs = [
      controller.events.on('STATE_CHANGE', (s: PlayerState) => {
        setState(s)
        onStateChange?.(s)
        if (s === 'playing') {
          setErrorMsg(null)
          setReconnectInfo(null)
        }
      }),
      controller.events.on('STATS_UPDATE', (s: PlayerStats) => {
        setStats(s)
        onStats?.(s)
      }),
      controller.events.on('AUDIO_TRACKS_READY', (tracks: AudioTrack[]) => {
        setAudioTracks(tracks)
      }),
      controller.events.on('AUTOPLAY_BLOCKED', () => {
        setAutoplayBlocked(true)
      }),
      controller.events.on('TRANSCODE_NEEDED', () => {
        setIsTranscoding(true)
      }),
      // v3: buffer reports — drive overlay decisions in UI
      controller.events.on('BUFFER_REPORT', (report: any) => {
        setBufferedSec(report.bufferedSec)
        setBufferHealth(report.health)
      }),
      controller.events.on('RECONNECTING', ({ attempt, reason }: any) => {
        setReconnectInfo({ attempt, reason })
        // Don't override state here — controller decides based on buffer
      }),
      controller.events.on('RECOVERED', () => {
        setReconnectInfo(null)
      }),
      controller.events.on('ERROR', (msg: string) => {
        setErrorMsg(msg)
        setState('error')
        onError?.(msg)
      }),
    ]

    controller.attachVideoElement(videoRef.current)
    controller.load(channelId, streamUrl)

    return () => {
      unsubs.forEach(fn => fn())
      controller.destroy()
      controllerRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channelId, streamUrl])

  // ── Controls auto-hide ───────────────────────────────────────────────────
  const resetHideTimer = useCallback(() => {
    setShowControls(true)
    clearTimeout(hideControlsTimer.current)
    hideControlsTimer.current = setTimeout(() => {
      if (state === 'playing') setShowControls(false)
    }, 3500)
  }, [state])

  useEffect(() => {
    return () => clearTimeout(hideControlsTimer.current)
  }, [])

  // Show controls when not playing
  useEffect(() => {
    if (state !== 'playing') setShowControls(true)
  }, [state])

  // ── Fullscreen ───────────────────────────────────────────────────────────
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  }

  // ── Volume ───────────────────────────────────────────────────────────────
  const handleVolumeChange = (v: number) => {
    setVolume(v)
    setIsMuted(v === 0)
    if (videoRef.current) videoRef.current.volume = v
  }

  const toggleMute = () => {
    if (!videoRef.current) return
    const next = !isMuted
    setIsMuted(next)
    videoRef.current.muted = next
  }

  // ── Audio track selection ────────────────────────────────────────────────
  const selectAudioTrack = (id: number) => {
    controllerRef.current?.selectAudioTrack(id)
    setAudioTracks(prev => prev.map(t => ({ ...t, active: t.id === id })))
    setShowSettings(false)
  }

  // ── Play/Pause ───────────────────────────────────────────────────────────
  const togglePlay = () => {
    if (!videoRef.current) return
    if (videoRef.current.paused) {
      videoRef.current.play().catch(() => {})
    } else {
      videoRef.current.pause()
    }
    setAutoplayBlocked(false)
  }

  // ── Status display ───────────────────────────────────────────────────────
  const getStatusLabel = (): { label: string; color: string } => {
    switch (state) {
      case 'playing':    return { label: 'LIVE', color: 'bg-red-500' }
      // v3: if buffer is OK during buffering/recovering, still show LIVE
      case 'buffering':  return bufferedSec >= 3 ? { label: 'LIVE', color: 'bg-red-500' } : { label: 'BUFFERING…', color: 'bg-yellow-500' }
      case 'waiting':    return bufferedSec >= 3 ? { label: 'LIVE', color: 'bg-red-500' } : { label: 'BUFFERING…', color: 'bg-yellow-500' }
      case 'recovering': return bufferedSec >= 3 ? { label: 'LIVE', color: 'bg-red-500' } : { label: 'RECONNECTING…', color: 'bg-orange-500' }
      case 'loading':    return { label: 'LOADING…', color: 'bg-blue-500' }
      case 'error':      return { label: 'ERROR', color: 'bg-red-600' }
      default:           return { label: 'IDLE', color: 'bg-zinc-600' }
    }
  }

  const { label: statusLabel, color: statusColor } = getStatusLabel()

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full bg-black select-none overflow-hidden group"
      onMouseMove={resetHideTimer}
      onMouseLeave={() => state === 'playing' && setShowControls(false)}
      onClick={() => { if (state === 'playing' || state === 'buffering') togglePlay() }}
    >
      {/* ── Video Element ── */}
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
        muted={isMuted}
      />

      {/* ── Loading overlay — initial startup only ── */}
      {(state === 'loading' || state === 'initializing') && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-10">
          <div className="w-14 h-14 rounded-full border-4 border-white/20 border-t-white animate-spin mb-5" />
          <p className="text-white/80 text-sm tracking-wider uppercase font-semibold mb-4">Loading stream…</p>
          {/* Buffer fill bar */}
          <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-white/60 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, (bufferedSec / 5) * 100)}%` }}
            />
          </div>
          <p className="text-white/40 text-xs mt-2 font-mono">
            {bufferedSec.toFixed(1)}s / 5.0s
          </p>
        </div>
      )}

      {/* ── Buffering spinner — ONLY shown when buffer is truly empty ── */}
      {(state === 'buffering' || state === 'waiting') && bufferedSec < 3 && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
          <div className="w-12 h-12 rounded-full border-4 border-white/20 border-t-white/80 animate-spin" />
        </div>
      )}

      {/* ── Recovering overlay — ONLY shown when buffer is exhausted ── */}
      {state === 'recovering' && bufferedSec < 3 && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 z-10">
          <RefreshCw size={36} className="text-orange-400 animate-spin mb-3" />
          <p className="text-white font-semibold text-lg">Reconnecting…</p>
          {reconnectInfo && (
            <p className="text-white/60 text-sm mt-1">Attempt {reconnectInfo.attempt} · {reconnectInfo.reason}</p>
          )}
        </div>
      )}

      {/* ── Silent reconnect indicator — buffer is healthy, no big overlay ── */}
      {reconnectInfo && bufferedSec >= 3 && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-3 py-1.5 rounded-full
                        bg-black/60 backdrop-blur-sm border border-white/10
                        text-white/70 text-xs flex items-center gap-2 pointer-events-none">
          <RefreshCw size={10} className="animate-spin" />
          Reconnecting in background…
        </div>
      )}

      {/* ── Autoplay blocked ── */}
      {autoplayBlocked && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
          <button
            onClick={e => { e.stopPropagation(); togglePlay(); setAutoplayBlocked(false) }}
            className="flex flex-col items-center gap-4 group/btn"
          >
            <div className="w-20 h-20 rounded-full bg-white/10 border-2 border-white/30 flex items-center justify-center
                            group-hover/btn:bg-white/20 transition-all duration-200">
              <Play size={32} className="text-white ml-1" />
            </div>
            <span className="text-white/80 text-sm font-medium tracking-wider uppercase">Tap to Play</span>
          </button>
        </div>
      )}

      {/* ── Fatal error ── */}
      {state === 'error' && errorMsg && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 p-6 text-center">
          <AlertTriangle size={40} className="text-red-400 mb-4" />
          <p className="text-white font-bold text-xl mb-2">Stream Error</p>
          <p className="text-white/60 text-sm max-w-xs">{errorMsg}</p>
          <button
            onClick={e => { e.stopPropagation(); controllerRef.current?.load(channelId, streamUrl) }}
            className="mt-6 px-6 py-2.5 bg-white/10 hover:bg-white/20 border border-white/20 rounded-xl text-white text-sm transition"
          >
            Try Again
          </button>
        </div>
      )}

      {/* ── Transcoding badge ── */}
      {isTranscoding && (state === 'playing' || bufferedSec >= 3) && (
        <div className="absolute top-4 right-4 z-30 px-2.5 py-1 rounded-lg bg-blue-600/80 backdrop-blur-sm
                        text-white text-xs font-semibold flex items-center gap-1.5 pointer-events-none">
          <Music2 size={10} />
          AC3→AAC
        </div>
      )}

      {/* ── Controls overlay ── */}
      <div
        className={`absolute inset-0 flex flex-col justify-between z-20 transition-opacity duration-300
          ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={e => e.stopPropagation()}
      >
        {/* Top bar */}
        <div className="p-4 flex items-center justify-between bg-gradient-to-b from-black/70 to-transparent">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full animate-pulse ${statusColor}`} />
              <span className="text-white text-xs font-bold tracking-widest uppercase">{statusLabel}</span>
            </div>
            {channelName && (
              <span className="text-white/80 text-sm font-medium hidden sm:block">{channelName}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Stats toggle */}
            <button
              onClick={() => setShowStats(s => !s)}
              className={`p-2 rounded-lg transition ${showStats
                ? 'bg-white/20 text-white'
                : 'text-white/60 hover:text-white hover:bg-white/10'}`}
            >
              <Activity size={16} />
            </button>
          </div>
        </div>

        {/* Stats panel */}
        {showStats && stats && (
          <div className="absolute top-14 right-3 z-40 bg-black/85 backdrop-blur-md rounded-xl border border-white/10
                          p-3 text-xs text-white/80 font-mono space-y-1 min-w-[200px]">
            <div className="text-white font-bold text-xs mb-2 flex items-center gap-1.5">
              <Activity size={11} /> Stream Statistics
            </div>
            {[
              ['State', stats.state],
              ['Health', stats.health],
              ['Buffer', fmtBuffer(stats.bufferSizeMs)],
              ['Uptime', fmtTime(stats.playbackTimeSec)],
              ['Resolution', stats.resolution],
              ['Video', stats.videoCodec],
              ['Audio', stats.audioCodec],
              ['Reconnects', String(stats.reconnectCount)],
              ['Dropped', String(stats.droppedFrames)],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4">
                <span className="text-white/50">{k}</span>
                <span className="text-white">{v}</span>
              </div>
            ))}
          </div>
        )}

        {/* Bottom controls */}
        <div className="p-4 bg-gradient-to-t from-black/70 to-transparent">
          <div className="flex items-center gap-3">
            {/* Play/Pause */}
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition"
            >
              {videoRef.current?.paused ? <Play size={20} className="ml-0.5" /> : <Pause size={20} />}
            </button>

            {/* Volume */}
            <div className="flex items-center gap-2">
              <button onClick={toggleMute} className="p-1.5 text-white/80 hover:text-white transition">
                {isMuted || volume === 0 ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
              <input
                type="range" min={0} max={1} step={0.05} value={isMuted ? 0 : volume}
                onChange={e => handleVolumeChange(Number(e.target.value))}
                className="w-20 h-1 accent-white cursor-pointer"
              />
            </div>

            {/* Spacer */}
            <div className="flex-1" />

            {/* Audio tracks settings */}
            {audioTracks.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowSettings(s => !s)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition
                    ${showSettings
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                >
                  <Settings size={15} />
                  <span className="hidden sm:inline text-xs">Audio</span>
                  <ChevronDown size={12} className={`transition-transform ${showSettings ? 'rotate-180' : ''}`} />
                </button>

                {showSettings && (
                  <div className="absolute bottom-10 right-0 z-50 bg-zinc-900/95 backdrop-blur-md border border-white/10
                                  rounded-xl overflow-hidden shadow-2xl min-w-[220px]">
                    <div className="px-4 py-3 border-b border-white/10">
                      <p className="text-white text-xs font-bold uppercase tracking-wider">Audio Track</p>
                    </div>
                    {audioTracks.map(track => (
                      <button
                        key={track.id}
                        onClick={() => selectAudioTrack(track.id)}
                        className={`w-full px-4 py-3 text-left text-sm flex items-center justify-between transition
                          ${track.active
                            ? 'bg-white/10 text-white'
                            : 'text-white/70 hover:bg-white/5 hover:text-white'}`}
                      >
                        <span>{track.label}</span>
                        {track.active && <div className="w-2 h-2 rounded-full bg-blue-400" />}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Fullscreen */}
            <button
              onClick={toggleFullscreen}
              className="p-2 text-white/80 hover:text-white transition"
            >
              {isFullscreen ? <Minimize size={18} /> : <Maximize size={18} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

export default LivePlayer
