// ─── IPGenZ Live Player v2 — Codec Manager ───────────────────────────────────
// Single responsibility: detect codec information from the stream.
// Returns codec info. Never handles UI or transcoding decisions.

import type { AudioCodec, VideoCodec, AudioTrack, CodecInfo } from './types'
import type { EventManager } from './EventManager'

const UNSUPPORTED_AUDIO = new Set<AudioCodec>(['AC3', 'EAC3', 'MP2'])

export class CodecManager {
  constructor(private events: EventManager) {}

  /** Check if the browser's MSE can decode the given audio codec natively. */
  browserCanPlayAudio(codec: AudioCodec): boolean {
    if (UNSUPPORTED_AUDIO.has(codec)) return false
    const mimeMap: Partial<Record<AudioCodec, string>> = {
      AAC: 'audio/aac',
      MP3: 'audio/mpeg',
    }
    const mime = mimeMap[codec]
    if (!mime) return false
    try {
      const el = document.createElement('audio')
      const r = el.canPlayType(mime)
      return r === 'probably' || r === 'maybe'
    } catch {
      return false
    }
  }

  /**
   * Client-side MPEG-TS PMT parser.
   * Fetches the first 64KB of the stream using the USER's IP (not Render's),
   * so IPTV providers never block it. Detects all audio track codecs & languages.
   */
  async detectFromStream(streamUrl: string): Promise<AudioTrack[]> {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 10000)

    try {
      const response = await fetch(streamUrl, { signal: controller.signal })
      const reader = response.body?.getReader()
      if (!reader) return []

      let buffer = new Uint8Array(0)
      const MAX_BYTES = 65536

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

      return this.parsePMT(buffer)
    } catch (e: any) {
      clearTimeout(timeoutId)
      if (e.name !== 'AbortError') console.warn('[CodecManager] Stream detect error:', e)
      return []
    }
  }

  /** Parse MPEG-TS PAT → PMT to extract all audio stream entries. */
  parsePMT(buffer: Uint8Array): AudioTrack[] {
    let pmtPid = -1
    const audioStreams: AudioTrack[] = []

    for (let i = 0; i + 188 <= buffer.length; i += 188) {
      if (buffer[i] !== 0x47) {
        for (let j = i; j < i + 188; j++) {
          if (buffer[j] === 0x47) { i = j - 188; break }
        }
        continue
      }
      const pid = ((buffer[i + 1] & 0x1F) << 8) | buffer[i + 2]
      const adaptCtrl = (buffer[i + 3] & 0x30) >> 4
      let payloadOff = i + 4
      if (adaptCtrl === 2) continue
      if (adaptCtrl === 3) payloadOff += (buffer[payloadOff] + 1)
      const pusi = (buffer[i + 1] & 0x40) !== 0

      if (pid === 0 && pusi && pmtPid === -1) {
        const ptrField = buffer[payloadOff]
        const base = payloadOff + 1 + ptrField
        const secLen = ((buffer[base + 1] & 0x0F) << 8) | buffer[base + 2]
        for (let j = base + 8; j < base + 3 + secLen - 4; j += 4) {
          const progNum = (buffer[j] << 8) | buffer[j + 1]
          if (progNum !== 0) { pmtPid = ((buffer[j + 2] & 0x1F) << 8) | buffer[j + 3]; break }
        }
      } else if (pid === pmtPid && pusi && audioStreams.length === 0) {
        const ptrField = buffer[payloadOff]
        const base = payloadOff + 1 + ptrField
        const secLen = ((buffer[base + 1] & 0x0F) << 8) | buffer[base + 2]
        const progInfoLen = ((buffer[base + 10] & 0x0F) << 8) | buffer[base + 11]
        let k = base + 12 + progInfoLen
        let audioIdx = 0
        while (k < base + 3 + secLen - 4) {
          const streamType = buffer[k]
          const esInfoLen = ((buffer[k + 3] & 0x0F) << 8) | buffer[k + 4]
          const isAudio = [0x03, 0x04, 0x0F, 0x11, 0x81, 0x06, 0x87].includes(streamType)
          if (isAudio) {
            const codec: AudioCodec =
              streamType === 0x0F || streamType === 0x11 ? 'AAC'
              : streamType === 0x03 || streamType === 0x04 ? 'MP2'
              : streamType === 0x81 ? 'AC3'
              : streamType === 0x87 ? 'EAC3'
              : 'AC3'
            let lang = 'und'
            for (let d = k + 5; d < k + 5 + esInfoLen - 1;) {
              const descTag = buffer[d], descLen = buffer[d + 1]
              if (descTag === 0x0A && descLen >= 3) {
                lang = String.fromCharCode(buffer[d + 2], buffer[d + 3], buffer[d + 4])
                  .replace(/[^\x20-\x7E]/g, '')
              }
              d += 2 + descLen
            }
            const canPlay = this.browserCanPlayAudio(codec)
            audioStreams.push({
              id: audioIdx,
              label: `Track ${audioIdx + 1} (${lang.toUpperCase() || 'UND'}) [${codec}]`,
              language: lang || 'und',
              codec,
              active: audioIdx === 0,
            })
            audioIdx++
          }
          k += 5 + esInfoLen
        }
        if (audioStreams.length > 0) break
      }
    }
    return audioStreams
  }

  /** Map mpegts.js mediaInfo audioCodec string to our AudioCodec enum. */
  parseAudioCodecFromMediaInfo(rawCodec: string): AudioCodec {
    const c = rawCodec.toLowerCase()
    if (c.includes('ac-3') || c.includes('ac3')) return 'AC3'
    if (c.includes('ec-3') || c.includes('eac3')) return 'EAC3'
    if (c.includes('mp4a') || c.includes('aac')) return 'AAC'
    if (c.includes('mp2') || c.includes('mpeg-1') || c.includes('mpeg-2')) return 'MP2'
    if (c.includes('mp3')) return 'MP3'
    return 'UNKNOWN'
  }

  /** Map mpegts.js mediaInfo videoCodec string to our VideoCodec enum. */
  parseVideoCodecFromMediaInfo(rawCodec: string): VideoCodec {
    const c = rawCodec.toLowerCase()
    if (c.includes('avc') || c.includes('h264') || c.includes('h.264')) return 'H264'
    if (c.includes('hevc') || c.includes('h265') || c.includes('h.265')) return 'HEVC'
    if (c.includes('av1')) return 'AV1'
    if (c.includes('mpeg')) return 'MPEG2'
    return 'UNKNOWN'
  }
}
