// v7 Street Map & Pure-Transparent Foreground Props Builder (mirrors map-home CRC32 lightweight pipeline)
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { decodePxg2ToRgba, MAP_STREET_PXG2_B64 } from './assets/uploadedOriginalAssets.mjs';
import { HOME_PROPS_V6_ATLAS_JSON } from './assets/v6HomePropsWebp.mjs';
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
  ihdr[9] = 6; // Truecolor RGBA
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

function verifyPngIntegrity(buf, expectedW, expectedH) {
  const w = buf.readUInt32BE(16);
  const h = buf.readUInt32BE(20);
  if (w !== expectedW || h !== expectedH) {
    throw new Error(`[v7-street] PNG size mismatch: ${w}x${h} vs ${expectedW}x${expectedH}`);
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
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  if (inflated.length !== (expectedW * 4 + 1) * expectedH) {
    throw new Error(`[v7-street] Inflated scanline byte count mismatch: ${inflated.length}`);
  }
}

// 1. Build 704x384 iPad lightweight HK street map PNG directly from lossless MAP_STREET_PXG2_B64
function buildVerifiedLightweightStreetMap() {
  const src = decodePxg2ToRgba(MAP_STREET_PXG2_B64, (w, h, rgba) => ({ w, h, rgba }));
  const dstW = 704;
  const dstH = 384;
  const dst = new Uint8Array(dstW * dstH * 4);

  // Crisp 2x2 pixel-art downsampling (picks top-left pixel of each 2x2 block to preserve sharp pixel edges)
  for (let y = 0; y < dstH; y++) {
    const sy = y * 2;
    for (let x = 0; x < dstW; x++) {
      const sx = x * 2;
      const si = (sy * src.w + sx) * 4;
      const di = (y * dstW + x) * 4;
      dst[di] = src.rgba[si];
      dst[di + 1] = src.rgba[si + 1];
      dst[di + 2] = src.rgba[si + 2];
      dst[di + 3] = 255;
    }
  }

  const pngBuf = encodeRgbaPng(dstW, dstH, dst);
  verifyPngIntegrity(pngBuf, dstW, dstH);

  fs.mkdirSync(MAPS_OUT, { recursive: true });
  const staleWebp = path.join(MAPS_OUT, 'map-street.webp');
  if (fs.existsSync(staleWebp)) fs.unlinkSync(staleWebp);

  const outPath = path.join(MAPS_OUT, 'map-street.png');
  fs.writeFileSync(outPath, pngBuf);
  console.log(
    `[v7-street-map] Verified -> wrote map-street.png (${dstW}x${dstH}, ${(pngBuf.length / 1024).toFixed(1)} KB, CRC32=0x${crc32(pngBuf).toString(16)})`
  );
}

// 2. Fix home-props-atlas.json frame unwrapping so all 26 home props have valid {x,y,w,h}
function fixHomePropsAtlasJson() {
  const rawFrames = HOME_PROPS_V6_ATLAS_JSON.frames || HOME_PROPS_V6_ATLAS_JSON;
  const frames = {};
  for (const [key, entry] of Object.entries(rawFrames)) {
    const r = entry.frame || entry;
    if (typeof r.x !== 'number') continue;
    frames[key] = {
      frame: { x: r.x, y: r.y, w: r.w, h: r.h },
      rotated: false,
      trimmed: false,
      spriteSourceSize: { x: 0, y: 0, w: r.w, h: r.h },
      sourceSize: { w: r.w, h: r.h }
    };
  }
  const atlasJson = {
    frames,
    meta: { app: 'cwsj-v7-home-props', image: 'home-props-atlas.webp', size: { w: 256, h: 118 }, scale: '1' }
  };
  fs.mkdirSync(SPRITES_OUT, { recursive: true });
  fs.writeFileSync(path.join(SPRITES_OUT, 'home-props-atlas.json'), JSON.stringify(atlasJson));
  console.log(`[v7-home-props] Fixed home-props-atlas.json (${Object.keys(frames).length} frames)`);
}

// 3. Build CRC32-verified 256x256 pure-transparent street-props-atlas.webp + JSON
function buildVerifiedStreetPropsAtlas() {
  const webpBuf = Buffer.from(STREET_CLEAN_WEBP_B64, 'base64');
  const actualCrc = crc32(webpBuf);
  if (webpBuf.length !== STREET_CLEAN_WEBP_BYTES || actualCrc !== STREET_CLEAN_WEBP_CRC32) {
    throw new Error(
      `[v7-street-props] Checksum mismatch: len=${webpBuf.length} (expected ${STREET_CLEAN_WEBP_BYTES}), crc=0x${actualCrc.toString(16)} (expected 0x${STREET_CLEAN_WEBP_CRC32.toString(16)})`
    );
  }

  fs.mkdirSync(SPRITES_OUT, { recursive: true });
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
  const atlasJson = {
    frames,
    meta: { app: 'cwsj-v7-street-props', image: 'street-props-atlas.webp', size: { w: 256, h: 256 }, scale: '1' }
  };
  fs.writeFileSync(path.join(SPRITES_OUT, 'street-props-atlas.json'), JSON.stringify(atlasJson));
  console.log(
    `[v7-street-props] Verified -> wrote street-props-atlas.webp (256x256, ${(webpBuf.length / 1024).toFixed(1)} KB, ${Object.keys(frames).length} frames)`
  );
  return Object.keys(frames);
}

// 4. Write updated v5RuntimeConfig.ts
function syncRuntimeConfig(validStreetKeys) {
  const tsContent =
    `// Auto-generated by scripts/v7StreetAndCollisionPatch.mjs\n` +
    `export const V5_HOME_MAP_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V5_HOME_NATIVE_1X: boolean = true;\n` +
    `export const V5_STREET_MAP_EXT: 'png' | 'webp' = 'png';\n` +
    `export const V5_STREET_NATIVE_1X: boolean = true;\n` +
    `export const V6_HOME_PROPS_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V6_HOME_PROPS_SCALE: number = 4;\n` +
    `export const V6_STREET_PROPS_ATLAS: boolean = true;\n` +
    `export const V6_STREET_PROPS_EXT: 'png' | 'webp' = 'webp';\n` +
    `export const V6_LIGHT_STREET_TILES: boolean = true;\n` +
    `export const V6_LIGHT_MG_NPCS: boolean = true;\n` +
    `export const V5_HD_CHARS_ENABLED: boolean = true;\n` +
    `export const V5_VALID_STREET_PROPS: readonly string[] = ${JSON.stringify(validStreetKeys)};\n`;
  fs.writeFileSync(RUNTIME_CFG_PATH, tsContent);
  console.log('[v7-runtime-cfg] Synced src/gfx/v5RuntimeConfig.ts');
}

buildVerifiedLightweightStreetMap();
fixHomePropsAtlasJson();
const validKeys = buildVerifiedStreetPropsAtlas();
syncRuntimeConfig(validKeys);
