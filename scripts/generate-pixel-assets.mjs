import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function makeChunk(type, data) {
  const t = Buffer.from(type, 'ascii');
  const l = Buffer.alloc(4); l.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([l, t, data, crc]);
}
function encodePNG(w, h, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const stride = w * 4;
  const raw = Buffer.alloc(h * (1 + stride));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + stride)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(raw, y * (1 + stride) + 1);
  }
  return Buffer.concat([sig, makeChunk('IHDR', ihdr), makeChunk('IDAT', zlib.deflateSync(raw, { level: 9 })), makeChunk('IEND', Buffer.alloc(0))]);
}

function hex(h, a = 255) {
  const s = h.replace('#', '');
  return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16), a];
}
const CLEAR = [0, 0, 0, 0];

class PixBuf {
  constructor(w, h) { this.w = w; this.h = h; this.data = new Uint8Array(w * h * 4); }
  px(x, y, c) {
    const ix = x | 0, iy = y | 0;
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const i = (iy * this.w + ix) * 4;
    this.data[i] = c[0]; this.data[i + 1] = c[1]; this.data[i + 2] = c[2]; this.data[i + 3] = c[3];
  }
  get(x, y) {
    const ix = Math.max(0, Math.min(this.w - 1, x | 0));
    const iy = Math.max(0, Math.min(this.h - 1, y | 0));
    const i = (iy * this.w + ix) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]];
  }
  getAlpha(x, y) {
    if (x < 0 || x >= this.w || y < 0 || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }
  rect(x1, y1, x2, y2, c) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) this.px(x, y, c);
  }
  ditherRect(x1, y1, x2, y2, c1, c2, mod = 2) {
    for (let y = y1; y <= y2; y++) for (let x = x1; x <= x2; x++) {
      this.px(x, y, ((x + y) % mod === 0) ? c2 : c1);
    }
  }
  circle(cx, cy, r, c) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++)
      for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++)
        if ((x - cx) ** 2 + (y - cy) ** 2 <= r2) this.px(x, y, c);
  }
  ellipse(cx, cy, rx, ry, c) {
    for (let y = Math.floor(cy - ry - 1); y <= Math.ceil(cy + ry + 1); y++)
      for (let x = Math.floor(cx - rx - 1); x <= Math.ceil(cx + rx + 1); x++)
        if (((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0) this.px(x, y, c);
  }
  flipH() {
    const o = new PixBuf(this.w, this.h);
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) o.px(this.w - 1 - x, y, this.get(x, y));
    return o;
  }
  outlined(col = hex('#181524')) {
    const o = new PixBuf(this.w, this.h); o.data.set(this.data);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.getAlpha(x, y) === 0 && dirs.some(([dx, dy]) => this.getAlpha(x + dx, y + dy) > 120)) o.px(x, y, col);
    }
    return o;
  }
  // Eric's Pixel Expansion (EPX / Scale2x) for NDS-grade smooth diagonal pixel art!
  epx2x() {
    const out = new PixBuf(this.w * 2, this.h * 2);
    const eq = (a, b) => a[0] === b[0] && a[1] === b[1] && a[2] === b[2] && a[3] === b[3];
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const P = this.get(x, y);
        const A = y > 0 ? this.get(x, y - 1) : P;
        const B = x < this.w - 1 ? this.get(x + 1, y) : P;
        const C = x > 0 ? this.get(x - 1, y) : P;
        const D = y < this.h - 1 ? this.get(x, y + 1) : P;
        let p1 = P, p2 = P, p3 = P, p4 = P;
        if (!eq(C, B) && !eq(A, D)) {
          if (eq(C, A)) p1 = A;
          if (eq(A, B)) p2 = B;
          if (eq(C, D)) p3 = C;
          if (eq(D, B)) p4 = B;
        }
        out.px(x * 2, y * 2, p1); out.px(x * 2 + 1, y * 2, p2);
        out.px(x * 2, y * 2 + 1, p3); out.px(x * 2 + 1, y * 2 + 1, p4);
      }
    }
    return out;
  }
  withGroundShadow(x1 = 8, x2 = 24, y1 = 27, y2 = 31, alpha = 105) {
    const res = new PixBuf(this.w, this.h);
    res.ellipse((x1 + x2) / 2, (y1 + y2) / 2, (x2 - x1) / 2, (y2 - y1) / 2, [12, 18, 34, alpha]);
    res.blit(this.outlined(), 0, 0, true);
    return res;
  }
  withPropShadow(yBot = 30) {
    const res = new PixBuf(this.w, this.h);
    res.ellipse(this.w / 2, yBot - 1, this.w * 0.4, 2.5, [12, 18, 34, 85]);
    res.blit(this.outlined(), 0, 0, true);
    return res;
  }
  blit(src, dx, dy, alphaTest = false) {
    for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) {
      const c = src.get(x, y);
      if (alphaTest && c[3] === 0) continue;
      this.px(dx + x, dy + y, c);
    }
  }
  save(fp) {
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, encodePNG(this.w, this.h, this.data));
  }
}

// ============================================================================
// 1. Protagonist 6x4 Sheet (char-student-boy.png: 384x256, EPX smoothed!)
//    Cols: 0=IdleA(Pose03), 1=IdleB(Breathe), 2=WalkL, 3=WalkMid, 4=WalkR, 5=CheerJump
// ============================================================================
function drawStudent(dir, colIdx) {
  let c = new PixBuf(32, 32);
  const HD = hex('#1f1c24'), HM = hex('#352f38'), HL = hex('#574c41'), HO = hex('#494021');
  const SL = hex('#ffe3d1'), SB = hex('#fed4be'), SS = hex('#e8a78c'), BL = hex('#f28b82');
  const WL = hex('#ffffff'), WB = hex('#f1f5f9'), WS = hex('#cbd5e1');
  const PL = hex('#528bff'), PB = hex('#366fd4'), PS = hex('#214ca3');
  const SHOE = hex('#272429'), SHOE_HI = hex('#524c54');

  const isCheer = colIdx === 5;
  const bob = isCheer ? -2 : (colIdx === 2 || colIdx === 4 ? -1 : (colIdx === 1 ? 1 : 0));
  const step = colIdx === 2 ? -1 : (colIdx === 4 ? 1 : 0);

  if (dir === 0 || dir === 3) {
    const lLift = step === 1 ? -1 : 0, rLift = step === -1 ? -1 : 0;
    c.rect(11, 24 + bob + lLift, 14, 25 + bob + lLift, SB);
    c.rect(11, 26 + bob + lLift, 14, 26 + bob + lLift, WL);
    c.rect(10, 27 + bob + lLift, 14, 28 + bob + lLift, SHOE); c.px(11, 27 + bob + lLift, SHOE_HI);
    c.rect(17, 24 + bob + rLift, 20, 25 + bob + rLift, SB);
    c.rect(17, 26 + bob + rLift, 20, 26 + bob + rLift, WL);
    c.rect(17, 27 + bob + rLift, 21, 28 + bob + rLift, SHOE); c.px(19, 27 + bob + rLift, SHOE_HI);

    c.rect(10, 20 + bob, 21, 23 + bob, PB); c.rect(10, 20 + bob, 21, 20 + bob, PS);
    c.rect(11, 21 + bob, 14, 22 + bob, PL); c.rect(17, 21 + bob, 20, 22 + bob, PL);
    c.px(15, 23 + bob, CLEAR); c.px(16, 23 + bob, CLEAR);
    if (dir === 0) c.px(15, 20 + bob, WL);
  } else {
    const fOff = step * 2;
    c.rect(14 - fOff, 24 + bob, 16 - fOff, 26 + bob, SS); c.rect(13 - fOff, 27 + bob, 16 - fOff, 28 + bob, SHOE);
    c.rect(14 + fOff, 24 + bob, 17 + fOff, 25 + bob, SB); c.rect(14 + fOff, 26 + bob, 17 + fOff, 26 + bob, WL);
    c.rect(13 + fOff, 27 + bob, 17 + fOff, 28 + bob, SHOE); c.px(14 + fOff, 27 + bob, SHOE_HI);
    c.rect(12, 20 + bob, 19, 23 + bob, PB); c.rect(13, 21 + bob, 17, 22 + bob, PL);
  }

  if (dir === 0) {
    c.rect(10, 15 + bob, 21, 19 + bob, WB); c.rect(11, 16 + bob, 20, 18 + bob, WL);
    c.px(15, 15 + bob, SB); c.px(16, 15 + bob, SB); c.px(15, 17 + bob, WS); c.px(15, 18 + bob, WS);
    c.px(17, 17 + bob, hex('#eab308')); c.px(18, 17 + bob, hex('#2563eb')); c.px(19, 17 + bob, hex('#ef4444')); c.px(18, 18 + bob, hex('#16a34a'));
    if (isCheer) {
      c.rect(7, 11 + bob, 9, 15 + bob, WL); c.rect(7, 9 + bob, 9, 11 + bob, SL);
      c.rect(22, 11 + bob, 24, 15 + bob, WL); c.rect(22, 9 + bob, 24, 11 + bob, SL);
    } else if (colIdx <= 1) {
      c.rect(8, 15 + bob, 9, 17 + bob, WL); c.rect(7, 17 + bob, 8, 19 + bob, SB); c.rect(8, 19 + bob, 10, 20 + bob, SL);
      c.rect(22, 15 + bob, 23, 17 + bob, WL); c.rect(23, 17 + bob, 24, 19 + bob, SB); c.rect(21, 19 + bob, 23, 20 + bob, SL);
    } else {
      c.rect(8, 15 + bob, 9, 17 + bob, WL); c.rect(8, 18 + bob - step, 9, 20 + bob - step, SB);
      c.rect(22, 15 + bob, 23, 17 + bob, WL); c.rect(22, 18 + bob + step, 23, 20 + bob + step, SB);
    }
  } else if (dir === 3) {
    c.rect(10, 15 + bob, 21, 19 + bob, WB); c.rect(12, 15 + bob, 19, 16 + bob, WL);
    c.rect(8, 15 + bob, 9, 19 + bob, WB); c.rect(22, 15 + bob, 23, 19 + bob, WB);
  } else {
    c.rect(12, 15 + bob, 19, 19 + bob, WB); c.rect(13, 16 + bob, 18, 18 + bob, WL);
    c.rect(14 + step, 15 + bob, 17 + step, 17 + bob, WL); c.rect(14 + step * 2, 18 + bob, 16 + step * 2, 20 + bob, SB);
  }

  if (dir === 0) {
    c.rect(10, 7 + bob, 21, 13 + bob, SB); c.rect(11, 14 + bob, 20, 14 + bob, SB);
    c.rect(9, 9 + bob, 9, 12 + bob, SB); c.rect(22, 9 + bob, 22, 12 + bob, SB);
    c.rect(8, 10 + bob, 8, 11 + bob, SS); c.rect(23, 10 + bob, 23, 11 + bob, SS);
    c.rect(12, 8 + bob, 19, 9 + bob, SL);
    c.px(10, 12 + bob, BL); c.px(11, 12 + bob, BL); c.px(20, 12 + bob, BL); c.px(21, 12 + bob, BL);
    c.px(12, 10 + bob, HD); c.px(12, 11 + bob, HD); c.px(19, 10 + bob, HD); c.px(19, 11 + bob, HD);
    c.px(12, 9 + bob, HM); c.px(19, 9 + bob, HM);
    c.rect(14, 12 + bob, 17, 12 + bob, WL); c.rect(14, 13 + bob, 17, 13 + bob, hex('#dc6860'));
    c.rect(10, 4 + bob, 21, 7 + bob, HD); c.rect(12, 3 + bob, 19, 4 + bob, HO);
    c.px(17, 2 + bob, HO); c.px(18, 2 + bob, HD);
    c.rect(8, 6 + bob, 10, 9 + bob, HD); c.rect(21, 6 + bob, 23, 9 + bob, HD);
    for (const bx of [9, 10, 11, 14, 15, 16, 17, 21, 22]) c.px(bx, 8 + bob, HD);
    c.rect(11, 5 + bob, 16, 5 + bob, HM); c.px(12, 5 + bob, HL); c.px(13, 5 + bob, HL);
  } else if (dir === 3) {
    c.rect(8, 10 + bob, 23, 11 + bob, SS); c.rect(9, 5 + bob, 22, 13 + bob, HD);
    c.rect(11, 3 + bob, 20, 5 + bob, HO); c.rect(11, 6 + bob, 20, 8 + bob, HM); c.rect(13, 6 + bob, 18, 7 + bob, HL);
  } else {
    c.rect(10, 7 + bob, 19, 14 + bob, SB); c.px(9, 11 + bob, SB);
    c.px(11, 10 + bob, HD); c.px(11, 11 + bob, HD); c.px(12, 12 + bob, BL); c.px(11, 13 + bob, hex('#dc6860'));
    c.rect(11, 4 + bob, 21, 7 + bob, HD); c.rect(13, 3 + bob, 19, 4 + bob, HO);
    c.rect(17, 7 + bob, 22, 13 + bob, HD); c.rect(10, 7 + bob, 12, 8 + bob, HD);
    c.rect(13, 5 + bob, 18, 6 + bob, HM); c.px(14, 5 + bob, HL);
  }
  if (dir === 2) c = c.flipH();
  return c.withGroundShadow().epx2x();
}

const boySheet = new PixBuf(384, 256);
for (let d = 0; d < 4; d++) for (let f = 0; f < 6; f++) boySheet.blit(drawStudent(d, f), f * 64, d * 64);
boySheet.save('public/assets/sprites/char-student-boy.png');
drawStudent(0, 0).epx2x().epx2x().save('public/assets/ui/portrait-student-boy.png');

// ============================================================================
// 2. NPCs, Companion, Mosquito, Rat & Emotes (sprites-npcs-pests.png: 256x512)
// ============================================================================
function drawNPC(role, fIdx) {
  let c = new PixBuf(32, 32);
  const bob = fIdx === 1 ? -1 : 0, side = fIdx >= 2;
  const SKIN = hex('#fed4be'), EYE = hex('#1f1c24');
  const pal = {
    fehd: { h: hex('#27272a'), s1: hex('#ffffff'), s2: hex('#cbd5e1'), p: hex('#1e293b') },
    mom:  { h: hex('#5c3a28'), s1: hex('#fbcfe8'), s2: hex('#ec4899'), p: hex('#fef3c7') },
    man:  { h: hex('#4a3525'), s1: hex('#60a5fa'), s2: hex('#2563eb'), p: hex('#4d7c0f') },
    girl: { h: hex('#452c20'), s1: hex('#fde047'), s2: hex('#f59e0b'), p: hex('#ec4899') }
  }[role];

  if (!side) {
    const lOff = fIdx === 1 ? -1 : 0;
    c.rect(11, 24 + bob + lOff, 14, 28 + bob + lOff, pal.p); c.rect(17, 24 + bob, 20, 28 + bob, pal.p);
    c.rect(10, 20 + bob, 21, 23 + bob, pal.p);
    c.rect(10, 15 + bob, 21, 19 + bob, pal.s2); c.rect(11, 16 + bob, 20, 18 + bob, pal.s1);
    c.rect(8, 15 + bob, 9, 20 + bob, SKIN); c.rect(22, 15 + bob, 23, 20 + bob, SKIN);
    if (role === 'fehd') { c.rect(15, 16 + bob, 16, 19 + bob, hex('#0f172a')); c.px(18, 17 + bob, hex('#fbbf24')); }
    if (role === 'mom') c.rect(12, 16 + bob, 19, 23 + bob, hex('#ffffff'));
    c.rect(10, 7 + bob, 21, 14 + bob, SKIN);
    c.px(12, 10 + bob, EYE); c.px(12, 11 + bob, EYE); c.px(19, 10 + bob, EYE); c.px(19, 11 + bob, EYE);
    c.rect(14, 12 + bob, 17, 13 + bob, hex('#e17065'));
    if (role === 'fehd') {
      c.rect(9, 3 + bob, 22, 6 + bob, hex('#f8fafc')); c.rect(9, 7 + bob, 22, 8 + bob, hex('#0f172a'));
      c.px(15, 5 + bob, hex('#10b981')); c.px(16, 5 + bob, hex('#fbbf24'));
    } else {
      c.rect(9, 4 + bob, 22, 8 + bob, pal.h);
      if (role === 'mom') c.rect(13, 2 + bob, 18, 4 + bob, pal.h);
      if (role === 'girl') { c.rect(7, 7 + bob, 9, 13 + bob, pal.h); c.rect(22, 7 + bob, 24, 13 + bob, pal.h); }
    }
  } else {
    c.rect(14, 24 + bob, 17, 28 + bob, pal.p); c.rect(12, 20 + bob, 19, 23 + bob, pal.p);
    c.rect(12, 15 + bob, 19, 19 + bob, pal.s1); c.rect(14, 17 + bob, 16, 20 + bob, SKIN);
    c.rect(10, 7 + bob, 19, 14 + bob, SKIN); c.px(11, 10 + bob, EYE);
    c.rect(10, 4 + bob, 21, 8 + bob, role === 'fehd' ? hex('#f8fafc') : pal.h);
    c.rect(17, 7 + bob, 21, 13 + bob, pal.h);
  }
  if (fIdx === 3) c = c.flipH();
  return c.withGroundShadow().epx2x();
}

const npcSheet = new PixBuf(256, 512);
['fehd', 'mom', 'man', 'girl'].forEach((r, ri) => {
  for (let f = 0; f < 4; f++) npcSheet.blit(drawNPC(r, f), f * 64, ri * 64);
});
for (let f = 0; f < 4; f++) {
  const b = (f === 1 || f === 3) ? -2 : (f === 2 ? -1 : 0);
  const cp = new PixBuf(32, 32);
  cp.circle(15.5, 19 + b, 6.2, hex('#0284c7')); cp.circle(15.5, 18.5 + b, 5.2, hex('#38bdf8'));
  cp.rect(14, 10 + b, 17, 14 + b, hex('#38bdf8')); cp.circle(13.5, 16.5 + b, 1.8, hex('#ffffff'));
  cp.px(13, 19 + b, hex('#0f172a')); cp.px(18, 19 + b, hex('#0f172a'));
  npcSheet.blit(cp.withGroundShadow(11, 21, 27, 30, 80).epx2x(), f * 64, 4 * 64);

  const ms = new PixBuf(32, 32);
  const mb = f % 2 === 0 ? 0 : -2;
  ms.ellipse(11, 11 + mb + (f % 2) * 3, 3.5, 2, hex('#e0f2fe', 220));
  ms.ellipse(20, 11 + mb + (f % 2) * 3, 3.5, 2, hex('#e0f2fe', 220));
  ms.rect(13, 14 + mb, 18, 18 + mb, hex('#0f172a')); ms.rect(15, 14 + mb, 16, 17 + mb, hex('#ffffff'));
  ms.rect(15, 19 + mb, 19, 23 + mb, hex('#0f172a')); ms.rect(15, 20 + mb, 19, 20 + mb, hex('#ffffff')); ms.rect(16, 22 + mb, 19, 22 + mb, hex('#ffffff'));
  ms.px(11, 15 + mb, hex('#ef4444')); ms.rect(8, 17 + mb, 11, 17 + mb, hex('#0f172a'));
  npcSheet.blit(ms.withGroundShadow(11, 21, 27, 30, 65).epx2x(), f * 64, 5 * 64);

  let rt = new PixBuf(32, 32);
  const rs = f % 2;
  rt.ellipse(16, 22 - rs, 5.5, 3.5, hex('#64748b')); rt.ellipse(15, 21 - rs, 4, 2, hex('#94a3b8'));
  rt.circle(10, 22 - rs, 2.5, hex('#64748b')); rt.circle(11, 18 - rs, 2, hex('#f472b6'));
  rt.px(7, 22 - rs, hex('#f472b6')); rt.px(9, 21 - rs, hex('#0f172a'));
  rt.rect(21, 22 - rs, 26, 23 - rs, hex('#f472b6'));
  if (f >= 2) rt = rt.flipH();
  npcSheet.blit(rt.withGroundShadow(9, 23, 26, 29, 95).epx2x(), f * 64, 6 * 64);

  const em = new PixBuf(32, 32);
  if (f === 0) { em.circle(15.5, 14, 8, hex('#ffffff')); em.rect(15, 8, 16, 15, hex('#ef4444')); em.rect(15, 17, 16, 18, hex('#ef4444')); }
  else if (f === 1) { em.circle(15.5, 14, 8, hex('#fef08a')); em.rect(13, 8, 18, 9, hex('#1d4ed8')); em.rect(16, 10, 18, 14, hex('#1d4ed8')); em.rect(15, 16, 16, 18, hex('#1d4ed8')); }
  else if (f === 2) { em.circle(15.5, 14, 8, hex('#10b981')); em.rect(11, 14, 14, 17, hex('#ffffff')); em.rect(14, 11, 20, 14, hex('#ffffff')); }
  else { em.circle(15.5, 14, 8, hex('#9333ea')); em.px(13, 13, hex('#fde047')); em.px(18, 13, hex('#fde047')); }
  npcSheet.blit(em.outlined().epx2x(), f * 64, 7 * 64);
}
npcSheet.save('public/assets/sprites/sprites-npcs-pests.png');

// ============================================================================
// 3. Dedicated Pixel Mini-Game Spritesheet (minigame-sprites.png: 512x256, 8x4 of 64x64)
// ============================================================================
const mgSheet = new PixBuf(512, 256);
function putMG(idx, fn) {
  const b = new PixBuf(32, 32);
  fn(b);
  mgSheet.blit(b.outlined().epx2x(), (idx % 8) * 64, Math.floor(idx / 8) * 64);
}
// 0: Open Hand, 1: Soap Bottle, 2: Bubble, 3: Purple Virus, 4: Green Bacteria
putMG(0, b => { b.ellipse(16, 20, 7, 7, hex('#fed4be')); b.ellipse(16, 19, 5, 5, hex('#ffe3d1')); for (const fx of [10, 13, 16, 19]) b.rect(fx, 6, fx + 2, 15, hex('#fed4be')); b.rect(7, 16, 10, 21, hex('#fed4be')); });
putMG(1, b => { b.rect(10, 11, 21, 27, hex('#ec4899')); b.rect(12, 13, 18, 25, hex('#f9a8d4')); b.rect(14, 6, 17, 11, hex('#f8fafc')); b.rect(14, 5, 21, 7, hex('#cbd5e1')); });
putMG(2, b => { b.circle(15.5, 15.5, 10, hex('#38bdf8', 190)); b.circle(15.5, 15.5, 8, hex('#bae6fd', 210)); b.circle(12, 11, 2.5, hex('#ffffff')); b.px(19, 20, hex('#f472b6')); });
putMG(3, b => { b.circle(15.5, 15.5, 8, hex('#7e22ce')); b.circle(15.5, 15.5, 6, hex('#a855f7')); for (const [x, y] of [[5, 15], [26, 15], [15, 5], [15, 26], [8, 8], [23, 8], [8, 23], [23, 23]]) b.circle(x, y, 2, hex('#c084fc')); b.rect(11, 13, 13, 15, hex('#fde047')); b.rect(18, 13, 20, 15, hex('#fde047')); b.rect(12, 19, 19, 20, hex('#ffffff')); });
putMG(4, b => { b.ellipse(15.5, 16, 9, 7, hex('#15803d')); b.ellipse(15.5, 15, 7, 5, hex('#4ade80')); b.rect(11, 13, 13, 15, hex('#ef4444')); b.rect(18, 13, 20, 15, hex('#ef4444')); b.rect(12, 18, 19, 19, hex('#052e16')); });
// 5: Clean Tooth, 6: Yellow Plaque Tooth, 7: Toothbrush, 8: Cavity Imp
putMG(5, b => { b.rect(8, 6, 23, 19, hex('#ffffff')); b.rect(9, 8, 22, 17, hex('#f0f9ff')); b.rect(9, 20, 13, 26, hex('#e2e8f0')); b.rect(18, 20, 22, 26, hex('#e2e8f0')); b.circle(12, 10, 2, hex('#bae6fd')); });
putMG(6, b => { b.rect(8, 6, 23, 19, hex('#facc15')); b.rect(9, 20, 13, 26, hex('#ca8a04')); b.rect(18, 20, 22, 26, hex('#ca8a04')); b.circle(13, 12, 3, hex('#a16207')); b.circle(19, 15, 2.5, hex('#ca8a04')); });
putMG(7, b => { for (let i = 0; i < 20; i++) b.rect(4 + i, 24 - i, 7 + i, 26 - i, hex('#2563eb')); b.rect(19, 4, 26, 9, hex('#ffffff')); b.rect(20, 2, 25, 5, hex('#34d399')); });
putMG(8, b => { b.circle(15.5, 17, 7.5, hex('#be123c')); b.rect(10, 8, 12, 12, hex('#fda4af')); b.rect(19, 8, 21, 12, hex('#fda4af')); b.px(13, 16, hex('#fde047')); b.px(18, 16, hex('#fde047')); });
// 9: Long Dirty Nail Finger, 10: Trimmed Clean Finger, 11: Nail Clippers
putMG(9, b => { b.rect(10, 12, 21, 29, hex('#fed4be')); b.rect(11, 4, 20, 14, hex('#78716c')); b.rect(11, 9, 20, 15, hex('#fde68a')); b.circle(14, 6, 1.5, hex('#9333ea')); b.circle(18, 7, 1.5, hex('#16a34a')); });
putMG(10, b => { b.rect(10, 12, 21, 29, hex('#fed4be')); b.rect(11, 10, 20, 16, hex('#ffe4e6')); b.rect(12, 9, 19, 11, hex('#ffffff')); });
putMG(11, b => { b.rect(7, 14, 25, 21, hex('#94a3b8')); b.rect(9, 15, 23, 19, hex('#e2e8f0')); b.rect(10, 8, 24, 12, hex('#cbd5e1')); b.rect(5, 12, 8, 21, hex('#f8fafc')); });
// 12: Roast Chicken Plate, 13: Food Dome Cover, 14: Covered Bin, 15: Housefly
putMG(12, b => { b.ellipse(16, 21, 12, 5, hex('#ffffff')); b.ellipse(16, 17, 8, 5, hex('#ea580c')); b.ellipse(15, 16, 6, 3.5, hex('#fb923c')); b.rect(22, 14, 26, 16, hex('#fef3c7')); });
putMG(13, b => { b.circle(15.5, 21, 11, hex('#38bdf8', 210)); b.circle(15.5, 21, 9, hex('#bae6fd', 210)); b.rect(2, 22, 29, 31, CLEAR); b.rect(3, 20, 28, 22, hex('#0284c7')); b.rect(14, 7, 17, 10, hex('#0284c7')); });
putMG(14, b => { b.rect(9, 10, 22, 28, hex('#64748b')); b.rect(11, 11, 19, 27, hex('#cbd5e1')); b.rect(8, 7, 23, 10, hex('#334155')); b.rect(14, 5, 17, 7, hex('#0f172a')); });
putMG(15, b => { b.ellipse(12, 12, 4, 2.5, hex('#bae6fd')); b.ellipse(20, 12, 4, 2.5, hex('#bae6fd')); b.circle(16, 17, 4.5, hex('#1e293b')); b.px(14, 15, hex('#ef4444')); b.px(18, 15, hex('#ef4444')); });
// 16: Waterlogged Saucer, 17: Mosquito Larva (孑孓), 18: Dry Saucer
putMG(16, b => { b.ellipse(16, 20, 12, 6, hex('#c2410c')); b.ellipse(16, 19, 10, 4.5, hex('#0ea5e9')); b.ellipse(14, 18, 5, 2, hex('#bae6fd')); });
putMG(17, b => { b.circle(12, 12, 3.5, hex('#475569')); b.rect(13, 14, 16, 19, hex('#64748b')); b.rect(16, 19, 19, 23, hex('#94a3b8')); b.rect(19, 23, 22, 25, hex('#475569')); b.px(11, 11, hex('#fde047')); });
putMG(18, b => { b.ellipse(16, 20, 12, 6, hex('#c2410c')); b.ellipse(16, 19, 10, 4.5, hex('#fdba74')); });
// 19: Plastic Bottle, 20: Newspaper, 21: Soda Can, 22: Banana/Food Waste, 23: Blue Bin, 24: Yellow Bin, 25: Brown Bin
putMG(19, b => { b.rect(11, 9, 20, 27, hex('#38bdf8')); b.rect(12, 11, 18, 25, hex('#bae6fd')); b.rect(11, 16, 20, 19, hex('#0284c7')); b.rect(13, 5, 18, 8, hex('#1d4ed8')); });
putMG(20, b => { b.rect(6, 9, 25, 25, hex('#e2e8f0')); b.rect(8, 11, 23, 14, hex('#64748b')); b.rect(8, 16, 21, 17, hex('#94a3b8')); b.rect(8, 19, 22, 20, hex('#94a3b8')); });
putMG(21, b => { b.rect(10, 8, 21, 26, hex('#ef4444')); b.rect(12, 9, 16, 25, hex('#f87171')); b.rect(10, 6, 21, 8, hex('#cbd5e1')); b.rect(10, 25, 21, 27, hex('#94a3b8')); });
putMG(22, b => { b.ellipse(16, 20, 8, 4, hex('#eab308')); b.rect(14, 9, 17, 19, hex('#fde047')); b.rect(9, 19, 14, 24, hex('#facc15')); b.rect(18, 19, 23, 24, hex('#facc15')); });
putMG(23, b => { b.rect(7, 7, 24, 28, hex('#1d4ed8')); b.rect(9, 10, 22, 26, hex('#3b82f6')); b.rect(12, 14, 19, 21, hex('#ffffff')); });
putMG(24, b => { b.rect(7, 7, 24, 28, hex('#ca8a04')); b.rect(9, 10, 22, 26, hex('#eab308')); b.rect(12, 14, 19, 21, hex('#ffffff')); });
putMG(25, b => { b.rect(7, 7, 24, 28, hex('#78350f')); b.rect(9, 10, 22, 26, hex('#a16207')); b.rect(13, 13, 18, 22, hex('#ffffff')); });
// 26: DEET Spray, 27: Spray Mist, 28: Butterfly, 29: Rat Hole, 30: Cement Trowel, 31: Steel Wire Mesh
putMG(26, b => { b.rect(10, 10, 21, 28, hex('#16a34a')); b.rect(12, 12, 19, 26, hex('#4ade80')); b.rect(11, 16, 20, 21, hex('#ffffff')); b.rect(13, 6, 18, 10, hex('#fde047')); });
putMG(27, b => { for (const [x, y, r] of [[11, 16, 5], [18, 13, 6], [20, 19, 5], [14, 18, 4]]) b.circle(x, y, r, hex('#bae6fd', 210)); });
putMG(28, b => { b.circle(10, 13, 5, hex('#f472b6')); b.circle(21, 13, 5, hex('#f472b6')); b.circle(11, 20, 4, hex('#fde047')); b.circle(20, 20, 4, hex('#fde047')); b.rect(15, 10, 16, 23, hex('#1e293b')); });
putMG(29, b => { b.rect(4, 6, 27, 27, hex('#b45309')); b.circle(16, 20, 8, hex('#0f172a')); b.px(13, 20, hex('#ef4444')); b.px(18, 20, hex('#ef4444')); });
putMG(30, b => { b.ellipse(15, 19, 9, 6, hex('#94a3b8')); b.ellipse(14, 18, 6, 4, hex('#cbd5e1')); b.rect(18, 6, 25, 10, hex('#b45309')); });
putMG(31, b => { b.rect(5, 5, 26, 26, hex('#475569')); for (let i = 8; i <= 24; i += 4) { b.rect(i, 6, i + 1, 25, hex('#e2e8f0')); b.rect(6, i, 25, i + 1, hex('#cbd5e1')); } });
mgSheet.save('public/assets/sprites/minigame-sprites.png');

// ============================================================================
// 4. Upgraded Rich Textured Home Interior Tileset (tileset-home-interior.png: 512x512)
// ============================================================================
const home = new PixBuf(512, 512);
function putH64(col, row, buf32, useEpx = false) {
  home.blit(useEpx ? buf32.epx2x() : buf32.epx2x(), col * 64, row * 64);
}
// Floors (0,1: Detailed Wood Grain; 2,3: Beveled Bath Tile & Drain; 4: Kitchen Tile; 5: Balcony Deck; 6,7: Ornate Rug)
[['#d89760', '#b87642', '#eab07d'], ['#ce8d56', '#ae6d39', '#e2a570']].forEach(([m, d, l], idx) => {
  const t = new PixBuf(32, 32);
  t.ditherRect(0, 0, 31, 31, hex(m), hex(l), 5);
  for (const py of [0, 8, 16, 24]) {
    t.rect(0, py, 31, py, hex(l)); t.rect(0, py + 7, 31, py + 7, hex(d));
    const jx = (11 + idx * 13 + py * 3) % 26 + 3;
    t.rect(jx, py, jx, py + 7, hex(d));
    t.circle((jx + 8) % 28 + 2, py + 4, 1, hex(d));
  }
  putH64(idx, 0, t);
});
[false, true].forEach((drain, idx) => {
  const t = new PixBuf(32, 32); t.rect(0, 0, 31, 31, hex('#7dd3fc'));
  for (const gy of [0, 16]) for (const gx of [0, 16]) {
    t.ditherRect(gx + 1, gy + 1, gx + 14, gy + 14, hex('#e0f2fe'), hex('#f0f9ff'), 3);
    t.rect(gx + 1, gy + 1, gx + 13, gy + 1, hex('#ffffff'));
  }
  if (drain) { t.rect(9, 9, 22, 22, hex('#475569')); for (let y = 11; y <= 20; y += 3) t.rect(11, y, 20, y + 1, hex('#0f172a')); }
  putH64(2 + idx, 0, t);
});
{
  const kt = new PixBuf(32, 32);
  for (const gy of [0, 16]) for (const gx of [0, 16]) {
    const alt = ((gx + gy) / 16) % 2 === 0;
    kt.ditherRect(gx, gy, gx + 15, gy + 15, hex(alt ? '#fef3c7' : '#fed7aa'), hex(alt ? '#fffbeb' : '#ffedd5'), 4);
    kt.rect(gx + 15, gy, gx + 15, gy + 15, hex('#d97706')); kt.rect(gx, gy + 15, gx + 15, gy + 15, hex('#d97706'));
  }
  putH64(4, 0, kt);

  const bd = new PixBuf(32, 32); bd.ditherRect(0, 0, 31, 31, hex('#b45309'), hex('#92400e'), 3);
  for (let y = 0; y < 32; y += 6) bd.rect(0, y, 31, y, hex('#78350f'));
  putH64(5, 0, bd);

  [0, 1].forEach(i => {
    const rg = new PixBuf(32, 32); rg.rect(0, 0, 31, 31, hex('#d89760'));
    const x1 = i === 0 ? 2 : 0, x2 = i === 0 ? 31 : 29;
    rg.rect(x1, 2, x2, 29, hex('#1e3a8a')); rg.rect(x1 + 2, 4, x2 - 2, 27, hex('#fbbf24'));
    rg.ditherRect(x1 + 4, 6, x2 - 4, 25, hex('#2563eb'), hex('#1d4ed8'), 2);
    rg.circle(i === 0 ? 24 : 8, 16, 4.5, hex('#fde047'));
    putH64(6 + i, 0, rg);
  });

  // Row 1: Walls & Partition Pillar (8:TopCap, 9:Wainscot, 10:BathMirror, 11:Window, 12:ExitDoor, 13:PosterWall, 14:Mat, 15:PartitionWall)
  const cap = new PixBuf(32, 32); cap.ditherRect(0, 0, 31, 26, hex('#1e293b'), hex('#334155'), 3); cap.rect(0, 27, 31, 31, hex('#92400e')); putH64(0, 1, cap);
  [[1, false], [5, true]].forEach(([cIdx, post]) => {
    const w = new PixBuf(32, 32); w.ditherRect(0, 0, 31, 19, hex('#fef9e7'), hex('#fffbeb'), 4);
    w.rect(0, 20, 31, 21, hex('#92400e')); w.rect(0, 22, 31, 29, hex('#d97706')); w.rect(0, 30, 31, 31, hex('#451a03'));
    for (let x = 3; x < 30; x += 8) w.rect(x, 23, x + 4, 28, hex('#f59e0b'));
    if (post) { w.rect(6, 3, 25, 17, hex('#0284c7')); w.rect(8, 5, 23, 15, hex('#e0f2fe')); w.circle(15.5, 10, 3.5, hex('#38bdf8')); }
    putH64(cIdx, 1, w);
  });
  const bm = new PixBuf(32, 32); bm.rect(0, 0, 31, 29, hex('#bae6fd')); bm.rect(0, 30, 31, 31, hex('#0369a1'));
  bm.rect(6, 3, 25, 23, hex('#475569')); bm.rect(8, 5, 23, 21, hex('#f0f9ff')); bm.rect(10, 7, 14, 18, hex('#ffffff')); putH64(2, 1, bm);

  const wn = new PixBuf(32, 32); wn.rect(0, 0, 31, 20, hex('#fef9e7')); wn.rect(0, 21, 31, 31, hex('#d97706'));
  wn.rect(3, 2, 28, 21, hex('#78350f')); wn.rect(5, 4, 26, 19, hex('#7dd3fc')); wn.circle(11, 8, 3, hex('#ffffff'));
  wn.rect(15, 4, 16, 19, hex('#78350f')); wn.rect(5, 11, 26, 12, hex('#78350f')); putH64(3, 1, wn);

  const dr = new PixBuf(32, 32); dr.rect(0, 0, 31, 31, hex('#fef9e7')); dr.rect(4, 1, 27, 31, hex('#451a03'));
  dr.rect(6, 3, 25, 31, hex('#9a3412')); dr.rect(9, 6, 22, 15, hex('#7c2d12')); dr.circle(22, 18, 2, hex('#fbbf24')); putH64(4, 1, dr);

  const mt = new PixBuf(32, 32); mt.rect(3, 6, 28, 25, hex('#dc2626')); mt.rect(5, 8, 26, 23, hex('#fde047')); mt.rect(7, 10, 24, 21, hex('#b91c1c')); putH64(6, 1, mt.outlined());

  const pw = new PixBuf(32, 32); pw.ditherRect(0, 0, 31, 25, hex('#475569'), hex('#334155'), 2); pw.rect(0, 26, 31, 31, hex('#92400e')); putH64(7, 1, pw);

  // Row 2: Task Props (16,17: Sink; 18: NailDesk; 19,20: DiningTable; 21,22: Flowerpot; 23: Bin)
  [false, true].forEach((cl, i) => {
    const s = new PixBuf(32, 32); s.rect(11, 20, 20, 29, hex('#cbd5e1')); s.rect(4, 10, 27, 20, hex('#ffffff'));
    s.rect(7, 12, 24, 17, hex(cl ? '#38bdf8' : '#94a3b8')); s.rect(6, 5, 10, 10, hex('#ec4899')); s.rect(21, 5, 25, 10, hex('#10b981'));
    putH64(i, 2, s.withPropShadow());
  });
  const nd = new PixBuf(32, 32); nd.rect(3, 10, 28, 20, hex('#d97706')); nd.rect(5, 20, 8, 29, hex('#78350f')); nd.rect(23, 20, 26, 29, hex('#78350f'));
  nd.rect(9, 11, 22, 16, hex('#fef3c7')); nd.rect(12, 12, 19, 15, hex('#64748b')); putH64(2, 2, nd.withPropShadow());

  [false, true].forEach((cv, i) => {
    const tb = new PixBuf(32, 32); tb.rect(2, 10, 29, 22, hex('#b45309')); tb.rect(4, 11, 27, 19, hex('#fde68a'));
    tb.rect(4, 22, 7, 29, hex('#78350f')); tb.rect(24, 22, 27, 29, hex('#78350f')); tb.ellipse(16, 15, 6, 3, hex('#ffffff'));
    if (!cv) { tb.ellipse(16, 14, 4, 2.5, hex('#ea580c')); tb.px(11, 7, hex('#0f172a')); tb.px(21, 6, hex('#0f172a')); }
    else { tb.circle(16, 14, 6.5, hex('#38bdf8')); tb.rect(9, 16, 23, 20, hex('#fde68a')); }
    putH64(3 + i, 2, tb.withPropShadow());
  });

  [false, true].forEach((dry, i) => {
    const fp = new PixBuf(32, 32); fp.ellipse(16, 26, 10, 3.5, hex('#c2410c')); fp.ellipse(16, 26, 8, 2.2, hex(dry ? '#fdba74' : '#0ea5e9'));
    fp.rect(9, 15, 22, 25, hex('#ea580c')); fp.circle(16, 10, 6.5, hex('#15803d')); fp.circle(14, 8, 4, hex('#4ade80'));
    putH64(5 + i, 2, fp.withPropShadow());
  });
  const bh = new PixBuf(32, 32); bh.rect(9, 9, 22, 28, hex('#cbd5e1')); bh.rect(8, 7, 23, 10, hex('#334155')); putH64(7, 2, bh.withPropShadow());

  // Row 3-5 Expanded Multi-Room Furniture!
  const bedT = new PixBuf(32, 32); bedT.rect(3, 4, 28, 31, hex('#78350f')); bedT.rect(5, 11, 26, 31, hex('#f8fafc')); bedT.rect(7, 13, 24, 22, hex('#ffffff')); bedT.rect(5, 24, 26, 31, hex('#60a5fa')); putH64(0, 3, bedT.outlined());
  const bedB = new PixBuf(32, 32); bedB.rect(3, 0, 28, 26, hex('#78350f')); bedB.ditherRect(5, 0, 26, 23, hex('#2563eb'), hex('#3b82f6'), 2); putH64(0, 4, bedB.outlined());

  [0, 1].forEach(i => {
    const sf = new PixBuf(32, 32); sf.rect(i === 0 ? 3 : 0, 5, i === 0 ? 31 : 28, 27, hex('#15803d'));
    sf.rect(i === 0 ? 7 : 0, 13, i === 0 ? 30 : 24, 25, hex('#4ade80'));
    if (i === 0) sf.rect(9, 9, 17, 16, hex('#fde047'));
    putH64(1 + i, 3, sf.withPropShadow());
  });
  [0, 1].forEach(i => {
    const kc = new PixBuf(32, 32); kc.rect(0, 6, 31, 29, hex('#d97706')); kc.rect(0, 5, 31, 14, hex('#f1f5f9'));
    if (i === 0) { kc.rect(4, 7, 27, 13, hex('#1e293b')); kc.circle(10, 10, 2.5, hex('#ef4444')); kc.circle(21, 10, 2.5, hex('#38bdf8')); }
    else { kc.rect(5, 7, 26, 13, hex('#bae6fd')); kc.rect(14, 3, 17, 7, hex('#64748b')); }
    putH64(3 + i, 3, kc.outlined());
  });
  const frT = new PixBuf(32, 32); frT.rect(4, 3, 27, 31, hex('#e2e8f0')); frT.rect(6, 5, 25, 25, hex('#ffffff')); frT.rect(7, 14, 8, 22, hex('#64748b')); putH64(5, 3, frT.outlined());
  const frB = new PixBuf(32, 32); frB.rect(4, 0, 27, 28, hex('#e2e8f0')); frB.rect(6, 2, 25, 26, hex('#ffffff')); frB.rect(7, 5, 8, 16, hex('#64748b')); putH64(5, 4, frB.outlined());

  const shT = new PixBuf(32, 32); shT.rect(3, 3, 28, 31, hex('#78350f')); shT.rect(5, 6, 26, 16, hex('#ef4444')); shT.rect(12, 6, 19, 16, hex('#3b82f6')); shT.rect(5, 19, 26, 29, hex('#10b981')); putH64(6, 3, shT.outlined());
  const shB = new PixBuf(32, 32); shB.rect(3, 0, 28, 28, hex('#78350f')); shB.rect(5, 3, 16, 13, hex('#eab308')); shB.rect(17, 3, 26, 13, hex('#a855f7')); putH64(6, 4, shB.outlined());

  const tl = new PixBuf(32, 32); tl.rect(9, 4, 22, 14, hex('#ffffff')); tl.ellipse(16, 21, 6, 6, hex('#f8fafc')); tl.ellipse(16, 20, 4, 4, hex('#bae6fd')); putH64(7, 3, tl.withPropShadow());

  // Wardrobe (33,41), PC Desk (34), Chair (35), Washer (36), TV (39), Bathtub (40), CoffeeTable (42), Plant (43), Railing (44), BedroomRug (45)
  const wdT = new PixBuf(32, 32); wdT.rect(3, 3, 28, 31, hex('#92400e')); wdT.rect(5, 5, 15, 31, hex('#b45309')); wdT.rect(16, 5, 26, 31, hex('#b45309')); putH64(1, 4, wdT.outlined());
  const wdB = new PixBuf(32, 32); wdB.rect(3, 0, 28, 28, hex('#92400e')); wdB.rect(5, 0, 15, 25, hex('#b45309')); wdB.rect(16, 0, 26, 25, hex('#b45309')); wdB.px(13, 8, hex('#fde047')); wdB.px(18, 8, hex('#fde047')); putH64(1, 5, wdB.outlined());

  const pc = new PixBuf(32, 32); pc.rect(3, 14, 28, 28, hex('#92400e')); pc.rect(8, 4, 23, 14, hex('#1e293b')); pc.rect(10, 6, 21, 12, hex('#38bdf8')); putH64(2, 4, pc.withPropShadow());
  const ch = new PixBuf(32, 32); ch.rect(9, 7, 22, 22, hex('#d97706')); ch.rect(10, 22, 12, 28, hex('#78350f')); ch.rect(19, 22, 21, 28, hex('#78350f')); putH64(3, 4, ch.withPropShadow());
  const ws = new PixBuf(32, 32); ws.rect(5, 5, 26, 28, hex('#ffffff')); ws.circle(16, 18, 6, hex('#475569')); ws.circle(16, 18, 4, hex('#38bdf8')); putH64(4, 4, ws.withPropShadow());
  const tv = new PixBuf(32, 32); tv.rect(2, 18, 29, 28, hex('#78350f')); tv.rect(3, 4, 28, 18, hex('#0f172a')); tv.rect(5, 6, 26, 16, hex('#0284c7')); tv.circle(15, 11, 3.5, hex('#4ade80')); putH64(7, 4, tv.withPropShadow());
  const btub = new PixBuf(32, 32); btub.rect(2, 7, 29, 27, hex('#ffffff')); btub.rect(5, 10, 26, 24, hex('#bae6fd')); btub.circle(10, 13, 3, hex('#ffffff')); btub.circle(20, 14, 3, hex('#ffffff')); putH64(0, 5, btub.withPropShadow());
  const ctbl = new PixBuf(32, 32); ctbl.rect(4, 11, 27, 24, hex('#b45309')); ctbl.rect(6, 12, 25, 21, hex('#d97706')); ctbl.circle(16, 16, 2.5, hex('#ffffff')); putH64(2, 5, ctbl.withPropShadow());
  const plnt = new PixBuf(32, 32); plnt.rect(11, 19, 20, 28, hex('#d97706')); plnt.circle(16, 12, 7, hex('#15803d')); plnt.circle(14, 10, 4, hex('#4ade80')); putH64(3, 5, plnt.withPropShadow());
  const rail = new PixBuf(32, 32); rail.rect(0, 8, 31, 11, hex('#334155')); rail.rect(0, 25, 31, 28, hex('#334155')); for (let x = 3; x < 30; x += 6) rail.rect(x, 11, x + 1, 25, hex('#64748b')); putH64(4, 5, rail.outlined());
  const brug = new PixBuf(32, 32); brug.rect(0, 0, 31, 31, hex('#d89760')); brug.rect(2, 2, 29, 29, hex('#ec4899')); brug.rect(4, 4, 27, 27, hex('#fbcfe8')); putH64(5, 5, brug);
}
home.save('public/assets/tilesets/tileset-home-interior.png');

// ============================================================================
// 5. Upgraded HK Street & Park 2.5D Tileset (tileset-hk-street.png: 512x512)
// ============================================================================
const street = new PixBuf(512, 512);
const putS64 = (col, row, b) => street.blit(b.epx2x(), col * 64, row * 64);
{
  const g1 = new PixBuf(32, 32); g1.ditherRect(0, 0, 31, 31, hex('#4ca64c'), hex('#58b858'), 3);
  for (const [gx, gy] of [[3, 4], [18, 3], [9, 13], [24, 15], [5, 23], [19, 25]]) {
    g1.px(gx, gy + 1, hex('#2d7a31')); g1.px(gx + 2, gy + 1, hex('#2d7a31')); g1.px(gx + 1, gy, hex('#86efac'));
  }
  putS64(0, 0, g1);

  const g2 = new PixBuf(32, 32); g2.data.set(g1.data);
  for (const [fx, fy, fc] of [[7, 7, '#fde047'], [22, 11, '#ffffff'], [14, 24, '#f472b6']]) { g2.circle(fx, fy, 2, hex(fc)); g2.px(fx, fy, hex('#ea580c')); }
  putS64(1, 0, g2);

  const sw = new PixBuf(32, 32); sw.ditherRect(0, 0, 31, 31, hex('#eebfb3'), hex('#f5d0c5'), 4);
  for (let y = 0; y < 32; y += 8) { sw.rect(0, y + 7, 31, y + 7, hex('#c9988b')); for (let x = ((y / 8) % 2) * 8; x < 32; x += 16) sw.rect(x, y, x, y + 7, hex('#c9988b')); }
  putS64(2, 0, sw);

  const cb = new PixBuf(32, 32); cb.data.set(sw.data); cb.rect(0, 17, 31, 24, hex('#facc15'));
  for (let x = 2; x < 30; x += 4) cb.px(x, 20, hex('#a16207'));
  cb.rect(0, 25, 31, 28, hex('#cbd5e1')); cb.rect(0, 29, 31, 31, hex('#1e293b')); putS64(3, 0, cb);

  const al = new PixBuf(32, 32); al.ditherRect(0, 0, 31, 31, hex('#64748b'), hex('#475569'), 3);
  for (let y = 0; y < 32; y += 8) al.rect(0, y + 7, 31, y + 7, hex('#334155')); putS64(4, 0, al);

  const rd = new PixBuf(32, 32); rd.ditherRect(0, 0, 31, 31, hex('#334155'), hex('#293548'), 4); rd.rect(6, 15, 25, 17, hex('#f8fafc')); putS64(5, 0, rd);
  const zb = new PixBuf(32, 32); zb.ditherRect(0, 0, 31, 31, hex('#334155'), hex('#293548'), 4); zb.rect(4, 2, 12, 29, hex('#f8fafc')); zb.rect(19, 2, 27, 29, hex('#f8fafc')); putS64(6, 0, zb);

  const pk = new PixBuf(32, 32); pk.ditherRect(0, 0, 31, 31, hex('#d6a87c'), hex('#c49368'), 3);
  for (const [cx, cy] of [[6, 7], [20, 9], [12, 19], [25, 24]]) pk.ellipse(cx, cy, 3.5, 2.5, hex('#e5c19e'));
  putS64(7, 0, pk);

  // Row 1: HK Buildings & Shops
  const bw = new PixBuf(32, 32); bw.ditherRect(0, 0, 31, 31, hex('#fef3c7'), hex('#fde68a'), 5);
  bw.rect(4, 5, 27, 25, hex('#475569')); bw.rect(6, 7, 14, 23, hex('#bae6fd')); bw.rect(17, 7, 25, 23, hex('#7dd3fc')); putS64(0, 1, bw);

  [false, true].forEach((ok, i) => {
    const ac = new PixBuf(32, 32); ac.ditherRect(0, 0, 31, 31, hex('#fef3c7'), hex('#fde68a'), 5);
    ac.rect(4, 6, 27, 20, hex('#f8fafc')); ac.rect(7, 9, 19, 17, hex('#475569'));
    if (!ok) { ac.rect(6, 20, 14, 22, hex('#38bdf8')); ac.circle(9, 25, 1.5, hex('#0ea5e9')); ac.circle(12, 29, 1.5, hex('#38bdf8')); }
    else { ac.circle(23, 11, 1.5, hex('#10b981')); ac.rect(25, 20, 27, 31, hex('#cbd5e1')); }
    putS64(1 + i, 1, ac);
  });

  const bs = new PixBuf(32, 32); bs.rect(0, 0, 31, 31, hex('#fef3c7')); bs.rect(1, 7, 30, 28, hex('#0284c7')); bs.rect(3, 9, 28, 26, hex('#7dd3fc'));
  bs.ellipse(10, 18, 4.5, 4, hex('#d97706')); bs.rect(6, 17, 14, 19, hex('#16a34a')); bs.rect(17, 13, 21, 24, hex('#ef4444')); bs.rect(23, 14, 27, 24, hex('#fde047')); putS64(3, 1, bs);

  const sd = new PixBuf(32, 32); sd.rect(0, 0, 31, 31, hex('#64748b')); sd.rect(3, 2, 14, 29, hex('#bae6fd')); sd.rect(17, 2, 28, 29, hex('#bae6fd')); putS64(4, 1, sd);
  const gt = new PixBuf(32, 32); gt.rect(0, 0, 31, 31, hex('#9a3412')); gt.rect(4, 4, 27, 31, hex('#475569')); for (let x = 6; x < 27; x += 4) gt.rect(x, 5, x + 1, 28, hex('#e2e8f0')); putS64(5, 1, gt);

  [false, true].forEach((s, i) => {
    const rw = new PixBuf(32, 32); rw.ditherRect(0, 0, 31, 26, hex('#fef3c7'), hex('#fde68a'), 5); rw.rect(0, 27, 31, 31, hex('#64748b'));
    if (!s) { rw.circle(16, 25, 6.5, hex('#0f172a')); rw.px(13, 25, hex('#ef4444')); rw.px(18, 25, hex('#ef4444')); }
    else { rw.rect(8, 17, 23, 31, hex('#94a3b8')); for (let x = 10; x <= 21; x += 3) rw.rect(x, 18, x, 30, hex('#334155')); for (let y = 19; y <= 29; y += 3) rw.rect(9, y, 22, y, hex('#334155')); }
    putS64(6 + i, 1, rw);
  });

  // Row 2: Street Props
  [false, true].forEach((td, i) => {
    const ob = new PixBuf(32, 32); ob.rect(9, 7, 22, 28, hex('#f97316')); ob.rect(12, 10, 19, 15, hex('#1e293b'));
    if (!td) { ob.circle(6, 26, 3.5, hex('#dc2626')); ob.rect(22, 23, 28, 28, hex('#38bdf8')); }
    putS64(i, 2, ob.withPropShadow());
  });
  const pl = new PixBuf(32, 32); pl.rect(4, 7, 17, 24, hex('#d97706')); pl.circle(13, 22, 6, hex('#166534')); pl.circle(21, 23, 5, hex('#15803d')); putS64(2, 2, pl.withPropShadow());
  const bb = new PixBuf(32, 32); bb.rect(7, 7, 24, 28, hex('#92400e')); bb.rect(13, 14, 18, 23, hex('#ffffff')); putS64(3, 2, bb.withPropShadow());
  const by = new PixBuf(32, 32); by.rect(2, 9, 14, 28, hex('#2563eb')); by.rect(17, 9, 29, 28, hex('#eab308')); putS64(4, 2, by.withPropShadow());
  const bt = new PixBuf(32, 32); bt.rect(5, 18, 17, 25, hex('#38bdf8')); bt.rect(19, 12, 26, 27, hex('#0ea5e9')); putS64(5, 2, bt.withPropShadow());
  const pd = new PixBuf(32, 32); pd.ellipse(16, 21, 11, 5.5, hex('#0ea5e9')); pd.ellipse(15, 20, 7, 3.5, hex('#7dd3fc')); putS64(6, 2, pd.outlined(hex('#0369a1')));
  const rl = new PixBuf(32, 32); rl.rect(1, 9, 30, 12, hex('#e2e8f0')); rl.rect(1, 24, 30, 26, hex('#94a3b8')); for (let x = 4; x < 29; x += 5) rl.rect(x, 12, x + 1, 28, hex('#cbd5e1')); putS64(7, 2, rl.outlined());

  // Row 3-4: 128x128 HGSS Tree, Lamp, Cha Chaan Teng Sign (27), Pharmacy Sign (28), Drain (29), Bush (35), Bench (37,38)
  const tree = new PixBuf(64, 64);
  tree.ellipse(32, 57, 18, 4.5, [12, 18, 34, 95]);
  const tc = new PixBuf(64, 64); tc.rect(25, 40, 38, 57, hex('#78350f')); tc.rect(27, 40, 33, 56, hex('#92400e'));
  tc.circle(32, 30, 23, hex('#14532d')); tc.circle(19, 33, 14, hex('#166534')); tc.circle(45, 33, 14, hex('#166534'));
  tc.circle(32, 25, 20, hex('#22c55e')); tc.circle(23, 26, 12, hex('#4ade80')); tc.circle(39, 25, 11, hex('#4ade80')); tc.circle(30, 16, 9, hex('#86efac'));
  tree.blit(tc.outlined(), 0, 0, true);
  street.blit(tree.epx2x(), 0, 3 * 64);

  const lmp = new PixBuf(32, 64); lmp.rect(14, 18, 17, 58, hex('#334155')); lmp.circle(15.5, 12, 7.5, hex('#facc15')); lmp.circle(15.5, 12, 4.5, hex('#fef9c3'));
  street.blit(lmp.outlined().epx2x(), 2 * 64, 3 * 64);

  const cct = new PixBuf(32, 32); cct.rect(0, 0, 31, 31, hex('#fef3c7')); cct.rect(1, 7, 30, 27, hex('#b91c1c')); cct.rect(3, 9, 28, 25, hex('#fef08a')); cct.circle(11, 18, 4, hex('#78350f')); cct.rect(18, 13, 25, 21, hex('#dc2626')); putS64(3, 3, cct);
  const phm = new PixBuf(32, 32); phm.rect(0, 0, 31, 31, hex('#fef3c7')); phm.rect(1, 7, 30, 27, hex('#15803d')); phm.rect(3, 9, 28, 25, hex('#ffffff')); phm.rect(14, 11, 17, 23, hex('#16a34a')); phm.rect(10, 15, 21, 18, hex('#16a34a')); putS64(4, 3, phm);
  const drn = new PixBuf(32, 32); drn.rect(0, 0, 31, 31, hex('#334155')); drn.rect(6, 8, 25, 23, hex('#64748b')); for (let x = 9; x <= 22; x += 3) drn.rect(x, 10, x + 1, 21, hex('#0f172a')); putS64(5, 3, drn);

  const bsh = new PixBuf(32, 32); bsh.circle(16, 19, 11, hex('#14532d')); bsh.circle(11, 20, 8, hex('#166534')); bsh.circle(21, 20, 8, hex('#166534')); bsh.circle(16, 15, 8, hex('#22c55e')); bsh.circle(14, 13, 4, hex('#86efac')); putS64(3, 4, bsh.withPropShadow());
  [0, 1].forEach(i => {
    const bn = new PixBuf(32, 32); bn.rect(i === 0 ? 4 : 0, 10, i === 0 ? 31 : 27, 17, hex('#b45309')); bn.rect(i === 0 ? 3 : 0, 19, i === 0 ? 31 : 28, 23, hex('#d97706'));
    bn.rect(i === 0 ? 7 : 20, 23, i === 0 ? 11 : 24, 29, hex('#1e293b')); putS64(5 + i, 4, bn.withPropShadow());
  });
}
street.save('public/assets/tilesets/tileset-hk-street.png');

console.log('[v2-epx-assets] Generated HD EPX character, NPC, 32 mini-game pixel sprites, and 6-room tilesets!');
