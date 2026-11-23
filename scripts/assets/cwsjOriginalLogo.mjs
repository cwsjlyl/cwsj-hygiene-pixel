import zlib from 'node:zlib';

// 原裝 CWSJ logo.png 標準透明 PNG 載荷（保留原始雲朵造型、彩色字體、抗鋸齒透明邊緣與原始長寬比）
export const CWSJ_ORIGINAL_LOGO_PNG_B64 = [
  'iVBORw0KGgoAAAANSUhEUgAAAsgAAAGbCAMAAADuh5aAAAAAwFBMVEUAAAD+/v7uJCS+aC3///////////////8SrUs7U6Q7',
  'U6Q7VKQ6UqRBWaY6UqQ7U6TuJCQ6UqQ7U6Q7U6Q7U6T15iv36itHR0c7U6Q7U6T////uJCQ7U6Q7VKQ6UqT36is7VKQSrUs7',
  'VKQ7U6Q7VKQ7U6S0vdY7U6Q6UqQ7U6Rbb7L////36ivd3OY7U6Tx8PQSrUsWq006UqT36is7VKT////fl4L///++xuH8/P6p',
  'dyiElcP36is7VKQ7U6TuJiYs/WPEAAAAQHRSTlMA+////////////////////////////yn///////////////////z/////',
  '///7//X///////////////7/////01hYzAAAJmhJREFUeNrtnctu47oSRVvdHpyA0TDXf8CBAILIxJDCgf//r671ssV3kaJs',
  'xdp7dE4jbXekpdKuYrH45w8EQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAE',
  'QRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAEQRAE',
  'QRAEQRAEQRAEQRAEQRAEQRD0Ap178buG/8VVgX4VwZzL6uRQJQeicY2g3UPMKyfCGs4VLw+zFv8Vwj+0AiURZXhBczGY',
  'e4BdT88Y/nFfoCSauDwl6wbz+q+tYt+hADNExak6ZWoFy2fy11aIzFCcJyVPq1TlUHY+y6SHpxJgGQoBJarTaiWH5axXwHoj',
  'A70txvJUSIIO2flcPeFboANVKYphPDoMopNZ9QqQcBjQVtE4AeWVGI8o495BG2JMgGyFqQDKkDPFO22kkIt9iSOH3hhjQs2g',
  'Ey1XSjVNUw+6/cftf3krutzawpmXdDGoYECxwChvCDfMq+aGs0y3yhFX0cnbkzOqbYWEv4BWuQo5M/zh1UyzTIEsEI47cftO',
  '88Gpo4/LLSjjZiIcu4kaIf4gaIS57YhB2RuOBW9q54PDIt8Ap3zwcOx9wY8UfySoD5xe0jQP6/HkQtXR4F+HQj/sBcKx6ShS',
  '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',
  '1qeDd48AAAAASUVORK5CYII='
].join('');

export const CWSJ_ORIGINAL_LOGO_LG01_B64 = CWSJ_ORIGINAL_LOGO_PNG_B64;

export function decodeLg01ToPng(b64 = CWSJ_ORIGINAL_LOGO_PNG_B64, encodePNG) {
  const pngBuf = Buffer.from(
    typeof b64 === 'string' && b64.length > 0 ? b64 : CWSJ_ORIGINAL_LOGO_PNG_B64,
    'base64'
  );
  if (typeof encodePNG !== 'function') {
    return pngBuf;
  }
  try {
    let pos = 8;
    let w = 0;
    let h = 0;
    let palRgb = null;
    let palAlpha = null;
    const idatParts = [];
    while (pos < pngBuf.length) {
      const len = pngBuf.readUInt32BE(pos);
      const type = pngBuf.subarray(pos + 4, pos + 8).toString('ascii');
      const data = pngBuf.subarray(pos + 8, pos + 8 + len);
      if (type === 'IHDR') {
        w = data.readUInt32BE(0);
        h = data.readUInt32BE(4);
      } else if (type === 'PLTE') {
        palRgb = data;
      } else if (type === 'tRNS') {
        palAlpha = data;
      } else if (type === 'IDAT') {
        idatParts.push(data);
      }
      pos += 12 + len;
    }
    if (!w || !h || !palRgb || idatParts.length === 0) {
      return pngBuf;
    }
    const scan = zlib.inflateSync(Buffer.concat(idatParts));
    const stride = w + 1;
    const rgba = new Uint8Array(w * h * 4);
    for (let y = 0; y < h; y++) {
      const rowOff = y * stride + 1;
      for (let x = 0; x < w; x++) {
        const ci = scan[rowOff + x];
        const dst = (y * w + x) * 4;
        const a = palAlpha && ci < palAlpha.length ? palAlpha[ci] : 255;
        if (a === 0) {
          rgba[dst] = 0;
          rgba[dst + 1] = 0;
          rgba[dst + 2] = 0;
          rgba[dst + 3] = 0;
        } else {
          const po = ci * 3;
          rgba[dst] = palRgb[po];
          rgba[dst + 1] = palRgb[po + 1];
          rgba[dst + 2] = palRgb[po + 2];
          rgba[dst + 3] = a;
        }
      }
    }
    return encodePNG(w, h, rgba);
  } catch {
    return pngBuf;
  }
}

export default CWSJ_ORIGINAL_LOGO_PNG_B64;
