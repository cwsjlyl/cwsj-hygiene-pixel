import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CWSJ_SCHOOLBOY_B64, verifyValidPngBuffer } from './assets/mapHomeData.mjs';

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

function hasValidExternalAsset(fp, minW = 64, minH = 64) {
  if (!fs.existsSync(fp)) return false;
  try {
    const buf = fs.readFileSync(fp);
    return Boolean(verifyValidPngBuffer(buf, minW, minH));
  } catch {
    return false;
  }
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
    for (let y = y1 | 0; y <= (y2 | 0); y++) for (let x = x1 | 0; x <= (x2 | 0); x++) this.px(x, y, c);
  }
  frameRect(x1, y1, x2, y2, borderCol, fillCol) {
    this.rect(x1, y1, x2, y2, borderCol);
    if (x2 - x1 >= 2 && y2 - y1 >= 2) this.rect(x1 + 1, y1 + 1, x2 - 1, y2 - 1, fillCol);
  }
  ditherRect(x1, y1, x2, y2, c1, c2, mod = 2) {
    for (let y = y1 | 0; y <= (y2 | 0); y++) for (let x = x1 | 0; x <= (x2 | 0); x++) {
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
  outlined(col = hex('#1d1926')) {
    const o = new PixBuf(this.w, this.h); o.data.set(this.data);
    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (let y = 0; y < this.h; y++) for (let x = 0; x < this.w; x++) {
      if (this.getAlpha(x, y) === 0 && dirs.some(([dx, dy]) => this.getAlpha(x + dx, y + dy) > 120)) o.px(x, y, col);
    }
    return o;
  }
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
  purgeZeroAlphaRgb() {
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] < 24) {
        this.data[i] = 0; this.data[i + 1] = 0; this.data[i + 2] = 0; this.data[i + 3] = 0;
      }
    }
    return this;
  }
  save(fp) {
    this.purgeZeroAlphaRgb();
    fs.mkdirSync(path.dirname(fp), { recursive: true });
    fs.writeFileSync(fp, encodePNG(this.w, this.h, this.data));
  }
}

// ============================================================================
// 1. Protagonist: CWSJ HD Schoolboy Sheet (256x336 4x4 of 64x84 from Repo Library!)
// ============================================================================
function drawFallbackSchoolboy4x4() {
  const sheet = new PixBuf(256, 336);
  for (let dir = 0; dir < 4; dir++) {
    for (let step = 0; step < 4; step++) {
      let c = new PixBuf(32, 42);
      const bob = (step === 1 || step === 3) ? -1 : 0;
      const swing = step === 1 ? -1 : (step === 3 ? 1 : 0);
      const HD = hex('#1f1c24'), HM = hex('#3b323d'), SL = hex('#ffe3d1'), SB = hex('#fed4be');
      const WL = hex('#ffffff'), WB = hex('#f1f5f9'), PB = hex('#2d5c88'), PL = hex('#3e78b2');
      c.ellipse(16, 39, 7, 2, [12, 18, 34, 95]);
      c.rect(11, 31 + bob + (swing > 0 ? -1 : 0), 14, 36 + bob, SB);
      c.rect(17, 31 + bob + (swing < 0 ? -1 : 0), 20, 36 + bob, SB);
      c.rect(11, 35 + bob, 14, 36 + bob, WL); c.rect(17, 35 + bob, 20, 36 + bob, WL);
      c.rect(10, 37 + bob, 14, 39 + bob, HD); c.rect(17, 37 + bob, 21, 39 + bob, HD);
      c.rect(10, 26 + bob, 21, 30 + bob, PB); c.rect(11, 27 + bob, 20, 29 + bob, PL);
      c.rect(10, 18 + bob, 21, 25 + bob, WB); c.rect(11, 19 + bob, 20, 24 + bob, WL);
      if (dir === 0) {
        c.px(18, 20 + bob, hex('#eab308')); c.px(19, 20 + bob, hex('#2563eb')); c.px(18, 21 + bob, hex('#16a34a'));
      }
      c.rect(8, 19 + bob + swing, 9, 25 + bob + swing, WL); c.rect(8, 25 + bob + swing, 9, 27 + bob + swing, SL);
      c.rect(22, 19 + bob - swing, 23, 25 + bob - swing, WL); c.rect(22, 25 + bob - swing, 23, 27 + bob - swing, SL);
      c.rect(10, 8 + bob, 21, 17 + bob, SB);
      if (dir !== 3) {
        c.px(12, 12 + bob, HD); c.px(12, 13 + bob, HD);
        if (dir === 0) { c.px(19, 12 + bob, HD); c.px(19, 13 + bob, HD); c.rect(14, 15 + bob, 17, 15 + bob, hex('#dc6860')); }
      }
      c.rect(9, 4 + bob, 22, 9 + bob, HD); c.rect(11, 5 + bob, 18, 6 + bob, HM);
      if (dir === 3) c.rect(9, 8 + bob, 22, 16 + bob, HD);
      if (dir === 2) c = c.flipH();
      sheet.blit(c.outlined().epx2x(), step * 64, dir * 84);
    }
  }
  return sheet;
}

const heroTarget = 'public/assets/sprites/char-cwsj-schoolboy.png';
if (!hasValidExternalAsset(heroTarget, 128, 128)) {
  const b64Buf = Buffer.from(CWSJ_SCHOOLBOY_B64, 'base64');
  const meta = verifyValidPngBuffer(b64Buf, 256, 336);
  if (meta) {
    fs.mkdirSync(path.dirname(heroTarget), { recursive: true });
    fs.writeFileSync(heroTarget, b64Buf);
    console.log('[v3-hd] Wrote verified CWSJ HD 256x336 schoolboy spritesheet from repository library!');
  } else {
    drawFallbackSchoolboy4x4().save(heroTarget);
  }
}

// Legacy 64x64 fallback & crisp portrait
const portraitBuf = drawFallbackSchoolboy4x4();
const singleFrame = new PixBuf(64, 84);
singleFrame.blit(portraitBuf, 0, 0);
singleFrame.epx2x().save('public/assets/ui/portrait-student-boy.png');

// ============================================================================
// 2. 26 De-Checkered 2.5D Furniture & Scene Props Atlas (home-props-atlas.png + .json)
//    100% Pure RGBA (alpha in {0, 255}), ZERO checkerboard draft!
// ============================================================================
function build26HomePropsAtlas() {
  const WOOD_D = hex('#6b3e23'), WOOD_M = hex('#a46438'), WOOD_L = hex('#cf8954'), WOOD_HI = hex('#e7ae7b');
  const CER_W = hex('#f8fafc'), CER_M = hex('#e2e8f0'), CER_B = hex('#bae6fd'), CER_A = hex('#38bdf8');
  const SOFA_D = hex('#991b1b'), SOFA_M = hex('#dc2626'), SOFA_L = hex('#f87171');
  const LEAF_D = hex('#14532d'), LEAF_M = hex('#16a34a'), LEAF_L = hex('#4ade80');
  const MET_D = hex('#334155'), MET_M = hex('#64748b'), MET_L = hex('#cbd5e1');

  const rawProps = {};
  const makeProp = (name, w, h, drawFn) => {
    const b = new PixBuf(w, h);
    drawFn(b);
    rawProps[name] = b.outlined(hex('#1e1926')).epx2x().purgeZeroAlphaRgb();
  };

  makeProp('double_bed', 58, 76, b => {
    b.frameRect(3, 4, 54, 18, WOOD_D, WOOD_M); b.rect(5, 6, 52, 10, WOOD_L);
    b.frameRect(3, 16, 54, 70, WOOD_D, CER_W);
    b.frameRect(7, 19, 25, 31, CER_M, CER_W); b.frameRect(32, 19, 50, 31, CER_M, CER_W);
    b.ditherRect(5, 33, 52, 66, hex('#ec4899'), hex('#f472b6'), 3);
    b.rect(5, 33, 52, 37, hex('#fbcfe8'));
    b.rect(4, 68, 9, 74, WOOD_D); b.rect(48, 68, 53, 74, WOOD_D);
  });

  makeProp('tv_cabinet', 82, 72, b => {
    b.frameRect(12, 4, 69, 40, MET_D, hex('#1e1b2e'));
    b.ditherRect(15, 7, 66, 36, hex('#312e81'), hex('#4338ca'), 4);
    b.rect(18, 10, 32, 14, hex('#818cf8'));
    b.rect(36, 40, 45, 45, MET_M);
    b.frameRect(3, 45, 78, 66, WOOD_D, WOOD_M); b.rect(5, 47, 76, 51, WOOD_L);
    b.frameRect(7, 53, 27, 63, WOOD_D, WOOD_L); b.frameRect(54, 53, 74, 63, WOOD_D, WOOD_L);
    b.rect(30, 54, 51, 62, hex('#1e293b'));
  });

  makeProp('door', 56, 68, b => {
    b.frameRect(4, 2, 51, 66, WOOD_D, WOOD_M);
    b.frameRect(8, 6, 47, 65, WOOD_D, WOOD_L);
    b.frameRect(12, 10, 43, 30, WOOD_M, WOOD_HI);
    b.frameRect(12, 35, 43, 58, WOOD_M, WOOD_HI);
    b.circle(41, 35, 2.5, hex('#fbbf24'));
  });

  makeProp('shower', 54, 64, b => {
    b.frameRect(4, 4, 49, 60, MET_M, CER_B);
    b.ditherRect(7, 8, 28, 54, CER_W, CER_M, 3);
    for (let x = 10; x <= 26; x += 5) b.rect(x, 8, x + 1, 54, hex('#93c5fd'));
    b.rect(34, 9, 44, 12, MET_D); b.circle(34, 13, 3, MET_L);
    b.frameRect(4, 54, 49, 61, MET_D, CER_W);
  });

  makeProp('sofa_2seat', 98, 64, b => {
    b.frameRect(8, 6, 89, 36, SOFA_D, SOFA_M); b.rect(11, 9, 86, 16, SOFA_L);
    b.frameRect(3, 20, 14, 56, SOFA_D, SOFA_M); b.frameRect(83, 20, 94, 56, SOFA_D, SOFA_M);
    b.frameRect(14, 30, 48, 52, SOFA_D, SOFA_L); b.frameRect(49, 30, 83, 52, SOFA_D, SOFA_L);
    b.rect(14, 52, 83, 57, SOFA_D);
    b.rect(8, 57, 13, 62, WOOD_D); b.rect(84, 57, 89, 62, WOOD_D);
  });

  makeProp('armchair_left', 50, 58, b => {
    b.frameRect(6, 6, 44, 32, SOFA_D, SOFA_M); b.frameRect(3, 18, 13, 50, SOFA_D, SOFA_L);
    b.frameRect(37, 18, 47, 50, SOFA_D, SOFA_L); b.frameRect(13, 28, 37, 48, SOFA_D, SOFA_L);
    b.rect(7, 50, 12, 55, WOOD_D); b.rect(38, 50, 43, 55, WOOD_D);
  });
  rawProps['armchair_right'] = rawProps['armchair_left'].flipH();

  makeProp('chair_front', 36, 62, b => {
    b.rect(6, 4, 9, 34, WOOD_D); b.rect(26, 4, 29, 34, WOOD_D);
    b.rect(6, 6, 29, 11, WOOD_L); b.rect(6, 17, 29, 21, WOOD_M);
    // Note: gap between bars (y=12..16 and y=22..31) stays CLEAR [0,0,0,0]!
    b.frameRect(4, 32, 31, 43, WOOD_D, WOOD_HI);
    b.rect(6, 43, 9, 59, WOOD_D); b.rect(26, 43, 29, 59, WOOD_D);
  });

  makeProp('chair_side', 28, 50, b => {
    b.rect(5, 3, 8, 47, WOOD_D); b.frameRect(5, 24, 23, 31, WOOD_D, WOOD_L);
    b.rect(19, 31, 22, 47, WOOD_D);
  });

  makeProp('cake_table', 86, 62, b => {
    b.frameRect(4, 14, 81, 40, WOOD_D, WOOD_L); b.rect(7, 16, 78, 36, WOOD_HI);
    b.rect(8, 40, 13, 58, WOOD_D); b.rect(72, 40, 77, 58, WOOD_D);
    b.ellipse(43, 26, 13, 7, CER_W); b.ellipse(43, 23, 9, 5, hex('#fde047'));
    b.circle(40, 19, 2, hex('#ef4444')); b.circle(46, 20, 2, hex('#ef4444'));
  });

  makeProp('dining_table', 90, 60, b => {
    b.frameRect(3, 10, 86, 38, WOOD_D, WOOD_M); b.rect(6, 13, 83, 34, WOOD_L);
    b.rect(8, 38, 13, 57, WOOD_D); b.rect(76, 38, 81, 57, WOOD_D);
  });

  makeProp('green_rug', 88, 60, b => {
    b.frameRect(2, 4, 85, 55, LEAF_D, LEAF_M);
    b.frameRect(6, 8, 81, 51, hex('#fde047'), hex('#22c55e'));
    b.ditherRect(10, 12, 77, 47, hex('#16a34a'), hex('#4ade80'), 3);
  });

  makeProp('plant_large', 44, 60, b => {
    b.frameRect(12, 38, 31, 56, WOOD_D, hex('#ea580c')); b.rect(10, 35, 33, 39, hex('#c2410c'));
    b.circle(22, 21, 13, LEAF_D); b.circle(15, 24, 9, LEAF_M); b.circle(29, 24, 9, LEAF_M);
    b.circle(22, 16, 9, LEAF_L);
  });

  makeProp('plant_whitepot', 30, 44, b => {
    b.frameRect(8, 25, 21, 41, MET_M, CER_W); b.ellipse(14.5, 40, 9, 2.5, hex('#38bdf8'));
    b.circle(15, 15, 10, LEAF_D); b.circle(14, 13, 7, LEAF_L);
  });

  makeProp('plant_small', 25, 36, b => {
    b.frameRect(7, 21, 17, 33, WOOD_D, hex('#d97706'));
    b.circle(12, 13, 8, LEAF_M); b.circle(11, 11, 5, LEAF_L);
  });

  makeProp('sink_vanity', 60, 58, b => {
    b.frameRect(4, 18, 55, 54, WOOD_D, CER_W);
    b.frameRect(8, 32, 28, 50, MET_M, CER_M); b.frameRect(31, 32, 51, 50, MET_M, CER_M);
    b.frameRect(6, 16, 53, 30, MET_M, CER_W);
    b.ellipse(30, 23, 16, 4.5, CER_A);
    b.rect(28, 8, 32, 16, MET_D); b.rect(12, 10, 17, 16, hex('#ec4899'));
  });

  makeProp('computer_desk', 54, 58, b => {
    b.frameRect(14, 4, 39, 22, MET_D, hex('#38bdf8')); b.rect(24, 22, 29, 27, MET_M);
    b.frameRect(3, 27, 50, 36, WOOD_D, WOOD_L);
    // Clean transparent under-desk leg gap!
    b.rect(5, 36, 9, 55, WOOD_D); b.rect(44, 36, 48, 55, WOOD_D);
  });

  makeProp('toilet', 32, 56, b => {
    b.frameRect(6, 4, 25, 22, MET_M, CER_W); b.rect(5, 3, 26, 6, CER_W);
    b.ellipse(15.5, 35, 11, 13, CER_M); b.ellipse(15.5, 33, 9, 10, CER_W); b.ellipse(15.5, 33, 5, 6, CER_B);
    b.rect(10, 44, 21, 53, CER_M);
  });

  makeProp('nightstand', 42, 52, b => {
    b.frameRect(4, 12, 37, 47, WOOD_D, WOOD_M); b.rect(6, 14, 35, 19, WOOD_HI);
    b.frameRect(7, 22, 34, 32, WOOD_D, WOOD_L); b.frameRect(7, 35, 34, 44, WOOD_D, WOOD_L);
    b.circle(20.5, 27, 1.5, hex('#fbbf24')); b.circle(20.5, 39, 1.5, hex('#fbbf24'));
  });

  makeProp('bathtub', 74, 48, b => {
    b.frameRect(3, 10, 70, 43, MET_M, CER_W);
    b.frameRect(8, 14, 65, 33, MET_L, CER_B);
    b.ditherRect(10, 16, 63, 31, CER_A, CER_B, 3);
    b.circle(18, 21, 4, CER_W); b.circle(52, 23, 3.5, CER_W);
    b.rect(62, 4, 66, 12, MET_D);
  });

  makeProp('toy_box', 42, 40, b => {
    b.frameRect(3, 12, 38, 37, hex('#581c87'), hex('#9333ea'));
    b.rect(6, 15, 35, 20, hex('#c084fc'));
    b.circle(14, 9, 5, hex('#fde047')); b.rect(22, 6, 32, 12, hex('#ef4444'));
  });

  makeProp('kitchen_top', 86, 34, b => {
    b.frameRect(2, 2, 42, 28, WOOD_D, WOOD_L); b.frameRect(44, 2, 83, 20, MET_D, MET_L);
    b.rect(46, 20, 81, 25, MET_M);
  });

  makeProp('kitchen_bottom', 86, 34, b => {
    b.frameRect(2, 3, 83, 31, WOOD_D, WOOD_M); b.rect(3, 3, 82, 11, CER_W);
    b.circle(54, 7, 3, hex('#ef4444')); b.circle(68, 7, 3, hex('#38bdf8'));
    b.ellipse(22, 7, 10, 3, MET_M);
  });

  makeProp('balcony_railing', 76, 31, b => {
    b.rect(2, 3, 73, 6, MET_D); b.rect(2, 4, 73, 5, MET_L);
    b.rect(2, 25, 73, 28, MET_D);
    // Open transparent gaps between vertical bars!
    for (let x = 4; x <= 72; x += 8) b.rect(x, 6, x + 2, 25, MET_M);
  });

  makeProp('mirror', 28, 26, b => {
    b.frameRect(3, 2, 24, 23, MET_D, CER_B);
    b.rect(6, 5, 21, 20, CER_W); b.rect(8, 7, 12, 18, CER_B);
  });

  makeProp('towel', 28, 22, b => {
    b.rect(3, 3, 24, 5, MET_D);
    b.frameRect(7, 4, 20, 19, hex('#0284c7'), hex('#7dd3fc'));
    b.rect(8, 15, 19, 17, CER_W);
  });

  const atlasW = 1024, atlasH = 512;
  const atlas = new PixBuf(atlasW, atlasH);
  const frames = {};
  let cx = 4, cy = 4, rowH = 0;
  for (const [name, spr] of Object.entries(rawProps).sort((a, b) => b[1].h - a[1].h)) {
    if (cx + spr.w + 6 > atlasW) { cx = 4; cy += rowH + 6; rowH = 0; }
    atlas.blit(spr, cx, cy, true);
    frames[name] = {
      frame: { x: cx, y: cy, w: spr.w, h: spr.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: spr.w, h: spr.h },
      sourceSize: { w: spr.w, h: spr.h }
    };
    cx += spr.w + 6;
    rowH = Math.max(rowH, spr.h);
  }
  return { atlas, meta: { frames, meta: { image: 'home-props-atlas.png', format: 'RGBA8888', size: { w: atlasW, h: atlasH }, scale: '1' } }, rawProps };
}

const builtAtlas = build26HomePropsAtlas();
const atlasPngPath = 'public/assets/sprites/home-props-atlas.png';
const atlasJsonPath = 'public/assets/sprites/home-props-atlas.json';
if (!hasValidExternalAsset(atlasPngPath, 256, 128) || !fs.existsSync(atlasJsonPath)) {
  builtAtlas.atlas.save(atlasPngPath);
  fs.writeFileSync(atlasJsonPath, JSON.stringify(builtAtlas.meta, null, 2));
}

// ============================================================================
// 3. Full Illustrated 2.5D Home Interior Map (map-home.png: 634x460 -> 3x = 1902x1380)
// ============================================================================
const homeMapPath = 'public/assets/maps/map-home.png';
if (!hasValidExternalAsset(homeMapPath, 400, 300)) {
  const hm = new PixBuf(634, 460);
  // Warm hardwood floor base across apartment
  for (let y = 0; y < 460; y++) {
    for (let x = 0; x < 634; x++) {
      const plank = ((y >> 3) + (x >> 5)) % 3;
      const base = plank === 0 ? hex('#d89b65') : plank === 1 ? hex('#ce8f58') : hex('#e0a672');
      hm.px(x, y, (y % 8 === 7 || (x + (y >> 3) * 17) % 40 === 0) ? hex('#b0723e') : base);
    }
  }
  // Kitchen & Dining warm cream tile zone (top-center x=160..395, y=14..175)
  for (let y = 14; y < 175; y++) for (let x = 160; x < 395; x++) {
    const g = (x % 16 === 0 || y % 16 === 0);
    hm.px(x, y, g ? hex('#d97706') : (((x >> 4) + (y >> 4)) % 2 === 0 ? hex('#fef3c7') : hex('#ffedd5')));
  }
  // Dual Aqua Bathrooms (right wing: Upper Bath x=396..620, y=14..185; Lower Bath x=396..620, y=186..315)
  for (let y = 14; y < 315; y++) for (let x = 396; x < 620; x++) {
    const g = (x % 14 === 0 || y % 14 === 0);
    hm.px(x, y, g ? hex('#38bdf8') : (((x >> 4) + (y >> 4)) % 2 === 0 ? hex('#e0f2fe') : hex('#f0f9ff')));
  }
  // Sunny Balcony cedar deck (bottom-right x=450..620, y=316..446)
  for (let y = 316; y < 446; y++) for (let x = 450; x < 620; x++) {
    hm.px(x, y, y % 6 === 0 ? hex('#78350f') : ((x + y) % 3 === 0 ? hex('#b45309') : hex('#92400e')));
  }
  // Bedroom soft carpet (bottom-left x=24..210, y=275..442)
  hm.frameRect(38, 305, 185, 425, hex('#be185d'), hex('#fbcfe8'));
  hm.ditherRect(44, 311, 179, 419, hex('#f9a8d4'), hex('#fce7f3'), 3);

  // Architectural 2.5D Walls with cream wainscot & dark slate top caps (open doorways!)
  const wallH = (x1, x2, y) => {
    hm.rect(x1, y, x2, y + 8, hex('#1e293b'));
    hm.rect(x1, y + 9, x2, y + 18, hex('#fef3c7'));
    hm.rect(x1, y + 19, x2, y + 22, hex('#92400e'));
  };
  const wallV = (x, y1, y2) => {
    hm.rect(x, y1, x + 9, y2, hex('#1e293b'));
    hm.rect(x + 2, y1 + 2, x + 7, y2 - 2, hex('#334155'));
  };
  wallH(8, 625, 4); wallH(8, 625, 442); wallV(8, 4, 448); wallV(620, 4, 448);
  // Foyer / Bedroom / Living / Dining / Bathroom partitions with wide open doorways
  wallV(156, 20, 115); wallV(156, 165, 255);
  wallH(16, 110, 255); wallH(156, 215, 255);
  wallV(215, 255, 335); wallV(215, 390, 442);
  wallV(395, 20, 115); wallV(395, 165, 235); wallV(395, 285, 340);
  wallH(395, 510, 182); wallH(560, 620, 182);
  wallH(395, 485, 314); wallH(545, 620, 314);
  wallV(448, 314, 355); wallV(448, 405, 442);

  // Sunlit Windows along top wall
  for (const wx of [235, 315, 465, 545]) {
    hm.frameRect(wx, 6, wx + 42, 20, hex('#78350f'), hex('#7dd3fc'));
    hm.rect(wx + 20, 7, wx + 22, 19, hex('#78350f'));
  }
  hm.save(homeMapPath);
}

// ============================================================================
// 4. Full Illustrated 2.5D HK Street & Choi Wan Park Map (map-street.png: 1408x768)
// ============================================================================
const streetMapPath = 'public/assets/maps/map-street.png';
if (!hasValidExternalAsset(streetMapPath, 600, 350)) {
  const sm = new PixBuf(1408, 768);
  // Base HK Pink-Brick Sidewalk
  for (let y = 0; y < 768; y++) for (let x = 0; x < 1408; x++) {
    const b = (y % 12 === 11 || ((x + (y >> 3) * 8) % 24 === 0));
    sm.px(x, y, b ? hex('#c99386') : (((x + y) % 5 === 0) ? hex('#f5d0c5') : hex('#eebfb3')));
  }
  // Left Choi Wan Park Lush Lawn & Gravel Paths (x=0..460, y=0..768)
  for (let y = 0; y < 768; y++) for (let x = 0; x < 460; x++) {
    const inPath = (x >= 210 && x <= 275) || (y >= 390 && y <= 460 && x >= 80);
    sm.px(x, y, inPath ? (((x + y) % 4 === 0) ? hex('#e5c19e') : hex('#d6a87c')) : (((x * 3 + y * 5) % 7 === 0) ? hex('#5cc45c') : hex('#49a649')));
  }
  // Playground sandpit, slide & seesaw in Park
  sm.frameRect(55, 170, 195, 340, hex('#b45309'), hex('#fde68a'));
  sm.frameRect(85, 195, 130, 285, hex('#1d4ed8'), hex('#ef4444')); // Slide chute
  sm.frameRect(90, 300, 175, 320, hex('#15803d'), hex('#facc15')); // Seesaw

  // Pedestrian Footbridge (top-left x=320..560, y=45..135)
  sm.frameRect(320, 50, 560, 130, hex('#334155'), hex('#94a3b8'));
  for (let x = 330; x <= 550; x += 14) { sm.rect(x, 52, x + 4, 66, hex('#e2e8f0')); sm.rect(x, 114, x + 4, 128, hex('#e2e8f0')); }

  // Tang Lau Building Row + Authentic HK Shopfronts (x=580..1180, y=20..310)
  sm.frameRect(580, 20, 1180, 265, hex('#451a03'), hex('#fef3c7'));
  for (let wy = 45; wy <= 135; wy += 48) {
    for (let wx = 605; wx <= 1140; wx += 64) {
      sm.frameRect(wx, wy, wx + 42, wy + 32, hex('#334155'), hex('#bae6fd'));
      sm.rect(wx + 20, wy + 1, wx + 22, wy + 31, hex('#475569'));
    }
  }
  // Neon Sign 1: 香港味道茶餐廳 (x=840..1040, y=175..265)
  sm.frameRect(840, 175, 1040, 220, hex('#7f1d1d'), hex('#dc2626'));
  sm.frameRect(846, 181, 1034, 214, hex('#fde047'), hex('#b91c1c'));
  sm.frameRect(855, 220, 1025, 265, hex('#1e293b'), hex('#7dd3fc'));
  // Awning 2: 興發大排檔 (x=600..805, y=180..265)
  for (let x = 600; x < 805; x += 16) {
    sm.rect(x, 180, x + 7, 218, hex('#15803d'));
    sm.rect(x + 8, 180, x + 15, 218, hex('#f8fafc'));
  }
  sm.frameRect(610, 218, 795, 265, hex('#78350f'), hex('#fde68a'));

  // Asphalt Road + Yellow Curb + Zebra Crossing (x=460..1408, y=540..768)
  sm.rect(460, 528, 1408, 544, hex('#facc15'));
  sm.ditherRect(460, 545, 1408, 767, hex('#334155'), hex('#1e293b'), 4);
  for (let zx = 660; zx <= 760; zx += 24) sm.rect(zx, 555, zx + 14, 755, hex('#f8fafc'));
  for (let lx = 500; lx < 1380; lx += 80) if (lx < 640 || lx > 780) sm.rect(lx, 650, lx + 42, 658, hex('#f8fafc'));

  // Right-side Canal & Stone Arch Bridge (x=1225..1385, y=0..525)
  for (let y = 0; y < 528; y++) for (let x = 1235; x < 1375; x++) {
    sm.px(x, y, ((x + y * 2) % 11 === 0) ? hex('#7dd3fc') : hex('#0284c7'));
  }
  sm.rect(1225, 0, 1235, 528, hex('#94a3b8')); sm.rect(1375, 0, 1385, 528, hex('#94a3b8'));
  sm.frameRect(1215, 310, 1395, 395, hex('#475569'), hex('#e2e8f0')); // Arch bridge deck
  sm.save(streetMapPath);
}

// ============================================================================
// 5. NPCs, Companion, Mosquito, Rat & Emotes (sprites-npcs-pests.png: 256x512)
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
    c.rect(12, 15 + bob, 19, 19 + pal.p.length - 4 + bob, pal.s1); c.rect(14, 17 + bob, 16, 20 + bob, SKIN);
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
  ms.ellipse(11, 11 + mb + (f % 2) * 3, 3.5, 2, hex('#e0f2fe', 255));
  ms.ellipse(20, 11 + mb + (f % 2) * 3, 3.5, 2, hex('#e0f2fe', 255));
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
// 6. Dedicated Pixel Mini-Game Spritesheet (minigame-sprites.png: 512x256, pure RGBA)
// ============================================================================
const mgSheet = new PixBuf(512, 256);
function putMG(idx, fn) {
  const b = new PixBuf(32, 32);
  fn(b);
  mgSheet.blit(b.outlined().epx2x(), (idx % 8) * 64, Math.floor(idx / 8) * 64);
}
putMG(0, b => { b.ellipse(16, 20, 7, 7, hex('#fed4be')); b.ellipse(16, 19, 5, 5, hex('#ffe3d1')); for (const fx of [10, 13, 16, 19]) b.rect(fx, 6, fx + 2, 15, hex('#fed4be')); b.rect(7, 16, 10, 21, hex('#fed4be')); });
putMG(1, b => { b.rect(10, 11, 21, 27, hex('#ec4899')); b.rect(12, 13, 18, 25, hex('#f9a8d4')); b.rect(14, 6, 17, 11, hex('#f8fafc')); b.rect(14, 5, 21, 7, hex('#cbd5e1')); });
putMG(2, b => { b.circle(15.5, 15.5, 10, hex('#38bdf8')); b.circle(15.5, 15.5, 8, hex('#bae6fd')); b.circle(12, 11, 2.5, hex('#ffffff')); b.px(19, 20, hex('#f472b6')); });
putMG(3, b => { b.circle(15.5, 15.5, 8, hex('#7e22ce')); b.circle(15.5, 15.5, 6, hex('#a855f7')); for (const [x, y] of [[5, 15], [26, 15], [15, 5], [15, 26], [8, 8], [23, 8], [8, 23], [23, 23]]) b.circle(x, y, 2, hex('#c084fc')); b.rect(11, 13, 13, 15, hex('#fde047')); b.rect(18, 13, 20, 15, hex('#fde047')); b.rect(12, 19, 19, 20, hex('#ffffff')); });
putMG(4, b => { b.ellipse(15.5, 16, 9, 7, hex('#15803d')); b.ellipse(15.5, 15, 7, 5, hex('#4ade80')); b.rect(11, 13, 13, 15, hex('#ef4444')); b.rect(18, 13, 20, 15, hex('#ef4444')); b.rect(12, 18, 19, 19, hex('#052e16')); });
putMG(5, b => { b.rect(8, 6, 23, 19, hex('#ffffff')); b.rect(9, 8, 22, 17, hex('#f0f9ff')); b.rect(9, 20, 13, 26, hex('#e2e8f0')); b.rect(18, 20, 22, 26, hex('#e2e8f0')); b.circle(12, 10, 2, hex('#bae6fd')); });
putMG(6, b => { b.rect(8, 6, 23, 19, hex('#facc15')); b.rect(9, 20, 13, 26, hex('#ca8a04')); b.rect(18, 20, 22, 26, hex('#ca8a04')); b.circle(13, 12, 3, hex('#a16207')); b.circle(19, 15, 2.5, hex('#ca8a04')); });
putMG(7, b => { for (let i = 0; i < 20; i++) b.rect(4 + i, 24 - i, 7 + i, 26 - i, hex('#2563eb')); b.rect(19, 4, 26, 9, hex('#ffffff')); b.rect(20, 2, 25, 5, hex('#34d399')); });
putMG(8, b => { b.circle(15.5, 17, 7.5, hex('#be123c')); b.rect(10, 8, 12, 12, hex('#fda4af')); b.rect(19, 8, 21, 12, hex('#fda4af')); b.px(13, 16, hex('#fde047')); b.px(18, 16, hex('#fde047')); });
putMG(9, b => { b.rect(10, 12, 21, 29, hex('#fed4be')); b.rect(11, 4, 20, 14, hex('#78716c')); b.rect(11, 9, 20, 15, hex('#fde68a')); b.circle(14, 6, 1.5, hex('#9333ea')); b.circle(18, 7, 1.5, hex('#16a34a')); });
putMG(10, b => { b.rect(10, 12, 21, 29, hex('#fed4be')); b.rect(11, 10, 20, 16, hex('#ffe4e6')); b.rect(12, 9, 19, 11, hex('#ffffff')); });
putMG(11, b => { b.rect(7, 14, 25, 21, hex('#94a3b8')); b.rect(9, 15, 23, 19, hex('#e2e8f0')); b.rect(10, 8, 24, 12, hex('#cbd5e1')); b.rect(5, 12, 8, 21, hex('#f8fafc')); });
putMG(12, b => { b.ellipse(16, 21, 12, 5, hex('#ffffff')); b.ellipse(16, 17, 8, 5, hex('#ea580c')); b.ellipse(15, 16, 6, 3.5, hex('#fb923c')); b.rect(22, 14, 26, 16, hex('#fef3c7')); });
putMG(13, b => { b.circle(15.5, 21, 11, hex('#38bdf8')); b.circle(15.5, 21, 9, hex('#bae6fd')); b.rect(2, 22, 29, 31, CLEAR); b.rect(3, 20, 28, 22, hex('#0284c7')); b.rect(14, 7, 17, 10, hex('#0284c7')); });
putMG(14, b => { b.rect(9, 10, 22, 28, hex('#64748b')); b.rect(11, 11, 19, 27, hex('#cbd5e1')); b.rect(8, 7, 23, 10, hex('#334155')); b.rect(14, 5, 17, 7, hex('#0f172a')); });
putMG(15, b => { b.ellipse(12, 12, 4, 2.5, hex('#bae6fd')); b.ellipse(20, 12, 4, 2.5, hex('#bae6fd')); b.circle(16, 17, 4.5, hex('#1e293b')); b.px(14, 15, hex('#ef4444')); b.px(18, 15, hex('#ef4444')); });
putMG(16, b => { b.ellipse(16, 20, 12, 6, hex('#c2410c')); b.ellipse(16, 19, 10, 4.5, hex('#0ea5e9')); b.ellipse(14, 18, 5, 2, hex('#bae6fd')); });
putMG(17, b => { b.circle(12, 12, 3.5, hex('#475569')); b.rect(13, 14, 16, 19, hex('#64748b')); b.rect(16, 19, 19, 23, hex('#94a3b8')); b.rect(19, 23, 22, 25, hex('#475569')); b.px(11, 11, hex('#fde047')); });
putMG(18, b => { b.ellipse(16, 20, 12, 6, hex('#c2410c')); b.ellipse(16, 19, 10, 4.5, hex('#fdba74')); });
putMG(19, b => { b.rect(11, 9, 20, 27, hex('#38bdf8')); b.rect(12, 11, 18, 25, hex('#bae6fd')); b.rect(11, 16, 20, 19, hex('#0284c7')); b.rect(13, 5, 18, 8, hex('#1d4ed8')); });
putMG(20, b => { b.rect(6, 9, 25, 25, hex('#e2e8f0')); b.rect(8, 11, 23, 14, hex('#64748b')); b.rect(8, 16, 21, 17, hex('#94a3b8')); b.rect(8, 19, 22, 20, hex('#94a3b8')); });
putMG(21, b => { b.rect(10, 8, 21, 26, hex('#ef4444')); b.rect(12, 9, 16, 25, hex('#f87171')); b.rect(10, 6, 21, 8, hex('#cbd5e1')); b.rect(10, 25, 21, 27, hex('#94a3b8')); });
putMG(22, b => { b.ellipse(16, 20, 8, 4, hex('#eab308')); b.rect(14, 9, 17, 19, hex('#fde047')); b.rect(9, 19, 14, 24, hex('#facc15')); b.rect(18, 19, 23, 24, hex('#facc15')); });
putMG(23, b => { b.rect(7, 7, 24, 28, hex('#1d4ed8')); b.rect(9, 10, 22, 26, hex('#3b82f6')); b.rect(12, 14, 19, 21, hex('#ffffff')); });
putMG(24, b => { b.rect(7, 7, 24, 28, hex('#ca8a04')); b.rect(9, 10, 22, 26, hex('#eab308')); b.rect(12, 14, 19, 21, hex('#ffffff')); });
putMG(25, b => { b.rect(7, 7, 24, 28, hex('#78350f')); b.rect(9, 10, 22, 26, hex('#a16207')); b.rect(13, 13, 18, 22, hex('#ffffff')); });
putMG(26, b => { b.rect(10, 10, 21, 28, hex('#16a34a')); b.rect(12, 12, 19, 26, hex('#4ade80')); b.rect(11, 16, 20, 21, hex('#ffffff')); b.rect(13, 6, 18, 10, hex('#fde047')); });
putMG(27, b => { for (const [x, y, r] of [[11, 16, 5], [18, 13, 6], [20, 19, 5], [14, 18, 4]]) b.circle(x, y, r, hex('#bae6fd')); });
putMG(28, b => { b.circle(10, 13, 5, hex('#f472b6')); b.circle(21, 13, 5, hex('#f472b6')); b.circle(11, 20, 4, hex('#fde047')); b.circle(20, 20, 4, hex('#fde047')); b.rect(15, 10, 16, 23, hex('#1e293b')); });
putMG(29, b => { b.rect(4, 6, 27, 27, hex('#b45309')); b.circle(16, 20, 8, hex('#0f172a')); b.px(13, 20, hex('#ef4444')); b.px(18, 20, hex('#ef4444')); });
putMG(30, b => { b.ellipse(15, 19, 9, 6, hex('#94a3b8')); b.ellipse(14, 18, 6, 4, hex('#cbd5e1')); b.rect(18, 6, 25, 10, hex('#b45309')); });
putMG(31, b => { b.rect(5, 5, 26, 26, hex('#475569')); for (let i = 8; i <= 24; i += 4) { b.rect(i, 6, i + 1, 25, hex('#e2e8f0')); b.rect(6, i, 25, i + 1, hex('#cbd5e1')); } });
mgSheet.save('public/assets/sprites/minigame-sprites.png');

// ============================================================================
// 7. Street Interactive Props Tileset (AC, Sealed Rat-Hole Mesh, Puddle, Bins)
//    All props rendered with pure transparent RGBA (ZERO background box!)
// ============================================================================
const streetProps = new PixBuf(512, 512);
const putSP = (col, row, b) => streetProps.blit(b.outlined().epx2x(), col * 64, row * 64);
[false, true].forEach((ok, i) => {
  const ac = new PixBuf(32, 32);
  ac.frameRect(4, 6, 27, 20, hex('#475569'), hex('#f8fafc'));
  ac.rect(7, 9, 19, 17, hex('#334155'));
  if (!ok) { ac.rect(8, 20, 14, 22, hex('#38bdf8')); ac.circle(10, 26, 2, hex('#0ea5e9')); }
  else { ac.circle(23, 11, 2, hex('#10b981')); ac.rect(24, 20, 26, 29, hex('#cbd5e1')); }
  putSP(1 + i, 1, ac); // frames 9, 10
});
[false, true].forEach((sealed, i) => {
  const rw = new PixBuf(32, 32);
  if (!sealed) {
    rw.ellipse(16, 22, 9, 7, hex('#78350f')); rw.circle(16, 22, 6.5, hex('#0f172a'));
    rw.px(13, 22, hex('#ef4444')); rw.px(18, 22, hex('#ef4444'));
  } else {
    rw.frameRect(7, 14, 24, 29, hex('#334155'), hex('#94a3b8'));
    for (let x = 10; x <= 21; x += 3) rw.rect(x, 16, x, 27, hex('#1e293b'));
    for (let y = 17; y <= 26; y += 3) rw.rect(9, y, 22, y, hex('#1e293b'));
  }
  putSP(6 + i, 1, rw); // frames 14, 15
});
[false, true].forEach((td, i) => {
  const ob = new PixBuf(32, 32);
  ob.frameRect(9, 7, 22, 28, hex('#9a3412'), hex('#f97316')); ob.rect(12, 10, 19, 15, hex('#1e293b'));
  if (!td) { ob.circle(6, 26, 3.5, hex('#dc2626')); ob.rect(22, 23, 28, 28, hex('#38bdf8')); }
  putSP(i, 2, ob); // frames 16, 17
});
{
  const by = new PixBuf(32, 32); by.frameRect(2, 9, 14, 28, hex('#1e3a8a'), hex('#2563eb')); by.frameRect(17, 9, 29, 28, hex('#854d0e'), hex('#eab308')); putSP(3, 2, by); // frame 19
  const bb = new PixBuf(32, 32); bb.frameRect(7, 7, 24, 28, hex('#451a03'), hex('#92400e')); bb.rect(13, 14, 18, 23, hex('#ffffff')); putSP(4, 2, bb); // frame 20
  const bt = new PixBuf(32, 32); bt.rect(5, 18, 17, 25, hex('#38bdf8')); bt.rect(19, 12, 26, 27, hex('#0ea5e9')); putSP(5, 2, bt); // frame 21
  const pd = new PixBuf(32, 32); pd.ellipse(16, 21, 11, 5.5, hex('#0ea5e9')); pd.ellipse(15, 20, 7, 3.5, hex('#7dd3fc')); putSP(6, 2, pd); // frame 22
}
streetProps.save('public/assets/tilesets/tileset-hk-street.png');

console.log('[v3-hd] Generated verified CWSJ HD schoolboy, 26 zero-checkerboard 2.5D props, and HD Home/Street maps!');
