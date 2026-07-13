import { TsPacketAligner, TimestampContinuityEngine, PmtParser } from '../src/stream-v2/timestamp-continuity';

function createDummyTsPacket(pid: number, hasPcr = false, pcrBase = 0n, hasPes = false, pts = 0n, dts = 0n): Buffer {
  const buf = Buffer.alloc(188);
  buf[0] = 0x47; // Sync byte
  
  // PID
  buf[1] = (pid >> 8) & 0x1F;
  buf[2] = pid & 0xFF;

  // Adaptation field control: 1 (payload only), 2 (adapt only), 3 (both)
  let adaptControl = 1;
  if (hasPcr) adaptControl = 3;
  buf[3] = (adaptControl << 4) | 0x01; // CC = 1

  let payloadStart = 4;

  if (hasPcr) {
    buf[4] = 7; // Adaptation field length (1 byte flags + 6 bytes PCR)
    buf[5] = 0x10; // PCR flag set

    // Write PCR
    const newPcrBase = pcrBase & 0x1FFFFFFFFn;
    const pcrExt = 0n;
    buf[6] = Number((newPcrBase >> 25n) & 0xFFn);
    buf[7] = Number((newPcrBase >> 17n) & 0xFFn);
    buf[8] = Number((newPcrBase >> 9n) & 0xFFn);
    buf[9] = Number((newPcrBase >> 1n) & 0xFFn);
    buf[10] = Number(((newPcrBase & 1n) << 7n) | 0x7En | ((pcrExt >> 8n) & 1n));
    buf[11] = Number(pcrExt & 0xFFn);

    payloadStart = 12;
  }

  if (hasPes) {
    // Set PUSI flag in header
    buf[1] |= 0x40;

    // PES Header prefix 0x000001
    buf[payloadStart] = 0x00;
    buf[payloadStart + 1] = 0x00;
    buf[payloadStart + 2] = 0x01;
    buf[payloadStart + 3] = 0xE0; // Stream ID (video)

    // PES Packet length
    buf[payloadStart + 4] = 0x00;
    buf[payloadStart + 5] = 0x0F;

    // PTS/DTS Flags: 3 (both PTS and DTS)
    buf[payloadStart + 7] = 0xC0; // 11000000 -> PTS & DTS present
    buf[payloadStart + 8] = 10; // PES Header data length

    // Write PTS
    const newPts = pts & 0x1FFFFFFFFn;
    buf[payloadStart + 9] = 0x31 | Number(((newPts >> 30n) & 0x07n) << 1n); // flags = 3
    buf[payloadStart + 10] = Number((newPts >> 22n) & 0xFFn);
    buf[payloadStart + 11] = Number((((newPts >> 15n) & 0x7Fn) << 1n) | 1n);
    buf[payloadStart + 12] = Number((newPts >> 7n) & 0xFFn);
    buf[payloadStart + 13] = Number(((newPts & 0x7Fn) << 1n) | 1n);

    // Write DTS
    const newDts = dts & 0x1FFFFFFFFn;
    buf[payloadStart + 14] = 0x11 | Number(((newDts >> 30n) & 0x07n) << 1n); // flags = 1
    buf[payloadStart + 15] = Number((newDts >> 22n) & 0xFFn);
    buf[payloadStart + 16] = Number((((newDts >> 15n) & 0x7Fn) << 1n) | 1n);
    buf[payloadStart + 17] = Number((newDts >> 7n) & 0xFFn);
    buf[payloadStart + 18] = Number(((newDts & 0x7Fn) << 1n) | 1n);
  }

  return buf;
}

async function runTests() {
  console.log('--- STARTING TIMESTAMP CONTINUITY TESTS ---');

  // Test 1: Aligner Stream
  const aligner = new TsPacketAligner();
  const packetsEmitted: Buffer[] = [];
  aligner.on('data', (pkt: Buffer) => packetsEmitted.push(pkt));

  // Write some fragmented buffers
  const dummy1 = Buffer.alloc(100, 0);
  const syncPkt = createDummyTsPacket(100);
  const dummy2 = Buffer.alloc(50, 0);

  const chunk1 = Buffer.concat([dummy1, syncPkt.subarray(0, 100)]);
  const chunk2 = Buffer.concat([syncPkt.subarray(100), dummy2]);

  aligner.write(chunk1);
  aligner.write(chunk2);

  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(`Test 1 (Aligner): Emitted ${packetsEmitted.length} packets. Expected 1.`);
  if (packetsEmitted.length === 1 && packetsEmitted[0].equals(syncPkt)) {
    console.log('Test 1 PASSED: Fragmented TS packet aligned correctly.');
  } else {
    console.error('Test 1 FAILED: Aligning fragmented packet failed.');
  }

  // Test 2: Continuity Engine (Timestamp offsetting)
  const engine = new TimestampContinuityEngine();
  const modifiedPackets: Buffer[] = [];
  engine.on('data', (pkt: Buffer) => modifiedPackets.push(pkt));

  // Session 1: PTS=100000, PCR=90000 (diff = 10000)
  const pkt1 = createDummyTsPacket(256, true, 90000n, true, 100000n, 95000n);
  engine.write(pkt1);

  await new Promise((resolve) => setTimeout(resolve, 50));

  // Simulate Reconnect: Reset Session, session 2 starts with PTS=10900, PCR=900 (diff = 10000)
  engine.resetSession();
  const pkt2 = createDummyTsPacket(256, true, 900n, true, 10900n, 10400n);
  engine.write(pkt2);

  await new Promise((resolve) => setTimeout(resolve, 100));

  console.log(`Test 2 (Continuity): Modified packets count: ${modifiedPackets.length}. Expected 2.`);
  
  const getPts = (packet: Buffer, start: number): bigint => {
    const b0 = BigInt(packet[start]);
    const b1 = BigInt(packet[start + 1]);
    const b2 = BigInt(packet[start + 2]);
    const b3 = BigInt(packet[start + 3]);
    const b4 = BigInt(packet[start + 4]);
    return (((b0 & 0x0En) >> 1n) << 30n) |
           (b1 << 22n) |
           (((b2 & 0xFEn) >> 1n) << 15n) |
           (b3 << 7n) |
           ((b4 & 0xFEn) >> 1n);
  };

  const getPcr = (packet: Buffer): bigint => {
    return (BigInt(packet[6]) << 25n) |
           (BigInt(packet[7]) << 17n) |
           (BigInt(packet[8]) << 9n) |
           (BigInt(packet[9]) << 1n) |
           (BigInt(packet[10]) >> 7n);
  };

  if (modifiedPackets.length >= 2) {
    const outPts1 = getPts(modifiedPackets[0], 12 + 9);
    const outPcr1 = getPcr(modifiedPackets[0]);
    console.log(`Pkt 1: In PTS=100000, Out PTS=${outPts1}. In PCR=90000, Out PCR=${outPcr1}`);

    const outPts2 = getPts(modifiedPackets[1], 12 + 9);
    const outPcr2 = getPcr(modifiedPackets[1]);
    console.log(`Pkt 2: In PTS=10900, Out PTS=${outPts2}. In PCR=900, Out PCR=${outPcr2}`);

    const expectedPts2 = 100000n + 9000n; // lastSeenPts + 9000 = 109000
    if (outPts2 === expectedPts2) {
      console.log('Test 2 PASSED: Timestamp Continuity offset successfully calculated and applied!');
    } else {
      console.error(`Test 2 FAILED: Expected output PTS to be ${expectedPts2}, got ${outPts2}`);
    }
  } else {
    console.error('Test 2 FAILED: Modifying packets failed.');
  }

  // Test 3: PMT Parsing
  const pmtParser = new PmtParser();
  
  // Construct a PAT packet (PID = 0, PUSI flag set in pat[1])
  const pat = Buffer.alloc(188, 0);
  pat[0] = 0x47;
  pat[1] = 0x40; pat[2] = 0x00; // PID 0, PUSI = 0x40
  pat[3] = 0x10; // no adapt, payload only
  // PAT payload
  pat[4] = 0x00; // pointer field
  pat[5] = 0x00; // table ID = PAT
  pat[6] = 0xB0; pat[7] = 0x0D; // section length = 13
  pat[8] = 0x00; pat[9] = 0x01; // transport stream ID
  pat[10] = 0xC1; // version/current_next
  pat[11] = 0x00; pat[12] = 0x00; // section number/last section number
  // Program loop: program num = 1, program PID = 0x0100
  pat[13] = 0x00; pat[14] = 0x01;
  pat[15] = 0xE1; pat[16] = 0x00; // 0xE000 | 0x0100
  
  pmtParser.parsePacket(pat);

  // Construct a PMT packet (PID = 0x0100, PUSI flag set in pmt[1])
  const pmt = Buffer.alloc(188, 0);
  pmt[0] = 0x47;
  pmt[1] = 0x41; pmt[2] = 0x00; // PID 0x0100, PUSI = 0x40
  pmt[3] = 0x10; // no adapt, payload only
  pmt[4] = 0x00; // pointer field
  pmt[5] = 0x02; // table ID = PMT
  pmt[6] = 0xB0; pmt[7] = 0x1D; // section length = 29
  pmt[8] = 0x00; pmt[9] = 0x01; // program number
  pmt[10] = 0xC1; // version/current_next
  pmt[11] = 0x00; pmt[12] = 0x00; // section number/last section number
  pmt[13] = 0xE1; pmt[14] = 0x00; // PCR PID = 0x0100
  pmt[15] = 0xF0; pmt[16] = 0x00; // program info length = 0
  // ES 1: Video (stream type 0x1b H.264, PID 0x0101, ES info length = 0)
  pmt[17] = 0x1B;
  pmt[18] = 0xE1; pmt[19] = 0x01;
  pmt[20] = 0xF0; pmt[21] = 0x00;
  // ES 2: Audio (stream type 0x0F AAC, PID 0x0102, ES info length = 5)
  pmt[22] = 0x0F;
  pmt[23] = 0xE1; pmt[24] = 0x02;
  pmt[25] = 0xF0; pmt[26] = 0x05; // ES info length = 5
  // Language Descriptor: tag 0x0A, len 3, lang "eng"
  pmt[27] = 0x0A;
  pmt[28] = 0x03;
  pmt[29] = 0x65; pmt[30] = 0x6E; pmt[31] = 0x67; // "eng"

  let tracksFound: any[] = [];
  pmtParser.onTracksFound((t) => {
    tracksFound = t;
  });

  pmtParser.parsePacket(pmt);

  console.log(`Test 3 (PMT Parser): Tracks found count: ${tracksFound.length}. Expected 1.`);
  if (tracksFound.length === 1 && tracksFound[0].pid === 0x0102 && tracksFound[0].codec === 'aac' && tracksFound[0].lang === 'eng') {
    console.log('Test 3 PASSED: PAT/PMT parsed and audio tracks extracted successfully.');
  } else {
    console.error('Test 3 FAILED: PAT/PMT parsing failed.');
  }
}

runTests().catch(console.error);
