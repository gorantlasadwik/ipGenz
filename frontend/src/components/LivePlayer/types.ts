// ─── IPGenZ Live Player v2 — Type Definitions ────────────────────────────────

export type PlayerState =
  | 'idle'
  | 'loading'
  | 'initializing'
  | 'buffering'
  | 'playing'
  | 'waiting'
  | 'recovering'
  | 'stopped'
  | 'error'

export type HealthStatus = 'healthy' | 'buffering' | 'stalled' | 'disconnected' | 'recovering'

export type AudioCodec = 'AAC' | 'MP3' | 'AC3' | 'EAC3' | 'MP2' | 'UNKNOWN'
export type VideoCodec = 'H264' | 'HEVC' | 'MPEG2' | 'AV1' | 'UNKNOWN'

export type RecoveryReason =
  | 'provider_eof'
  | 'network_error'
  | 'decoder_error'
  | 'stall'
  | 'manual'

export type PlayerEvent =
  | 'PLAY'
  | 'PAUSE'
  | 'BUFFERING'
  | 'WAITING'
  | 'PLAYING'
  | 'ERROR'
  | 'ENDED'
  | 'STALLED'
  | 'RECONNECTING'
  | 'RECOVERED'
  | 'CHANNEL_CHANGED'
  | 'STATE_CHANGE'
  | 'STATS_UPDATE'
  | 'CODEC_DETECTED'
  | 'AUDIO_TRACKS_READY'
  | 'AUTOPLAY_BLOCKED'

export interface AudioTrack {
  id: number
  label: string
  language: string
  codec: AudioCodec
  active: boolean
}

export interface CodecInfo {
  videoCodec: VideoCodec
  audioCodec: AudioCodec
  resolution?: string
  fps?: number
  bitrate?: number
  audioTracks: AudioTrack[]
  requiresTranscode: boolean
  transcodeType: 'AUDIO' | 'VIDEO' | null
}

export interface PlayerStats {
  fps: number
  droppedFrames: number
  resolution: string
  bitrate: number
  bufferSizeMs: number
  latencyMs: number
  reconnectCount: number
  playbackTimeSec: number
  videoCodec: string
  audioCodec: string
  state: PlayerState
  health: HealthStatus
}

export interface SessionConfig {
  channelId: string
  streamUrl: string
  autoplay: boolean
  startMuted?: boolean
}

export interface PlayerConfig {
  enableStats?: boolean
  enableHealthMonitor?: boolean
  healthCheckIntervalMs?: number
  stallThresholdMs?: number
  maxReconnectAttempts?: number
  bufferTargetSec?: number
}

export interface LivePlayerProps {
  channelId: string
  streamUrl: string
  channelName?: string
  autoplay?: boolean
  onStateChange?: (state: PlayerState) => void
  onStats?: (stats: PlayerStats) => void
  onError?: (error: string) => void
}
