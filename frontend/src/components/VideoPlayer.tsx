"use client"

import React, { useEffect, useRef, useState } from 'react'
import videojs from 'video.js'
import Player from 'video.js/dist/types/player'
import 'video.js/dist/video-js.css'
import { Settings, Tv, Volume2, Play } from 'lucide-react'
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
  // Pre-loaded mpegts.js module — stored in a ref so button click handlers can use it synchronously
  const mpegtsRef = useRef<any>(null)
  // Guard ref to prevent double-triggering the transcode reload (MSE error + MEDIA_INFO can both fire)
  const transcodeTriggeredRef = useRef(false)

  // Player controls states
  const [aspectRatio, setAspectRatio] = useState<'contain' | 'stretch' | 'zoom' | '16:9' | '4:3'>('contain')
  const [audioTracks, setAudioTracks] = useState<{ id: number; label: string; active: boolean }[]>([])
  const [showSettings, setShowSettings] = useState(false)
  const [selectedAudioTrackId, setSelectedAudioTrackId] = useState<number | null>(null)
  const [isTranscodingRequired, setIsTranscodingRequired] = useState(false)
  // Set to true when client-side PMT parsing detects a codec the browser can't play natively (AC3/EAC3/MP2)
  const [clientDetectedTranscodeNeeded, setClientDetectedTranscodeNeeded] = useState(false)
  // Show a button overlay when autoplay is blocked by the browser policy
  const [isAutoplayBlocked, setIsAutoplayBlocked] = useState(false)
  // Use a ref so we can read the latest value inside selectAudioTrack without triggering re-renders
  const isTranscodingRequiredRef = useRef(false)

  // Compute isMpegTs synchronously during render
  const firstSource = options.sources?.[0]
  const rawSourceUrl = firstSource?.src || ''

  /**
   * Checks if the browser can natively decode an audio codec.
   * Codecs that browsers CANNOT play in MPEG-TS streams:
   * - AC3 (Dolby Digital): Chrome, Firefox, Opera do not support it
   * - EAC3 (Dolby Digital Plus): Chrome, Firefox do not support it
   * - MP2 (MPEG-1 Layer 2): Not supported in MSE by any major browser
   * Codecs that ARE supported: AAC, MP3, Opus, Vorbis
   */
  const browserCanPlayCodec = (codec: string): boolean => {
    const unsupported = new Set(['AC3', 'EAC3', 'MP2'])
    if (unsupported.has(codec.toUpperCase())) return false
    // Double-check with canPlayType for runtime accuracy
    const mimeMap: Record<string, string> = {
      'AAC': 'audio/aac',
      'MP3': 'audio/mpeg',
      'OPUS': 'audio/ogg; codecs="opus"',
      'VORBIS': 'audio/ogg; codecs="vorbis"',
    }
    const mime = mimeMap[codec.toUpperCase()]
    if (!mime) return false
    const el = document.createElement('audio')
    const result = el.canPlayType(mime)
    return result === 'probably' || result === 'maybe'
  }

  // Smart URL builder: auto-adds ?transcode=audio when client detects unsupported codec
  const buildSourceUrl = (): string => {
    const params: string[] = []
    // If client-side PMT parsing detected an unsupported codec, request server transcoding
    if (clientDetectedTranscodeNeeded && selectedAudioTrackId === null) {
      params.push('transcode=audio')
    }
    // If user selected a specific audio track, request it from server
    if (selectedAudioTrackId !== null || isTranscodingRequired) {
      params.push(`audioTrack=${selectedAudioTrackId ?? 0}`)
    }
    if (params.length === 0) return rawSourceUrl
    return `${rawSourceUrl}${rawSourceUrl.includes('?') ? '&' : '?'}${params.join('&')}`
  }

  const sourceUrl = buildSourceUrl()
  const sourceType = firstSource?.type || ''
  const isMpegTs = sourceType === 'video/mp2t' || sourceType === 'video/mpegts' || rawSourceUrl.includes('.ts') || isTranscodingRequired || clientDetectedTranscodeNeeded || selectedAudioTrackId !== null

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
                : streamType === 0x81 ? 'AC3'
                : streamType === 0x87 ? 'EAC3' : 'AC3' // 0x87=E-AC-3, default unknown to AC3 (safer)
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
    setClientDetectedTranscodeNeeded(false)
    setIsAutoplayBlocked(false)
    transcodeTriggeredRef.current = false
    
    if (rawSourceUrl && rawSourceUrl.includes('/stream/')) {
      const isMovie = rawSourceUrl.includes('/stream/movie/')
      const isEpisode = rawSourceUrl.includes('/stream/episode/')
      const isLive = rawSourceUrl.includes('/stream/live/')
      
      let fetchPromise: Promise<any> | null = null;
      
      if (isMovie) {
        const id = rawSourceUrl.split('/stream/movie/')[1].split('?')[0]
        fetchPromise = api.getMovieStreamInfo(id)
      } else if (isEpisode) {
        const id = rawSourceUrl.split('/stream/episode/')[1].split('?')[0]
        fetchPromise = api.getEpisodeStreamInfo(id)
      } else if (isLive) {
        const id = rawSourceUrl.split('/stream/live/')[1].split('?')[0]
        fetchPromise = api.getLiveStreamInfo(id)
      }

      /**
       * Run client-side MPEG-TS PMT codec detection.
       * This uses the USER's home IP (not Render's cloud IP) so IPTV providers won't block it.
       * Detects: AAC, MP2, AC3, EAC3 — then checks browser support.
       * If the primary audio codec is not natively supported, auto-requests ?transcode=audio.
       */
      const runClientSideCodecDetection = async () => {
        const parsed = await parseMpegTsAudioFromStream(rawSourceUrl)
        if (parsed.length > 0) {
          console.log(`[VideoPlayer] Client-side PMT parser found ${parsed.length} audio stream(s):`, parsed)
          const primaryCodec = parsed[0]?.codec || 'AAC'
          const canPlay = browserCanPlayCodec(primaryCodec)
          // Only set transcoding needed if not already showing the button (which has its own handler)
          if (!canPlay && !transcodeTriggeredRef.current) {
            console.log(`[VideoPlayer] Browser cannot natively play '${primaryCodec}' — enabling server-side audio transcoding (AC3→AAC)...`)
            transcodeTriggeredRef.current = true
            setClientDetectedTranscodeNeeded(true)
          } else if (!canPlay) {
            console.log(`[VideoPlayer] Browser cannot natively play '${primaryCodec}' — Enable Audio button already shown, skipping auto-reload`)
          } else {
            console.log(`[VideoPlayer] Browser natively supports '${primaryCodec}' — using direct stream (zero server overhead)`)
          }
          return parsed
        }
        return []
      }

      if (fetchPromise) {
        fetchPromise
          .then(async data => {
            if (data && data.allAudioStreams && data.allAudioStreams.length > 0) {
              // Backend returned tracks — use them
              const list = data.allAudioStreams.map((stream: any) => ({
                id: stream.id,
                label: `Track ${stream.id + 1} (${stream.language?.toUpperCase() || 'UND'}) [${stream.codec?.toUpperCase()}]`,
                active: stream.id === (selectedAudioTrackId !== null ? selectedAudioTrackId : 0)
              }))
              setAudioTracks(list)
              // Also check if primary codec needs transcoding
              const primaryCodec = data.allAudioStreams[0]?.codec || 'AAC'
              if (!browserCanPlayCodec(primaryCodec)) {
                console.log(`[VideoPlayer] Backend reports primary audio is '${primaryCodec}' — enabling server-side audio transcoding`)
                setClientDetectedTranscodeNeeded(true)
              }
            } else {
              // Backend returned no tracks (likely IP-blocked on Render).
              // Fall back to client-side MPEG-TS PMT parsing from the raw stream!
              console.log('[VideoPlayer] Backend returned no audio tracks, falling back to client-side PMT parsing...')
              const parsed = await runClientSideCodecDetection()
              if (parsed.length > 0) {
                setAudioTracks(parsed.map(s => ({
                  id: s.id,
                  label: `Track ${s.id + 1} (${s.language.toUpperCase()}) [${s.codec}]`,
                  active: s.id === 0
                })))
              }
            }
            if (data && data.transcodingRequired) {
              setIsTranscodingRequired(true)
            }
          })
          .catch(async err => {
            console.warn("Backend stream info fetch failed, trying client-side PMT parsing:", err)
            const parsed = await runClientSideCodecDetection()
            if (parsed.length > 0) {
              setAudioTracks(parsed.map(s => ({
                id: s.id,
                label: `Track ${s.id + 1} (${s.language.toUpperCase()}) [${s.codec}]`,
                active: s.id === 0
              })))
            }
          });
      } else {
        // No backend fetch needed — just run client-side detection
        runClientSideCodecDetection().then(parsed => {
          if (parsed.length > 0) {
            setAudioTracks(parsed.map(s => ({
              id: s.id,
              label: `Track ${s.id + 1} (${s.language.toUpperCase()}) [${s.codec}]`,
              active: s.id === 0
            })))
          }
        })
      }
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

  const resetVideoElement = () => {
    if (videoRef.current) {
      try {
        videoRef.current.pause()
        videoRef.current.removeAttribute('src')
        videoRef.current.load()
      } catch (e) {
        console.warn("Failed to reset video element:", e)
      }
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
        mpegtsRef.current = mpegts
        if (videoRef.current && mpegts.getFeatureList().mseLivePlayback) {
          let hadPreviousPlayer = false
          // Clean up previous mpegts player
          if (mpegtsPlayerRef.current) {
            hadPreviousPlayer = true
            try {
              mpegtsPlayerRef.current.unload()
              mpegtsPlayerRef.current.detachMediaElement()
              mpegtsPlayerRef.current.destroy()
            } catch (e) {
              console.error("Error cleaning up previous mpegts player:", e)
            }
            mpegtsPlayerRef.current = null
            resetVideoElement()
          }

          const initPlayer = () => {
            const sourceUrlToPlay = sourceUrl
            if (!sourceUrlToPlay || !videoRef.current) return

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

            // Auto-transcode recovery: when mpegts.js reads the actual stream codec,
            // check if the browser supports it. If not (AC3/EAC3/MP2), switch to transcoded URL.
            mpegtsPlayer.on(mpegts.Events.MEDIA_INFO, () => {
              try {
                const info = mpegtsPlayer.mediaInfo as any
                // audioCodec from mpegts.js is in format like 'ac-3', 'ec-3', 'mp4a.40.2'
                const rawCodec = (info?.audioCodec || '').toLowerCase()
                const isUnsupported = rawCodec.includes('ac-3') || rawCodec.includes('ac3') ||
                  rawCodec.includes('ec-3') || rawCodec.includes('eac3') ||
                  rawCodec.includes('mp2') || rawCodec === 'audio'

                if (isUnsupported && !sourceUrlToPlay.includes('transcode=audio') && !transcodeTriggeredRef.current) {
                  transcodeTriggeredRef.current = true
                  console.log(`[VideoPlayer] mpegts detected unsupported audio codec '${rawCodec}' — switching to server-side transcoding...`)
                  setClientDetectedTranscodeNeeded(true) // triggers sourceUrl update → player reloads
                } else {
                  updateMpegtsAudioTracks(mpegtsPlayer)
                }
              } catch (e) {
                updateMpegtsAudioTracks(mpegtsPlayer)
              }
            })

            mpegtsPlayer.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
              console.warn("mpegts.js error occurred in VideoPlayer:", type, detail, info)
              // Correct mpegts.js error types: type='MediaError', detail='MediaMSEError'
              // This is fired when the browser's MSE cannot decode the codec (e.g. AC3/EAC3)
              const isMseCodecError = type === 'MediaError' && detail === 'MediaMSEError'
              if (isMseCodecError && !sourceUrlToPlay.includes('transcode=audio') && !transcodeTriggeredRef.current) {
                transcodeTriggeredRef.current = true
                console.log('[VideoPlayer] AC3/EAC3 codec rejected by MSE — reloading with transcoding...')
                setClientDetectedTranscodeNeeded(true)
              }
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
                  if (err?.name === 'NotAllowedError') {
                    setIsAutoplayBlocked(true)
                  }
                })
              }
            }
          }

          if (hadPreviousPlayer) {
            // Wait 800ms before starting the new connection to let the old connection fully close on the IPTV server
            timeoutId = setTimeout(initPlayer, 800)
          } else {
            initPlayer()
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

      {/* Click to Play / Autoplay Blocked Overlay */}
      {isAutoplayBlocked && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <button
            onClick={() => {
              setIsAutoplayBlocked(false)
              if (mpegtsPlayerRef.current) {
                mpegtsPlayerRef.current.play()?.catch((err: any) => console.warn('Play failed:', err))
              } else if (playerRef.current) {
                playerRef.current.play()?.catch((err: any) => console.warn('Play failed:', err))
              }
            }}
            className="flex flex-col items-center gap-3 px-8 py-5 bg-red-600 hover:bg-red-500 active:bg-red-700 rounded-2xl text-white font-bold shadow-2xl transition-all transform hover:scale-105 active:scale-95"
          >
            <div className="p-3 bg-white/10 rounded-full">
              <Play size={28} fill="currentColor" />
            </div>
            <span className="text-sm tracking-wide">Click to Play</span>
            <span className="text-xs text-red-200 font-normal">Playback is ready to start</span>
          </button>
        </div>
      )}

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
