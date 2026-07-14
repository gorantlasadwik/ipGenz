/**
 * Protocol Detector
 * Identifies the ingest protocol from a provider URL.
 */

export enum ProtocolType {
  MPEG_TS = 'MPEG_TS',   // Direct .ts or UDP/RTP
  HLS     = 'HLS',       // .m3u8 / HTTP Live Streaming
  RTMP    = 'RTMP',      // rtmp:// or rtmps://
  SRT     = 'SRT',       // srt://
  UNKNOWN = 'UNKNOWN',
}

export function detectProtocol(url: string): ProtocolType {
  if (!url) return ProtocolType.UNKNOWN;

  const lower = url.toLowerCase();

  if (lower.startsWith('rtmp://') || lower.startsWith('rtmps://')) {
    return ProtocolType.RTMP;
  }
  if (lower.startsWith('srt://')) {
    return ProtocolType.SRT;
  }
  if (lower.includes('.m3u8') || lower.includes('/hls/') || lower.includes('playlist')) {
    return ProtocolType.HLS;
  }
  if (
    lower.includes('.ts') ||
    lower.startsWith('udp://') ||
    lower.startsWith('rtp://') ||
    lower.includes('/live/')
  ) {
    return ProtocolType.MPEG_TS;
  }

  // Default to MPEG-TS passthrough for unknown HTTP streams
  return ProtocolType.MPEG_TS;
}

/**
 * Returns FFmpeg input flags appropriate for the detected protocol.
 */
export function getFFmpegInputFlags(protocol: ProtocolType): string[] {
  switch (protocol) {
    case ProtocolType.MPEG_TS:
      return [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '3',
        '-fflags', '+genpts+discardcorrupt+igndts',
        '-analyzeduration', '3000000',
        '-probesize', '1000000',
      ];
    case ProtocolType.HLS:
      return [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-reconnect_streamed', '1',
        '-reconnect_delay_max', '3',
        '-live_start_index', '-3',
        '-fflags', '+genpts+discardcorrupt',
        '-analyzeduration', '3000000',
      ];
    case ProtocolType.RTMP:
      return [
        '-fflags', '+genpts+discardcorrupt',
        '-analyzeduration', '3000000',
      ];
    case ProtocolType.SRT:
      return [
        '-fflags', '+genpts+discardcorrupt',
        '-analyzeduration', '3000000',
      ];
    default:
      return [
        '-reconnect', '1',
        '-reconnect_at_eof', '1',
        '-fflags', '+genpts+discardcorrupt+igndts',
      ];
  }
}
