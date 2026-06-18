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
  // Use a ref so we can read the latest value inside selectAudioTrack without triggering re-renders
  const isTranscodingRequiredRef = useRef(false)

  // Compute isMpegTs synchronously during render
  const firstSource = options.sources?.[0]
  const rawSourceUrl = firstSource?.src || ''
  // Browser-native audio codecs (no transcoding needed)
  const BROWSER_NATIVE_AUDIO = ['AAC', 'MP3', 'OPUS', 'VORBIS']
  // When user picks a track, append ?audioTrack=X to trigger backend Node.js PID filter
  const sourceUrl = selectedAudioTrackId !== null || isTranscodingRequired
    ? `${rawSourceUrl}${rawSourceUrl.includes('?') ? '&' : '?'}audioTrack=${selectedAudioTrackId ?? 0}`
    : rawSourceUrl
  const sourceType = firstSource?.type || ''
  const isMpegTs = sourceType === 'video/mp2t' || sourceType === 'video/mpegts' || rawSourceUrl.includes('.ts') || isTranscodingRequired || selectedAudioTrackId !== null

  // Parse MPEG-TS PMT tables from raw stream bytes to detect audio tracks client-side.
  // This runs entirely in the browser using the user's home IP - no backend needed!
  const parseMpegTsAudioFromStream = async (streamUrl: string): Promise<Array<{id: number, language: string, codec: string}>> => {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch(streamUrl, { signal: controller.signal })
      const reader = response.body?.getReader()
      if (!reader) return []

      let buffer = new Uint8Array(0)
      const MAX_BYTES = 65536 // 64KB is enough to find PAT/PMT

      while (buffer.length < MAX_BYTES) {
        const { done, value } = await reader.read()
        if (done || !value) break
        const merged = new Uint8Array(buffer.length + value.length)
        merged.set(buffer)
        merged.set(value, buffer.length)
        buffer = merged
        if (buffer.length >= MAX_BYTES) break
      }
      reader.cancel()
      clearTimeout(timeoutId)

      // Parse MPEG-TS packets (188 bytes each, starts with 0x47 sync byte)
      let pmtPid = -1
      const audioStreams: Array<{id: number, language: string, codec: string}> = []

      for (let i = 0; i + 188 <= buffer.length; i += 188) {
        if (buffer[i] !== 0x47) { // seek sync byte
          for (let j = i; j < i + 188; j++) {
            if (buffer[j] === 0x47) { i = j - 188; break }
          }
          continue
        }
        const pid = ((buffer[i + 1] & 0x1F) << 8) | buffer[i + 2]
        const adaptFieldCtrl = (buffer[i + 3] & 0x30) >> 4
        let payloadOffset = i + 4
        if (adaptFieldCtrl === 2) continue // adaptation only, no payload
        if (adaptFieldCtrl === 3) payloadOffset += (buffer[payloadOffset] + 1) // skip adaptation field
        const pusi = (buffer[i + 1] & 0x40) !== 0 // payload unit start indicator

        if (pid === 0 && pusi && pmtPid === -1) {
          // PAT: find PMT PID for program 1
          const ptrField = buffer[payloadOffset]
          const sectionBase = payloadOffset + 1 + ptrField
          const secLen = ((buffer[sectionBase + 1] & 0x0F) << 8) | buffer[sectionBase + 2]
          for (let j = sectionBase + 8; j < sectionBase + 3 + secLen - 4; j += 4) {
            const progNum = (buffer[j] << 8) | buffer[j + 1]
            if (progNum !== 0) { pmtPid = ((buffer[j + 2] & 0x1F) << 8) | buffer[j + 3]; break }
          }
        } else if (pid === pmtPid && pusi && audioStreams.length === 0) {
          // PMT: enumerate all audio stream entries
          const ptrField = buffer[payloadOffset]
          const sectionBase = payloadOffset + 1 + ptrField
          const secLen = ((buffer[sectionBase + 1] & 0x0F) << 8) | buffer[sectionBase + 2]
          const pcrPid = ((buffer[sectionBase + 8] & 0x1F) << 8) | buffer[sectionBase + 9]
          const progInfoLen = ((buffer[sectionBase + 10] & 0x0F) << 8) | buffer[sectionBase + 11]
          let k = sectionBase + 12 + progInfoLen
          let audioIdx = 0
          while (k < sectionBase + 3 + secLen - 4) {
            const streamType = buffer[k]
            const esPid = ((buffer[k + 1] & 0x1F) << 8) | buffer[k + 2]
            const esInfoLen = ((buffer[k + 3] & 0x0F) << 8) | buffer[k + 4]
            // Audio types: 0x03=MPEG-1, 0x04=MPEG-2, 0x0F=AAC, 0x11=MPEG-4, 0x81=AC-3, 0x87=E-AC-3
            const isAudio = [0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)
            if (isAudio) {
              let lang = 'und'
              const codecName = streamType === 0x0F || streamType === 0x11 ? 'AAC'
                : streamType === 0x03 || streamType === 0x04 ? 'MP2'
                : streamType === 0x81 ? 'AC3' : 'AUDIO'
              // Scan ES descriptors for ISO 639 language descriptor (tag 0x0A)
              for (let d = k + 5; d < k + 5 + esInfoLen - 1; ) {
                const descTag = buffer[d], descLen = buffer[d + 1]
                if (descTag === 0x0A && descLen >= 3) {
                  lang = String.fromCharCode(buffer[d + 2], buffer[d + 3], buffer[d + 4]).replace(/[^\x20-\x7E]/g, '')
                }
                d += 2 + descLen
              }
              audioStreams.push({ id: audioIdx, language: lang || 'und', codec: codecName })
              audioIdx++
            }
            k += 5 + esInfoLen
          }
          if (audioStreams.length > 0) break // found all tracks, done
        }
      }
      return audioStreams
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name !== 'AbortError') console.warn('[PMT parser] error:', e)
      return []
    }
  }

  // Reset states when the stream source changes and fetch tracks
  useEffect(() => {
    setAudioTracks([])
    
    const match = rawSourceUrl.match(/\/stream\/live\/([^\/?]+)/);
    if (match && match[1]) {
      const channelId = match[1];

      // First try the backend API (fast, works locally)
      api.getLiveStreamInfo(channelId)
        .then(async data => {
          if (data && data.allAudioStreams && data.allAudioStreams.length > 0) {
            // Backend returned tracks — use them
            const list = data.allAudioStreams.map((stream: any) => ({
              id: stream.id,
              label: `Track ${stream.id + 1} (${stream.language?.toUpperCase() || 'UND'}) [${stream.codec?.toUpperCase()}]`,
              active: stream.id === (selectedAudioTrackId !== null ? selectedAudioTrackId : 0)
            }))
            setAudioTracks(list)
          } else {
            // Backend returned no tracks (likely IP-blocked on Render).
            // Fall back to client-side MPEG-TS PMT parsing from the raw stream!
            console.log('[VideoPlayer] Backend returned no audio tracks, falling back to client-side PMT parsing...')
            const parsed = await parseMpegTsAudioFromStream(rawSourceUrl)
            if (parsed.length > 0) {
              console.log(`[VideoPlayer] Client-side PMT parser found ${parsed.length} audio stream(s):`, parsed)
              setAudioTracks(parsed.map(s => ({
                id: s.id,
                label: `Track ${s.id + 1} (${s.language.toUpperCase()}) [${s.codec}]`,
                active: s.id === 0
              })))
              // Show the detected tracks for informational purposes
              // NOTE: Do NOT auto-enable backend transcoding here — if Render can't reach
              // the IPTV provider (IP blocked), forcing FFmpeg transcoding kills the video too!
            }
          }
          if (data && data.transcodingRequired) {
            setIsTranscodingRequired(true)
          }
        })
        .catch(async err => {
          console.warn("Backend stream info fetch failed, trying client-side PMT parsing:", err)
          const parsed = await parseMpegTsAudioFromStream(rawSourceUrl)
          if (parsed.length > 0) {
            setAudioTracks(parsed.map(s => ({
              id: s.id,
              label: `Track ${s.id + 1} (${s.language.toUpperCase()}) [${s.codec}]`,
              active: s.id === 0
            })))
            // Show tracks for informational purposes only — don't force transcoding
            // as that would break video playback if the backend can't reach the provider
          }
        });
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

        if (mediaInfo && mediaInfo.audioStreams && mediaInfo.audioStreams.length > 0) {
          const currentStream = player.currentAudioStream !== undefined ? player.currentAudioStream : 0
          return mediaInfo.audioStreams.map((stream: any, idx: number) => ({
            id: idx,
            label: stream.language ? `Track ${idx + 1} (${stream.language.toUpperCase()}) [${stream.codec?.toUpperCase() || 'MPEG-TS'}]` : `Track ${idx + 1} (UND) [${stream.codec?.toUpperCase() || 'MPEG-TS'}]`,
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
        setAudioTracks(prev => {
          if (prev.length > 0) return prev;
          return [{ id: 0, label: 'Default Audio', active: true }];
        })
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
    setAudioTracks(prev => prev.map(t => ({ ...t, active: t.id === id })))
    // Always use backend PID filter for track switching on live streams.
    // The PID filter uses Node.js HTTP proxy (not FFmpeg) so it works on Render.
    // setSelectedAudioTrackId triggers a sourceUrl change → player reloads with ?audioTrack=X
    setSelectedAudioTrackId(id)
    if (playerRef.current) {
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
