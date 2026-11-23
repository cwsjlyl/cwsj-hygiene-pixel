import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { CWSJ_ORIGINAL_LOGO_LG01_B64, decodeLg01ToPng } from './assets/cwsjOriginalLogo.mjs';
import { HOME_PROPS_PACK_A } from './assets/homePropsPackA.mjs';
import { HOME_PROPS_PACK_B } from './assets/homePropsPackB.mjs';
import { scale2xRgba, upscaleHdPixelArt } from './assets/lxp1Codec.mjs';
import { CWSJ_SCHOOLBOY_B64, verifyValidPngBuffer } from './assets/mapHomeData.mjs';
import { STREET_PROPS_PACK } from './assets/streetPropsStandalone.mjs';
import {
  decodePxg2ToRgba,
  HOME_PROPS_ATLAS_PXG2_B64,
  MAP_HOME_PXG2_B64,
  MAP_STREET_PXG2_B64
} from './assets/uploadedOriginalAssets.mjs';

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
  return Buffer.concat([
    sig,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

function writeBinaryPng(targetPath, pngBuf) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, pngBuf);
}

function parseRawPropBuffer(raw, expectedW, expectedH) {
  const magic = raw.subarray(0, 4).toString('ascii');
  if (magic === 'LXP1') {
    const w = raw.readUInt16BE(4);
    const h = raw.readUInt16BE(6);
    const totalPx = w * h;
    const nColors = raw[8] === 0 && raw.length >= 10 + 256 * 3 + totalPx ? 256 : raw[8];
    const transIdx = raw[9];
    const palOff = 10;
    const idxOff = palOff + nColors * 3;
    if (raw.length < idxOff + totalPx) {
      throw new Error(`Truncated LXP1 buffer: ${raw.length} < ${idxOff + totalPx}`);
    }
    const pal32 = new Uint32Array(256);
    const tmp = new Uint8Array(4);
    const tmp32 = new Uint32Array(tmp.buffer);
    for (let i = 0; i < nColors; i++) {
      if (i === transIdx) {
        pal32[i] = 0;
      } else {
        tmp[0] = raw[palOff + i * 3];
        tmp[1] = raw[palOff + i * 3 + 1];
        tmp[2] = raw[palOff + i * 3 + 2];
        tmp[3] = 255;
        pal32[i] = tmp32[0];
      }
    }
    const rgba = new Uint8Array(totalPx * 4);
    const out32 = new Uint32Array(rgba.buffer);
    for (let p = 0; p < totalPx; p++) {
      out32[p] = pal32[raw[idxOff + p]];
    }
    return { w, h, rgba };
  }

  if (expectedW && expectedH && raw.length >= expectedW * expectedH * 4) {
    const rgba = new Uint8Array(expectedW * expectedH * 4);
    rgba.set(raw.subarray(0, expectedW * expectedH * 4));
    return { w: expectedW, h: expectedH, rgba };
  }
  throw new Error(`Unsupported raw prop buffer: magic=${magic}, len=${raw.length}`);
}

function cropRgbaRegion(srcImg, rx, ry, rw, rh) {
  const rgba = new Uint8Array(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    const sy = Math.min(srcImg.h - 1, Math.max(0, ry + y));
    for (let x = 0; x < rw; x++) {
      const sx = Math.min(srcImg.w - 1, Math.max(0, rx + x));
      const si = (sy * srcImg.w + sx) * 4;
      const di = (y * rw + x) * 4;
      rgba[di] = srcImg.rgba[si];
      rgba[di + 1] = srcImg.rgba[si + 1];
      rgba[di + 2] = srcImg.rgba[si + 2];
      rgba[di + 3] = srcImg.rgba[si + 3];
    }
  }
  return { w: rw, h: rh, rgba };
}

function tryDecodePropResilient(item, fallbackFn) {
  const clean = item.b64.replace(/\s+/g, '');
  const buf = Buffer.from(clean, 'base64');

  // Tier 1: Standard strict zlib inflate
  try {
    const raw = zlib.inflateSync(buf);
    return { img: parseRawPropBuffer(raw, item.w, item.h), tier: 'lxp1-strict' };
  } catch {
    // proceed to Tier 2
  }

  // Tier 2: Raw DEFLATE stream bypassing 2B zlib header & 4B Adler-32 tail checksum
  try {
    const rawBody = buf.subarray(2, Math.max(2, buf.length - 4));
    const raw = zlib.inflateRawSync(rawBody, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
    return { img: parseRawPropBuffer(raw, item.w, item.h), tier: 'lxp1-raw-deflate' };
  } catch {
    // proceed to Tier 3
  }

  // Tier 3: Verified original atlas/map region crop fallback
  return { img: fallbackFn(), tier: 'atlas-crop-fallback' };
}

function cleanPureRgba(rgba) {
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] < 24) {
      rgba[i] = 0;
      rgba[i + 1] = 0;
      rgba[i + 2] = 0;
      rgba[i + 3] = 0;
    }
  }
  return rgba;
}

// ============================================================================
// 0. 100% 原裝校徽 CWSJ logo.png（2138 x 1233 逐像素無損輸出）
// ============================================================================
writeBinaryPng('public/assets/ui/cwsj-logo.png', decodeLg01ToPng(CWSJ_ORIGINAL_LOGO_LG01_B64, encodePNG));

// ============================================================================
// 1. V4 高清超解析度地圖管線 (Compact Home 1268x920 EPX-2x & HK Street 2816x1536 EPX-2x)
// ============================================================================
const rawHome1902 = decodePxg2ToRgba(MAP_HOME_PXG2_B64, (w, h, rgba) => ({ w, h, rgba }));
{
  const baseW = 634;
  const baseH = 460;
  const home634 = new Uint8Array(baseW * baseH * 4);
  for (let y = 0; y < baseH; y++) {
    const sy = Math.min(rawHome1902.h - 1, y * 3 + 1);
    for (let x = 0; x < baseW; x++) {
      const sx = Math.min(rawHome1902.w - 1, x * 3 + 1);
      const si = (sy * rawHome1902.w + sx) * 4;
      const di = (y * baseW + x) * 4;
      home634[di] = rawHome1902.rgba[si];
      home634[di + 1] = rawHome1902.rgba[si + 1];
      home634[di + 2] = rawHome1902.rgba[si + 2];
      home634[di + 3] = 255;
    }
  }
  const hdCompactHome = scale2xRgba(baseW, baseH, home634); // 1268 x 920
  writeBinaryPng('public/assets/maps/map-home.png', encodePNG(hdCompactHome.w, hdCompactHome.h, hdCompactHome.rgba));
}

const rawStreet1408 = decodePxg2ToRgba(MAP_STREET_PXG2_B64, (w, h, rgba) => ({ w, h, rgba }));
{
  const hdStreet = scale2xRgba(rawStreet1408.w, rawStreet1408.h, rawStreet1408.rgba); // 2816 x 1536
  writeBinaryPng('public/assets/maps/map-street.png', encodePNG(hdStreet.w, hdStreet.h, hdStreet.rgba));
}

// ============================================================================
// 1b. V4 26 件獨立家居家具 PNG + 圖集重建 & 12 件香港街道獨立物件 PNG（三層容錯解碼）
// ============================================================================
const existingAtlasJson = JSON.parse(fs.readFileSync('public/assets/sprites/home-props-atlas.json', 'utf8'));
const fallbackAtlasImg = decodePxg2ToRgba(HOME_PROPS_ATLAS_PXG2_B64, (w, h, rgba) => ({ w, h, rgba }));

const allHomePropPacks = { ...HOME_PROPS_PACK_A, ...HOME_PROPS_PACK_B };
const decodedHomeProps1x = {};
const tierStats = { 'lxp1-strict': 0, 'lxp1-raw-deflate': 0, 'atlas-crop-fallback': 0 };

for (const [name, item] of Object.entries(allHomePropPacks)) {
  const { img: decoded, tier } = tryDecodePropResilient(item, () => {
    const f = existingAtlasJson.frames[name]?.frame;
    if (!f) return { w: item.w, h: item.h, rgba: new Uint8Array(item.w * item.h * 4) };
    return cropRgbaRegion(fallbackAtlasImg, f.x, f.y, f.w, f.h);
  });
  tierStats[tier]++;
  cleanPureRgba(decoded.rgba);
  decodedHomeProps1x[name] = decoded;
  const hd2x = upscaleHdPixelArt(decoded, 1);
  cleanPureRgba(hd2x.rgba);
  writeBinaryPng(
    `public/assets/sprites/props-home/${name}.png`,
    encodePNG(hd2x.w, hd2x.h, hd2x.rgba)
  );
}

// 同步重建 home-props-atlas.png + home-props-atlas.json
{
  const atlasW = 1024;
  const atlasH = 512;
  const atlasRgba = new Uint8Array(atlasW * atlasH * 4);
  const frames = {};
  let cx = 4;
  let cy = 4;
  let rowH = 0;

  for (const [name, spr] of Object.entries(decodedHomeProps1x).sort((a, b) => b[1].h - a[1].h)) {
    if (cx + spr.w + 6 > atlasW) {
      cx = 4;
      cy += rowH + 6;
      rowH = 0;
    }
    for (let y = 0; y < spr.h; y++) {
      const srcOff = y * spr.w * 4;
      const dstOff = ((cy + y) * atlasW + cx) * 4;
      atlasRgba.set(spr.rgba.subarray(srcOff, srcOff + spr.w * 4), dstOff);
    }
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

  writeBinaryPng('public/assets/sprites/home-props-atlas.png', encodePNG(atlasW, atlasH, atlasRgba));
  const atlasMeta = {
    frames,
    meta: {
      app: 'cwsj-hygiene-pixel-v4-lxp1',
      version: '4.0',
      image: 'home-props-atlas.png',
      format: 'RGBA8888',
      size: { w: atlasW, h: atlasH },
      scale: '1'
    }
  };
  fs.mkdirSync('public/assets/sprites', { recursive: true });
  fs.writeFileSync('public/assets/sprites/home-props-atlas.json', JSON.stringify(atlasMeta, null, 2));
}

// 輸出 12 件 EPX-2x 香港街道獨立前景物件
const streetManifest = {};
for (const [name, item] of Object.entries(STREET_PROPS_PACK)) {
  const { img: decoded, tier } = tryDecodePropResilient(item, () =>
    cropRgbaRegion(rawStreet1408, item.x, item.y, item.w, item.h)
  );
  tierStats[tier]++;
  cleanPureRgba(decoded.rgba);
  const hd2x = upscaleHdPixelArt(decoded, 1);
  cleanPureRgba(hd2x.rgba);
  writeBinaryPng(
    `public/assets/sprites/props-street/${name}.png`,
    encodePNG(hd2x.w, hd2x.h, hd2x.rgba)
  );
  streetManifest[name] = { x: item.x, y: item.y, w: item.w, h: item.h };
}
fs.writeFileSync('public/assets/sprites/street-props-manifest.json', JSON.stringify(streetManifest, null, 2));
console.log('[v4-prop-tiers]', JSON.stringify(tierStats));

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
    writeBinaryPng(fp, encodePNG(this.w, this.h, this.data));
  }
}

// ============================================================================
// 2. Protagonist: CWSJ HD Schoolboy Sheet (256x336 4x4, 64x84 per frame) + UI Portrait
// ============================================================================
function drawSchoolboyFrame32x42(dirRow, col) {
  let b = new PixBuf(32, 42);
  const SKIN = hex('#fed4be');
  const SKIN_SH = hex('#f3b698');
  const HAIR = hex('#27202b');
  const HAIR_HI = hex('#3f3446');
  const SHIRT = hex('#ffffff');
  const SHIRT_SH = hex('#e2e8f0');
  const COLLAR = hex('#1d4ed8');
  const PANTS = hex('#1e3a8a');
  const PANTS_SH = hex('#172554');
  const SOCK = hex('#f8fafc');
  const SHOE = hex('#18181b');
  const EYE = hex('#18181b');

  const bob = (col === 1 || col === 3) ? -1 : 0;
  const step = col === 1 ? -2 : (col === 3 ? 2 : 0);

  if (dirRow === 0 || dirRow === 3) {
    const lY = 33 + bob + (step < 0 ? -1 : 0);
    const rY = 33 + bob + (step > 0 ? -1 : 0);
    b.rect(11, 28 + bob, 14, lY, SKIN);
    b.rect(17, 28 + bob, 20, rY, SKIN);
    b.rect(11, lY, 14, lY + 2, SOCK);
    b.rect(17, rY, 20, rY + 2, SOCK);
    b.rect(10, lY + 3, 14, lY + 4, SHOE);
    b.rect(17, rY + 3, 21, rY + 4, SHOE);
    b.rect(10, 23 + bob, 21, 28 + bob, PANTS);
    b.rect(15, 25 + bob, 16, 28 + bob, PANTS_SH);
    b.rect(9, 15 + bob, 22, 23 + bob, SHIRT_SH);
    b.rect(10, 15 + bob, 21, 22 + bob, SHIRT);
    const armSwing = step;
    b.rect(7, 15 + bob, 9, 18 + bob, SHIRT);
    b.rect(22, 15 + bob, 24, 18 + bob, SHIRT);
    b.rect(7, 19 + bob + (armSwing > 0 ? -1 : 0), 9, 23 + bob, SKIN);
    b.rect(22, 19 + bob + (armSwing < 0 ? -1 : 0), 24, 23 + bob, SKIN);
    if (dirRow === 0) {
      b.rect(13, 15 + bob, 18, 16 + bob, COLLAR);
      b.rect(15, 16 + bob, 16, 20 + bob, COLLAR);
      b.px(18, 18 + bob, hex('#ef4444'));
      b.px(19, 18 + bob, hex('#facc15'));
    }
    b.rect(9, 5 + bob, 22, 14 + bob, SKIN);
    b.rect(9, 13 + bob, 22, 14 + bob, SKIN_SH);
    b.rect(8, 3 + bob, 23, 8 + bob, HAIR);
    b.rect(10, 4 + bob, 16, 5 + bob, HAIR_HI);
    if (dirRow === 0) {
      b.px(9, 8 + bob, HAIR); b.px(22, 8 + bob, HAIR);
      b.rect(11, 9 + bob, 12, 11 + bob, EYE);
      b.rect(19, 9 + bob, 20, 11 + bob, EYE);
      b.px(11, 9 + bob, hex('#ffffff')); b.px(19, 9 + bob, hex('#ffffff'));
      b.rect(14, 12 + bob, 17, 12 + bob, hex('#e17065'));
    } else {
      b.rect(8, 3 + bob, 23, 12 + bob, HAIR);
      b.rect(11, 5 + bob, 18, 6 + bob, HAIR_HI);
    }
  } else {
    const fX = 13 + step;
    const bX = 15 - step;
    b.rect(bX, 28 + bob, bX + 3, 33 + bob, SKIN_SH);
    b.rect(bX, 33 + bob, bX + 3, 35 + bob, SOCK);
    b.rect(bX - 1, 36 + bob, bX + 3, 37 + bob, SHOE);

    b.rect(fX, 28 + bob, fX + 3, 33 + bob, SKIN);
    b.rect(fX, 33 + bob, fX + 3, 35 + bob, SOCK);
    b.rect(fX - 1, 36 + bob, fX + 3, 37 + bob, SHOE);

    b.rect(11, 23 + bob, 20, 28 + bob, PANTS);
    b.rect(11, 15 + bob, 20, 23 + bob, SHIRT);
    b.rect(12, 15 + bob, 15, 16 + bob, COLLAR);
    b.rect(14 - Math.sign(step), 16 + bob, 17 - Math.sign(step), 19 + bob, SHIRT_SH);
    b.rect(14 - Math.sign(step), 20 + bob, 16 - Math.sign(step), 23 + bob, SKIN);
    b.rect(10, 5 + bob, 20, 14 + bob, SKIN);
    b.rect(9, 3 + bob, 22, 8 + bob, HAIR);
    b.rect(16, 7 + bob, 22, 12 + bob, HAIR);
    b.rect(12, 4 + bob, 17, 5 + bob, HAIR_HI);
    b.rect(11, 9 + bob, 12, 11 + bob, EYE);
    b.px(11, 12 + bob, hex('#e17065'));
    if (dirRow === 2) b = b.flipH();
  }
  return b.withGroundShadow(9, 23, 36, 40, 95).epx2x();
}

const heroTarget = 'public/assets/sprites/char-cwsj-schoolboy.png';
const b64Buf = Buffer.from(CWSJ_SCHOOLBOY_B64, 'base64');
if (verifyValidPngBuffer(b64Buf, 256, 336)) {
  writeBinaryPng(heroTarget, b64Buf);
} else {
  const heroSheet = new PixBuf(256, 336);
  for (let row = 0; row < 4; row++) {
    for (let col = 0; col < 4; col++) {
      heroSheet.blit(drawSchoolboyFrame32x42(row, col), col * 64, row * 84);
    }
  }
  heroSheet.save(heroTarget);
}

{
  const f0 = drawSchoolboyFrame32x42(0, 0);
  const portrait = new PixBuf(128, 128);
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const c = f0.get(x, Math.min(83, y + 2));
      if (c[3] === 0) continue;
      portrait.px(x * 2, y * 2, c);
      portrait.px(x * 2 + 1, y * 2, c);
      portrait.px(x * 2, y * 2 + 1, c);
      portrait.px(x * 2 + 1, y * 2 + 1, c);
    }
  }
  portrait.save('public/assets/ui/portrait-student-boy.png');
}

// ============================================================================
// 3. NPCs, Companion, Mosquito, Rat & Emotes (sprites-npcs-pests.png: 256x512)
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
// 4. Dedicated Pixel Mini-Game Spritesheet (minigame-sprites.png: 512x256, pure RGBA)
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
// 5. Street Interactive Props Tileset (AC, Sealed Rat-Hole Mesh, Puddle, Bins)
// ============================================================================
const streetProps = new PixBuf(512, 512);
const putSP = (col, row, b) => streetProps.blit(b.outlined().epx2x(), col * 64, row * 64);
[false, true].forEach((ok, i) => {
  const ac = new PixBuf(32, 32);
  ac.frameRect(4, 6, 27, 20, hex('#475569'), hex('#f8fafc'));
  ac.rect(7, 9, 19, 17, hex('#334155'));
  if (!ok) { ac.rect(8, 20, 14, 22, hex('#38bdf8')); ac.circle(10, 26, 2, hex('#0ea5e9')); }
  else { ac.circle(23, 11, 2, hex('#10b981')); ac.rect(24, 20, 26, 29, hex('#cbd5e1')); }
  putSP(1 + i, 1, ac);
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
  putSP(6 + i, 1, rw);
});
[false, true].forEach((td, i) => {
  const ob = new PixBuf(32, 32);
  ob.frameRect(9, 7, 22, 28, hex('#9a3412'), hex('#f97316')); ob.rect(12, 10, 19, 15, hex('#1e293b'));
  if (!td) { ob.circle(6, 26, 3.5, hex('#dc2626')); ob.rect(22, 23, 28, 28, hex('#38bdf8')); }
  putSP(i, 2, ob);
});
{
  const by = new PixBuf(32, 32); by.frameRect(2, 9, 14, 28, hex('#1e3a8a'), hex('#2563eb')); by.frameRect(17, 9, 29, 28, hex('#854d0e'), hex('#eab308')); putSP(3, 2, by);
  const bb = new PixBuf(32, 32); bb.frameRect(7, 7, 24, 28, hex('#451a03'), hex('#92400e')); bb.rect(13, 14, 18, 23, hex('#ffffff')); putSP(4, 2, bb);
  const bt = new PixBuf(32, 32); bt.rect(5, 18, 17, 25, hex('#38bdf8')); bt.rect(19, 12, 26, 27, hex('#0ea5e9')); putSP(5, 2, bt);
  const pd = new PixBuf(32, 32); pd.ellipse(16, 21, 11, 5.5, hex('#0ea5e9')); pd.ellipse(15, 20, 7, 3.5, hex('#7dd3fc')); putSP(6, 2, pd);
}
streetProps.save('public/assets/tilesets/tileset-hk-street.png');

// ============================================================================
// 6. V4 建置期完整性強制驗證（11 核心圖檔 + 26 獨立家居物件 + 12 獨立香港街道物件 = 49 檔案）
// ============================================================================
const requiredAssets = [
  'public/assets/ui/cwsj-logo.png',
  'public/assets/ui/portrait-student-boy.png',
  'public/assets/maps/map-home.png',
  'public/assets/maps/map-street.png',
  'public/assets/sprites/home-props-atlas.png',
  'public/assets/sprites/home-props-atlas.json',
  'public/assets/sprites/street-props-manifest.json',
  'public/assets/sprites/char-cwsj-schoolboy.png',
  'public/assets/sprites/sprites-npcs-pests.png',
  'public/assets/sprites/minigame-sprites.png',
  'public/assets/tilesets/tileset-hk-street.png',
  ...Object.keys(allHomePropPacks).map((k) => `public/assets/sprites/props-home/${k}.png`),
  ...Object.keys(STREET_PROPS_PACK).map((k) => `public/assets/sprites/props-street/${k}.png`)
];
for (const rp of requiredAssets) {
  if (!fs.existsSync(rp) || fs.statSync(rp).size < 64) {
    throw new Error(`Missing or invalid required V4 asset: ${rp}`);
  }
}
console.log(`[v4-verified] All ${requiredAssets.length} V4 HD assets verified successfully!`);
