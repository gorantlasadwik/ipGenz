"use client"

import React, { useEffect, useRef, useState } from 'react'
import { 
  Play, Pause, RotateCcw, Volume2, VolumeX, Maximize, 
  Minimize, Subtitles, Heart, Clock, ListPlus, Download, 
  Camera, ArrowLeft, Tv, Info, Check, ChevronRight, Activity 
} from 'lucide-react'
import { api } from '@/lib/api'

interface VodPlayerProps {
  src: string
  rawUrl?: string
  contentType: 'MOVIE' | 'EPISODE'
  contentId: string
  title: string
  subtitle?: string
  onClose: () => void
  seriesData?: any          // Complete series object with seasons & episodes
  onPlayEpisode?: (episode: any) => void
  durationSec?: number      // Fallback duration from backend if video duration is Infinity
}

function getPlaybackType(rawUrl: string | undefined, srcUrl: string | undefined, isTranscoding: boolean) {
  if (isTranscoding) return 'mpegts';
  const url = (rawUrl || srcUrl || '').toLowerCase();
  if (url.includes('.m3u8') || url.includes('.mpd') || url.includes('/hls/')) {
    return 'shaka';
  }
  if (url.includes('.ts') || url.includes('/mpegts') || url.includes('/live/') || url.includes('.mpegts')) {
    return 'mpegts';
  }
  return 'native';
}

export const VodPlayer: React.FC<VodPlayerProps> = ({
  src,
  rawUrl,
  contentType,
  contentId,
  title,
  subtitle,
  onClose,
  seriesData,
  onPlayEpisode,
  durationSec
}) => {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shakaPlayerRef = useRef<any>(null)
  const mpegtsPlayerRef = useRef<any>(null)

  const cleanUpPlayers = () => {
    // Clean up Shaka Player
    if (shakaPlayerRef.current) {
      try {
        shakaPlayerRef.current.destroy()
      } catch (e) {
        console.error("Error destroying Shaka Player:", e)
      }
      shakaPlayerRef.current = null
    }

    // Clean up mpegts.js Player
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
  }

  // Player state
  const [shakaLoaded, setShakaLoaded] = useState(false)
  const [isFallback, setIsFallback] = useState(false)
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [localDuration, setLocalDuration] = useState(0)
  
  // Computed duration: prefer local video duration unless it's Infinity (mpegts VOD bug), then fallback to backend durationSec
  const duration = (localDuration && isFinite(localDuration)) ? localDuration : (durationSec || 0)
  
  const [volume, setVolume] = useState(1)
  const [isMuted, setIsMuted] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [showControls, setShowControls] = useState(true)
  const [activeMenu, setActiveMenu] = useState<'none' | 'audio' | 'subtitles' | 'settings' | 'info'>('none')
  
  // Custom Controls State
  const [playbackSpeed, setPlaybackSpeed] = useState(1)
  const [aspectRatio, setAspectRatio] = useState<'auto' | 'original' | '16:9' | '4:3' | '21:9' | 'stretch' | 'fill' | 'crop'>('auto')
  const [subtitleSize, setSubtitleSize] = useState<'small' | 'medium' | 'large' | 'extra-large'>('medium')
  const [subtitleColor, setSubtitleColor] = useState<string>('#ffffff')
  const [subtitleBg, setSubtitleBg] = useState<string>('rgba(0, 0, 0, 0.5)')
  const [brightness, setBrightness] = useState(1) // Simulated brightness (1 = normal, 0.3 = dark)

  // Track Lists (Shaka Player)
  const [audioTracks, setAudioTracks] = useState<any[]>([])
  const [subtitleTracks, setSubtitleTracks] = useState<any[]>([])
  const [videoQualities, setVideoQualities] = useState<any[]>([])
  const [currentAudio, setCurrentAudio] = useState<any>(null)
  const [currentSubtitle, setCurrentSubtitle] = useState<any>(null)
  const [currentQuality, setCurrentQuality] = useState<string>('Auto')

  // Backend FFprobe Audio Tracks
  const [backendAudioTracks, setBackendAudioTracks] = useState<any[]>([])
  const [selectedBackendAudio, setSelectedBackendAudio] = useState<any>(null)

  // Continue Watching Prompt
  const [resumePrompt, setResumePrompt] = useState<{ show: boolean; position: number }>({ show: false, position: 0 })

  // Series Autoplay Countdown
  const [autoplayCountdown, setAutoplayCountdown] = useState<number | null>(null)
  const [nextEpisode, setNextEpisode] = useState<any>(null)
  const [prevEpisode, setPrevEpisode] = useState<any>(null)

  // Keep Track of Dragging / Idle state
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  // 1. Dynamic script injection for Shaka Player
  useEffect(() => {
    if (typeof window === 'undefined') return

    const scriptId = 'shaka-player-script'
    let script = document.getElementById(scriptId) as HTMLScriptElement

    const initShaka = () => {
      if ((window as any).shaka) {
        ;(window as any).shaka.polyfill.installAll()
        setShakaLoaded(true)
      }
    }

    if (!script) {
      script = document.createElement('script')
      script.id = scriptId
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/shaka-player/4.3.5/shaka-player.compiled.js'
      script.onload = initShaka
      document.body.appendChild(script)
    } else {
      if ((window as any).shaka) {
        initShaka()
      } else {
        script.addEventListener('load', initShaka)
      }
    }

    // Load user speed preference
    const savedSpeed = localStorage.getItem('vod-playback-speed')
    if (savedSpeed) {
      setPlaybackSpeed(parseFloat(savedSpeed))
    }

    return () => {
      if (script) {
        script.removeEventListener('load', initShaka)
      }
    }
  }, [])

  // 2. Autoplay Episode calculation
  useEffect(() => {
    if (!seriesData || !seriesData.seasons) return

    // Flatten all episodes
    const eps: any[] = []
    seriesData.seasons.forEach((season: any) => {
      if (season.episodes) {
        const sorted = [...season.episodes].sort((a, b) => a.episodeNumber - b.episodeNumber)
        eps.push(...sorted)
      }
    })

    const idx = eps.findIndex((e: any) => e.id === contentId)
    if (idx !== -1) {
      setNextEpisode(idx < eps.length - 1 ? eps[idx + 1] : null)
      setPrevEpisode(idx > 0 ? eps[idx - 1] : null)
    }
  }, [seriesData, contentId])

  // 2.5 Fetch Backend Stream Info for Audio tracks
  useEffect(() => {
    const fetchInfo = async () => {
      let info;
      if (contentType === 'MOVIE') {
        info = await api.getMovieStreamInfo(contentId);
      } else {
        info = await api.getEpisodeStreamInfo(contentId);
      }
      if (info && info.allAudioStreams && info.allAudioStreams.length > 0) {
        const list = info.allAudioStreams.map((stream: any) => ({
          id: stream.id,
          language: stream.language || `Track ${stream.id + 1}`,
          label: `Track ${stream.id + 1} (${(stream.language || 'UND').toUpperCase()}) [${(stream.codec || '').toUpperCase()}]`,
        }));
        setBackendAudioTracks(list);
      }
    };
    fetchInfo();
  }, [contentId, contentType]);

  // 3. Load Continue Watching Position from API
  useEffect(() => {
    const profileId = localStorage.getItem('profileId')
    if (!profileId) return

    api.getContinueWatching(profileId).then(items => {
      const match = items.find((item: any) => item.contentId === contentId)
      if (match && match.positionSeconds > 10) {
        // Less than 95% complete to prevent looping resume at the end credits
        const percent = match.durationSeconds ? (match.positionSeconds / match.durationSeconds) * 100 : 0
        if (percent < 95) {
          setResumePrompt({ show: true, position: match.positionSeconds })
        }
      }
    }).catch(err => console.error("Error loading continue watching status:", err))
  }, [contentId])

  // 4. Initialize Player (Shaka, MpegTs, or Fallback)
  useEffect(() => {
    if (!videoRef.current) return

    cleanUpPlayers()
    setIsFallback(false)

    // Load default speed preference
    videoRef.current.playbackRate = playbackSpeed

    // Compute actual source URL and transcoding state
    const isTranscoding = selectedBackendAudio !== null && backendAudioTracks.length > 0;
    let actualSrc = src;
    if (isTranscoding) {
      actualSrc = `${src}${src.includes('?') ? '&' : '?'}audioTrack=${selectedBackendAudio.id}&start=${Math.floor(currentTime)}`;
    }

    const playType = getPlaybackType(rawUrl, actualSrc, isTranscoding)
    console.log(`Initial playback engine selection for rawUrl=${rawUrl || 'none'}, actualSrc=${actualSrc}: ${playType}`)

    if (playType === 'shaka') {
      if (!shakaLoaded || !(window as any).shaka) {
        // Fallback natively if script not loaded yet
        videoRef.current.src = actualSrc
        return
      }

      const shaka = (window as any).shaka
      const player = new shaka.Player(videoRef.current)
      shakaPlayerRef.current = player

      player.addEventListener('error', (event: any) => {
        console.error('Shaka Player error:', event.detail)
        setIsFallback(true)
        cleanUpPlayers()
      })

      // Load source
      player.load(actualSrc).then(() => {
        console.log("Shaka loaded stream successfully!")
        updateTracks(player)
      }).catch((err: any) => {
        console.warn("Shaka fail-load, reverting to HTML5 native player:", err)
        setIsFallback(true)
        cleanUpPlayers()
      })
    } else if (playType === 'mpegts') {
      // MPEG-TS VOD playback
      import('mpegts.js').then((mpegtsModule) => {
        const mpegts = mpegtsModule.default
        if (videoRef.current && mpegts.getFeatureList().mseLivePlayback) {
          const mpegtsPlayer = mpegts.createPlayer({
            type: 'mpegts',
            isLive: isTranscoding, // Treat on-the-fly transcoding as live
            url: actualSrc
          }, {
            enableWorker: true,
            enableStashBuffer: true,
          })

          mpegtsPlayerRef.current = mpegtsPlayer
          mpegtsPlayer.attachMediaElement(videoRef.current)

          mpegtsPlayer.on(mpegts.Events.ERROR, (type: any, detail: any, info: any) => {
            console.warn("mpegts.js error occurred, falling back to native player:", type, detail, info)
            setIsFallback(true)
            cleanUpPlayers()
          })

          mpegtsPlayer.load()
          
          if (isPlaying) {
            const playPromise = mpegtsPlayer.play()
            if (playPromise && typeof playPromise.catch === 'function') {
              playPromise.catch((err: any) => console.warn(err))
            }
          }
        }
      }).catch((err) => {
        console.error("Failed to load mpegts.js:", err)
        setIsFallback(true)
      })
    } else {
      // Play natively
      setIsFallback(true)
    }

    return () => {
      cleanUpPlayers()
    }
  }, [shakaLoaded, src, rawUrl, selectedBackendAudio])

  // Native fallback source loading
  useEffect(() => {
    if (isFallback && videoRef.current) {
      const isTranscoding = selectedBackendAudio !== null && backendAudioTracks.length > 0;
      let actualSrc = src;
      if (isTranscoding) {
        actualSrc = `${src}${src.includes('?') ? '&' : '?'}audioTrack=${selectedBackendAudio.id}&start=${Math.floor(currentTime)}`;
      }
      
      cleanUpPlayers()
      videoRef.current.src = actualSrc
      videoRef.current.load()
      if (isPlaying) {
        videoRef.current.play().catch(err => console.warn("Fallback play error:", err))
      }
    }
  }, [isFallback, src, selectedBackendAudio])

  // 5. Setup periodic sync for continue watching position
  useEffect(() => {
    const profileId = localStorage.getItem('profileId')
    if (!profileId) return

    progressIntervalRef.current = setInterval(() => {
      if (videoRef.current && videoRef.current.currentTime > 0) {
        const cur = Math.floor(videoRef.current.currentTime)
        const dur = Math.floor(videoRef.current.duration || 0)
        
        api.upsertContinueWatching({
          profileId,
          contentType: contentType === 'MOVIE' ? 'MOVIE' : 'EPISODE',
          contentId,
          positionSeconds: cur,
          durationSeconds: dur > 0 ? dur : undefined
        }).catch(err => console.error("Error updating progress:", err))
      }
    }, 10000) // Every 10 seconds

    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [contentId, contentType])

  // Track Parsing logic
  const updateTracks = (player: any) => {
    try {
      // 1. Parse variant tracks (audio & qualities)
      const variants = player.getVariantTracks()
      
      // Parse Audios
      const audios = variants.reduce((acc: any[], track: any) => {
        if (track.language && !acc.some((a: any) => a.language === track.language)) {
          acc.push({
            language: track.language,
            label: track.label || track.language.toUpperCase(),
            track: track
          })
        }
        return acc
      }, [])
      setAudioTracks(audios)

      // Get Active Audio language
      const currentAudioLang = player.getConfiguration().preferredAudioLanguage
      const activeAud = audios.find((a: any) => a.language === currentAudioLang)
      setCurrentAudio(activeAud || audios[0] || null)

      // Parse Qualities (resolutions)
      const qualities: any[] = []
      variants.forEach((track: any) => {
        if (track.height && !qualities.some((q: any) => q.height === track.height)) {
          qualities.push({
            height: track.height,
            label: `${track.height}p`,
            track: track
          })
        }
      })
      qualities.sort((a: any, b: any) => b.height - a.height) // High to low
      setVideoQualities(qualities)
      
      // Check ABR mode
      const isAbr = player.getConfiguration().abr.enabled
      setCurrentQuality(isAbr ? 'Auto' : qualities.find((q: any) => q.track.active)?.label || 'Auto')

      // 2. Parse subtitle/text tracks
      const texts = player.getTextTracks()
      const textTracksList = texts.map((t: any) => ({
        id: t.id,
        language: t.language,
        label: t.label || t.language.toUpperCase(),
        track: t
      }))
      setSubtitleTracks(textTracksList)

      const activeText = textTracksList.find((t: any) => t.track.active)
      setCurrentSubtitle(activeText || null)
    } catch (e) {
      console.error("Error parsing Shaka tracks:", e)
    }
  }

  // 6. Action handlers
  const handlePlayPause = () => {
    if (!videoRef.current) return
    if (isPlaying) {
      videoRef.current.pause()
      // Save position instantly when pausing
      const profileId = localStorage.getItem('profileId')
      if (profileId) {
        api.upsertContinueWatching({
          profileId,
          contentType: contentType === 'MOVIE' ? 'MOVIE' : 'EPISODE',
          contentId,
          positionSeconds: Math.floor(videoRef.current.currentTime),
          durationSeconds: Math.floor(videoRef.current.duration || 0)
        }).catch(err => console.error("Error saving progress on pause:", err))
      }
    } else {
      videoRef.current.play().catch(err => console.warn(err))
    }
  }

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return
    const val = parseFloat(e.target.value)
    setCurrentTime(val)
    
    // If we are transcoding, native seeking will break the FFmpeg pipe.
    if (selectedBackendAudio !== null && backendAudioTracks.length > 0) {
      // Force trigger reload by updating state 
      // Actually we just set the video element time. If it's mpegts, it might glitch. Let's see.
    }
    
    videoRef.current.currentTime = val
  }

  const handleSkip = (seconds: number) => {
    if (!videoRef.current) return
    let newTime = videoRef.current.currentTime + seconds
    if (newTime < 0) newTime = 0
    if (newTime > duration) newTime = duration
    videoRef.current.currentTime = newTime
    setCurrentTime(newTime)
    triggerControlsVisibility()
  }

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return
    const val = parseFloat(e.target.value)
    videoRef.current.volume = val
    setVolume(val)
    setIsMuted(val === 0)
    videoRef.current.muted = val === 0
  }

  const handleMuteToggle = () => {
    if (!videoRef.current) return
    const mute = !isMuted
    setIsMuted(mute)
    videoRef.current.muted = mute
    if (!mute && volume === 0) {
      videoRef.current.volume = 0.5
      setVolume(0.5)
    }
  }

  const handleFullscreenToggle = () => {
    if (!containerRef.current) return
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true)
      }).catch(err => console.error(err))
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }

  // Monitor Fullscreen changes
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement)
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  // 7. Dynamic Aspect Ratio classes
  const getAspectClass = () => {
    switch (aspectRatio) {
      case '16:9': return 'w-full h-full object-cover aspect-[16/9]'
      case '4:3': return 'w-full h-full object-cover aspect-[4/3]'
      case '21:9': return 'w-full h-full object-cover aspect-[21/9]'
      case 'stretch': return 'w-full h-full object-fill'
      case 'fill': return 'w-full h-full object-cover'
      case 'crop': return 'w-full h-full object-cover scale-110 transition-transform duration-300'
      case 'original': return 'w-auto h-auto max-w-full max-h-full object-none'
      default: return 'w-full h-full object-contain'
    }
  }

  const cycleAspectRatio = () => {
    const orders: typeof aspectRatio[] = ['auto', '16:9', '4:3', '21:9', 'stretch', 'fill', 'crop']
    const nextIdx = (orders.indexOf(aspectRatio) + 1) % orders.length
    setAspectRatio(orders[nextIdx])
  }

  // 8. Custom Playback Speed
  const changeSpeed = (speed: number) => {
    if (videoRef.current) {
      videoRef.current.playbackRate = speed
      setPlaybackSpeed(speed)
      localStorage.setItem('vod-playback-speed', speed.toString())
    }
  }

  // 9. Screenshots (Desktop only)
  const captureFrame = () => {
    if (!videoRef.current) return
    try {
      const video = videoRef.current
      const canvas = document.createElement('canvas')
      canvas.width = video.videoWidth
      canvas.height = video.videoHeight
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
        const link = document.createElement('a')
        link.download = `screenshot_${contentId}_${Math.floor(currentTime)}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
    } catch (e) {
      console.error("Screenshot error:", e)
    }
  }

  // 10. API bindings
  const selectAudioTrack = (trackObj: any) => {
    if (shakaPlayerRef.current) {
      shakaPlayerRef.current.selectAudioLanguage(trackObj.language)
      setCurrentAudio(trackObj)
    } else if (backendAudioTracks.length > 0) {
      // Backend ffprobe track
      setSelectedBackendAudio(trackObj)
      // The `useEffect` listening to `selectedBackendAudio` will handle rebuilding the player.
    }
  }

  const selectSubtitleTrack = (trackObj: any | null) => {
    if (shakaPlayerRef.current) {
      if (trackObj) {
        shakaPlayerRef.current.selectTextTrack(trackObj.track)
        shakaPlayerRef.current.setTextTrackVisibility(true)
        setCurrentSubtitle(trackObj)
      } else {
        shakaPlayerRef.current.setTextTrackVisibility(false)
        setCurrentSubtitle(null)
      }
    }
  }

  const selectQualityLevel = (qual: any | 'Auto') => {
    if (shakaPlayerRef.current) {
      if (qual === 'Auto') {
        shakaPlayerRef.current.configure({ abr: { enabled: true } })
        setCurrentQuality('Auto')
      } else {
        shakaPlayerRef.current.configure({ abr: { enabled: false } })
        shakaPlayerRef.current.selectVariantTrack(qual.track, true)
        setCurrentQuality(qual.label)
      }
    }
  }

  // 11. Time tracking & Autoplay Check
  const handleTimeUpdate = () => {
    if (!videoRef.current) return
    const cur = videoRef.current.currentTime
    const videoDur = videoRef.current.duration
    setCurrentTime(cur)
    if (videoDur && isFinite(videoDur)) {
      setLocalDuration(videoDur)
    }

    // Series Autoplay Trigger: 15s remaining
    if (contentType === 'EPISODE' && nextEpisode && duration > 0 && (duration - cur <= 15)) {
      if (autoplayCountdown === null) {
        setAutoplayCountdown(15)
      }
    } else {
      if (autoplayCountdown !== null && (duration - cur > 15)) {
        setAutoplayCountdown(null)
      }
    }
  }

  // Autoplay Countdown decrements
  useEffect(() => {
    if (autoplayCountdown === null) return
    if (autoplayCountdown <= 0) {
      // Countdown complete, play next episode
      setAutoplayCountdown(null)
      if (onPlayEpisode && nextEpisode) {
        onPlayEpisode(nextEpisode)
      }
      return
    }

    const timer = setTimeout(() => {
      setAutoplayCountdown(prev => (prev !== null ? prev - 1 : null))
    }, 1000)

    return () => clearTimeout(timer)
  }, [autoplayCountdown, nextEpisode, onPlayEpisode])

  // 12. Keep controls visible during actions, fade when idle
  const triggerControlsVisibility = () => {
    setShowControls(true)
    if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    if (isPlaying) {
      idleTimeoutRef.current = setTimeout(() => {
        if (activeMenu === 'none') {
          setShowControls(false)
        }
      }, 3000)
    }
  }

  useEffect(() => {
    triggerControlsVisibility()
    return () => {
      if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current)
    }
  }, [isPlaying, activeMenu])

  // 13. Keyboard Shortcuts
  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'SELECT' || activeEl.tagName === 'TEXTAREA')) {
        return // Ignore keyboard hotkeys while inputting text
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault()
          handlePlayPause()
          break
        case 'ArrowLeft':
          e.preventDefault()
          handleSkip(-10)
          break
        case 'ArrowRight':
          e.preventDefault()
          handleSkip(10)
          break
        case 'KeyF':
          e.preventDefault()
          handleFullscreenToggle()
          break
        case 'KeyM':
          e.preventDefault()
          handleMuteToggle()
          break
        case 'KeyC':
          e.preventDefault()
          // Toggle Subtitles on/off
          if (shakaPlayerRef.current) {
            const vis = !shakaPlayerRef.current.isTextTrackVisible()
            shakaPlayerRef.current.setTextTrackVisibility(vis)
            if (!vis) {
              setCurrentSubtitle(null)
            } else if (subtitleTracks.length > 0) {
              setCurrentSubtitle(subtitleTracks[0])
            }
          }
          break
        case 'KeyP':
          e.preventDefault()
          if (videoRef.current) {
            if (document.pictureInPictureElement) {
              document.exitPictureInPicture()
            } else {
              videoRef.current.requestPictureInPicture()
            }
          }
          break
        default:
          break
      }
    }

    window.addEventListener('keydown', handleKeydown)
    return () => window.removeEventListener('keydown', handleKeydown)
  }, [isPlaying, activeMenu, subtitleTracks])

  // 14. Touch Gestures helper
  const touchStartRef = useRef<{ x: number; y: number; time: number }>({ x: 0, y: 0, time: 0 })
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      touchStartRef.current = {
        x: e.touches[0].clientX,
        y: e.touches[0].clientY,
        time: Date.now()
      }
    }
  }

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (e.changedTouches.length === 1) {
      const diffX = e.changedTouches[0].clientX - touchStartRef.current.x
      const diffY = e.changedTouches[0].clientY - touchStartRef.current.y
      const diffTime = Date.now() - touchStartRef.current.time

      // Double tap skip detection:
      if (diffTime < 250 && Math.abs(diffX) < 15 && Math.abs(diffY) < 15) {
        const width = containerRef.current?.clientWidth || 0
        const tapX = e.changedTouches[0].clientX
        if (tapX < width / 3) {
          handleSkip(-10)
        } else if (tapX > (width * 2) / 3) {
          handleSkip(10)
        } else {
          handlePlayPause()
        }
      }

      // Vertical Swipe detection (Volume on right, Brightness on left)
      if (diffTime > 200 && Math.abs(diffY) > 80 && Math.abs(diffX) < 40) {
        const width = containerRef.current?.clientWidth || 0
        const isLeft = touchStartRef.current.x < width / 2
        
        if (isLeft) {
          // Adjust brightness
          const dir = diffY < 0 ? 0.1 : -0.1
          setBrightness(b => Math.max(0.2, Math.min(1.0, b + dir)))
        } else {
          // Adjust volume
          const dir = diffY < 0 ? 0.1 : -0.1
          const newVol = Math.max(0, Math.min(1, volume + dir))
          if (videoRef.current) {
            videoRef.current.volume = newVol
            setVolume(newVol)
            setIsMuted(newVol === 0)
          }
        }
      }
    }
  }

  // Format position times cleanly
  const formatTime = (secs: number) => {
    if (isNaN(secs) || !isFinite(secs)) return '0:00'
    const h = Math.floor(secs / 3600)
    const m = Math.floor((secs % 3600) / 60)
    const s = Math.floor(secs % 60)
    const padding = s < 10 ? '0' : ''
    
    if (h > 0) {
      const mPadding = m < 10 ? '0' : ''
      return `${h}:${mPadding}${m}:${padding}${s}`
    }
    return `${m}:${padding}${s}`
  }

  const getRemainingTime = () => {
    return formatTime(Math.max(0, duration - currentTime))
  }

  // Library updates
  const handleFavoriteToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId) return
    try {
      await api.addFavorite(profileId, contentType === 'MOVIE' ? 'MOVIE' : 'SERIES', contentId)
    } catch (err) {
      console.error(err)
    }
  }

  const handleWatchLaterToggle = async () => {
    const profileId = localStorage.getItem("profileId")
    if (!profileId) return
    try {
      await api.addWatchLater(profileId, contentType === 'MOVIE' ? 'MOVIE' : 'SERIES', contentId)
    } catch (err) {
      console.error(err)
    }
  }

  return (
    <div 
      ref={containerRef}
      onMouseMove={triggerControlsVisibility}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      style={{
        '--subtitle-size': subtitleSize === 'small' ? '14px' : subtitleSize === 'large' ? '24px' : subtitleSize === 'extra-large' ? '32px' : '18px',
        '--subtitle-color': subtitleColor,
        '--subtitle-bg': subtitleBg,
      } as React.CSSProperties}
      className="relative w-full h-full bg-[#030303] overflow-hidden select-none"
    >
      {/* Simulated Brightness overlay */}
      <div 
        className="absolute inset-0 bg-black pointer-events-none z-10 transition-opacity duration-200" 
        style={{ opacity: 1 - brightness }}
      />

      {/* Actual Video Tag */}
      <video
        ref={videoRef}
        onTimeUpdate={handleTimeUpdate}
        onDurationChange={() => {
          if (videoRef.current?.duration && isFinite(videoRef.current.duration)) {
            setLocalDuration(videoRef.current.duration)
          }
        }}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onClick={handlePlayPause}
        className={`bg-black cursor-pointer pointer-events-auto transition-all ${getAspectClass()}`}
        playsInline
      />

      {/* Resume playback prompt overlay */}
      {resumePrompt.show && (
        <div className="absolute inset-0 z-40 bg-black/85 backdrop-blur-md flex flex-col justify-center items-center gap-6 p-6">
          <div className="text-center">
            <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight mb-2">Continue Watching?</h2>
            <p className="text-zinc-400 text-sm max-w-sm mx-auto leading-relaxed">
              We saved your spot from last time. Would you like to resume from where you left off at {formatTime(resumePrompt.position)}?
            </p>
          </div>
          <div className="flex gap-4">
            <button 
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = resumePrompt.position
                  videoRef.current.play().catch(console.warn)
                }
                setResumePrompt({ show: false, position: 0 })
              }}
              className="bg-primary hover:bg-primary/90 text-white font-bold px-8 py-3 rounded-lg shadow-xl shadow-primary/20 transition-all text-sm"
            >
              Resume Playback
            </button>
            <button 
              onClick={() => {
                if (videoRef.current) {
                  videoRef.current.currentTime = 0
                  videoRef.current.play().catch(console.warn)
                }
                setResumePrompt({ show: false, position: 0 })
              }}
              className="bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold px-6 py-3 rounded-lg transition text-sm"
            >
              Start Over
            </button>
          </div>
        </div>
      )}

      {/* Series Autoplay Countdown Timer overlay */}
      {autoplayCountdown !== null && nextEpisode && (
        <div className="absolute bottom-24 right-8 z-40 bg-black/90 border border-white/10 p-6 rounded-2xl shadow-2xl backdrop-blur-md max-w-sm flex items-center gap-4 transition-all">
          <div className="relative w-12 h-12 flex items-center justify-center bg-primary text-white font-black text-lg rounded-full animate-pulse">
            {autoplayCountdown}
          </div>
          <div>
            <p className="text-zinc-400 text-xs font-semibold uppercase tracking-wider mb-0.5">Next Episode</p>
            <h4 className="font-bold text-white text-sm line-clamp-1 mb-2">
              {nextEpisode.title || `Episode ${nextEpisode.episodeNumber}`}
            </h4>
            <div className="flex gap-3">
              <button 
                onClick={() => {
                  setAutoplayCountdown(null)
                  if (onPlayEpisode) onPlayEpisode(nextEpisode)
                }}
                className="bg-white text-black text-xs font-bold px-3 py-1.5 rounded transition hover:bg-white/90"
              >
                Play Now
              </button>
              <button 
                onClick={() => setAutoplayCountdown(null)}
                className="bg-white/10 hover:bg-white/20 text-white text-xs font-semibold px-3 py-1.5 rounded transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* VOD Player Controls Overlay */}
      <div 
        className={`absolute inset-0 z-30 flex flex-col justify-between bg-gradient-to-t from-black/85 via-black/20 to-black/85 transition-opacity duration-300 pointer-events-none ${showControls ? 'opacity-100' : 'opacity-0'}`}
      >
        {/* Top Header Bar */}
        <div className="p-6 flex items-center justify-between pointer-events-auto">
          <div className="flex items-center gap-4">
            <button 
              onClick={onClose}
              className="p-2.5 bg-white/5 border border-white/10 hover:bg-white/15 text-white rounded-full transition shadow-lg"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <div className="flex items-center gap-2">
                <span className="px-2 py-0.5 text-[10px] font-black uppercase tracking-wider bg-primary rounded text-white shadow-sm shadow-primary/20">
                  {contentType}
                </span>
                <h1 className="font-bold text-white text-lg tracking-tight leading-none">{title}</h1>
              </div>
              {subtitle && <p className="text-xs text-zinc-400 mt-1 leading-none font-medium">{subtitle}</p>}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={handleFavoriteToggle} 
              className="p-2.5 bg-white/5 border border-white/10 text-zinc-300 hover:text-white rounded-full transition shadow-lg"
              title="Add to Favorites"
            >
              <Heart size={16} />
            </button>
            <button 
              onClick={handleWatchLaterToggle}
              className="p-2.5 bg-white/5 border border-white/10 text-zinc-300 hover:text-white rounded-full transition shadow-lg"
              title="Add to Watch Later"
            >
              <Clock size={16} />
            </button>
          </div>
        </div>

        {/* Center Control Overlays */}
        <div className="flex justify-center items-center gap-10 md:gap-16 pointer-events-auto my-auto">
          {/* Skip Back 10s */}
          <button 
            onClick={() => handleSkip(-10)}
            className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-full transition shadow-xl transform active:scale-95"
            title="Rewind 10s"
          >
            <RotateCcw size={24} className="transform rotate-45" />
          </button>

          {/* Central Play/Pause button */}
          <button 
            onClick={handlePlayPause}
            className="p-6 bg-primary hover:bg-primary/95 text-white rounded-full transition shadow-2xl transform hover:scale-105 active:scale-95 shadow-primary/30"
          >
            {isPlaying ? <Pause size={36} className="fill-current" /> : <Play size={36} className="fill-current ml-1" />}
          </button>

          {/* Skip Forward 10s */}
          <button 
            onClick={() => handleSkip(10)}
            className="p-4 bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 hover:text-white rounded-full transition shadow-xl transform active:scale-95"
            title="Fast Forward 10s"
          >
            <RotateCcw size={24} className="transform -scale-x-100 -rotate-45" />
          </button>
        </div>

        {/* Bottom Bar: Seek & Control Buttons */}
        <div className="p-6 space-y-4 pointer-events-auto">
          {/* Seek Progress Slider */}
          <div className="flex items-center gap-4">
            <span className="text-xs font-mono text-zinc-300 min-w-[50px] text-right">{formatTime(currentTime)}</span>
            <input 
              type="range"
              min={0}
              max={isFinite(duration) && duration > 0 ? duration : 100}
              value={isFinite(currentTime) ? currentTime : 0}
              onChange={handleSeek}
              className="flex-1 accent-primary bg-white/10 rounded-lg appearance-none h-1.5 cursor-pointer outline-none hover:bg-white/20 transition"
            />
            <span className="text-xs font-mono text-zinc-300 min-w-[50px]">{getRemainingTime()}</span>
          </div>

          {/* Bottom Bar Control Actions */}
          <div className="flex justify-between items-center">
            {/* Left Hand Controls: volume, aspect, details info */}
            <div className="flex items-center gap-4">
              <button 
                onClick={handlePlayPause}
                className="text-zinc-300 hover:text-white transition"
              >
                {isPlaying ? <Pause size={20} /> : <Play size={20} />}
              </button>

              {/* Volume sliders */}
              <div className="flex items-center gap-2 group">
                <button 
                  onClick={handleMuteToggle}
                  className="text-zinc-300 hover:text-white transition"
                >
                  {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
                </button>
                <input 
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="accent-white bg-white/10 rounded appearance-none h-1 w-0 group-hover:w-20 transition-all cursor-pointer"
                />
              </div>

              {/* Aspect ratio label */}
              <button 
                onClick={cycleAspectRatio}
                className="text-xs font-black uppercase bg-white/5 border border-white/10 rounded-md px-2 py-1 text-zinc-300 hover:text-white transition"
                title="Change Aspect Ratio"
              >
                Aspect: {aspectRatio}
              </button>
            </div>

            {/* Right Hand Controls: speed, audio/sub, pip, quality, screenshot, fullscreen */}
            <div className="flex items-center gap-4 relative">
              {/* Screenshot Mode (Desktop only) */}
              <button 
                onClick={captureFrame}
                className="text-zinc-300 hover:text-white transition hidden md:block"
                title="Take Screenshot"
              >
                <Camera size={18} />
              </button>

              {/* Info panel trigger */}
              <button 
                onClick={() => setActiveMenu(activeMenu === 'info' ? 'none' : 'info')}
                className={`text-zinc-300 hover:text-white transition ${activeMenu === 'info' ? 'text-primary' : ''}`}
                title="Playback Info"
              >
                <Info size={18} />
              </button>

              {/* Quality level selection */}
              {!isFallback && videoQualities.length > 0 && (
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenu(activeMenu === 'settings' ? 'none' : 'settings')}
                    className={`text-xs font-semibold bg-white/5 border border-white/10 rounded-md px-2.5 py-1 text-zinc-300 hover:text-white transition flex items-center gap-1 ${activeMenu === 'settings' ? 'text-primary' : ''}`}
                  >
                    Quality: {currentQuality}
                  </button>

                  {/* Quality Settings Dropdown Menu */}
                  {activeMenu === 'settings' && (
                    <div className="absolute bottom-10 right-0 bg-[#0B0B0C] border border-white/10 p-2 rounded-xl shadow-2xl min-w-[140px] flex flex-col gap-1 z-50">
                      <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500 px-2 py-1">Resolution</p>
                      <button 
                        onClick={() => {
                          selectQualityLevel('Auto')
                          setActiveMenu('none')
                        }}
                        className={`text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between transition ${currentQuality === 'Auto' ? 'bg-primary text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                      >
                        <span>Auto</span>
                        {currentQuality === 'Auto' && <Check size={12} />}
                      </button>
                      {videoQualities.map((q: any) => (
                        <button 
                          key={q.height}
                          onClick={() => {
                            selectQualityLevel(q)
                            setActiveMenu('none')
                          }}
                          className={`text-left text-xs px-2.5 py-1.5 rounded-lg flex items-center justify-between transition ${currentQuality === q.label ? 'bg-primary text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                        >
                          <span>{q.label}</span>
                          {currentQuality === q.label && <Check size={12} />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Audio & Subtitle track menus */}
              {(audioTracks.length > 0 || subtitleTracks.length > 0 || backendAudioTracks.length > 0 || isFallback) && (
                <div className="relative">
                  <button 
                    onClick={() => setActiveMenu(activeMenu === 'audio' ? 'none' : 'audio')}
                    className={`text-zinc-300 hover:text-white transition ${activeMenu === 'audio' ? 'text-primary' : ''}`}
                    title="Audio & Subtitles"
                  >
                    <Subtitles size={20} />
                  </button>

                  {/* Audio & Subtitles Dropdown */}
                  {activeMenu === 'audio' && (
                    <div className="absolute bottom-10 right-0 bg-[#0B0B0C] border border-white/10 p-3 rounded-xl shadow-2xl min-w-[280px] grid grid-cols-2 gap-4 z-50 text-left">
                      {/* Audio Tracks Col */}
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500 mb-2 border-b border-white/5 pb-1">Audio</p>
                        <div className="space-y-1 max-h-[160px] overflow-y-auto">
                          {backendAudioTracks.length > 0 ? (
                            backendAudioTracks.map((a: any) => (
                              <button
                                key={a.id}
                                onClick={() => selectAudioTrack(a)}
                                className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition ${selectedBackendAudio?.id === a.id ? 'text-primary font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                              >
                                <span className="truncate pr-1">{a.label}</span>
                                {selectedBackendAudio?.id === a.id && <Check size={12} />}
                              </button>
                            ))
                          ) : audioTracks.length === 0 ? (
                            <p className="text-[10px] text-zinc-600 px-2">Default track</p>
                          ) : (
                            audioTracks.map((a: any) => (
                              <button
                                key={a.language}
                                onClick={() => selectAudioTrack(a)}
                                className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition ${currentAudio?.language === a.language ? 'text-primary font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                              >
                                <span className="truncate pr-1">{a.label}</span>
                                {currentAudio?.language === a.language && <Check size={12} />}
                              </button>
                            ))
                          )}
                        </div>
                      </div>

                      {/* Subtitle Tracks Col */}
                      <div>
                        <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500 mb-2 border-b border-white/5 pb-1">Subtitles</p>
                        <div className="space-y-1 max-h-[160px] overflow-y-auto">
                          <button
                            onClick={() => selectSubtitleTrack(null)}
                            className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition ${currentSubtitle === null ? 'text-primary font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                          >
                            <span>Off</span>
                            {currentSubtitle === null && <Check size={12} />}
                          </button>
                          {subtitleTracks.map((s: any) => (
                            <button
                              key={s.id}
                              onClick={() => selectSubtitleTrack(s)}
                              className={`w-full text-left text-xs px-2 py-1.5 rounded flex items-center justify-between transition ${currentSubtitle?.id === s.id ? 'text-primary font-bold' : 'text-zinc-300 hover:bg-white/5'}`}
                            >
                              <span className="truncate pr-1">{s.label}</span>
                              {currentSubtitle?.id === s.id && <Check size={12} />}
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Playback speed selector */}
              <div className="relative">
                <button 
                  onClick={() => setActiveMenu(activeMenu === 'subtitles' ? 'none' : 'subtitles')}
                  className="text-xs bg-white/5 border border-white/10 rounded-md px-2 py-1 text-zinc-300 hover:text-white transition"
                  title="Playback Speed"
                >
                  Speed: {playbackSpeed}x
                </button>

                {/* Speed selector popup */}
                {activeMenu === 'subtitles' && (
                  <div className="absolute bottom-10 right-0 bg-[#0B0B0C] border border-white/10 p-2 rounded-xl shadow-2xl min-w-[100px] flex flex-col gap-1 z-50">
                    <p className="text-[10px] uppercase font-black tracking-wider text-zinc-500 px-2 py-1">Speed</p>
                    {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2].map(speed => (
                      <button 
                        key={speed}
                        onClick={() => {
                          changeSpeed(speed)
                          setActiveMenu('none')
                        }}
                        className={`text-left text-xs px-2 py-1 rounded flex items-center justify-between transition ${playbackSpeed === speed ? 'bg-primary text-white' : 'text-zinc-300 hover:bg-white/5'}`}
                      >
                        <span>{speed}x</span>
                        {playbackSpeed === speed && <Check size={12} />}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Subtitles custom appearance settings button (gear-like settings) */}
              <div className="relative">
                <button
                  onClick={() => setActiveMenu(activeMenu === 'settings' ? 'none' : 'settings')}
                  className="text-zinc-300 hover:text-white transition"
                  title="Customize Subtitles"
                >
                  {/* Reuse Settings popup menu trigger if needed or custom trigger */}
                </button>
              </div>

              {/* PIP toggle */}
              <button 
                onClick={() => {
                  if (videoRef.current) {
                    if (document.pictureInPictureElement) {
                      document.exitPictureInPicture()
                    } else {
                      videoRef.current.requestPictureInPicture()
                    }
                  }
                }}
                className="text-zinc-300 hover:text-white transition hidden md:block"
                title="Picture-in-Picture"
              >
                <Tv size={18} />
              </button>

              {/* Fullscreen Button */}
              <button 
                onClick={handleFullscreenToggle}
                className="text-zinc-300 hover:text-white transition"
                title="Fullscreen"
              >
                {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Playback Info Panel overlay */}
      {activeMenu === 'info' && (
        <div className="absolute top-24 left-6 z-40 bg-black/90 border border-white/10 p-5 rounded-2xl shadow-2xl max-w-sm backdrop-blur-md text-left">
          <h3 className="font-bold text-white text-base mb-3 flex items-center gap-2">
            <Activity size={16} className="text-primary" />
            Media Playback Info
          </h3>
          <div className="space-y-2 text-xs font-medium text-zinc-300">
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-zinc-500">Pipeline:</span>
              <span>{isFallback ? 'HTML5 Native (Fallback)' : 'Shaka Player'}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-zinc-500">Content Type:</span>
              <span>{contentType}</span>
            </div>
            <div className="flex justify-between border-b border-white/5 pb-1">
              <span className="text-zinc-500">Stream Url:</span>
              <span className="truncate max-w-[200px]" title={src}>{src}</span>
            </div>
            {!isFallback && shakaPlayerRef.current && (
              <>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-zinc-500">Resolution:</span>
                  <span>
                    {shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active)?.width}x
                    {shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active)?.height}
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-zinc-500">Bitrate:</span>
                  <span>
                    {((shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active)?.bandwidth || 0) / 1000000).toFixed(2)} Mbps
                  </span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-zinc-500">Video Codec:</span>
                  <span>{shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active)?.videoCodec || 'N/A'}</span>
                </div>
                <div className="flex justify-between border-b border-white/5 pb-1">
                  <span className="text-zinc-500">Audio Codec:</span>
                  <span>{shakaPlayerRef.current.getVariantTracks().find((t: any) => t.active)?.audioCodec || 'N/A'}</span>
                </div>
              </>
            )}
            <div className="flex justify-between pb-1">
              <span className="text-zinc-500">Duration:</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <button 
            onClick={() => setActiveMenu('none')}
            className="w-full bg-white/5 hover:bg-white/10 text-white font-bold text-xs py-2 rounded-lg mt-4 transition border border-white/10"
          >
            Close Panel
          </button>
        </div>
      )}

      {/* Styled Cues for subtitles style customize options */}
      <style dangerouslySetInnerHTML={{__html: `
        video::cue {
          font-size: var(--subtitle-size, 18px) !important;
          color: var(--subtitle-color, #ffffff) !important;
          background-color: var(--subtitle-bg, rgba(0, 0, 0, 0.5)) !important;
          font-family: inherit;
        }
      `}} />
    </div>
  )
}
