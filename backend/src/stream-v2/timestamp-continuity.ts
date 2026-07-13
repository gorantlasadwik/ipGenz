import { Transform, TransformCallback } from 'stream';

export interface AudioTrackInfo {
  pid: number;
  codec: string;
  lang: string;
}

/**
 * Align incoming binary stream into chunks of exactly 188 bytes,
 * searching for the MPEG-TS sync byte 0x47.
 */
export class TsPacketAligner extends Transform {
  private buffer: Buffer = Buffer.alloc(0);

  constructor() {
    super();
  }

  _transform(chunk: Buffer, encoding: string, callback: TransformCallback) {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    let offset = 0;

    while (this.buffer.length - offset >= 188) {
      if (this.buffer[offset] !== 0x47) {
        // Sync byte missing! Scan for next 0x47
        let syncIndex = -1;
        for (let i = offset + 1; i < this.buffer.length; i++) {
          if (this.buffer[i] === 0x47) {
            // Check if there is another sync byte 188 bytes later to verify
            if (i + 188 <= this.buffer.length && this.buffer[i + 188] !== 0x47) {
              continue; // False sync byte
            }
            syncIndex = i;
            break;
          }
        }
        if (syncIndex !== -1) {
          offset = syncIndex;
        } else {
          // No sync byte found in the rest of the buffer, discard it
          offset = this.buffer.length;
          break;
        }
      }

      if (this.buffer.length - offset < 188) {
        break;
      }

      const packet = Buffer.alloc(188);
      this.buffer.copy(packet, 0, offset, offset + 188);
      this.push(packet);
      offset += 188;
    }

    if (offset > 0) {
      this.buffer = this.buffer.subarray(offset);
    }
    callback();
  }

  _flush(callback: TransformCallback) {
    callback();
  }
}

/**
 * Normalizes continuity counters and offsets PTS, DTS, and PCR
 * so they remain monotonic across reconnect boundaries.
 */
export class TimestampContinuityEngine extends Transform {
  private currentOffset = 0n;
  private lastSeenPts = 0n;
  private lastSeenPcr = 0n;
  private firstPtsInSession: bigint | null = null;
  private firstPcrInSession: bigint | null = null;
  private isNewSession = true;
  private ccMap = new Map<number, number>();

  constructor() {
    super();
  }

  /**
   * Called when the upstream connection restarts, indicating that
   * the next incoming timestamps should be normalized relative to the previous ones.
   */
  resetSession() {
    this.isNewSession = true;
    this.firstPtsInSession = null;
    this.firstPcrInSession = null;
  }

  _transform(packet: Buffer, encoding: string, callback: TransformCallback) {
    if (packet.length !== 188 || packet[0] !== 0x47) {
      this.push(packet);
      return callback();
    }

    const pid = ((packet[1] & 0x1F) << 8) | packet[2];
    const pusi = (packet[1] & 0x40) !== 0;
    const adaptControl = (packet[3] & 0x30) >> 4;
    const hasAdapt = adaptControl === 2 || adaptControl === 3;
    const hasPayload = adaptControl === 1 || adaptControl === 3;

    // 1. CC Normalization
    if (hasPayload) {
      let expectedCc = this.ccMap.get(pid);
      if (expectedCc === undefined) {
        expectedCc = packet[3] & 0x0F;
      }
      packet[3] = (packet[3] & 0xF0) | expectedCc;
      this.ccMap.set(pid, (expectedCc + 1) & 0x0F);
    }

    // 2. PCR Adjustment
    if (hasAdapt && packet[4] > 0) {
      const adaptLength = packet[4];
      const flags = packet[5];
      const hasPcr = (flags & 0x10) !== 0;
      if (hasPcr && adaptLength >= 6) {
        const pcrBase = (BigInt(packet[6]) << 25n) |
                        (BigInt(packet[7]) << 17n) |
                        (BigInt(packet[8]) << 9n) |
                        (BigInt(packet[9]) << 1n) |
                        (BigInt(packet[10]) >> 7n);
        const pcrExt = (BigInt(packet[10] & 0x01) << 8n) | BigInt(packet[11]);
        
        if (this.isNewSession && this.firstPcrInSession === null) {
          this.firstPcrInSession = pcrBase;
          if (this.lastSeenPcr > 0n) {
            const delta = 9000n; // 100ms
            const stepOffset = (this.lastSeenPcr + delta - pcrBase) & 0x1FFFFFFFFn;
            this.currentOffset = (this.currentOffset + stepOffset) & 0x1FFFFFFFFn;
          }
          this.isNewSession = false;
        }

        const newPcrBase = (pcrBase + this.currentOffset) & 0x1FFFFFFFFn;
        
        packet[6] = Number((newPcrBase >> 25n) & 0xFFn);
        packet[7] = Number((newPcrBase >> 17n) & 0xFFn);
        packet[8] = Number((newPcrBase >> 9n) & 0xFFn);
        packet[9] = Number((newPcrBase >> 1n) & 0xFFn);
        packet[10] = Number(((newPcrBase & 1n) << 7n) | 0x7En | ((pcrExt >> 8n) & 1n));
        packet[11] = Number(pcrExt & 0xFFn);

        this.lastSeenPcr = newPcrBase;
      }
    }

    // 3. PTS/DTS Adjustment
    if (pusi && hasPayload) {
      let payloadStart = 4;
      if (hasAdapt) {
        payloadStart += 1 + packet[4];
      }

      if (payloadStart + 6 <= 188) {
        const isPes = packet[payloadStart] === 0x00 &&
                      packet[payloadStart + 1] === 0x00 &&
                      packet[payloadStart + 2] === 0x01;

        if (isPes) {
          const ptsDtsFlags = (packet[payloadStart + 7] & 0xC0) >> 6;

          if (ptsDtsFlags === 2 || ptsDtsFlags === 3) {
            const b0 = BigInt(packet[payloadStart + 9]);
            const b1 = BigInt(packet[payloadStart + 10]);
            const b2 = BigInt(packet[payloadStart + 11]);
            const b3 = BigInt(packet[payloadStart + 12]);
            const b4 = BigInt(packet[payloadStart + 13]);

            const pts = (((b0 & 0x0En) >> 1n) << 30n) |
                        (b1 << 22n) |
                        (((b2 & 0xFEn) >> 1n) << 15n) |
                        (b3 << 7n) |
                        ((b4 & 0xFEn) >> 1n);

            if (this.isNewSession && this.firstPtsInSession === null) {
              this.firstPtsInSession = pts;
              if (this.lastSeenPts > 0n) {
                const delta = 9000n; // 100ms
                const stepOffset = (this.lastSeenPts + delta - pts) & 0x1FFFFFFFFn;
                this.currentOffset = (this.currentOffset + stepOffset) & 0x1FFFFFFFFn;
              }
              this.isNewSession = false;
            }

            const newPts = (pts + this.currentOffset) & 0x1FFFFFFFFn;

            packet[payloadStart + 9] = Number((b0 & 0xF1n) | (((newPts >> 30n) & 0x07n) << 1n));
            packet[payloadStart + 10] = Number((newPts >> 22n) & 0xFFn);
            packet[payloadStart + 11] = Number((((newPts >> 15n) & 0x7Fn) << 1n) | 1n);
            packet[payloadStart + 12] = Number((newPts >> 7n) & 0xFFn);
            packet[payloadStart + 13] = Number(((newPts & 0x7Fn) << 1n) | 1n);

            this.lastSeenPts = newPts;

            if (ptsDtsFlags === 3) {
              const d0 = BigInt(packet[payloadStart + 14]);
              const d1 = BigInt(packet[payloadStart + 15]);
              const d2 = BigInt(packet[payloadStart + 16]);
              const d3 = BigInt(packet[payloadStart + 17]);
              const d4 = BigInt(packet[payloadStart + 18]);

              const dts = (((d0 & 0x0En) >> 1n) << 30n) |
                          (d1 << 22n) |
                          (((d2 & 0xFEn) >> 1n) << 15n) |
                          (d3 << 7n) |
                          ((d4 & 0xFEn) >> 1n);

              const newDts = (dts + this.currentOffset) & 0x1FFFFFFFFn;

              packet[payloadStart + 14] = Number((d0 & 0xF1n) | (((newDts >> 30n) & 0x07n) << 1n));
              packet[payloadStart + 15] = Number((newDts >> 22n) & 0xFFn);
              packet[payloadStart + 16] = Number((((newDts >> 15n) & 0x7Fn) << 1n) | 1n);
              packet[payloadStart + 17] = Number((newDts >> 7n) & 0xFFn);
              packet[payloadStart + 18] = Number(((newDts & 0x7Fn) << 1n) | 1n);
            }
          }
        }
      }
    }

    this.push(packet);
    callback();
  }
}

/**
 * Extracts and tracks active audio stream details from PAT/PMT.
 */
export class PmtParser {
  private pmtPid: number | null = null;
  private tracks: AudioTrackInfo[] = [];
  private tracksParsed = false;
  private lastPmtVersion: number | null = null;
  private onTracksFoundCallback: ((tracks: AudioTrackInfo[]) => void) | null = null;

  onTracksFound(cb: (tracks: AudioTrackInfo[]) => void) {
    this.onTracksFoundCallback = cb;
  }

  parsePacket(packet: Buffer) {
    const pid = ((packet[1] & 0x1F) << 8) | packet[2];
    const pusi = (packet[1] & 0x40) !== 0;
    const adaptControl = (packet[3] & 0x30) >> 4;
    const hasPayload = adaptControl === 1 || adaptControl === 3;

    if (!hasPayload) return;

    let payloadStart = 4;
    if (adaptControl === 3) {
      payloadStart += 1 + packet[4];
    }

    if (pusi) {
      const pointerField = packet[payloadStart];
      payloadStart += 1 + pointerField;
    }

    if (payloadStart >= 188) return;

    // 1. PAT Parser
    if (pid === 0) {
      const tableId = packet[payloadStart];
      if (tableId !== 0x00) return;

      const sectionLength = ((packet[payloadStart + 1] & 0x0F) << 8) | packet[payloadStart + 2];
      const endPos = payloadStart + 3 + sectionLength - 4;

      let pos = payloadStart + 8;
      while (pos < endPos && pos + 4 <= 188) {
        const programNum = (packet[pos] << 8) | packet[pos + 1];
        const programPid = ((packet[pos + 2] & 0x1F) << 8) | packet[pos + 3];
        if (programNum !== 0) {
          this.pmtPid = programPid;
          break;
        }
        pos += 4;
      }
    }

    // 2. PMT Parser
    if (this.pmtPid !== null && pid === this.pmtPid) {
      const tableId = packet[payloadStart];
      if (tableId !== 0x02) return;

      const pmtVersion = (packet[payloadStart + 5] & 0x3E) >> 1;
      if (this.tracksParsed && this.lastPmtVersion === pmtVersion) {
        return; // No version change
      }

      const sectionLength = ((packet[payloadStart + 1] & 0x0F) << 8) | packet[payloadStart + 2];
      const programInfoLength = ((packet[payloadStart + 10] & 0x0F) << 8) | packet[payloadStart + 11];
      
      let esStart = payloadStart + 12 + programInfoLength;
      const endPos = payloadStart + 3 + sectionLength - 4;

      const foundTracks: AudioTrackInfo[] = [];

      while (esStart < endPos && esStart + 5 <= 188) {
        const streamType = packet[esStart];
        const esPid = ((packet[esStart + 1] & 0x1F) << 8) | packet[esStart + 2];
        const esInfoLength = ((packet[esStart + 3] & 0x0F) << 8) | packet[esStart + 4];

        const isAudio = [0x03, 0x04, 0x0F, 0x11, 0x81, 0x82, 0x87].includes(streamType);

        if (isAudio) {
          let codec = 'unknown';
          if ([0x03, 0x04].includes(streamType)) codec = 'mp3';
          else if ([0x0F, 0x11].includes(streamType)) codec = 'aac';
          else if ([0x81, 0x82, 0x87].includes(streamType)) codec = 'ac3';

          let lang = 'und';
          let descPos = esStart + 5;
          const descEnd = descPos + esInfoLength;
          while (descPos < descEnd && descPos + 2 <= 188) {
            const tag = packet[descPos];
            const len = packet[descPos + 1];
            if (tag === 0x0A && descPos + 2 + len <= 188 && len >= 3) {
              lang = packet.toString('ascii', descPos + 2, descPos + 5);
              break;
            }
            descPos += 2 + len;
          }

          foundTracks.push({ pid: esPid, codec, lang });
        }

        esStart += 5 + esInfoLength;
      }

      if (foundTracks.length > 0) {
        this.tracks = foundTracks;
        this.tracksParsed = true;
        this.lastPmtVersion = pmtVersion;
        if (this.onTracksFoundCallback) {
          this.onTracksFoundCallback(this.tracks);
        }
      }
    }
  }

  getTracks() {
    return this.tracks;
  }
}
