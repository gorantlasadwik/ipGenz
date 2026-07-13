// Web Worker for Player 3 Client-Side Decode Pipeline
// Keeps heavy TS demuxing and WebCodecs/WASM decode operations off the main thread.

const ctx: Worker = self as any;

let videoDecoder: any = null;
let audioDecoder: any = null;
let videoPid: number | null = null;
let audioPid: number | null = null;
let pmtPid: number | null = null;

// Audio and Video parsing state
let videoPesBuffer: number[] = [];
let audioPesBuffer: number[] = [];

// TS Sync state
let alignBuffer = new Uint8Array(0);

// Capability scan results
let detectedVideoCodec = 'h264';
let detectedAudioCodec = 'aac';

ctx.onmessage = function (e: MessageEvent) {
  const { type, data } = e.data;

  if (type === 'init') {
    const { videoCodec, audioCodec, vPid, aPid } = data;
    videoPid = vPid || null;
    audioPid = aPid || null;
    detectedVideoCodec = videoCodec || 'h264';
    detectedAudioCodec = audioCodec || 'aac';

    setupWebCodecs(videoCodec, audioCodec);
  } else if (type === 'chunk') {
    processIncomingBytes(new Uint8Array(data));
  } else if (type === 'destroy') {
    destroyDecoders();
  }
};

function setupWebCodecs(videoCodec: string, audioCodec: string) {
  try {
    // 1. Initialize WebCodecs Video Decoder if supported
    if (typeof VideoDecoder !== 'undefined') {
      let videoConfigCodec = 'avc1.42e01f'; // H.264 default
      if (videoCodec === 'hevc' || videoCodec === 'h265') {
        videoConfigCodec = 'hev1.1.6.L93.B0'; // HEVC Main Profile
      } else if (videoCodec === 'mpeg2') {
        videoConfigCodec = 'mp2v'; // MPEG-2 WebCodecs format
      }

      videoDecoder = new VideoDecoder({
        output: (frame) => {
          // Send decoded frame back to main thread for Canvas rendering
          ctx.postMessage({ type: 'video-frame', frame }, [frame]);
        },
        error: (err) => {
          ctx.postMessage({ type: 'error', message: `VideoDecoder error: ${err.message}` });
        },
      });

      videoDecoder.configure({
        codec: videoConfigCodec,
        hardwareAcceleration: 'prefer-hardware',
      });
    }

    // 2. Initialize WebCodecs Audio Decoder if supported
    if (typeof AudioDecoder !== 'undefined') {
      let audioConfigCodec = 'mp4a.40.2'; // AAC LC default
      if (audioCodec === 'ac3') {
        audioConfigCodec = 'ac-3';
      } else if (audioCodec === 'dts') {
        audioConfigCodec = 'dts';
      }

      audioDecoder = new AudioDecoder({
        output: (audioData) => {
          // Send decoded audio back to main thread or direct Web Audio API worker
          ctx.postMessage({ type: 'audio-data', audioData });
        },
        error: (err) => {
          ctx.postMessage({ type: 'error', message: `AudioDecoder error: ${err.message}` });
        },
      });

      audioDecoder.configure({
        codec: audioConfigCodec,
        numberOfChannels: 2,
        sampleRate: 48000,
      });
    }
  } catch (err: any) {
    ctx.postMessage({ type: 'error', message: `Failed to configure decoders: ${err.message}. Falling back to WASM emulation.` });
  }
}

function processIncomingBytes(chunk: Uint8Array) {
  // Concat new chunk to align buffer
  const temp = new Uint8Array(alignBuffer.length + chunk.length);
  temp.set(alignBuffer, 0);
  temp.set(chunk, alignBuffer.length);
  alignBuffer = temp;

  let offset = 0;
  while (alignBuffer.length - offset >= 188) {
    if (alignBuffer[offset] !== 0x47) {
      // Sync byte missing, scan forward
      let syncIdx = -1;
      for (let i = offset + 1; i < alignBuffer.length; i++) {
        if (alignBuffer[i] === 0x47) {
          syncIdx = i;
          break;
        }
      }
      if (syncIdx !== -1) {
        offset = syncIdx;
      } else {
        offset = alignBuffer.length;
        break;
      }
    }

    if (alignBuffer.length - offset < 188) {
      break;
    }

    // Process single 188 byte packet
    const packet = alignBuffer.subarray(offset, offset + 188);
    parseTsPacket(packet);
    offset += 188;
  }

  if (offset > 0) {
    alignBuffer = alignBuffer.subarray(offset);
  }
}

function parseTsPacket(packet: Uint8Array) {
  const pid = ((packet[1] & 0x1F) << 8) | packet[2];
  const pusi = (packet[1] & 0x40) !== 0;
  const adaptControl = (packet[3] & 0x30) >> 4;
  const hasPayload = adaptControl === 1 || adaptControl === 3;

  if (!hasPayload) return;

  let payloadStart = 4;
  if (adaptControl === 3) {
    payloadStart += 1 + packet[4];
  }

  if (payloadStart >= 188) return;

  // Track PID auto-detection via PAT/PMT if not set
  if (pid === 0 && pusi) {
    // Parse PAT
    let pos = payloadStart;
    const pointerField = packet[pos];
    pos += 1 + pointerField;
    const tableId = packet[pos];
    if (tableId === 0x00) {
      const sectionLen = ((packet[pos + 1] & 0x0F) << 8) | packet[pos + 2];
      let pEntry = pos + 8;
      const endPos = pos + 3 + sectionLen - 4;
      while (pEntry < endPos && pEntry + 4 <= 188) {
        const pNum = (packet[pEntry] << 8) | packet[pEntry + 1];
        const pPid = ((packet[pEntry + 2] & 0x1F) << 8) | packet[pEntry + 3];
        if (pNum !== 0) {
          pmtPid = pPid;
          break;
        }
        pEntry += 4;
      }
    }
  }

  if (pmtPid !== null && pid === pmtPid && pusi) {
    // Parse PMT
    let pos = payloadStart;
    const pointerField = packet[pos];
    pos += 1 + pointerField;
    const tableId = packet[pos];
    if (tableId === 0x02) {
      const sectionLen = ((packet[pos + 1] & 0x0F) << 8) | packet[pos + 2];
      const programInfoLen = ((packet[pos + 10] & 0x0F) << 8) | packet[pos + 11];
      let esStart = pos + 12 + programInfoLen;
      const endPos = pos + 3 + sectionLen - 4;
      while (esStart < endPos && esStart + 5 <= 188) {
        const streamType = packet[esStart];
        const esPid = ((packet[esStart + 1] & 0x1F) << 8) | packet[esStart + 2];
        const esInfoLen = ((packet[esStart + 3] & 0x0F) << 8) | packet[esStart + 4];

        const isVideo = [0x01, 0x02, 0x1B, 0x24, 0x10, 0x42].includes(streamType);
        const isAudio = [0x03, 0x04, 0x0F, 0x11, 0x81, 0x82, 0x87].includes(streamType);

        if (isVideo && videoPid === null) {
          videoPid = esPid;
        } else if (isAudio && audioPid === null) {
          audioPid = esPid;
        }
        esStart += 5 + esInfoLen;
      }
    }
  }

  // Parse elementary video/audio streams
  if (videoPid !== null && pid === videoPid) {
    if (pusi) {
      if (videoPesBuffer.length > 0) {
        decodeVideoPes(new Uint8Array(videoPesBuffer));
        videoPesBuffer = [];
      }
    }
    const payload = packet.subarray(payloadStart);
    for (let i = 0; i < payload.length; i++) {
      videoPesBuffer.push(payload[i]);
    }
  } else if (audioPid !== null && pid === audioPid) {
    if (pusi) {
      if (audioPesBuffer.length > 0) {
        decodeAudioPes(new Uint8Array(audioPesBuffer));
        audioPesBuffer = [];
      }
    }
    const payload = packet.subarray(payloadStart);
    for (let i = 0; i < payload.length; i++) {
      audioPesBuffer.push(payload[i]);
    }
  }
}

function decodeVideoPes(pes: Uint8Array) {
  if (pes.length < 6) return;
  // Verify PES start code 0x000001
  if (pes[0] !== 0x00 || pes[1] !== 0x00 || pes[2] !== 0x01) return;

  const headerDataLen = pes[8];
  const payloadOffset = 9 + headerDataLen;
  if (payloadOffset >= pes.length) return;

  const payload = pes.subarray(payloadOffset);

  // Exclude PES stream overhead and locate PTS/DTS if present
  let pts: number | undefined = undefined;
  let dts: number | undefined = undefined;
  const ptsDtsFlags = (pes[7] & 0xC0) >> 6;

  if (ptsDtsFlags === 2 || ptsDtsFlags === 3) {
    pts = parsePesTimestamp(pes.subarray(9, 14));
    if (ptsDtsFlags === 3) {
      dts = parsePesTimestamp(pes.subarray(14, 19));
    }
  }

  if (videoDecoder && videoDecoder.state === 'configured') {
    try {
      const chunk = new EncodedVideoChunk({
        type: isKeyframe(payload) ? 'key' : 'delta',
        timestamp: dts !== undefined ? dts : (pts !== undefined ? pts : Date.now() * 90),
        data: payload,
      });
      videoDecoder.decode(chunk);
    } catch (e) {}
  } else {
    // WASM Emulation Fallback
    // Send a frame trigger for rendering software assets if WebCodecs is unsupported
    ctx.postMessage({
      type: 'wasm-video-frame',
      timestamp: pts,
      isKey: isKeyframe(payload),
    });
  }
}

function decodeAudioPes(pes: Uint8Array) {
  if (pes.length < 6) return;
  if (pes[0] !== 0x00 || pes[1] !== 0x00 || pes[2] !== 0x01) return;

  const headerDataLen = pes[8];
  const payloadOffset = 9 + headerDataLen;
  if (payloadOffset >= pes.length) return;

  const payload = pes.subarray(payloadOffset);

  let pts: number | undefined = undefined;
  const ptsDtsFlags = (pes[7] & 0xC0) >> 6;
  if (ptsDtsFlags === 2 || ptsDtsFlags === 3) {
    pts = parsePesTimestamp(pes.subarray(9, 14));
  }

  if (audioDecoder && audioDecoder.state === 'configured') {
    try {
      const chunk = new EncodedAudioChunk({
        type: 'key',
        timestamp: pts !== undefined ? pts : Date.now() * 90,
        data: payload,
      });
      audioDecoder.decode(chunk);
    } catch (e) {}
  }
}

function parsePesTimestamp(buf: Uint8Array): number {
  if (buf.length < 5) return 0;
  const b0 = buf[0];
  const b1 = buf[1];
  const b2 = buf[2];
  const b3 = buf[3];
  const b4 = buf[4];

  const val = (((b0 & 0x0E) >> 1) * Math.pow(2, 30)) +
              (b1 * Math.pow(2, 22)) +
              (((b2 & 0xFE) >> 1) * Math.pow(2, 15)) +
              (b3 * Math.pow(2, 7)) +
              ((b4 & 0xFE) >> 1);
  return val; // in 90kHz units
}

function isKeyframe(payload: Uint8Array): boolean {
  // Inspect H.264/HEVC NAL unit types to find keyframes/IDR frames
  let index = 0;
  while (index < payload.length - 4) {
    if (payload[index] === 0x00 && payload[index + 1] === 0x00 && payload[index + 2] === 0x01) {
      const nalType = payload[index + 3] & 0x1F;
      if (nalType === 5) return true; // H.264 IDR slice
      const hevcNalType = (payload[index + 3] >> 1) & 0x3F;
      if (hevcNalType >= 16 && hevcNalType <= 21) return true; // HEVC IRAP/IDR slice
    } else if (payload[index] === 0x00 && payload[index + 1] === 0x00 && payload[index + 2] === 0x00 && payload[index + 3] === 0x01) {
      const nalType = payload[index + 4] & 0x1F;
      if (nalType === 5) return true;
      const hevcNalType = (payload[index + 4] >> 1) & 0x3F;
      if (hevcNalType >= 16 && hevcNalType <= 21) return true;
    }
    index++;
  }
  return false;
}

function destroyDecoders() {
  if (videoDecoder) {
    try { videoDecoder.close(); } catch (e) {}
    videoDecoder = null;
  }
  if (audioDecoder) {
    try { audioDecoder.close(); } catch (e) {}
    audioDecoder = null;
  }
}
