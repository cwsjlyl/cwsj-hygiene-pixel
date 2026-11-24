// v8 iPad Crisp HD Assets & Full-Color Character Spritesheets Pipeline
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {
  STREET_CLEAN_WEBP_B64,
  STREET_CLEAN_WEBP_BYTES,
  STREET_CLEAN_WEBP_CRC32,
  STREET_PROPS_V7_FRAMES
} from './assets/v7StreetPropsWebp.mjs';

const MAPS_OUT = path.resolve('public/assets/maps');
const SPRITES_OUT = path.resolve('public/assets/sprites');
const RUNTIME_CFG_PATH = path.resolve('src/gfx/v5RuntimeConfig.ts');

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c >>> 0;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaPng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = w * 4 + 1;
  const raw = Buffer.alloc(stride * h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * stride;
    raw[rowOff] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, rowOff + 1);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0))
  ]);
}

function verifyPngFile(filePath, expectedW, expectedH) {
  const buf = fs.readFileSync(filePath);
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedW || h !== expectedH) {
    throw new Error(`[v8-verify] ${path.basename(filePath)} size ${w}x${h} !== ${expectedW}x${expectedH}`);
  }
  const idats = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    if (type === 'IDAT') idats.push(buf.subarray(off + 8, off + 8 + len));
    if (type === 'IEND') break;
    off += 12 + len;
  }
  zlib.inflateSync(Buffer.concat(idats));
  return buf.length;
}

function hexToRgba(hex) {
  const v = parseInt(hex.replace('#', ''), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255, 255];
}

class TinyCanvas {
  constructor(w, h) {
    this.w = w;
    this.h = h;
    this.data = new Uint8Array(w * h * 4);
  }
  pset(x, y, rgba) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.w || iy < 0 || iy >= this.h) return;
    const i = (iy * this.w + ix) * 4;
    this.data[i] = rgba[0];
    this.data[i + 1] = rgba[1];
    this.data[i + 2] = rgba[2];
    this.data[i + 3] = rgba[3];
  }
  rect(x, y, w, h, hex) {
    const c = Array.isArray(hex) ? hex : hexToRgba(hex);
    for (let dy = 0; dy < h; dy++) {
      for (let dx = 0; dx < w; dx++) {
        this.pset(x + dx, y + dy, c);
      }
    }
  }
  ellipse(cx, cy, rx, ry, hex) {
    const c = Array.isArray(hex) ? hex : hexToRgba(hex);
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const nx = (x - cx) / rx;
        const ny = (y - cy) / ry;
        if (nx * nx + ny * ny <= 1.0) this.pset(x, y, c);
      }
    }
  }
  addDarkOutline(outlineHex = '#1a1626') {
    const oc = hexToRgba(outlineHex);
    const copy = new Uint8Array(this.data);
    const isOpaque = (x, y) => {
      if (x < 0 || x >= this.w || y < 0 || y >= this.h) return false;
      return copy[(y * this.w + x) * 4 + 3] > 200;
    };
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = (y * this.w + x) * 4;
        if (copy[i + 3] === 0) {
          if (isOpaque(x - 1, y) || isOpaque(x + 1, y) || isOpaque(x, y - 1) || isOpaque(x, y + 1)) {
            this.data[i] = oc[0];
            this.data[i + 1] = oc[1];
            this.data[i + 2] = oc[2];
            this.data[i + 3] = 255;
          }
        }
      }
    }
  }
}

function epx2x(src, w, h) {
  const dw = w * 2;
  const dh = h * 2;
  const dst = new Uint8Array(dw * dh * 4);
  const px = (x, y) => {
    const cx = Math.max(0, Math.min(w - 1, x));
    const cy = Math.max(0, Math.min(h - 1, y));
    const i = (cy * w + cx) * 4;
    return ((src[i] << 24) | (src[i + 1] << 16) | (src[i + 2] << 8) | src[i + 3]) >>> 0;
  };
  const write = (dx, dy, u32) => {
    const i = (dy * dw + dx) * 4;
    dst[i] = (u32 >>> 24) & 255;
    dst[i + 1] = (u32 >>> 16) & 255;
    dst[i + 2] = (u32 >>> 8) & 255;
    dst[i + 3] = u32 & 255;
  };
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const P = px(x, y);
      const A = px(x, y - 1);
      const B = px(x + 1, y);
      const C = px(x - 1, y);
      const D = px(x, y + 1);
      let p1 = P, p2 = P, p3 = P, p4 = P;
      if (C === A && C !== D && A !== B) p1 = A;
      if (A === B && A !== C && B !== D) p2 = B;
      if (D === C && D !== B && C !== A) p3 = C;
      if (B === D && B !== A && D !== C) p4 = D;
      write(x * 2, y * 2, p1);
      write(x * 2 + 1, y * 2, p2);
      write(x * 2, y * 2 + 1, p3);
      write(x * 2 + 1, y * 2 + 1, p4);
    }
  }
  return { w: dw, h: dh, data: dst };
}

/**
 * Renders a 4-direction x 4-frame (448x592, 112x148 per frame) NDS-style pixel-art character sheet.
 * Row 0: down, Row 1: left, Row 2: right, Row 3: up
 */
function buildCrisp4DirCharacterPng(spec) {
  const fw = 28;
  const fh = 37;
  const sheetW = 448;
  const sheetH = 592;
  const sheet = new Uint8Array(sheetW * sheetH * 4);

  const dirs = ['down', 'left', 'right', 'up'];
  for (let row = 0; row < 4; row++) {
    const dir = dirs[row];
    for (let col = 0; col < 4; col++) {
      const c = new TinyCanvas(fw, fh);
      const bob = (col === 0 || col === 2) ? -1 : 0;
      const stepPhase = col === 0 ? -1 : col === 2 ? 1 : 0;

      // 1. Character body (drawn before outline pass)
      const headY = 6 + bob;
      const torsoY = 17 + bob;
      const legY = 27 + bob;

      // Back hair / bun (for Mom / Sister)
      if (spec.hasBun) {
        if (dir === 'up') c.ellipse(14, headY - 2, 4.2, 3.2, spec.hairDark);
        else if (dir === 'left') c.ellipse(19, headY + 1, 3.2, 3.2, spec.hairDark);
        else if (dir === 'right') c.ellipse(9, headY + 1, 3.2, 3.2, spec.hairDark);
        else c.ellipse(14, headY - 2, 3.6, 2.4, spec.hairDark);
      }

      // Legs & Shoes
      if (dir === 'down' || dir === 'up') {
        const lOff = stepPhase === -1 ? -1 : stepPhase === 1 ? 1 : 0;
        const rOff = -lOff;
        c.rect(10, legY, 3, 5 + Math.max(0, lOff), spec.legColor);
        c.rect(15, legY, 3, 5 + Math.max(0, rOff), spec.legColor);
        c.rect(9, legY + 5 + Math.max(0, lOff), 4, 2, spec.shoeColor);
        c.rect(15, legY + 5 + Math.max(0, rOff), 4, 2, spec.shoeColor);
      } else {
        const stride = stepPhase * 2;
        c.rect(12 - stride, legY, 3, 5, spec.legShadow);
        c.rect(11 - stride, legY + 5, 4, 2, spec.shoeColor);
        c.rect(12 + stride, legY, 4, 5, spec.legColor);
        c.rect(12 + stride + (dir === 'right' ? 1 : -1), legY + 5, 4, 2, spec.shoeColor);
      }

      // Torso / Dress / Shirt
      if (spec.hasSkirt) {
        c.rect(9, torsoY, 10, 6, spec.topColor);
        c.rect(9, torsoY + 4, 10, 2, spec.topShadow);
        c.rect(8, torsoY + 6, 12, 5, spec.skirtColor);
        c.rect(8, torsoY + 10, 12, 1, spec.skirtShadow);
        if (spec.hasApron && dir !== 'up') {
          const ax = dir === 'left' ? 9 : dir === 'right' ? 13 : 10;
          const aw = (dir === 'left' || dir === 'right') ? 6 : 8;
          c.rect(ax, torsoY + 2, aw, 8, '#f8fafc');
          c.rect(ax, torsoY + 9, aw, 1, '#cbd5e1');
        }
        if (dir === 'down') {
          c.rect(12, torsoY, 4, 2, '#fff1f2');
        }
      } else {
        c.rect(9, torsoY, 10, 9, spec.topColor);
        c.rect(9, torsoY + 7, 10, 2, spec.topShadow);
        c.rect(9, torsoY + 9, 10, 2, '#334155');
        if (dir === 'down') {
          c.rect(12, torsoY, 4, 2, '#ffffff');
          c.rect(13, torsoY + 2, 2, 4, spec.topAccent);
        }
      }

      // Arms (with natural swing)
      const armSwing = stepPhase * 2;
      if (dir === 'down' || dir === 'up') {
        c.rect(7, torsoY + 1 + armSwing, 2, 6, spec.topColor);
        c.rect(7, torsoY + 6 + armSwing, 2, 2, spec.skinColor);
        c.rect(19, torsoY + 1 - armSwing, 2, 6, spec.topColor);
        c.rect(19, torsoY + 6 - armSwing, 2, 2, spec.skinColor);
      } else {
        const armX = dir === 'left' ? 13 + armSwing : 12 - armSwing;
        c.rect(armX, torsoY + 1, 3, 6, spec.topShadow);
        c.rect(armX, torsoY + 6, 3, 2, spec.skinColor);
      }

      // Neck & Head
      c.rect(12, headY + 10, 4, 2, spec.skinShadow);
      c.ellipse(14, headY + 5, 6.2, 5.8, spec.skinColor);
      c.rect(9, headY + 8, 10, 2, spec.skinColor);

      // Hair & Facial Features by direction
      if (dir === 'down') {
        c.ellipse(14, headY + 2, 6.6, 4.0, spec.hairColor);
        c.rect(8, headY + 2, 2, 5, spec.hairColor);
        c.rect(18, headY + 2, 2, 5, spec.hairColor);
        c.rect(11, headY + 1, 5, 2, spec.hairLight);
        // Eyes, blush & gentle smile
        c.rect(10, headY + 5, 2, 2, '#1e1b4b');
        c.rect(16, headY + 5, 2, 2, '#1e1b4b');
        c.pset(10, headY + 5, [255, 255, 255, 255]);
        c.pset(16, headY + 5, [255, 255, 255, 255]);
        c.pset(9, headY + 7, hexToRgba('#fda4af'));
        c.pset(18, headY + 7, hexToRgba('#fda4af'));
        c.rect(13, headY + 8, 2, 1, '#be123c');
      } else if (dir === 'up') {
        c.ellipse(14, headY + 5, 6.6, 5.8, spec.hairColor);
        c.rect(9, headY + 6, 10, 4, spec.hairDark);
        c.rect(11, headY + 2, 6, 2, spec.hairLight);
      } else if (dir === 'left') {
        c.ellipse(15, headY + 2, 6.2, 4.0, spec.hairColor);
        c.rect(14, headY + 2, 6, 7, spec.hairColor);
        c.rect(16, headY + 5, 4, 4, spec.hairDark);
        c.rect(12, headY + 1, 4, 2, spec.hairLight);
        c.rect(10, headY + 5, 2, 2, '#1e1b4b');
        c.pset(10, headY + 5, [255, 255, 255, 255]);
        c.pset(11, headY + 7, hexToRgba('#fda4af'));
        c.pset(10, headY + 8, hexToRgba('#be123c'));
      } else {
        c.ellipse(13, headY + 2, 6.2, 4.0, spec.hairColor);
        c.rect(8, headY + 2, 6, 7, spec.hairColor);
        c.rect(8, headY + 5, 4, 4, spec.hairDark);
        c.rect(12, headY + 1, 4, 2, spec.hairLight);
        c.rect(16, headY + 5, 2, 2, '#1e1b4b');
        c.pset(17, headY + 5, [255, 255, 255, 255]);
        c.pset(16, headY + 7, hexToRgba('#fda4af'));
        c.pset(17, headY + 8, hexToRgba('#be123c'));
      }

      // Crisp pixel-art dark outline
      c.addDarkOutline('#1a1528');

      // Soft ground shadow underneath feet
      for (let sy = 33; sy <= 35; sy++) {
        for (let sx = 8; sx <= 19; sx++) {
          const nx = (sx - 13.5) / 6.0;
          const ny = (sy - 34) / 1.6;
          if (nx * nx + ny * ny <= 1.0) {
            const idx = (sy * fw + sx) * 4;
            if (c.data[idx + 3] === 0) {
              c.data[idx] = 15;
              c.data[idx + 1] = 23;
              c.data[idx + 2] = 42;
              c.data[idx + 3] = 95;
            }
          }
        }
      }

      // Smooth 4x pixel-art upscale (28x37 -> 56x74 -> 112x148) via two EPX passes
      const pass1 = epx2x(c.data, fw, fh);
      const pass2 = epx2x(pass1.data, pass1.w, pass1.h);

      const ox = col * 112;
      const oy = row * 148;
      for (let y = 0; y < 148; y++) {
        const srcOff = y * 112 * 4;
        const dstOff = ((oy + y) * sheetW + ox) * 4;
        sheet.set(pass2.data.subarray(srcOff, srcOff + 112 * 4), dstOff);
      }
    }
  }

  return encodeRgbaPng(sheetW, sheetH, sheet);
}

// 1. Clean up redundant PNGs while keeping FULL HD 1408x768 map-street.png & 1024x512 home-props-atlas.png
function cleanMapsAndHomeProps() {
  // Keep map-home.webp (42.5 KB verified), remove redundant map-home.png
  const homePng = path.join(MAPS_OUT, 'map-home.png');
  const homeWebp = path.join(MAPS_OUT, 'map-home.webp');
  if (fs.existsSync(homeWebp) && fs.existsSync(homePng)) {
    fs.unlinkSync(homePng);
  }

  // Keep FULL HD 1408x768 map-street.png from generate-pixel-assets.mjs, remove broken map-street.webp
  const streetWebp = path.join(MAPS_OUT, 'map-street.webp');
  if (fs.existsSync(streetWebp)) fs.unlinkSync(streetWebp);
  const streetBytes = verifyPngFile(path.join(MAPS_OUT, 'map-street.png'), 1408, 768);
  console.log(`[v8-street-hd] Verified FULL HD map-street.png (1408x768, ${(streetBytes / 1024).toFixed(1)} KB)`);

  // Keep FULL HD 1024x512 home-props-atlas.png + json from generate-pixel-assets.mjs, remove blurry 256x118 webp & loose props-home dir
  const homePropsWebp = path.join(SPRITES_OUT, 'home-props-atlas.webp');
  if (fs.existsSync(homePropsWebp)) fs.unlinkSync(homePropsWebp);
  const propsHomeDir = path.join(SPRITES_OUT, 'props-home');
  if (fs.existsSync(propsHomeDir)) fs.rmSync(propsHomeDir, { recursive: true, force: true });
  const propsStreetDir = path.join(SPRITES_OUT, 'props-street');
  if (fs.existsSync(propsStreetDir)) fs.rmSync(propsStreetDir, { recursive: true, force: true });

  const hpBytes = verifyPngFile(path.join(SPRITES_OUT, 'home-props-atlas.png'), 1024, 512);
  console.log(`[v8-home-props-hd] Verified FULL HD home-props-atlas.png (1024x512, ${(hpBytes / 1024).toFixed(1)} KB)`);
}

// 2. Build full-color 448x592 PNG spritesheets for Mom & Passerby (fixes black silhouettes 100%)
function buildFullColorCharacterSheets() {
  const momPng = buildCrisp4DirCharacterPng({
    hairColor: '#6b3e26',
    hairDark: '#4a2816',
    hairLight: '#8c5538',
    skinColor: '#ffd7ba',
    skinShadow: '#eab38f',
    topColor: '#f472b6',
    topShadow: '#db2777',
    topAccent: '#fbcfe8',
    skirtColor: '#fde68a',
    skirtShadow: '#f59e0b',
    legColor: '#ffd7ba',
    legShadow: '#eab38f',
    shoeColor: '#9f1239',
    hasBun: true,
    hasSkirt: true,
    hasApron: true
  });

  const passerbyPng = buildCrisp4DirCharacterPng({
    hairColor: '#475569',
    hairDark: '#1e293b',
    hairLight: '#94a3b8',
    skinColor: '#f5cba7',
    skinShadow: '#d9a47c',
    topColor: '#38bdf8',
    topShadow: '#0284c7',
    topAccent: '#bae6fd',
    skirtColor: '#475569',
    skirtShadow: '#334155',
    legColor: '#64748b',
    legShadow: '#475569',
    shoeColor: '#292524',
    hasBun: false,
    hasSkirt: false,
    hasApron: false
  });

  for (const stale of ['char-v5-mom.webp', 'char-v5-passerby.webp']) {
    const p = path.join(SPRITES_OUT, stale);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  const momOut = path.join(SPRITES_OUT, 'char-v5-mom.png');
  const passerbyOut = path.join(SPRITES_OUT, 'char-v5-passerby.png');
  fs.writeFileSync(momOut, momPng);
  fs.writeFileSync(passerbyOut, passerbyPng);
  verifyPngFile(momOut, 448, 592);
  verifyPngFile(passerbyOut, 448, 592);
  console.log(
    `[v8-chars] Verified full-color char-v5-mom.png (${(momPng.length / 1024).toFixed(1)} KB) & char-v5-passerby.png (${(passerbyPng.length / 1024).toFixed(1)} KB)`
  );
}

// 3. Build CRC32-verified 256x256 pure-transparent street-props-atlas.webp + JSON
function buildVerifiedStreetPropsAtlas() {
  const webpBuf = Buffer.from(STREET_CLEAN_WEBP_B64, 'base64');
  const actualCrc = crc32(webpBuf);
  if (webpBuf.length !== STREET_CLEAN_WEBP_BYTES || actualCrc !== STREET_CLEAN_WEBP_CRC32) {
    throw new Error(`[v8-street-props] Checksum mismatch: 0x${actualCrc.toString(16)}`);
  }
  const stalePng = path.join(SPRITES_OUT, 'street-props-atlas.png');
  if (fs.existsSync(stalePng)) fs.unlinkSync(stalePng);

  fs.writeFileSync(path.join(SPRITES_OUT, 'street-props-atlas.webp'), webpBuf);
  const frames = {};
  for (const [key, r] of Object.entries(STREET_PROPS_V7_FRAMES)) {
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h }
    };
  }
  fs.writeFileSync(
    path.join(SPRITES_OUT, 'street-props-atlas.json'),
    JSON.stringify({
      frames,
      meta: { app: 'cwsj-v8-street-props', image: 'street-props-atlas.webp', size: { w: 256, h: 256 }, scale: '1' }
    })
  );
  return Object.keys(frames);
}

function syncRuntimeConfig(validStreetKeys) {
  const tsContent =
    `// Auto-generated by scripts/v8IpadCrispPipeline.mjs\n` +
    `export const V5_HOME_MAP_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V5_HOME_NATIVE_1X: boolean = true;\n` +
    `export const V5_STREET_MAP_EXT: 'png' | 'webp' = 'png';\n` +
    `export const V5_STREET_NATIVE_1X: boolean = false;\n` +
    `export const V5_HD_CHARS_ENABLED: boolean = true;\n` +
    `export const V5_HD_CHARS_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V8_CHAR_MOM_EXT: 'png' | 'webp' = 'png';\n` +
    `export const V8_CHAR_PASSERBY_EXT: 'png' | 'webp' = 'png';\n` +
    `export const V6_HOME_PROPS_EXT: 'png' | 'webp' = 'png';\n` +
    `export const V6_HOME_PROPS_SCALE: number = 1;\n` +
    `export const V6_STREET_PROPS_ATLAS: boolean = true;\n` +
    `export const V6_STREET_PROPS_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V6_LIGHT_STREET_TILES: boolean = false;\n` +
    `export const V6_LIGHT_MG_NPCS: boolean = false;\n` +
    `export const V5_VALID_STREET_PROPS: readonly string[] = ${JSON.stringify(validStreetKeys)};\n`;
  fs.writeFileSync(RUNTIME_CFG_PATH, tsContent);
  console.log('[v8-runtime-cfg] Synced src/gfx/v5RuntimeConfig.ts');
}

cleanMapsAndHomeProps();
buildFullColorCharacterSheets();
const validKeys = buildVerifiedStreetPropsAtlas();
syncRuntimeConfig(validKeys);
