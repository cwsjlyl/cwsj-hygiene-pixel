import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const RAW_DIR = 'raw-uploads';
const MAPS_OUT = 'public/assets/maps';
const SPRITES_OUT = 'public/assets/sprites';
const RUNTIME_CFG_PATH = 'src/gfx/v5RuntimeConfig.ts';

const WALK_MAPS = {
  passerby: [
    [[0, 0, false], [0, 1, false], [0, 0, true],  [0, 2, false]],
    [[2, 0, true],  [2, 2, true],  [2, 1, true],  [2, 2, true]],
    [[2, 0, false], [2, 2, false], [2, 1, false], [2, 2, false]],
    [[3, 0, false], [3, 1, false], [3, 3, false], [3, 2, false]]
  ],
  sister: [
    [[0, 0, false], [0, 1, false], [0, 0, true],  [0, 2, false]],
    [[2, 0, true],  [2, 2, true],  [2, 1, true],  [2, 2, true]],
    [[2, 0, false], [2, 2, false], [2, 1, false], [2, 2, false]],
    [[3, 0, false], [3, 1, false], [3, 3, false], [3, 2, false]]
  ],
  mom: [
    [[0, 0, false], [0, 1, false], [0, 3, false], [0, 2, false]],
    [[2, 0, true],  [2, 2, true],  [2, 1, true],  [2, 2, true]],
    [[2, 0, false], [2, 2, false], [2, 1, false], [2, 2, false]],
    [[3, 0, false], [3, 1, false], [3, 3, false], [3, 2, false]]
  ],
  hero: [
    [[0, 0, false], [0, 1, false], [0, 2, false], [0, 1, false]],
    [[1, 0, false], [2, 0, false], [1, 0, false], [2, 0, false]],
    [[1, 2, false], [2, 2, false], [1, 3, false], [2, 3, false]],
    [[3, 0, false], [3, 1, false], [3, 3, false], [3, 1, false]]
  ]
};

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (c & 1 ? 0xedb88320 : 0);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodeRgbaPng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) {
    const rowOff = y * (w * 4 + 1);
    raw[rowOff] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, rowOff + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, pngChunk('IHDR', ihdr), pngChunk('IDAT', idat), pngChunk('IEND', Buffer.alloc(0))]);
}

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePngToRgba(buf) {
  if (buf.length < 8 || buf[0] !== 137 || buf[1] !== 80 || buf[2] !== 78 || buf[3] !== 71) {
    throw new Error('Invalid PNG signature');
  }
  let pos = 8, w = 0, h = 0, bitDepth = 8, colorType = 2;
  let plte = null, trns = null;
  const idats = [];
  while (pos + 8 <= buf.length) {
    const len = buf.readUInt32BE(pos);
    const type = buf.toString('ascii', pos + 4, pos + 8);
    const data = buf.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (type === 'PLTE') plte = data;
    else if (type === 'tRNS') trns = data;
    else if (type === 'IDAT') idats.push(data);
    else if (type === 'IEND') break;
  }
  if (bitDepth !== 8) throw new Error(`Unsupported PNG bitDepth: ${bitDepth}`);
  const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 4 ? 2 : 1;
  const stride = w * bpp;
  const inflated = zlib.inflateSync(Buffer.concat(idats));
  const recon = new Uint8Array(h * stride);

  for (let y = 0; y < h; y++) {
    const ftype = inflated[y * (stride + 1)];
    const srcOff = y * (stride + 1) + 1;
    const dstOff = y * stride;
    const prevOff = (y - 1) * stride;
    for (let x = 0; x < stride; x++) {
      const rawByte = inflated[srcOff + x];
      const a = x >= bpp ? recon[dstOff + x - bpp] : 0;
      const b = y > 0 ? recon[prevOff + x] : 0;
      const c = (x >= bpp && y > 0) ? recon[prevOff + x - bpp] : 0;
      let val = rawByte;
      if (ftype === 1) val = (rawByte + a) & 0xff;
      else if (ftype === 2) val = (rawByte + b) & 0xff;
      else if (ftype === 3) val = (rawByte + ((a + b) >> 1)) & 0xff;
      else if (ftype === 4) val = (rawByte + paeth(a, b, c)) & 0xff;
      recon[dstOff + x] = val;
    }
  }

  const rgba = new Uint8Array(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    const di = i * 4;
    if (colorType === 6) {
      const si = i * 4;
      rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = recon[si + 3];
    } else if (colorType === 2) {
      const si = i * 3;
      rgba[di] = recon[si]; rgba[di + 1] = recon[si + 1]; rgba[di + 2] = recon[si + 2]; rgba[di + 3] = 255;
    } else if (colorType === 3 && plte) {
      const idx = recon[i];
      rgba[di] = plte[idx * 3] ?? 0;
      rgba[di + 1] = plte[idx * 3 + 1] ?? 0;
      rgba[di + 2] = plte[idx * 3 + 2] ?? 0;
      rgba[di + 3] = trns && idx < trns.length ? trns[idx] : 255;
    } else if (colorType === 4) {
      rgba[di] = recon[i * 2]; rgba[di + 1] = recon[i * 2]; rgba[di + 2] = recon[i * 2]; rgba[di + 3] = recon[i * 2 + 1];
    } else {
      rgba[di] = recon[i]; rgba[di + 1] = recon[i]; rgba[di + 2] = recon[i]; rgba[di + 3] = 255;
    }
  }
  return { w, h, rgba };
}

// Auto-crop transparent margins & box-downsample oversized home maps (e.g. 1920x1080) to iPad-lightweight 634x460
function downscaleHomeForIpad(w, h, rgba) {
  let minX = w, maxX = -1, minY = h, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] > 16) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX) { minX = 0; maxX = w - 1; minY = 0; maxY = h - 1; }
  const cw = maxX - minX + 1, ch = maxY - minY + 1;
  const outW = 634, outH = 460;
  const out = new Uint8Array(outW * outH * 4);
  for (let dy = 0; dy < outH; dy++) {
    const sy0 = minY + Math.floor((dy * ch) / outH);
    const sy1 = Math.max(sy0 + 1, minY + Math.floor(((dy + 1) * ch) / outH));
    for (let dx = 0; dx < outW; dx++) {
      const sx0 = minX + Math.floor((dx * cw) / outW);
      const sx1 = Math.max(sx0 + 1, minX + Math.floor(((dx + 1) * cw) / outW));
      let r = 0, g = 0, b = 0, a = 0, cnt = 0, fgCnt = 0;
      for (let sy = sy0; sy < sy1 && sy < h; sy++) {
        for (let sx = sx0; sx < sx1 && sx < w; sx++) {
          const p = (sy * w + sx) * 4;
          cnt++;
          a += rgba[p + 3];
          if (rgba[p + 3] >= 128) {
            r += rgba[p]; g += rgba[p + 1]; b += rgba[p + 2]; fgCnt++;
          }
        }
      }
      const di = (dy * outW + dx) * 4;
      if (cnt > 0 && a / cnt >= 128 && fgCnt > 0) {
        out[di] = Math.round(r / fgCnt);
        out[di + 1] = Math.round(g / fgCnt);
        out[di + 2] = Math.round(b / fgCnt);
        out[di + 3] = 255;
      }
    }
  }
  return { w: outW, h: outH, rgba: out };
}

function classifyCharRole(fileName, w, h, rgba, usedRoles) {
  const lower = fileName.toLowerCase();
  if (/hero|boy|student|school|主角|小明/.test(lower)) return 'hero';
  if (/mom|mother|媽媽|母親/.test(lower)) return 'mom';
  if (/sis|girl|妹妹/.test(lower)) return 'sister';
  if (/passer|man|npc|路人|街坊/.test(lower)) return 'passerby';

  const borderLums = [];
  for (let x = 0; x < w; x++) {
    const t = x * 4, b = ((h - 1) * w + x) * 4;
    borderLums.push((rgba[t] + rgba[t + 1] + rgba[t + 2]) / 3);
    borderLums.push((rgba[b] + rgba[b + 1] + rgba[b + 2]) / 3);
  }
  borderLums.sort((a, b) => a - b);
  const c0 = borderLums[Math.floor(borderLums.length * 0.2)];
  if (c0 > 114 && !usedRoles.has('hero')) return 'hero';

  const cellW = Math.floor(w / 4), cellH = Math.floor(h / 4);
  const sy = h / 1184, sx = w / 896;
  let skinC03 = 0;
  for (let y = Math.floor(45 * sy); y < Math.floor(105 * sy); y++) {
    for (let x = cellW * 3; x < cellW * 4; x++) {
      const p = (y * w + x) * 4;
      if (rgba[p] > 180 && rgba[p] - rgba[p + 2] > 35) skinC03++;
    }
  }
  if (skinC03 > Math.floor(400 * sx * sy) && !usedRoles.has('mom')) return 'mom';

  let minX = cellW, maxX = 0;
  for (let y = cellH * 3; y < cellH * 4; y++) {
    for (let x = 0; x < cellW; x++) {
      const p = (y * w + x) * 4;
      const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
      const chr = Math.max(r, g, b) - Math.min(r, g, b);
      const lum = (r + g + b) / 3;
      if (chr > 16 || lum < 65) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      }
    }
  }
  if (maxX - minX > 118 * sx && !usedRoles.has('sister')) return 'sister';
  for (const r of ['passerby', 'sister', 'mom', 'hero']) {
    if (!usedRoles.has(r)) return r;
  }
  return 'passerby';
}

function cleanAndAlignSpriteSheet(role, w, h, srcRgba) {
  if (w === 448 && h === 592 && srcRgba[3] === 0 && srcRgba[(w - 1) * 4 + 3] === 0) {
    return { w: 448, h: 592, rgba: srcRgba };
  }
  const n = w * h;
  const lum = new Float32Array(n);
  const chroma = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    const r = srcRgba[i * 4], g = srcRgba[i * 4 + 1], b = srcRgba[i * 4 + 2];
    lum[i] = (r + g + b) / 3;
    chroma[i] = Math.max(r, g, b) - Math.min(r, g, b);
  }
  const border = [];
  for (let x = 0; x < w; x++) { border.push(lum[x], lum[(h - 1) * w + x]); }
  for (let y = 0; y < h; y++) { border.push(lum[y * w], lum[y * w + (w - 1)]); }
  border.sort((a, b) => a - b);
  const isHero = role === 'hero';
  const lo = isHero ? 68.0 : border[Math.floor(border.length * 0.005)] - 24.0;
  const hi = border[Math.floor(border.length * 0.995)] + 24.0;

  const cand = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (srcRgba[i * 4 + 3] < 128 || (chroma[i] <= 15 && lum[i] >= lo && lum[i] <= hi)) cand[i] = 1;
  }

  const cellH = Math.floor(h / 4), cellW = Math.floor(w / 4);
  const ryArmMax = Math.round(215 * (cellH / 296));
  const ryHeroLeg = Math.round(252 * (cellH / 296));

  const visited = new Uint8Array(n);
  const bg = new Uint8Array(n);
  const queue = new Int32Array(n);

  for (let start = 0; start < n; start++) {
    if (!cand[start] || visited[start]) continue;
    let qh = 0, qt = 0;
    queue[qt++] = start;
    visited[start] = 1;
    let touchesBorder = false, ryMin = cellH, ryMax = 0;
    while (qh < qt) {
      const cur = queue[qh++];
      const y = (cur / w) | 0, x = cur - y * w;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) touchesBorder = true;
      const ry = y % cellH;
      if (ry < ryMin) ryMin = ry;
      if (ry > ryMax) ryMax = ry;
      if (x > 0 && cand[cur - 1] && !visited[cur - 1]) { visited[cur - 1] = 1; queue[qt++] = cur - 1; }
      if (x + 1 < w && cand[cur + 1] && !visited[cur + 1]) { visited[cur + 1] = 1; queue[qt++] = cur + 1; }
      if (y > 0 && cand[cur - w] && !visited[cur - w]) { visited[cur - w] = 1; queue[qt++] = cur - w; }
      if (y + 1 < h && cand[cur + w] && !visited[cur + w]) { visited[cur + w] = 1; queue[qt++] = cur + w; }
    }
    if (touchesBorder || (qt >= 15 && (ryMax < ryArmMax || (isHero && ryMin < ryHeroLeg)))) {
      for (let i = 0; i < qt; i++) bg[queue[i]] = 1;
    }
  }

  visited.fill(0);
  for (let start = 0; start < n; start++) {
    if (!bg[start] || visited[start]) continue;
    let qh = 0, qt = 0;
    queue[qt++] = start;
    visited[start] = 1;
    let touchesBorder = false;
    while (qh < qt) {
      const cur = queue[qh++];
      const y = (cur / w) | 0, x = cur - y * w;
      if (x === 0 || x === w - 1 || y === 0 || y === h - 1) touchesBorder = true;
      if (x > 0 && bg[cur - 1] && !visited[cur - 1]) { visited[cur - 1] = 1; queue[qt++] = cur - 1; }
      if (x + 1 < w && bg[cur + 1] && !visited[cur + 1]) { visited[cur + 1] = 1; queue[qt++] = cur + 1; }
      if (y > 0 && bg[cur - w] && !visited[cur - w]) { visited[cur - w] = 1; queue[qt++] = cur - w; }
      if (y + 1 < h && bg[cur + w] && !visited[cur + w]) { visited[cur + w] = 1; queue[qt++] = cur + w; }
    }
    if (!touchesBorder && qt <= 20) {
      for (let i = 0; i < qt; i++) bg[queue[i]] = 0;
    }
  }

  visited.fill(0);
  for (let start = 0; start < n; start++) {
    if (bg[start] || visited[start]) continue;
    let qh = 0, qt = 0;
    queue[qt++] = start;
    visited[start] = 1;
    while (qh < qt) {
      const cur = queue[qh++];
      const y = (cur / w) | 0, x = cur - y * w;
      if (x > 0 && !bg[cur - 1] && !visited[cur - 1]) { visited[cur - 1] = 1; queue[qt++] = cur - 1; }
      if (x + 1 < w && !bg[cur + 1] && !visited[cur + 1]) { visited[cur + 1] = 1; queue[qt++] = cur + 1; }
      if (y > 0 && !bg[cur - w] && !visited[cur - w]) { visited[cur - w] = 1; queue[qt++] = cur - w; }
      if (y + 1 < h && !bg[cur + w] && !visited[cur + w]) { visited[cur + w] = 1; queue[qt++] = cur + w; }
    }
    if (qt < 45) {
      for (let i = 0; i < qt; i++) bg[queue[i]] = 1;
    }
  }

  const aligned = new Uint8Array(w * h * 4);
  const targetCenterX = Math.round(cellW / 2);
  const targetFootY = Math.round(cellH * (284 / 296));
  const map = WALK_MAPS[role] || WALK_MAPS.passerby;

  for (let dr = 0; dr < 4; dr++) {
    for (let dc = 0; dc < 4; dc++) {
      const [sr, sc, flipX] = map[dr][dc];
      let minX = cellW, maxX = -1, maxY = -1;
      for (let cy = 0; cy < cellH; cy++) {
        for (let cx = 0; cx < cellW; cx++) {
          const sxIdx = flipX ? (cellW - 1 - cx) : cx;
          const pIdx = (sr * cellH + cy) * w + (sc * cellW + sxIdx);
          if (!bg[pIdx]) {
            if (cx < minX) minX = cx;
            if (cx > maxX) maxX = cx;
            if (cy > maxY) maxY = cy;
          }
        }
      }
      if (maxX < 0) continue;
      const dx = targetCenterX - Math.round((minX + maxX) / 2);
      const dy = targetFootY - maxY;
      for (let cy = 0; cy < cellH; cy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= cellH) continue;
        for (let cx = 0; cx < cellW; cx++) {
          const nx = cx + dx;
          if (nx < 0 || nx >= cellW) continue;
          const sxIdx = flipX ? (cellW - 1 - cx) : cx;
          const sIdx = (sr * cellH + cy) * w + (sc * cellW + sxIdx);
          if (bg[sIdx]) continue;
          const dOff = ((dr * cellH + ny) * w + (dc * cellW + nx)) * 4;
          const sOff = sIdx * 4;
          aligned[dOff] = srcRgba[sOff];
          aligned[dOff + 1] = srcRgba[sOff + 1];
          aligned[dOff + 2] = srcRgba[sOff + 2];
          aligned[dOff + 3] = 255;
        }
      }
    }
  }

  const outW = 448, outH = 592;
  const outRgba = new Uint8Array(outW * outH * 4);
  for (let y = 0; y < outH; y++) {
    const sy = Math.min(h - 1, Math.floor((y * h) / outH));
    for (let x = 0; x < outW; x++) {
      const sx = Math.min(w - 1, Math.floor((x * w) / outW));
      const si = (sy * w + sx) * 4, di = (y * outW + x) * 4;
      outRgba[di] = aligned[si];
      outRgba[di + 1] = aligned[si + 1];
      outRgba[di + 2] = aligned[si + 2];
      outRgba[di + 3] = aligned[si + 3];
    }
  }
  return { w: outW, h: outH, rgba: outRgba };
}

async function runPipeline() {
  fs.mkdirSync(MAPS_OUT, { recursive: true });
  fs.mkdirSync(SPRITES_OUT, { recursive: true });

  // 1. Assemble & strictly CRC32-verify embedded iPad lightweight 634x460 RGBA home map WebP
  if (
    fs.existsSync('scripts/assets/v5HomeIpadWebpPart1.mjs') &&
    fs.existsSync('scripts/assets/v5HomeIpadWebpPart2.mjs')
  ) {
    const { IPAD_HOME_WEBP_P1 } = await import('./assets/v5HomeIpadWebpPart1.mjs');
    const { IPAD_HOME_WEBP_P2 } = await import('./assets/v5HomeIpadWebpPart2.mjs');
    const c1 = crc32(Buffer.from(IPAD_HOME_WEBP_P1, 'ascii'));
    const c2 = crc32(Buffer.from(IPAD_HOME_WEBP_P2, 'ascii'));
    const webpBuf = Buffer.from(IPAD_HOME_WEBP_P1 + IPAD_HOME_WEBP_P2, 'base64');
    const cAll = crc32(webpBuf);
    console.log(`[ipad-home] P1(len=${IPAD_HOME_WEBP_P1.length}, crc=0x${c1.toString(16)}) P2(len=${IPAD_HOME_WEBP_P2.length}, crc=0x${c2.toString(16)}) Total(${webpBuf.length}B, crc=0x${cAll.toString(16)})`);
    if (c1 !== 0x41f4e4e0 || c2 !== 0x3d225829 || cAll !== 0xcc3fb0ee) {
      throw new Error(`[ipad-home] Checksum mismatch! Expected 0x41f4e4e0 / 0x3d225829 / 0xcc3fb0ee`);
    }
    fs.writeFileSync(path.join(MAPS_OUT, 'map-home.webp'), webpBuf);
    console.log('[ipad-home] 100% bit-exact verified -> wrote public/assets/maps/map-home.webp (634x460, 42.5 KB)!');
  }

  let homeMapExt = fs.existsSync(path.join(MAPS_OUT, 'map-home.webp')) ? 'webp' : 'png';
  let streetMapExt = fs.existsSync(path.join(MAPS_OUT, 'map-street.webp')) ? 'webp' : 'png';
  let streetNative1x = streetMapExt === 'webp';
  let validStreetProps = [];

  if (fs.existsSync(RUNTIME_CFG_PATH)) {
    const cur = fs.readFileSync(RUNTIME_CFG_PATH, 'utf8');
    const mProps = cur.match(/V5_VALID_STREET_PROPS[^=]*=\s*(\[[^\]]*\])/);
    if (mProps) {
      try { validStreetProps = JSON.parse(mProps[1]); } catch { /* ignore */ }
    }
  }

  const charFound = { hero: null, mom: null, sister: null, passerby: null };
  for (const r of Object.keys(charFound)) {
    if (fs.existsSync(path.join(SPRITES_OUT, `char-v5-${r}.webp`))) charFound[r] = 'webp';
    else if (fs.existsSync(path.join(SPRITES_OUT, `char-v5-${r}.png`))) charFound[r] = 'png';
  }

  if (fs.existsSync(RAW_DIR)) {
    const entries = fs.readdirSync(RAW_DIR).filter((f) => /\.(png|webp)$/i.test(f)).sort();
    const usedRoles = new Set();

    for (const file of entries) {
      const full = path.join(RAW_DIR, file);
      const lower = file.toLowerCase();
      if (lower.endsWith('.webp')) {
        if (/home|house|room|家居|室內/.test(lower)) {
          fs.copyFileSync(full, path.join(MAPS_OUT, 'map-home.webp'));
          homeMapExt = 'webp';
          console.log(`[raw-uploads] Copied WebP home map: ${file}`);
        } else if (/street|街道/.test(lower)) {
          fs.copyFileSync(full, path.join(MAPS_OUT, 'map-street.webp'));
          streetMapExt = 'webp';
          streetNative1x = true;
          console.log(`[raw-uploads] Copied WebP street map: ${file}`);
        } else {
          for (const r of ['hero', 'mom', 'sister', 'passerby']) {
            if (lower.includes(r)) {
              fs.copyFileSync(full, path.join(SPRITES_OUT, `char-v5-${r}.webp`));
              charFound[r] = 'webp';
              console.log(`[raw-uploads] Copied WebP character (${r}): ${file}`);
            }
          }
        }
        continue;
      }

      const rawBuf = fs.readFileSync(full);
      const { w, h, rgba } = decodePngToRgba(rawBuf);
      const isHomeByName = /home|house|room|interior|家居|室內/.test(lower);
      const hasTransparentCorners = rgba[3] === 0 && rgba[(w - 1) * 4 + 3] === 0;

      if (isHomeByName || (w >= 500 && w <= 950 && h >= 360 && h <= 700 && w > h) || (w === 1920 && h === 1080 && hasTransparentCorners)) {
        if (w > 950) {
          const scaled = downscaleHomeForIpad(w, h, rgba);
          fs.writeFileSync(path.join(MAPS_OUT, 'map-home.png'), encodeRgbaPng(scaled.w, scaled.h, scaled.rgba));
          console.log(`[raw-uploads] Auto-cropped & downscaled oversized home map (${w}x${h} -> 634x460 iPad-lightweight): ${file}`);
        } else {
          fs.copyFileSync(full, path.join(MAPS_OUT, 'map-home.png'));
          console.log(`[raw-uploads] Installed native PNG home map (${w}x${h}): ${file}`);
        }
        if (fs.existsSync(path.join(MAPS_OUT, 'map-home.webp'))) fs.unlinkSync(path.join(MAPS_OUT, 'map-home.webp'));
        homeMapExt = 'png';
      } else if (/street|街道/.test(lower) || (w >= 1100 && w > h * 1.4)) {
        fs.copyFileSync(full, path.join(MAPS_OUT, 'map-street.png'));
        streetMapExt = 'png';
        streetNative1x = w <= 1600;
        console.log(`[raw-uploads] Installed native PNG street map (${w}x${h}): ${file}`);
      } else if (h > w * 1.1) {
        const role = classifyCharRole(file, w, h, rgba, usedRoles);
        usedRoles.add(role);
        const cleaned = cleanAndAlignSpriteSheet(role, w, h, rgba);
        const outPng = encodeRgbaPng(cleaned.w, cleaned.h, cleaned.rgba);
        fs.writeFileSync(path.join(SPRITES_OUT, `char-v5-${role}.png`), outPng);
        charFound[role] = 'png';
        console.log(`[raw-uploads] Cleaned checkerboard & aligned 4-dir spritesheet -> char-v5-${role}.png (${cleaned.w}x${cleaned.h}) from ${file}`);
      }
    }
  }

  const allWebp = ['hero', 'mom', 'sister', 'passerby'].every((r) => charFound[r] === 'webp');
  const allPng = ['hero', 'mom', 'sister', 'passerby'].every((r) => charFound[r] === 'png');
  const hdCharsEnabled = allWebp || allPng;
  const hdCharsExt = allPng ? 'png' : 'webp';

  const cfgOut = [
    '// Auto-generated by scripts/rawUploadsPipeline.mjs',
    `export const V5_HOME_MAP_EXT: 'png' | 'webp' = '${homeMapExt}';`,
    `export const V5_STREET_MAP_EXT: 'png' | 'webp' = '${streetMapExt}';`,
    `export const V5_STREET_NATIVE_1X: boolean = ${streetNative1x};`,
    `export const V5_HD_CHARS_ENABLED: boolean = ${hdCharsEnabled};`,
    `export const V5_HD_CHARS_EXT: 'png' | 'webp' = '${hdCharsExt}';`,
    `export const V5_VALID_STREET_PROPS: readonly string[] = ${JSON.stringify(validStreetProps)};`,
    ''
  ].join('\n');

  fs.writeFileSync(RUNTIME_CFG_PATH, cfgOut, 'utf8');
  console.log(`[v5-pipeline] Runtime config synced -> home:${homeMapExt}, street:${streetMapExt}, hdChars:${hdCharsEnabled} (${hdCharsExt})`);
}

await runPipeline();
