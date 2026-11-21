import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

function encodePNG(width, height, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (1 + stride));
  for (let y = 0; y < height; y++) {
    const rowStart = y * (1 + stride);
    raw[rowStart] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, rowStart + 1);
  }
  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

class PixBuf {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  px(x, y, rgba) {
    const ix = x | 0;
    const iy = y | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const idx = (iy * this.w + ix) * 4;
    this.data[idx] = rgba[0];
    this.data[idx + 1] = rgba[1];
    this.data[idx + 2] = rgba[2];
    this.data[idx + 3] = rgba[3];
  }
  getAlpha(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  rect(x1, y1, x2, y2, rgba) {
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        this.px(x, y, rgba);
      }
    }
  }
  circle(cx, cy, r, rgba) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) {
          this.px(x, y, rgba);
        }
      }
    }
  }
  ellipse(cx, cy, rx, ry, rgba) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++) {
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++) {
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0) {
          this.px(x, y, rgba);
        }
      }
    }
  }
  flipH() {
    const out = new PixBuf(this.w, this.h);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const s = (y * this.w + x) * 4;
        const d = (y * this.w + (this.w - 1 - x)) * 4;
        out.data[d] = this.data[s];
        out.data[d + 1] = this.data[s + 1];
        out.data[d + 2] = this.data[s + 2];
        out.data[d + 3] = this.data[s + 3];
      }
    }
    return out;
  }
  outlined(outlineCol = hex('#191724')) {
    const out = new PixBuf(this.w, this.h);
    out.data.set(this.data);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        if (this.getAlpha(x, y) === 0) {
          for (const [dx, dy] of dirs) {
            if (this.getAlpha(x + dx, y + dy) > 0) {
              out.px(x, y, outlineCol);
              break;
            }
          }
        }
      }
    }
    return out;
  }
  withGroundShadow(x1 = 9, x2 = 23, y1 = 27, y2 = 31, alpha = 105) {
    const res = new PixBuf(this.w, this.h);
    res.ellipse((x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2, (y2 - y1) / 2, [15, 20, 35, alpha]);
    const spr = this.outlined();
    res.blit(spr, 0, 0, true);
    return res;
  }
  withPropShadow(yBot = 30) {
    const res = new PixBuf(this.w, this.h);
    res.rect(3, Math.max(0, yBot - 3), this.w - 4, Math.min(this.h - 1, yBot), [15, 20, 35, 78]);
    res.blit(this.outlined(), 0, 0, true);
    return res;
  }
  blit(src, dstX, dstY, alphaTest = false) {
    for (let y = 0; y < src.h; y++) {
      for (let x = 0; x < src.w; x++) {
        const si = (y * src.w + x) * 4;
        const a = src.data[si + 3];
        if (alphaTest && a === 0) continue;
        const dx = dstX + x;
        const dy = dstY + y;
        if (dx < 0 || dx >= this.w || dy < 0 || dy >= this.h) continue;
        const di = (dy * this.w + dx) * 4;
        this.data[di] = src.data[si];
        this.data[di + 1] = src.data[si + 1];
        this.data[di + 2] = src.data[si + 2];
        this.data[di + 3] = a;
      }
    }
  }
  upscale(scale) {
    const out = new PixBuf(this.w * scale, this.h * scale);
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const si = (y * this.w + x) * 4;
        const col = [this.data[si], this.data[si + 1], this.data[si + 2], this.data[si + 3]];
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            out.px(x * scale + sx, y * scale + sy, col);
          }
        }
      }
    }
    return out;
  }
  save(filepath) {
    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    fs.writeFileSync(filepath, encodePNG(this.w, this.h, this.data));
  }
}

function hex(h, a = 255) {
  const s = h.replace('#', '');
  return [
    parseInt(s.slice(0, 2), 16),
    parseInt(s.slice(2, 4), 16),
    parseInt(s.slice(4, 6), 16),
    a
  ];
}

const CLEAR = [0, 0, 0, 0];

function drawStudentFrame(dir, frameIdx) {
  let c = new PixBuf(32, 32);
  const HAIR_DARK = hex('#232023'), HAIR_MID = hex('#343033'), HAIR_LIGHT = hex('#4f473e'), HAIR_OLIVE = hex('#433b1d');
  const SKIN_LIGHT = hex('#ffe0cd'), SKIN_BASE = hex('#fed4be'), SKIN_SHADE = hex('#eeb096');
  const BLUSH = hex('#f09587'), MOUTH_RED = hex('#d9786c'), WHITE = hex('#ffffff');
  const SHIRT_LIGHT = hex('#ffffff'), SHIRT_BASE = hex('#f3f2f9'), SHIRT_SHADE = hex('#d5d1e6');
  const SHORTS_LIGHT = hex('#4f84e0'), SHORTS_BASE = hex('#3b6ec9'), SHORTS_SHADE = hex('#264da3');
  const SOCK_WHITE = hex('#f8fafc'), SHOE_DARK = hex('#2c2929'), SHOE_LIGHT = hex('#4b4643');

  const bob = (frameIdx === 1 || frameIdx === 3) ? -1 : 0;
  const step = frameIdx === 1 ? -1 : (frameIdx === 3 ? 1 : 0);

  if (dir === 0 || dir === 3) {
    if (step === 1) {
      c.rect(11, 23 + bob, 14, 24 + bob, SKIN_SHADE);
      c.rect(11, 25 + bob, 14, 25 + bob, SOCK_WHITE);
      c.rect(11, 26 + bob, 14, 27 + bob, SHOE_DARK);
      c.px(12, 26 + bob, SHOE_LIGHT);
    } else {
      c.rect(11, 24 + bob, 14, 25 + bob, SKIN_BASE); c.px(11, 24 + bob, SKIN_SHADE);
      c.rect(11, 26 + bob, 14, 26 + bob, SOCK_WHITE);
      c.rect(11, 27 + bob, 14, 28 + bob, SHOE_DARK); c.px(12, 27 + bob, SHOE_LIGHT);
    }
    if (step === -1) {
      c.rect(17, 23 + bob, 20, 24 + bob, SKIN_SHADE);
      c.rect(17, 25 + bob, 20, 25 + bob, SOCK_WHITE);
      c.rect(17, 26 + bob, 20, 27 + bob, SHOE_DARK);
      c.px(19, 26 + bob, SHOE_LIGHT);
    } else {
      c.rect(17, 24 + bob, 20, 25 + bob, SKIN_BASE); c.px(20, 24 + bob, SKIN_SHADE);
      c.rect(17, 26 + bob, 20, 26 + bob, SOCK_WHITE);
      c.rect(17, 27 + bob, 20, 28 + bob, SHOE_DARK); c.px(19, 27 + bob, SHOE_LIGHT);
    }
  } else {
    if (step === 0) {
      c.rect(14, 24 + bob, 17, 25 + bob, SKIN_BASE); c.px(17, 24 + bob, SKIN_SHADE);
      c.rect(14, 26 + bob, 17, 26 + bob, SOCK_WHITE);
      c.rect(13, 27 + bob, 17, 28 + bob, SHOE_DARK); c.px(14, 27 + bob, SHOE_LIGHT);
    } else {
      const fOff = step === 1 ? -2 : 2, bOff = -fOff;
      c.rect(14 + bOff, 24 + bob, 16 + bOff, 25 + bob, SKIN_SHADE);
      c.rect(14 + bOff, 26 + bob, 16 + bOff, 26 + bob, SOCK_WHITE);
      c.rect(13 + bOff, 27 + bob, 16 + bOff, 28 + bob, SHOE_DARK);
      c.rect(14 + fOff, 24 + bob, 17 + fOff, 25 + bob, SKIN_BASE);
      c.rect(14 + fOff, 26 + bob, 17 + fOff, 26 + bob, SOCK_WHITE);
      c.rect(13 + fOff, 27 + bob, 17 + fOff, 28 + bob, SHOE_DARK); c.px(14 + fOff, 27 + bob, SHOE_LIGHT);
    }
  }

  if (dir === 0 || dir === 3) {
    c.rect(10, 20 + bob, 21, 23 + bob, SHORTS_BASE);
    c.rect(10, 20 + bob, 21, 20 + bob, SHORTS_SHADE);
    c.px(10, 21 + bob, SHORTS_SHADE); c.px(21, 21 + bob, SHORTS_SHADE);
    c.rect(12, 21 + bob, 14, 22 + bob, SHORTS_LIGHT); c.rect(17, 21 + bob, 19, 22 + bob, SHORTS_LIGHT);
    c.px(15, 22 + bob, SHORTS_SHADE); c.px(16, 22 + bob, SHORTS_SHADE);
    c.px(15, 23 + bob, CLEAR); c.px(16, 23 + bob, CLEAR);
    if (dir === 0) c.px(15, 20 + bob, hex('#e2e8f0'));
  } else {
    c.rect(12, 20 + bob, 19, 23 + bob, SHORTS_BASE);
    c.rect(12, 20 + bob, 19, 20 + bob, SHORTS_SHADE);
    c.rect(14, 21 + bob, 17, 22 + bob, SHORTS_LIGHT);
  }

  if (dir === 0) {
    c.rect(10, 15 + bob, 21, 19 + bob, SHIRT_BASE);
    c.rect(11, 16 + bob, 20, 18 + bob, SHIRT_LIGHT);
    c.px(15, 15 + bob, SKIN_BASE); c.px(16, 15 + bob, SKIN_BASE); c.px(15, 16 + bob, SKIN_SHADE);
    c.px(13, 15 + bob, SHIRT_LIGHT); c.px(14, 16 + bob, SHIRT_SHADE);
    c.px(18, 15 + bob, SHIRT_LIGHT); c.px(17, 16 + bob, SHIRT_SHADE);
    c.px(15, 17 + bob, SHIRT_SHADE); c.px(15, 18 + bob, SHIRT_SHADE);
    c.px(17, 17 + bob, hex('#eab308')); c.px(18, 17 + bob, hex('#2563eb'));
    c.px(19, 17 + bob, hex('#ef4444')); c.px(18, 18 + bob, hex('#16a34a'));
    if (frameIdx === 0 || frameIdx === 2) {
      c.rect(8, 15 + bob, 9, 17 + bob, SHIRT_LIGHT); c.px(8, 17 + bob, SHIRT_SHADE);
      c.rect(7, 17 + bob, 8, 19 + bob, SKIN_BASE); c.rect(8, 19 + bob, 10, 20 + bob, SKIN_LIGHT);
      c.rect(22, 15 + bob, 23, 17 + bob, SHIRT_LIGHT); c.px(23, 17 + bob, SHIRT_SHADE);
      c.rect(23, 17 + bob, 24, 19 + bob, SKIN_BASE); c.rect(21, 19 + bob, 23, 20 + bob, SKIN_LIGHT);
    } else {
      const ly = 16 + bob + (step === 1 ? 1 : -1), ry = 16 + bob + (step === -1 ? 1 : -1);
      c.rect(8, 15 + bob, 9, 17 + bob, SHIRT_LIGHT); c.rect(8, ly + 1, 9, ly + 3, SKIN_BASE);
      c.rect(22, 15 + bob, 23, 17 + bob, SHIRT_LIGHT); c.rect(22, ry + 1, 23, ry + 3, SKIN_BASE);
    }
  } else if (dir === 3) {
    c.rect(10, 15 + bob, 21, 19 + bob, SHIRT_BASE);
    c.rect(12, 15 + bob, 19, 16 + bob, SHIRT_LIGHT);
    c.rect(10, 18 + bob, 21, 19 + bob, SHIRT_SHADE);
    c.rect(8, 15 + bob, 9, 19 + bob, SHIRT_BASE); c.rect(8, 19 + bob, 9, 20 + bob, SKIN_SHADE);
    c.rect(22, 15 + bob, 23, 19 + bob, SHIRT_BASE); c.rect(22, 19 + bob, 23, 20 + bob, SKIN_SHADE);
  } else {
    c.rect(12, 15 + bob, 19, 19 + bob, SHIRT_BASE);
    c.rect(13, 16 + bob, 18, 18 + bob, SHIRT_LIGHT);
    c.px(12, 15 + bob, SKIN_BASE);
    const armX = 15 + step * 2;
    c.rect(14, 15 + bob, 17, 17 + bob, SHIRT_LIGHT);
    c.rect(armX, 18 + bob, armX + 1, 20 + bob, SKIN_BASE); c.px(armX, 18 + bob, SKIN_LIGHT);
  }

  if (dir === 0) {
    c.rect(10, 7 + bob, 21, 13 + bob, SKIN_BASE); c.rect(11, 14 + bob, 20, 14 + bob, SKIN_BASE);
    c.rect(9, 9 + bob, 9, 12 + bob, SKIN_BASE); c.rect(22, 9 + bob, 22, 12 + bob, SKIN_BASE);
    c.rect(8, 10 + bob, 8, 11 + bob, SKIN_SHADE); c.rect(23, 10 + bob, 23, 11 + bob, SKIN_SHADE);
    c.rect(12, 8 + bob, 19, 9 + bob, SKIN_LIGHT);
    c.px(10, 12 + bob, BLUSH); c.px(11, 12 + bob, BLUSH); c.px(20, 12 + bob, BLUSH); c.px(21, 12 + bob, BLUSH);
    c.px(12, 9 + bob, HAIR_DARK); c.px(13, 9 + bob, HAIR_DARK); c.px(18, 9 + bob, HAIR_DARK); c.px(19, 9 + bob, HAIR_DARK);
    c.px(12, 10 + bob, HAIR_DARK); c.px(12, 11 + bob, HAIR_DARK); c.px(19, 10 + bob, HAIR_DARK); c.px(19, 11 + bob, HAIR_DARK);
    c.rect(14, 12 + bob, 17, 12 + bob, WHITE); c.rect(14, 13 + bob, 17, 13 + bob, MOUTH_RED);
    c.rect(10, 4 + bob, 21, 7 + bob, HAIR_DARK); c.rect(12, 3 + bob, 19, 4 + bob, HAIR_DARK);
    c.px(17, 2 + bob, HAIR_OLIVE); c.px(18, 2 + bob, HAIR_DARK);
    c.rect(8, 6 + bob, 10, 9 + bob, HAIR_DARK); c.rect(21, 6 + bob, 23, 9 + bob, HAIR_DARK);
    for (const bx of [9, 10, 11, 14, 15, 16, 17, 21, 22]) c.px(bx, 8 + bob, HAIR_DARK);
    c.rect(13, 3 + bob, 18, 4 + bob, HAIR_OLIVE); c.rect(11, 5 + bob, 15, 5 + bob, HAIR_MID);
    c.px(12, 5 + bob, HAIR_LIGHT); c.px(13, 5 + bob, HAIR_LIGHT); c.rect(17, 5 + bob, 20, 6 + bob, HAIR_MID);
  } else if (dir === 3) {
    c.rect(8, 10 + bob, 8, 11 + bob, SKIN_SHADE); c.rect(23, 10 + bob, 23, 11 + bob, SKIN_SHADE);
    c.rect(11, 14 + bob, 20, 14 + bob, SKIN_SHADE); c.rect(9, 5 + bob, 22, 13 + bob, HAIR_DARK);
    c.rect(10, 4 + bob, 21, 5 + bob, HAIR_DARK); c.rect(12, 3 + bob, 19, 4 + bob, HAIR_OLIVE);
    c.px(17, 2 + bob, HAIR_OLIVE); c.px(18, 2 + bob, HAIR_DARK);
    c.rect(11, 6 + bob, 20, 8 + bob, HAIR_MID); c.rect(13, 6 + bob, 18, 7 + bob, HAIR_LIGHT);
    c.px(9, 13 + bob, CLEAR); c.px(22, 13 + bob, CLEAR);
  } else {
    c.rect(10, 7 + bob, 19, 13 + bob, SKIN_BASE); c.rect(11, 14 + bob, 18, 14 + bob, SKIN_BASE);
    c.px(9, 11 + bob, SKIN_BASE); c.px(9, 12 + bob, SKIN_BASE); c.rect(10, 9 + bob, 12, 10 + bob, SKIN_LIGHT);
    c.px(11, 9 + bob, HAIR_DARK); c.px(12, 9 + bob, HAIR_DARK); c.px(11, 10 + bob, HAIR_DARK); c.px(11, 11 + bob, HAIR_DARK);
    c.px(12, 12 + bob, BLUSH); c.px(13, 12 + bob, BLUSH); c.px(11, 13 + bob, MOUTH_RED); c.px(12, 13 + bob, MOUTH_RED);
    c.rect(16, 10 + bob, 17, 11 + bob, SKIN_SHADE);
    c.rect(11, 4 + bob, 21, 7 + bob, HAIR_DARK); c.rect(13, 3 + bob, 19, 4 + bob, HAIR_OLIVE);
    c.px(18, 2 + bob, HAIR_OLIVE); c.px(19, 2 + bob, HAIR_DARK);
    c.rect(18, 7 + bob, 22, 12 + bob, HAIR_DARK); c.rect(17, 12 + bob, 21, 13 + bob, HAIR_DARK);
    c.px(9, 7 + bob, HAIR_DARK); c.px(10, 7 + bob, HAIR_DARK); c.px(10, 8 + bob, HAIR_DARK); c.px(11, 8 + bob, HAIR_DARK);
    c.rect(15, 8 + bob, 17, 9 + bob, HAIR_DARK); c.rect(13, 5 + bob, 18, 6 + bob, HAIR_MID); c.px(14, 5 + bob, HAIR_LIGHT);
  }

  if (dir === 2) c = c.flipH();
  return c.withGroundShadow();
}

const boySheet = new PixBuf(128, 128);
for (let d = 0; d < 4; d++) {
  for (let f = 0; f < 4; f++) {
    boySheet.blit(drawStudentFrame(d, f), f * 32, d * 32);
  }
}
boySheet.upscale(2).save('public/assets/sprites/char-student-boy.png');
drawStudentFrame(0, 0).upscale(8).save('public/assets/ui/portrait-student-boy.png');

function drawHumanNPC(role, fIdx) {
  let c = new PixBuf(32, 32);
  const bob = fIdx === 1 ? -1 : 0;
  const side = fIdx === 2 || fIdx === 3;
  const SKIN = hex('#fed4be'), EYE = hex('#232023'), BLUSH = hex('#f09587');
  const cfg = {
    fehd: { hair: hex('#2b282b'), shirtL: hex('#ffffff'), shirtB: hex('#e2e8f0'), pantsB: hex('#1e293b'), pantsL: hex('#334155') },
    mom:  { hair: hex('#5c3a28'), shirtL: hex('#fbcfe8'), shirtB: hex('#f472b6'), pantsB: hex('#fef3c7'), pantsL: hex('#ffffff') },
    man:  { hair: hex('#573b2c'), shirtL: hex('#60a5fa'), shirtB: hex('#3b82f6'), pantsB: hex('#4d7c0f'), pantsL: hex('#65a30d') },
    girl: { hair: hex('#4a3228'), shirtL: hex('#fde68a'), shirtB: hex('#fbbf24'), pantsB: hex('#ec4899'), pantsL: hex('#f472b6') }
  }[role];

  if (!side) {
    const lOff = fIdx === 1 ? -1 : 0;
    c.rect(11, 24 + bob + lOff, 14, 26 + bob + lOff, cfg.pantsB); c.rect(11, 27 + bob + lOff, 14, 28 + bob + lOff, hex('#27272a'));
    c.rect(17, 24 + bob, 20, 26 + bob, cfg.pantsB); c.rect(17, 27 + bob, 20, 28 + bob, hex('#27272a'));
    c.rect(10, 20 + bob, 21, 23 + bob, cfg.pantsB); c.rect(12, 21 + bob, 19, 22 + bob, cfg.pantsL);
    c.rect(10, 15 + bob, 21, 19 + bob, cfg.shirtB); c.rect(11, 16 + bob, 20, 18 + bob, cfg.shirtL);
    c.rect(8, 15 + bob, 9, 17 + bob, cfg.shirtB); c.rect(8, 18 + bob, 9, 20 + bob, SKIN);
    c.rect(22, 15 + bob, 23, 17 + bob, cfg.shirtB); c.rect(22, 18 + bob, 23, 20 + bob, SKIN);
    if (role === 'fehd') {
      c.rect(10, 15 + bob, 12, 15 + bob, hex('#0f172a')); c.rect(19, 15 + bob, 21, 15 + bob, hex('#0f172a'));
      c.rect(15, 16 + bob, 16, 19 + bob, hex('#0f172a')); c.px(18, 17 + bob, hex('#fbbf24'));
    } else if (role === 'mom') {
      c.rect(12, 16 + bob, 19, 22 + bob, hex('#fffbeb'));
    }
    c.rect(10, 7 + bob, 21, 13 + bob, SKIN); c.rect(11, 14 + bob, 20, 14 + bob, SKIN);
    c.px(12, 10 + bob, EYE); c.px(12, 11 + bob, EYE); c.px(19, 10 + bob, EYE); c.px(19, 11 + bob, EYE);
    c.px(10, 12 + bob, BLUSH); c.px(21, 12 + bob, BLUSH); c.rect(14, 12 + bob, 17, 13 + bob, hex('#d9786c'));
    if (role === 'fehd') {
      c.rect(9, 4 + bob, 22, 6 + bob, hex('#f8fafc')); c.rect(11, 3 + bob, 20, 4 + bob, hex('#f8fafc'));
      c.rect(9, 7 + bob, 22, 8 + bob, hex('#0f172a')); c.px(15, 5 + bob, hex('#10b981')); c.px(16, 5 + bob, hex('#fbbf24'));
    } else if (role === 'mom') {
      c.rect(13, 2 + bob, 18, 3 + bob, cfg.hair); c.rect(9, 4 + bob, 22, 8 + bob, cfg.hair);
      c.rect(8, 7 + bob, 9, 12 + bob, cfg.hair); c.rect(22, 7 + bob, 23, 12 + bob, cfg.hair);
    } else if (role === 'girl') {
      c.rect(10, 4 + bob, 21, 8 + bob, cfg.hair); c.rect(7, 7 + bob, 9, 13 + bob, cfg.hair); c.rect(22, 7 + bob, 24, 13 + bob, cfg.hair);
      c.rect(14, 3 + bob, 17, 4 + bob, hex('#fde047'));
    } else {
      c.rect(10, 4 + bob, 21, 8 + bob, cfg.hair); c.rect(9, 6 + bob, 10, 9 + bob, cfg.hair); c.rect(21, 6 + bob, 22, 9 + bob, cfg.hair);
    }
  } else {
    c.rect(14, 24 + bob, 17, 26 + bob, cfg.pantsB); c.rect(13, 27 + bob, 17, 28 + bob, hex('#27272a'));
    c.rect(12, 20 + bob, 19, 23 + bob, cfg.pantsB); c.rect(12, 15 + bob, 19, 19 + bob, cfg.shirtB);
    c.rect(14, 16 + bob, 17, 18 + bob, cfg.shirtL); c.rect(15, 18 + bob, 16, 20 + bob, SKIN);
    c.rect(10, 7 + bob, 19, 13 + bob, SKIN); c.rect(11, 14 + bob, 18, 14 + bob, SKIN);
    c.px(11, 10 + bob, EYE); c.px(11, 11 + bob, EYE); c.px(12, 12 + bob, BLUSH);
    c.rect(10, 4 + bob, 21, 7 + bob, role === 'fehd' ? hex('#f8fafc') : cfg.hair);
    c.rect(17, 7 + bob, 21, 12 + bob, cfg.hair);
  }
  if (fIdx === 3) c = c.flipH();
  return c.withGroundShadow();
}

function drawCompanion(fIdx) {
  const c = new PixBuf(32, 32);
  const bob = (fIdx === 1 || fIdx === 3) ? -2 : (fIdx === 2 ? -1 : 0);
  c.rect(15, 10 + bob, 16, 11 + bob, hex('#bae6fd')); c.rect(13, 12 + bob, 18, 14 + bob, hex('#38bdf8'));
  c.rect(11, 15 + bob, 20, 17 + bob, hex('#38bdf8')); c.rect(10, 18 + bob, 21, 23 + bob, hex('#38bdf8'));
  c.rect(12, 24 + bob, 19, 25 + bob, hex('#0284c7')); c.rect(12, 16 + bob, 18, 22 + bob, hex('#bae6fd'));
  c.rect(12, 15 + bob, 14, 17 + bob, hex('#ffffff'));
  c.px(13, 19 + bob, hex('#0f172a')); c.px(13, 20 + bob, hex('#0f172a'));
  c.px(18, 19 + bob, hex('#0f172a')); c.px(18, 20 + bob, hex('#0f172a'));
  c.px(11, 21 + bob, hex('#f472b6')); c.px(20, 21 + bob, hex('#f472b6'));
  c.rect(15, 21 + bob, 16, 21 + bob, hex('#0f172a'));
  return c.withGroundShadow(11, 21, 27, 30, 85);
}

function drawMosquito(fIdx) {
  const c = new PixBuf(32, 32);
  const bob = (fIdx % 2 === 1) ? -2 : 0;
  const wing = hex('#e0f2fe', 215), blk = hex('#1e293b'), wht = hex('#ffffff');
  if (fIdx % 2 === 0) {
    c.rect(8, 9 + bob, 14, 14 + bob, wing); c.rect(17, 9 + bob, 23, 14 + bob, wing);
  } else {
    c.rect(7, 13 + bob, 13, 16 + bob, wing); c.rect(18, 13 + bob, 24, 16 + bob, wing);
  }
  c.rect(13, 14 + bob, 18, 18 + bob, blk); c.px(15, 14 + bob, wht); c.px(16, 14 + bob, wht);
  c.rect(15, 19 + bob, 19, 23 + bob, blk); c.rect(15, 20 + bob, 19, 20 + bob, wht); c.rect(16, 22 + bob, 19, 22 + bob, wht);
  c.rect(11, 15 + bob, 13, 17 + bob, blk); c.px(11, 15 + bob, hex('#ef4444'));
  c.px(10, 17 + bob, blk); c.px(9, 18 + bob, blk); c.px(8, 19 + bob, blk);
  for (const [lx, ly] of [[12, 19], [11, 21], [15, 20], [14, 22], [18, 20], [19, 22]]) {
    c.px(lx, ly + bob, (lx + ly) % 2 === 0 ? wht : blk);
  }
  return c.withGroundShadow(11, 21, 27, 30, 70);
}

function drawRat(fIdx) {
  let c = new PixBuf(32, 32);
  const step = fIdx % 2 === 1 ? 1 : 0;
  c.rect(11, 19 - step, 21, 25 - step, hex('#64748b')); c.rect(13, 18 - step, 19, 23 - step, hex('#94a3b8'));
  c.rect(8, 20 - step, 12, 24 - step, hex('#64748b')); c.px(7, 22 - step, hex('#f472b6')); c.px(9, 21 - step, hex('#0f172a'));
  c.rect(10, 16 - step, 13, 19 - step, hex('#475569')); c.rect(11, 17 - step, 12, 18 - step, hex('#fbcfe8'));
  c.rect(22, 23 - step, 25, 24 - step, hex('#f472b6')); c.rect(25, 20 - step, 26, 23 - step, hex('#f472b6'));
  c.px(10 + step, 26, hex('#f472b6')); c.px(19 - step, 26, hex('#f472b6'));
  if (fIdx >= 2) c = c.flipH();
  return c.withGroundShadow(9, 23, 26, 29, 95);
}

function drawEmote(idx) {
  const c = new PixBuf(32, 32);
  if (idx === 0) {
    c.rect(9, 6, 22, 20, hex('#ffffff')); c.rect(14, 21, 17, 24, hex('#ffffff'));
    c.rect(15, 8, 16, 15, hex('#ef4444')); c.rect(15, 17, 16, 18, hex('#ef4444'));
  } else if (idx === 1) {
    c.rect(9, 6, 22, 20, hex('#fef9c3')); c.rect(14, 21, 17, 24, hex('#fef9c3'));
    c.rect(13, 8, 18, 9, hex('#2563eb')); c.rect(17, 10, 18, 12, hex('#2563eb'));
    c.rect(15, 12, 17, 14, hex('#2563eb')); c.rect(15, 17, 16, 18, hex('#2563eb'));
  } else if (idx === 2) {
    c.circle(15.5, 15.5, 8.5, hex('#10b981')); c.circle(15.5, 15.5, 6.5, hex('#34d399'));
    for (const [dx, dy] of [[11, 16], [12, 17], [13, 18], [14, 19], [15, 18], [16, 17], [17, 15], [18, 14], [19, 13]]) {
      c.rect(dx, dy - 1, dx + 1, dy, hex('#ffffff'));
    }
  } else {
    c.circle(15.5, 15.5, 7.5, hex('#a855f7')); c.circle(15.5, 15.5, 5.5, hex('#c084fc'));
    c.px(13, 14, hex('#fde047')); c.px(18, 14, hex('#fde047')); c.rect(13, 18, 18, 18, hex('#1e1b4b'));
  }
  return c.outlined();
}

const npcSheet = new PixBuf(128, 256);
['fehd', 'mom', 'man', 'girl'].forEach((r, ri) => {
  for (let f = 0; f < 4; f++) npcSheet.blit(drawHumanNPC(r, f), f * 32, ri * 32);
});
for (let f = 0; f < 4; f++) {
  npcSheet.blit(drawCompanion(f), f * 32, 4 * 32);
  npcSheet.blit(drawMosquito(f), f * 32, 5 * 32);
  npcSheet.blit(drawRat(f), f * 32, 6 * 32);
  npcSheet.blit(drawEmote(f), f * 32, 7 * 32);
}
npcSheet.upscale(2).save('public/assets/sprites/sprites-npcs-pests.png');

const home = new PixBuf(256, 256);
const putH = (col, row, buf) => home.blit(buf, col * 32, row * 32);

[['#d99b66', '#c4834e', '#eab37e'], ['#cf8f5a', '#ba7944', '#e3a871']].forEach(([b, s, l], i) => {
  const t = new PixBuf(32, 32);
  t.rect(0, 0, 31, 31, hex(b));
  for (const py of [0, 8, 16, 24]) {
    t.rect(0, py, 31, py, hex(l)); t.rect(0, py + 7, 31, py + 7, hex(s));
    const sx = (14 + i * 9 + py * 2) % 28 + 2;
    t.rect(sx, py, sx, py + 7, hex(s));
  }
  putH(i, 0, t);
});
[false, true].forEach((drain, i) => {
  const t = new PixBuf(32, 32);
  t.rect(0, 0, 31, 31, hex('#e0f2fe'));
  for (const gy of [0, 16]) for (const gx of [0, 16]) {
    t.rect(gx + 1, gy + 1, gx + 14, gy + 14, hex((gx + gy) % 32 === 0 ? '#f0f9ff' : '#bae6fd'));
    t.rect(gx + 2, gy + 2, gx + 5, gy + 3, hex('#ffffff'));
    t.rect(gx + 15, gy, gx + 15, gy + 15, hex('#7dd3fc')); t.rect(gx, gy + 15, gx + 15, gy + 15, hex('#7dd3fc'));
  }
  if (drain) {
    t.rect(10, 10, 21, 21, hex('#64748b')); t.rect(11, 11, 20, 20, hex('#cbd5e1'));
    for (let dy = 13; dy < 20; dy += 2) t.rect(13, dy, 18, dy, hex('#1e293b'));
  }
  putH(2 + i, 0, t);
});
{
  const tk = new PixBuf(32, 32);
  for (const gy of [0, 16]) for (const gx of [0, 16]) {
    tk.rect(gx, gy, gx + 15, gy + 15, hex(((gx / 16 + gy / 16) % 2 === 0) ? '#fef3c7' : '#fde68a'));
  }
  putH(4, 0, tk);
  const tb = new PixBuf(32, 32);
  tb.rect(0, 0, 31, 31, hex('#c26d4a'));
  for (const gy of [0, 16]) for (const gx of [0, 16]) tb.rect(gx + 1, gy + 1, gx + 14, gy + 14, hex('#d97d57'));
  putH(5, 0, tb);
  [0, 1].forEach((idx) => {
    const tr = new PixBuf(32, 32);
    tr.rect(0, 0, 31, 31, hex('#d99b66'));
    const x1 = idx === 0 ? 3 : 0, x2 = idx === 0 ? 31 : 28;
    tr.rect(x1, 3, x2, 28, hex('#1e3a8a')); tr.rect(x1 + 1, 4, x2 - 1, 27, hex('#fbbf24'));
    tr.rect(x1 + 3, 6, x2 - 3, 25, hex('#2563eb')); tr.rect(x1 + 5, 8, x2 - 5, 23, hex('#3b82f6'));
    putH(6 + idx, 0, tr);
  });
}

{
  const cap = new PixBuf(32, 32);
  cap.rect(0, 0, 31, 31, hex('#334155')); cap.rect(0, 27, 31, 31, hex('#92400e'));
  putH(0, 1, cap);

  [[1, false], [5, true]].forEach(([colI, poster]) => {
    const w = new PixBuf(32, 32);
    w.rect(0, 0, 31, 20, hex('#fef9e7')); w.rect(0, 21, 31, 22, hex('#b45309'));
    w.rect(0, 23, 31, 29, hex('#d97706')); w.rect(0, 30, 31, 31, hex('#78350f'));
    if (poster) {
      w.rect(7, 4, 24, 18, hex('#1e293b')); w.rect(8, 5, 23, 17, hex('#bae6fd'));
      w.rect(10, 7, 21, 10, hex('#0284c7')); w.rect(13, 12, 18, 16, hex('#fed4be'));
    }
    putH(colI, 1, w);
  });

  const bm = new PixBuf(32, 32);
  bm.rect(0, 0, 31, 29, hex('#bae6fd')); bm.rect(0, 30, 31, 31, hex('#0369a1'));
  bm.rect(8, 4, 23, 22, hex('#475569')); bm.rect(9, 5, 22, 21, hex('#e0f2fe'));
  putH(2, 1, bm);

  const ww = new PixBuf(32, 32);
  ww.rect(0, 0, 31, 20, hex('#fef9e7')); ww.rect(0, 21, 31, 29, hex('#d97706')); ww.rect(0, 30, 31, 31, hex('#78350f'));
  ww.rect(4, 3, 27, 21, hex('#78350f')); ww.rect(6, 5, 25, 19, hex('#7dd3fc'));
  ww.rect(15, 5, 16, 19, hex('#78350f')); ww.rect(6, 12, 25, 13, hex('#78350f'));
  putH(3, 1, ww);

  const dr = new PixBuf(32, 32);
  dr.rect(0, 0, 31, 31, hex('#fef9e7')); dr.rect(4, 2, 27, 31, hex('#5c2d16'));
  dr.rect(6, 4, 25, 31, hex('#9a4b26')); dr.rect(22, 16, 24, 18, hex('#fbbf24'));
  putH(4, 1, dr);

  const mat = new PixBuf(32, 32);
  mat.rect(3, 6, 28, 25, hex('#dc2626')); mat.rect(6, 9, 25, 22, hex('#fca5a5')); mat.rect(8, 11, 23, 20, hex('#dc2626'));
  putH(6, 1, mat.outlined());

  const gl = new PixBuf(32, 32);
  gl.rect(0, 0, 31, 31, hex('#475569')); gl.rect(2, 2, 14, 29, hex('#bae6fd')); gl.rect(17, 2, 29, 29, hex('#93c5fd'));
  putH(7, 1, gl);
}

[false, true].forEach((clean, i) => {
  const s = new PixBuf(32, 32);
  s.rect(12, 20, 19, 29, hex('#cbd5e1')); s.rect(5, 11, 26, 20, hex('#ffffff'));
  s.rect(8, 12, 23, 16, hex(clean ? '#38bdf8' : '#94a3b8'));
  s.rect(15, 6, 16, 11, hex('#64748b')); s.rect(7, 6, 10, 10, hex('#f472b6')); s.rect(21, 6, 24, 10, hex('#34d399'));
  putH(i, 2, s.withPropShadow());
});
{
  const nd = new PixBuf(32, 32);
  nd.rect(3, 12, 28, 22, hex('#92400e')); nd.rect(4, 10, 27, 18, hex('#d97706'));
  nd.rect(5, 22, 7, 29, hex('#78350f')); nd.rect(24, 22, 26, 29, hex('#78350f'));
  nd.rect(9, 12, 22, 16, hex('#fef3c7')); nd.rect(12, 13, 19, 15, hex('#64748b'));
  putH(2, 2, nd.withPropShadow());
}
[false, true].forEach((cov, i) => {
  const tb = new PixBuf(32, 32);
  tb.rect(2, 12, 29, 23, hex('#b45309')); tb.rect(3, 10, 28, 20, hex('#f59e0b')); tb.rect(5, 11, 26, 18, hex('#fde68a'));
  tb.rect(5, 23, 8, 29, hex('#78350f')); tb.rect(23, 23, 26, 29, hex('#78350f'));
  tb.rect(10, 12, 21, 17, hex('#ffffff'));
  if (!cov) {
    tb.rect(12, 13, 19, 16, hex('#ea580c')); tb.px(11, 7, hex('#1e293b')); tb.px(20, 6, hex('#1e293b'));
  } else {
    tb.rect(9, 9, 22, 16, hex('#38bdf8')); tb.rect(11, 7, 20, 15, hex('#bae6fd')); tb.rect(15, 5, 16, 6, hex('#0284c7'));
  }
  putH(3 + i, 2, tb.withPropShadow());
});
[false, true].forEach((dry, i) => {
  const fp = new PixBuf(32, 32);
  fp.rect(5, 24, 26, 29, hex('#c2410c')); fp.rect(6, 25, 25, 28, hex(dry ? '#fdba74' : '#38bdf8'));
  if (!dry) { fp.rect(2, 27, 5, 29, hex('#7dd3fc')); fp.rect(26, 26, 29, 28, hex('#7dd3fc')); }
  fp.rect(9, 15, 22, 25, hex('#ea580c')); fp.rect(8, 13, 23, 16, hex('#c2410c'));
  fp.circle(15.5, 9.5, 5.5, hex('#16a34a')); fp.circle(14, 8, 3, hex('#4ade80'));
  putH(5 + i, 2, fp.withPropShadow());
});
{
  const bh = new PixBuf(32, 32);
  bh.rect(9, 10, 22, 28, hex('#94a3b8')); bh.rect(8, 8, 23, 11, hex('#334155')); bh.rect(14, 6, 17, 8, hex('#1e293b'));
  putH(7, 2, bh.withPropShadow());

  const bed = new PixBuf(32, 64);
  bed.rect(3, 4, 28, 58, hex('#78350f')); bed.rect(5, 13, 26, 55, hex('#f8fafc'));
  bed.rect(7, 14, 24, 23, hex('#ffffff')); bed.rect(5, 25, 26, 54, hex('#3b82f6')); bed.rect(6, 25, 25, 29, hex('#93c5fd'));
  home.blit(bed.outlined(), 0, 3 * 32);

  const sofa = new PixBuf(64, 32);
  sofa.rect(4, 6, 59, 27, hex('#15803d')); sofa.rect(6, 4, 57, 16, hex('#22c55e'));
  sofa.rect(10, 15, 31, 25, hex('#4ade80')); sofa.rect(32, 15, 53, 25, hex('#4ade80')); sofa.rect(12, 10, 20, 17, hex('#fde047'));
  home.blit(sofa.outlined(), 1 * 32, 3 * 32);

  const kit = new PixBuf(64, 32);
  kit.rect(2, 8, 61, 29, hex('#d97706')); kit.rect(2, 6, 61, 15, hex('#f1f5f9'));
  kit.rect(6, 8, 25, 13, hex('#334155')); kit.rect(36, 8, 55, 13, hex('#bae6fd'));
  home.blit(kit.outlined(), 3 * 32, 3 * 32);

  const fridge = new PixBuf(32, 64);
  fridge.rect(4, 4, 27, 59, hex('#cbd5e1')); fridge.rect(5, 5, 25, 24, hex('#f8fafc')); fridge.rect(5, 27, 25, 57, hex('#f8fafc'));
  home.blit(fridge.outlined(), 5 * 32, 3 * 32);

  const shelf = new PixBuf(32, 64);
  shelf.rect(3, 4, 28, 59, hex('#78350f')); shelf.rect(5, 6, 26, 57, hex('#451a03'));
  for (const sy of [18, 32, 46, 57]) {
    shelf.rect(4, sy, 27, sy + 2, hex('#b45309'));
    shelf.rect(7, sy - 8, 12, sy - 1, hex('#ef4444')); shelf.rect(13, sy - 9, 18, sy - 1, hex('#3b82f6')); shelf.rect(19, sy - 7, 24, sy - 1, hex('#10b981'));
  }
  home.blit(shelf.outlined(), 6 * 32, 3 * 32);

  const tl = new PixBuf(32, 32);
  tl.rect(9, 4, 22, 14, hex('#ffffff')); tl.rect(10, 15, 21, 27, hex('#f8fafc')); tl.rect(12, 16, 19, 22, hex('#bae6fd'));
  putH(7, 3, tl.withPropShadow());

  const tv = new PixBuf(32, 32);
  tv.rect(3, 18, 28, 28, hex('#78350f')); tv.rect(4, 5, 27, 18, hex('#1e293b')); tv.rect(6, 7, 25, 16, hex('#38bdf8'));
  putH(7, 4, tv.withPropShadow());
}
home.upscale(2).save('public/assets/tilesets/tileset-home-interior.png');

const street = new PixBuf(256, 256);
const putS = (col, row, buf) => street.blit(buf, col * 32, row * 32);
{
  const g1 = new PixBuf(32, 32);
  g1.rect(0, 0, 31, 31, hex('#55a64e'));
  for (const [gx, gy] of [[3, 4], [19, 3], [10, 12], [25, 15], [5, 22], [18, 25]]) {
    g1.px(gx, gy + 1, hex('#3b8236')); g1.px(gx + 2, gy + 1, hex('#3b8236'));
    g1.px(gx, gy, hex('#78c868')); g1.px(gx + 1, gy + 1, hex('#78c868'));
  }
  putS(0, 0, g1);

  const g2 = new PixBuf(32, 32); g2.data.set(g1.data);
  for (const [fx, fy, fc] of [[7, 7, '#fde047'], [22, 10, '#ffffff'], [14, 23, '#f472b6']]) {
    g2.circle(fx, fy, 1.5, hex(fc)); g2.px(fx, fy, hex('#f59e0b'));
  }
  putS(1, 0, g2);

  const sw = new PixBuf(32, 32);
  sw.rect(0, 0, 31, 31, hex('#f3dfd1'));
  for (let py = 0; py < 32; py += 8) {
    sw.rect(0, py, 31, py, hex('#faece3')); sw.rect(0, py + 7, 31, py + 7, hex('#d6beae'));
    for (let pxI = ((py / 8) % 2) * 8; pxI < 32; pxI += 16) sw.rect(pxI, py, pxI, py + 7, hex('#d6beae'));
  }
  putS(2, 0, sw);

  const cb = new PixBuf(32, 32); cb.data.set(sw.data);
  cb.rect(0, 18, 31, 25, hex('#fde047')); cb.rect(0, 26, 31, 28, hex('#94a3b8')); cb.rect(0, 29, 31, 31, hex('#475569'));
  putS(3, 0, cb);

  const al = new PixBuf(32, 32); al.rect(0, 0, 31, 31, hex('#64748b'));
  for (let py = 0; py < 32; py += 8) al.rect(0, py + 7, 31, py + 7, hex('#475569'));
  putS(4, 0, al);

  const rd = new PixBuf(32, 32); rd.rect(0, 0, 31, 31, hex('#334155')); rd.rect(6, 15, 25, 17, hex('#f8fafc'));
  putS(5, 0, rd);

  const zb = new PixBuf(32, 32); zb.rect(0, 0, 31, 31, hex('#334155'));
  zb.rect(4, 2, 12, 29, hex('#f8fafc')); zb.rect(19, 2, 27, 29, hex('#f8fafc'));
  putS(6, 0, zb);

  const dt = new PixBuf(32, 32); dt.rect(0, 0, 31, 31, hex('#d4a373'));
  putS(7, 0, dt);

  const bw = new PixBuf(32, 32); bw.rect(0, 0, 31, 31, hex('#fef3c7'));
  bw.rect(4, 5, 27, 25, hex('#64748b')); bw.rect(6, 7, 14, 23, hex('#bae6fd')); bw.rect(17, 7, 25, 23, hex('#93c5fd'));
  putS(0, 1, bw);

  [false, true].forEach((fixed, i) => {
    const ac = new PixBuf(32, 32); ac.rect(0, 0, 31, 31, hex('#fef3c7'));
    ac.rect(5, 6, 26, 20, hex('#f8fafc')); ac.rect(8, 9, 19, 16, hex('#475569'));
    if (!fixed) {
      ac.rect(6, 20, 13, 22, hex('#38bdf8')); ac.rect(8, 24, 9, 27, hex('#0ea5e9')); ac.rect(11, 28, 12, 30, hex('#38bdf8'));
    } else {
      ac.rect(22, 10, 23, 11, hex('#10b981')); ac.rect(25, 20, 27, 31, hex('#cbd5e1'));
    }
    putS(1 + i, 1, ac);
  });

  const bs = new PixBuf(32, 32); bs.rect(0, 0, 31, 31, hex('#fef3c7'));
  bs.rect(1, 8, 30, 28, hex('#0284c7')); bs.rect(2, 9, 29, 27, hex('#7dd3fc'));
  bs.rect(6, 13, 13, 16, hex('#d97706')); bs.rect(6, 17, 13, 18, hex('#16a34a')); bs.rect(6, 19, 13, 23, hex('#78350f'));
  bs.rect(16, 14, 20, 24, hex('#ef4444')); bs.rect(22, 14, 27, 24, hex('#fde047'));
  putS(3, 1, bs);

  const sd = new PixBuf(32, 32); sd.rect(0, 0, 31, 31, hex('#94a3b8'));
  sd.rect(3, 2, 14, 29, hex('#bae6fd')); sd.rect(17, 2, 28, 29, hex('#bae6fd'));
  putS(4, 1, sd);

  const gt = new PixBuf(32, 32); gt.rect(0, 0, 31, 31, hex('#9a3412')); gt.rect(4, 4, 27, 31, hex('#64748b'));
  for (let gx = 6; gx < 27; gx += 4) gt.rect(gx, 5, gx + 1, 27, hex('#cbd5e1'));
  putS(5, 1, gt);

  [false, true].forEach((sealed, i) => {
    const rw = new PixBuf(32, 32); rw.rect(0, 0, 31, 26, hex('#fef3c7')); rw.rect(0, 27, 31, 31, hex('#64748b'));
    if (!sealed) {
      rw.rect(9, 19, 22, 31, hex('#0f172a')); rw.px(13, 25, hex('#ef4444')); rw.px(18, 25, hex('#ef4444'));
    } else {
      rw.rect(8, 17, 23, 31, hex('#94a3b8')); rw.rect(10, 19, 21, 29, hex('#cbd5e1'));
      for (let mx = 11; mx < 21; mx += 3) rw.rect(mx, 19, mx, 29, hex('#475569'));
      for (let my = 20; my < 29; my += 3) rw.rect(10, my, 21, my, hex('#475569'));
    }
    putS(6 + i, 1, rw);
  });

  [false, true].forEach((tidy, i) => {
    const ob = new PixBuf(32, 32);
    ob.rect(9, 7, 22, 28, hex('#f97316')); ob.rect(12, 10, 19, 15, hex('#1e293b')); ob.rect(9, 26, 22, 28, hex('#334155'));
    if (!tidy) { ob.rect(3, 22, 9, 29, hex('#dc2626')); ob.rect(22, 24, 28, 29, hex('#38bdf8')); }
    putS(i, 2, ob.withPropShadow());
  });

  const pl = new PixBuf(32, 32);
  pl.rect(5, 6, 18, 24, hex('#d97706')); pl.rect(6, 16, 26, 28, hex('#166534'));
  putS(2, 2, pl.withPropShadow());

  const bb = new PixBuf(32, 32);
  bb.rect(7, 7, 24, 28, hex('#92400e')); bb.rect(9, 6, 22, 9, hex('#b45309')); bb.rect(13, 14, 18, 23, hex('#ffffff'));
  putS(3, 2, bb.withPropShadow());

  const by = new PixBuf(32, 32);
  by.rect(2, 9, 14, 28, hex('#2563eb')); by.rect(17, 9, 29, 28, hex('#eab308'));
  putS(4, 2, by.withPropShadow());

  const bt = new PixBuf(32, 32);
  bt.rect(5, 18, 17, 25, hex('#38bdf8')); bt.rect(19, 12, 26, 27, hex('#0ea5e9'));
  putS(5, 2, bt.withPropShadow());

  const pd = new PixBuf(32, 32); pd.ellipse(16, 21, 10, 5.5, hex('#38bdf8')); pd.ellipse(15, 20, 7, 3.5, hex('#7dd3fc'));
  putS(6, 2, pd.outlined(hex('#0284c7')));

  const rl = new PixBuf(32, 32);
  rl.rect(1, 9, 30, 12, hex('#cbd5e1')); rl.rect(1, 24, 30, 26, hex('#94a3b8'));
  for (let vx = 4; vx < 29; vx += 5) rl.rect(vx, 12, vx + 1, 28, hex('#94a3b8'));
  putS(7, 2, rl.outlined());

  const tree = new PixBuf(64, 64);
  tree.rect(25, 42, 38, 57, hex('#78350f'));
  tree.circle(32, 30, 22, hex('#166534')); tree.circle(20, 33, 13, hex('#166534')); tree.circle(44, 33, 13, hex('#166534'));
  tree.circle(32, 25, 19, hex('#22c55e')); tree.circle(31, 19, 13, hex('#4ade80')); tree.circle(29, 15, 7, hex('#86efac'));
  street.blit(tree.outlined(), 0, 3 * 32);

  const lamp = new PixBuf(32, 64);
  lamp.rect(14, 20, 17, 58, hex('#334155')); lamp.circle(15.5, 13.5, 7, hex('#fde047')); lamp.circle(15.5, 13.5, 4, hex('#fef9c3'));
  street.blit(lamp.outlined(), 2 * 32, 3 * 32);

  const bush = new PixBuf(32, 32);
  bush.circle(16, 19, 11, hex('#14532d')); bush.circle(10, 21, 8, hex('#15803d')); bush.circle(22, 21, 8, hex('#15803d')); bush.circle(16, 16, 8, hex('#22c55e'));
  putS(3, 3, bush.withPropShadow());

  const bench = new PixBuf(64, 32);
  bench.rect(6, 10, 57, 17, hex('#b45309')); bench.rect(5, 19, 58, 23, hex('#d97706'));
  bench.rect(9, 23, 13, 29, hex('#334155')); bench.rect(50, 23, 54, 29, hex('#334155'));
  street.blit(bench.outlined(), 5 * 32, 3 * 32);
}
street.upscale(2).save('public/assets/tilesets/tileset-hk-street.png');

const ui = new PixBuf(256, 128);
const putU = (col, row, buf) => ui.blit(buf, col * 32, row * 32);
{
  const jb = new PixBuf(64, 64);
  jb.circle(31.5, 31.5, 29, hex('#0f172a', 175)); jb.circle(31.5, 31.5, 27, hex('#38bdf8', 210));
  jb.circle(31.5, 31.5, 25, hex('#1e293b', 185)); jb.circle(31.5, 31.5, 13, hex('#334155', 160));
  ui.blit(jb, 0, 0);

  const kn = new PixBuf(32, 32);
  kn.circle(15.5, 15.5, 12, hex('#1e3a8a')); kn.circle(15.5, 15.5, 10, hex('#3b82f6')); kn.circle(13.5, 12.5, 4, hex('#bae6fd'));
  putU(2, 0, kn.outlined());

  [['#047857', '#10b981', '#6ee7b7'], ['#b45309', '#f59e0b', '#fde68a']].forEach(([d, m, h], i) => {
    const b = new PixBuf(32, 32);
    b.circle(15.5, 16, 13, hex(d)); b.circle(15.5, 14.5, 12, hex(m)); b.circle(13.5, 11.5, 4.5, hex(h));
    putU(3 + i, 0, b.outlined());
  });

  const sp = new PixBuf(32, 32); sp.rect(6, 12, 25, 23, hex('#ec4899')); sp.circle(10, 10, 4, hex('#ffffff')); putU(2, 1, sp.outlined());
  const tb = new PixBuf(32, 32); for (let i = 0; i < 18; i++) tb.rect(5 + i, 23 - i, 7 + i, 25 - i, hex('#3b82f6')); tb.rect(19, 4, 25, 9, hex('#34d399')); putU(3, 1, tb.outlined());
  const ct = new PixBuf(32, 32); ct.rect(8, 6, 23, 22, hex('#ffffff')); putU(4, 1, ct.outlined());
  const dt = new PixBuf(32, 32); dt.rect(8, 6, 23, 22, hex('#fde047')); putU(5, 1, dt.outlined());
  const cl = new PixBuf(32, 32); cl.rect(7, 14, 25, 21, hex('#cbd5e1')); cl.rect(10, 9, 24, 13, hex('#94a3b8')); putU(6, 1, cl.outlined());
  const pb = new PixBuf(32, 32); pb.rect(11, 9, 20, 26, hex('#7dd3fc')); pb.rect(13, 5, 18, 8, hex('#2563eb')); putU(7, 1, pb.outlined());

  const dy = new PixBuf(32, 32); dy.rect(14, 11, 24, 27, hex('#22c55e')); dy.rect(17, 7, 21, 11, hex('#f8fafc')); putU(0, 2, dy.outlined());
  const cm = new PixBuf(32, 32); cm.rect(6, 14, 25, 26, hex('#94a3b8')); putU(1, 2, cm.outlined());
  const ms = new PixBuf(32, 32); ms.rect(6, 6, 25, 25, hex('#cbd5e1')); putU(2, 2, ms.outlined());
  const gm = new PixBuf(32, 32); gm.circle(15.5, 15.5, 9, hex('#9333ea')); gm.px(12, 14, hex('#fde047')); gm.px(19, 14, hex('#fde047')); putU(3, 2, gm.outlined());
  const dm = new PixBuf(32, 32); dm.circle(15.5, 20, 10, hex('#bae6fd')); dm.rect(3, 21, 28, 31, CLEAR); putU(4, 2, dm.outlined());
}
ui.upscale(2).save('public/assets/ui/ui-controls-minigames.png');

fs.writeFileSync(
  'public/assets/asset-manifest.json',
  JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      resolution: { width: 1280, height: 720, tileSize: 64 },
      files: [
        'assets/ui/cwsj-logo.svg',
        'assets/ui/portrait-student-boy.png',
        'assets/ui/ui-controls-minigames.png',
        'assets/sprites/char-student-boy.png',
        'assets/sprites/sprites-npcs-pests.png',
        'assets/tilesets/tileset-home-interior.png',
        'assets/tilesets/tileset-hk-street.png'
      ]
    },
    null,
    2
  )
);

console.log('[cwsj-hygiene-pixel] Successfully generated all PNG spritesheets & tilesets in public/assets/');
