import { deflateSync } from 'zlib';

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

function crc32(buf: Buffer) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** Trazo manuscrito ficticio (PNG transparente) para firmar las historias demo. */
export function demoSignatureDataUrl(seed = 1): string {
  const w = 360;
  const h = 120;
  const alpha = new Uint8Array(w * h);
  const stamp = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.round(x + dx);
        const py = Math.round(y + dy);
        if (px < 0 || py < 0 || px >= w || py >= h) continue;
        const a = dx === 0 && dy === 0 ? 255 : 150;
        alpha[py * w + px] = Math.max(alpha[py * w + px], a);
      }
    }
  };
  for (let t = 0; t <= 1; t += 0.0004) {
    const x = 24 + t * 300;
    const loops = Math.sin(t * Math.PI * (9 + seed)) * 26 * (1 - t * 0.5);
    const drift = Math.sin(t * Math.PI * 2) * 10;
    stamp(x + Math.cos(t * Math.PI * (9 + seed)) * 9, 64 + loops + drift);
  }
  for (let t = 0; t <= 1; t += 0.001) stamp(40 + t * 270, 98 - t * 6);

  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const row = y * (w * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < w; x++) {
      const o = row + 1 + x * 4;
      raw[o] = 0x0b;
      raw[o + 1] = 0x2a;
      raw[o + 2] = 0x5c;
      raw[o + 3] = alpha[y * w + x];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString('base64')}`;
}
