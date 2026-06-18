"use client"

import React, { useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import { Settings, Tv, Volume2 } from 'lucide-react'
import { api } from '@/lib/api'

interface VideoPlayerProps {
  options: any;
  onReady?: (player: Player) => void;
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ options, onReady }) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playerRef = useRef<Player | null>(null)
  const mpegtsPlayerRef = useRef<any>(null)
  const settingsRef = useRef<HTMLDivElement>(null)

  // Player controls states
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'stretch' | 'zoom' | '16:9' | '4:3'>('contain')
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; active: boolean }[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<number | null>(null)
  const [isTranscodingRequired, setIsTranscodingRequired] = useState(false)

  // Compute isMpegTs synchronously during render
  const firstSource = options.sources?.[0]
  const rawSourceUrl = firstSource?.src || ''
  const sourceUrl = selectedAudioTrackId !== null 
    ? `${rawSourceUrl}${rawSourceUrl.includes('?') ? '&' : '?'}audioTrack=${selectedAudioTrackId}`
    : rawSourceUrl
  const sourceType = firstSource?.type || ''
  const isMpegTs = sourceType === 'video/mp2t' || sourceType === 'video/mpegts' || rawSourceUrl.includes('.ts') || selectedAudioTrackId !== null || isTranscodingRequired

  // Reset states when the stream source changes and fetch tracks from backend
  useEffect(() => {
    setAudioTracks([])
    
    const match = rawSourceUrl.match(/\/stream\/live\/([^\/?]+)/);
    if (match && match[1]) {
      const channelId = match[1];
      api.getLiveStreamInfo(channelId)
        .then(data => {
          if (data && data.allAudioStreams && data.allAudioStreams.length > 0) {
            const list = data.allAudioStreams.map((stream: any) => ({
              id: stream.id,
              label: `Track ${stream.id + 1} (${stream.language?.toUpperCase() || 'UND'}) [${stream.codec?.toUpperCase()}]`,
              active: stream.id === (selectedAudioTrackId !== null ? selectedAudioTrackId : 0)
            }))
            setAudioTracks(list)
          }
          if (data && data.transcodingRequired) {
            setIsTranscodingRequired(true)
          }
        })
        .catch(err => console.warn("Failed to fetch stream info", err));
    }
  }, [rawSourceUrl])

  // Click outside listener for settings panel
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setShowSettings(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  // Audio track detection functions
  const updateMpegtsAudioTracks = (player: any) => {
    if (!player) return
    try {
      const mediaInfo = player.mediaInfo
      setAudioTracks(prev => {
        // If we already fetched tracks from the backend API, preserve them!
        if (prev.length > 0) return prev;

        if (mediaInfo && mediaInfo.audioStreams && mediaInfo.audioStreams.length > 1) {
          const currentStream = player.currentAudioStream !== undefined ? player.currentAudioStream : 0
          return mediaInfo.audioStreams.map((stream: any, idx: number) => ({
            id: idx,
            label: stream.language ? `Audio Track ${idx + 1} (${stream.language})` : `Audio Track ${idx + 1} (${stream.codec || 'MPEG-TS'})`,
            active: idx === (selectedAudioTrackId !== null ? selectedAudioTrackId : currentStream)
          }))
        }
        
        return [{ id: 0, label: 'Default Audio', active: selectedAudioTrackId === null || selectedAudioTrackId === 0 }]
      })
    } catch (e) {
      console.warn("Failed to read mpegts audio tracks (player may be destroyed):", e)
    }
  }

  const updateVideoJsAudioTracks = (player: any) => {
    if (!player) return
    try {
      const tracks = player.audioTracks() as any
      if (tracks && tracks.length > 0) {
        const list = []
        for (let i = 0; i < tracks.length; i++) {
          list.push({
            id: i,
            label: tracks[i].label || tracks[i].language || `Audio Track ${i + 1}`,
            active: tracks[i].enabled
          })
        }
        setAudioTracks(list)
      } else {
        setAudioTracks([{ id: 0, label: 'Default Audio', active: true }])
      }
    } catch (e) {
      console.warn("Failed to read videojs audio tracks (player may be destroyed):", e)
    }
  }

  const handleSelectVideoJsAudio = (id: number) => {
    if (playerRef.current) {
      const tracks = playerRef.current.audioTracks() as any
      for (let i = 0; i < tracks.length; i++) {
        tracks[i].enabled = (i === id)
      }
      setAudioTracks(prev => prev.map(t => ({
        ...t,
        active: t.id === id
      })))
    }
  }

  const selectAudioTrack = (id: number) => {
    if (isMpegTs) {
      setSelectedAudioTrackId(id)
      setAudioTracks(prev => prev.map(t => ({
        ...t,
        active: t.id === id
      })))
    } else {
      handleSelectVideoJsAudio(id)
    }
  }

  useEffect(() => {
    let timeoutId: any = null

    if (isMpegTs) {
      // Clean up Video.js if it was active
      if (playerRef.current) {
        try {
          playerRef.current.dispose()
        } catch (e) {
          console.error("Error disposing videojs:", e)
        }
        playerRef.current = null
      }

      // Dynamically import mpegts.js on client side to avoid SSR errors
      import('mpegts.js').then((mpegtsModule) => {
        const mpegts = mpegtsModule.default

        if (videoRef.current && mpegts.getFeatureList().mseLivePlayback) {
          // Clean up previous mpegts player
          if (mpegtsPlayerRef.current) {
            try {
              mpegtsPlayerRef.current.unload()
              mpegtsPlayerRef.current.detachMediaElement()
              mpegtsPlayerRef.current.destroy()
            } catch (e) {
              console.error("Error cleaning up previous mpegts player:", e)
            }
            mpegtsPlayerRef.current = null
          }

          const sourceUrlToPlay = sourceUrl
          if (sourceUrlToPlay) {
            const mpegtsPlayer = mpegts.createPlayer({
              type: 'mpegts',
              isLive: true,
              url: sourceUrlToPlay
            }, {
              enableWorker: true,
              enableStashBuffer: false,
              stashInitialSize: 128
            })

            mpegtsPlayerRef.current = mpegtsPlayer
            mpegtsPlayer.attachMediaElement(videoRef.current)
            
            mpegtsPlayer.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
              console.warn("mpegts.js error occurred in VideoPlayer:", type, detail, info)
            })

            mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, () => {
              updateMpegtsAudioTracks(mpegtsPlayer)
            })

            mpegtsPlayer.load()

            // Trigger fallback check for audio streams in 2 seconds
            timeoutId = setTimeout(() => {
              updateMpegtsAudioTracks(mpegtsPlayer)
            }, 2000)

            if (options.autoplay) {
              const playPromise = mpegtsPlayer.play()
              if (playPromise && typeof playPromise.catch === 'function') {
                playPromise.catch((err: any) => {
                  console.warn("Autoplay blocked or failed:", err)
                })
              }
            }
          }
        }
      }).catch((err) => {
        console.error("Failed to load mpegts.js:", err)
      })
    } else {
      // Clean up mpegts if it was active
      if (mpegtsPlayerRef.current) {
        try {
          mpegtsPlayerRef.current.unload()
          mpegtsPlayerRef.current.detachMediaElement()
          mpegtsPlayerRef.current.destroy()
        } catch (e) {
          console.error("Error cleaning up mpegts player:", e)
        }
        mpegtsPlayerRef.current = null
      }

      // Initialize or update Video.js
      if (videoRef.current) {
        if (!playerRef.current) {
          // Initialize Video.js on the ref'd video element
          const player = playerRef.current = videojs(videoRef.current, options, () => {
            videojs.log('player is ready')
            if (onReady) {
              onReady(player)
            }
          })

          player.on('loadeddata', () => {
            updateVideoJsAudioTracks(player)
          })

          const audioTracksList = player.audioTracks()
          if (audioTracksList) {
            audioTracksList.on('change', () => {
              updateVideoJsAudioTracks(player)
            })
          }
        } else {
          const player = playerRef.current
          player.autoplay(options.autoplay)
          player.src(options.sources)
          
          updateVideoJsAudioTracks(player)
        }
      }
    }

    return () => {
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [isMpegTs, sourceUrl, options, onReady])

  // Dispose both players when the component unmounts
  useEffect(() => {
    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        try {
          playerRef.current.dispose()
        } catch (e) {
          console.error("Error disposing videojs on unmount:", e)
        }
        playerRef.current = null
      }
      if (mpegtsPlayerRef.current) {
        try {
          mpegtsPlayerRef.current.unload()
          mpegtsPlayerRef.current.detachMediaElement()
          mpegtsPlayerRef.current.destroy()
        } catch (e) {
          console.error("Error cleaning up mpegts player on unmount:", e)
        }
        mpegtsPlayerRef.current = null
      }
    }
  }, [])

  // Dynamic aspect ratio calculation
  const getObjectFitClass = () => {
    switch (aspectRatio) {
      case 'stretch': return 'object-fill'
      case 'zoom': return 'object-cover'
      case '16:9':
      case '4:3':
        return 'object-fill' // stretch content within constrained element
      case 'contain':
      default:
        return 'object-contain'
    }
  }

  const getVideoStyle = () => {
    switch (aspectRatio) {
      case '16:9':
        return { aspectRatio: '16/9', width: '100%', height: 'auto', maxHeight: '100%' }
      case '4:3':
        return { aspectRatio: '4/3', width: 'auto', height: '100%', maxWidth: '100%', margin: '0 auto' }
      default:
        return { width: '100%', height: '100%' }
    }
  }

  return (
    <div data-vjs-player className="w-full h-full relative group flex items-center justify-center bg-[#0A0A0A] overflow-hidden" key={isMpegTs ? 'mpegts' : 'videojs'}>
      <video
        ref={videoRef}
        className={`bg-[#0A0A0A] transition-all duration-300 ${getObjectFitClass()} ${isMpegTs ? '' : 'video-js vjs-big-play-centered'}`}
        style={getVideoStyle()}
        controls
        playsInline
      />

      {/* Premium Floating Controls Overlay */}
      <div ref={settingsRef} className={`absolute top-4 right-4 z-30 transition-opacity duration-300 ${showSettings ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
        <button
          onClick={() => setShowSettings(!showSettings)}
          className="p-2 bg-black/60 hover:bg-red-600 border border-white/10 hover:border-red-500 rounded-xl text-white transition-all shadow-lg backdrop-blur-md focus:outline-none"
          title="Playback Settings"
        >
          <Settings size={18} />
        </button>

        {showSettings && (
          <div className="absolute right-0 mt-2 w-72 bg-zinc-950/95 border border-white/10 backdrop-blur-md rounded-2xl p-4 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-2 duration-200">
            {/* Header */}
            <div className="flex items-center gap-2 border-b border-white/5 pb-2">
              <Tv size={14} className="text-red-500" />
              <span className="text-[10px] font-black uppercase tracking-wider text-zinc-300">Player Control Center</span>
            </div>

            {/* Aspect Ratio Options */}
            <div className="space-y-1.5">
              <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Aspect Ratio</label>
              <div className="grid grid-cols-3 gap-1">
                {['contain', 'stretch', 'zoom', '16:9', '4:3'].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio as any)}
                    className={`py-1.5 px-2 rounded-lg text-[9px] font-bold uppercase border transition-all ${
                      aspectRatio === ratio
                        ? 'bg-red-600/15 text-red-500 border-red-500/30'
                        : 'bg-black/40 text-zinc-400 border-white/5 hover:border-white/10 hover:text-white'
                    }`}
                  >
                    {ratio === 'contain' ? 'Auto' : ratio}
                  </button>
                ))}
              </div>
            </div>

            {/* Audio Track Selection */}
            <div className="space-y-1.5">
              <div className="flex items-center gap-1.5">
                <Volume2 size={12} className="text-zinc-500" />
                <label className="text-[9px] text-zinc-500 font-bold uppercase tracking-wider block">Audio Language</label>
              </div>
              <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                {audioTracks.length === 0 ? (
                  <div className="text-[9px] text-zinc-500 italic p-1">Default Track</div>
                ) : (
                  audioTracks.map((track) => (
                    <button
                      key={track.id}
                      onClick={() => selectAudioTrack(track.id)}
                      className={`w-full text-left py-2 px-3 rounded-lg text-[9px] border transition-all flex items-center justify-between font-bold ${
                        track.active
                          ? 'bg-red-500/15 text-red-500 border-red-500/25'
                          : 'bg-black/30 text-zinc-400 border-white/5 hover:border-white/10 hover:text-white'
                      }`}
                    >
                      <span className="truncate">{track.label}</span>
                      {track.active && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
                    </button>
                  ))
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      <style dangerouslySetInnerHTML={{__html:`
        /* Custom Premium Video.js overrides */
        .video-js {
          width: 100% !important;
          height: 100% !important;
          background-color: #0A0A0A;
          font-family: inherit;
        }
        .vjs-tech {
          object-fit: inherit !important;
        }
        .vjs-big-play-button {
          background-color: rgba(229, 9, 20, 0.8) !important;
          border: none !important;
          border-radius: 50% !important;
          width: 80px !important;
          height: 80px !important;
          line-height: 80px !important;
          margin-left: -40px !important;
          margin-top: -40px !important;
          transition: transform 0.2s ease, background-color 0.2s ease !important;
        }
        .vjs-big-play-button:hover {
          transform: scale(1.1) !important;
          background-color: #E50914 !important;
        }
        .vjs-control-bar {
          background-color: rgba(10, 10, 10, 0.8) !important;
          backdrop-filter: blur(10px);
          height: 50px !important;
        }
        .vjs-play-progress {
          background-color: #E50914 !important;
        }
      `}} />
    </div>
  )
}
