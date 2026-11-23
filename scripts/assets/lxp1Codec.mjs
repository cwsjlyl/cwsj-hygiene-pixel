import zlib from 'node:zlib';

/**
 * Decodes an LXP1 (Lossless Indexed Pixel v1) base64 payload into { w, h, rgba }.
 * Header (10B): 'LXP1' (4B) | width (u16BE) | height (u16BE) | nColors (u8, 0=>256) | transIdx (u8, 255=opaque)
 */
export function decodeLxp1ToRgba(b64) {
  const clean = b64.replace(/\s+/g, '');
  const raw = zlib.inflateSync(Buffer.from(clean, 'base64'));
  const magic = raw.subarray(0, 4).toString('ascii');
  if (magic !== 'LXP1') {
    throw new Error(`Invalid LXP1 header: ${magic}`);
  }
  const w = raw.readUInt16BE(4);
  const h = raw.readUInt16BE(6);
  const totalPx = w * h;
  const nColors = raw[8] === 0 && raw.length >= 10 + 256 * 3 + totalPx ? 256 : raw[8];
  const transIdx = raw[9];
  const palOff = 10;
  const idxOff = palOff + nColors * 3;

  if (raw.length < idxOff + totalPx) {
    throw new Error(`Corrupt LXP1 buffer: expected ${idxOff + totalPx}, got ${raw.length}`);
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

/**
 * Fast typed-array Scale2x / EPX pixel-art super-resolution upscaler (2x per pass).
 * Eliminates blocky staircase pixels on 45-degree walls, furniture & street details
 * while preserving 100% razor-sharp outlines and alpha transparency.
 */
export function scale2xRgba(w, h, srcRgba) {
  const aligned = srcRgba.byteOffset % 4 === 0 ? srcRgba : new Uint8Array(srcRgba);
  const src32 = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h);
  const dw = w * 2;
  const dh = h * 2;
  const dstRgba = new Uint8Array(dw * dh * 4);
  const dst32 = new Uint32Array(dstRgba.buffer);

  for (let y = 0; y < h; y++) {
    const ym1 = y > 0 ? y - 1 : 0;
    const yp1 = y < h - 1 ? y + 1 : h - 1;
    const rowP = y * w;
    const rowA = ym1 * w;
    const rowD = yp1 * w;
    const outRow0 = (y * 2) * dw;
    const outRow1 = (y * 2 + 1) * dw;

    for (let x = 0; x < w; x++) {
      const xm1 = x > 0 ? x - 1 : 0;
      const xp1 = x < w - 1 ? x + 1 : w - 1;

      const P = src32[rowP + x];
      const A = src32[rowA + x];
      const B = src32[rowP + xp1];
      const C = src32[rowP + xm1];
      const D = src32[rowD + x];

      let E0 = P;
      let E1 = P;
      let E2 = P;
      let E3 = P;

      if (C !== B && A !== D) {
        if (C === A) E0 = A;
        if (A === B) E1 = B;
        if (C === D) E2 = C;
        if (B === D) E3 = D;
      }

      const ox = x * 2;
      dst32[outRow0 + ox] = E0;
      dst32[outRow0 + ox + 1] = E1;
      dst32[outRow1 + ox] = E2;
      dst32[outRow1 + ox + 1] = E3;
    }
  }
  return { w: dw, h: dh, rgba: dstRgba };
}

/**
 * Runs multiple EPX 2x passes (passes=1 -> 2x, passes=2 -> 4x).
 */
export function upscaleHdPixelArt(img, passes = 1) {
  let cur = img;
  for (let i = 0; i < passes; i++) {
    cur = scale2xRgba(cur.w, cur.h, cur.rgba);
  }
  return cur;
}
