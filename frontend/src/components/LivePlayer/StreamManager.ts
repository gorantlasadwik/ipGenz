// ─── IPGenZ Live Player v2 — Stream Manager ──────────────────────────────────
// Responsible for building the correct stream URL based on codec requirements.
// Detects if transcoding is needed. Returns the best URL for the current session.
// Never handles playback or UI.

import type { AudioCodec } from './types'
import { api } from '@/lib/api'

export interface StreamConfig {
  baseUrl: string
  audioTrackId: number | null
  transcodeAudio: boolean
}

export class StreamManager {
  constructor(private channelId: string) {}

  /** Build the full stream URL from the current config. */
  buildUrl(cfg: StreamConfig): string {
    let url = cfg.baseUrl
    const params: string[] = []

    if (cfg.transcodeAudio && cfg.audioTrackId === null) {
      params.push('transcode=audio')
    }
    if (cfg.audioTrackId !== null) {
      params.push(`audioTrack=${cfg.audioTrackId}`)
    }

    if (params.length > 0) {
      url += (url.includes('?') ? '&' : '?') + params.join('&')
    }
    return url
  }

  /** Fetch backend codec info (uses Render IP — may fail for some providers). */
  async fetchBackendCodecInfo(): Promise<{ allAudioStreams: any[] } | null> {
    try {
      const data = await api.getLiveStreamInfo(this.channelId)
      return data
    } catch {
      return null
    }
  }

  /** The base stream URL for this channel. */
  getBaseUrl(): string {
    return api.streamLiveUrl(this.channelId)
  }
}
