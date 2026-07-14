/**
 * DecodePathResolver — v7
 *
 * Determines the optimal decode path for a given codec, in strict cost order:
 * 1. Native MSE (MediaSource.isTypeSupported) — free, default for H.264/AAC
 * 2. WebCodecs API — hardware-accelerated where supported
 * 3. WASM software decode — fallback for non-native codecs
 * 4. Server transcode — absolute last resort
 *
 * Returns a DecodePath enum indicating which path to use.
 */

export enum DecodePath {
  NATIVE     = 'NATIVE',         // Browser MSE hardware decode
  WEBCODECS  = 'WEBCODECS',      // WebCodecs API
  WASM       = 'WASM',           // Client-side WASM software decode
  SERVER     = 'SERVER_TRANSCODE', // Server-side FFmpeg transcode (last resort)
  UNSUPPORTED = 'UNSUPPORTED',   // No viable path on this device
}

export interface DecodePathResult {
  video: DecodePath;
  audio: DecodePath;
  details: string;
}

const NATIVE_VIDEO_TYPES: Record<string, string[]> = {
  'h264':      ['video/mp4; codecs="avc1.42E01E"', 'video/mp2t'],
  'h264_high': ['video/mp4; codecs="avc1.640028"'],
  'hevc':      ['video/mp4; codecs="hev1.1.6.L93.B0"', 'video/mp4; codecs="hvc1"'],
  'mpeg2video':['video/mp2t'],
  'av1':       ['video/mp4; codecs="av01.0.08M.08"'],
  'vp9':       ['video/webm; codecs="vp9"'],
};

const NATIVE_AUDIO_TYPES: Record<string, string[]> = {
  'aac':  ['audio/mp4; codecs="mp4a.40.2"', 'audio/mp2t'],
  'mp3':  ['audio/mpeg'],
  'opus': ['audio/webm; codecs="opus"'],
  'ac3':  ['audio/mp4; codecs="ac-3"'],
  'eac3': ['audio/mp4; codecs="ec-3"'],
  'dts':  ['audio/mp4; codecs="dtsc"'],
};

function checkNativeSupport(mimeTypes: string[]): boolean {
  if (typeof window === 'undefined' || !('MediaSource' in window)) return false;
  return mimeTypes.some(mime => MediaSource.isTypeSupported(mime));
}

async function checkWebCodecsSupport(codec: string, type: 'video' | 'audio'): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!('VideoDecoder' in window) && !('AudioDecoder' in window)) return false;

  try {
    if (type === 'video' && 'VideoDecoder' in window) {
      const codecMap: Record<string, string> = {
        'h264': 'avc1.42E01E',
        'hevc': 'hev1.1.6.L93.B0',
        'av1': 'av01.0.08M.08',
        'vp9': 'vp09.00.10.08',
        'mpeg2video': 'mp2v',
      };
      const id = codecMap[codec];
      if (!id) return false;
      const result = await (window as any).VideoDecoder.isConfigSupported({ codec: id });
      return result.supported === true;
    }

    if (type === 'audio' && 'AudioDecoder' in window) {
      const codecMap: Record<string, string> = {
        'aac': 'mp4a.40.2',
        'mp3': 'mp3',
        'opus': 'opus',
        'ac3': 'ac-3',
        'eac3': 'ec-3',
        'vorbis': 'vorbis',
      };
      const id = codecMap[codec];
      if (!id) return false;
      const result = await (window as any).AudioDecoder.isConfigSupported({ codec: id, sampleRate: 48000, numberOfChannels: 2 });
      return result.supported === true;
    }
  } catch {
    return false;
  }
  return false;
}

function checkWasmAvailable(): boolean {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.instantiate === 'function';
  } catch {
    return false;
  }
}

/**
 * Resolves the optimal decode path for the given video and audio codecs.
 */
export async function resolveDecodePath(
  videoCodec: string,
  audioCodec: string,
): Promise<DecodePathResult> {
  const normalVideo = videoCodec.toLowerCase();
  const normalAudio = audioCodec.toLowerCase();

  // ── VIDEO PATH ──────────────────────────────────────────────────────────────
  let video: DecodePath;
  let details = '';

  // Step 1: Native MSE check
  const nativeVideoTypes = NATIVE_VIDEO_TYPES[normalVideo] || ['video/mp2t'];
  if (checkNativeSupport(nativeVideoTypes)) {
    video = DecodePath.NATIVE;
    details += `Video: NATIVE (${normalVideo}). `;
  }
  // Step 2: WebCodecs
  else if (await checkWebCodecsSupport(normalVideo, 'video')) {
    video = DecodePath.WEBCODECS;
    details += `Video: WEBCODECS (${normalVideo}). `;
  }
  // Step 3: WASM (available for H.264, HEVC, MPEG-2)
  else if (checkWasmAvailable() && ['h264', 'hevc', 'mpeg2video', 'mpeg4'].includes(normalVideo)) {
    video = DecodePath.WASM;
    details += `Video: WASM (${normalVideo}). `;
  }
  // Step 4: Server transcode as last resort
  else if (['h264', 'hevc', 'mpeg2video', 'av1'].includes(normalVideo)) {
    video = DecodePath.SERVER;
    details += `Video: SERVER_TRANSCODE (${normalVideo} not decodable client-side). `;
  } else {
    video = DecodePath.UNSUPPORTED;
    details += `Video: UNSUPPORTED (${normalVideo}). `;
  }

  // ── AUDIO PATH ──────────────────────────────────────────────────────────────
  let audio: DecodePath;

  const nativeAudioTypes = NATIVE_AUDIO_TYPES[normalAudio] || [];
  if (nativeAudioTypes.length > 0 && checkNativeSupport(nativeAudioTypes)) {
    audio = DecodePath.NATIVE;
    details += `Audio: NATIVE (${normalAudio}).`;
  } else if (await checkWebCodecsSupport(normalAudio, 'audio')) {
    audio = DecodePath.WEBCODECS;
    details += `Audio: WEBCODECS (${normalAudio}).`;
  } else if (checkWasmAvailable()) {
    audio = DecodePath.WASM;
    details += `Audio: WASM (${normalAudio}).`;
  } else {
    audio = DecodePath.SERVER;
    details += `Audio: SERVER_TRANSCODE (${normalAudio} no client path).`;
  }

  // If video is NATIVE, allow any audio path (mpegts.js handles demux)
  // If video is non-native, audio must match the same decode pipeline
  if (video === DecodePath.NATIVE) {
    // Native MSE path can handle most audio tracks via mpegts.js demux
    // Keep audio path as resolved
  }

  return { video, audio, details };
}
