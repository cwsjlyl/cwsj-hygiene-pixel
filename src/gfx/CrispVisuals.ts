import Phaser from 'phaser';

/**
 * 升級版 4x 超清繁體中文貼圖解析度修補（源自 qing-shengshi-pixel 最佳實踐）
 */
export function installCrispChineseTextPatch(): void {
  const proto = Phaser.GameObjects.Text.prototype as unknown as {
    updateText: () => Phaser.GameObjects.Text;
    __cwsjPatched?: boolean;
  };
  if (proto.__cwsjPatched) return;
  proto.__cwsjPatched = true;

  const origUpdate = proto.updateText;
  proto.updateText = function patchedText(this: Phaser.GameObjects.Text) {
    if ((this.style?.resolution ?? 1) < 4) {
      this.style.resolution = 4;
    }
    const res = origUpdate.call(this);
    if (this.frame?.source) {
      this.frame.source.scaleMode = Phaser.ScaleModes.LINEAR;
    }
    return res;
  };
}

/**
 * 雙重保險執行期 Sprite 去背淨化器：
 * 1) 若圖集本身已為原生 RGBA 透明，清除 < 28 微弱雜訊並將透明像素 RGB 歸零；
 * 2) 若載入外部仍帶有灰白棋盤格底稿的 PNG，自動由邊界與內部鏤空孔洞執行連通去背與 1px 灰邊淨化。
 */
export function sanitizeSpriteTextureAlpha(scene: Phaser.Scene, texKey: string): void {
  if (!scene.textures.exists(texKey)) return;
  const tex = scene.textures.get(texKey);
  const srcImg = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!srcImg || !srcImg.width || !srcImg.height) return;

  const w = srcImg.width;
  const h = srcImg.height;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return;

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(srcImg, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  // Check if corners are opaque gray/white checkerboard (alpha > 240 on all 4 corners)
  const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
  const hasOpaqueCorners = corners.every((idx) => d[idx + 3] > 240);

  if (!hasOpaqueCorners) {
    // Already transparent RGBA: scrub any faint <28 alpha dust & zero RGB on transparent pixels
    let modified = false;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] < 28) {
        if (d[i + 3] !== 0 || d[i] !== 0 || d[i + 1] !== 0 || d[i + 2] !== 0) modified = true;
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      }
    }
    if (!modified) {
      tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
      return;
    }
  } else {
    // Opaque checkerboard detected: run border flood-fill + interior checker-hole removal!
    const passable = new Uint8Array(w * h);
    const lumArr = new Float32Array(w * h);
    const chromaArr = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      const ch = maxC - minC;
      const lum = (r + g + b) / 3;
      lumArr[p] = lum;
      chromaArr[p] = ch;
      if (ch <= 22 && lum >= 108) passable[p] = 1;
    }

    const bgMask = new Uint8Array(w * h);
    const visited = new Uint8Array(w * h);
    const queue = new Int32Array(w * h);

    for (let start = 0; start < w * h; start++) {
      if (!passable[start] || visited[start]) continue;
      let head = 0, tail = 0;
      queue[tail++] = start;
      visited[start] = 1;
      let touchesBorder = false;
      let darkSq = 0, lightSq = 0;

      while (head < tail) {
        const cur = queue[head++];
        const cx = cur % w, cy = (cur / w) | 0;
        if (cx === 0 || cy === 0 || cx === w - 1 || cy === h - 1) touchesBorder = true;
        const l = lumArr[cur];
        if (l >= 110 && l <= 145) darkSq++;
        else if (l >= 220 && l <= 252) lightSq++;

        const neighbors = [
          cx > 0 ? cur - 1 : -1,
          cx < w - 1 ? cur + 1 : -1,
          cy > 0 ? cur - w : -1,
          cy < h - 1 ? cur + w : -1
        ];
        for (const nb of neighbors) {
          if (nb >= 0 && passable[nb] && !visited[nb]) {
            visited[nb] = 1;
            queue[tail++] = nb;
          }
        }
      }

      if (touchesBorder || (darkSq >= 10 && lightSq >= 10)) {
        for (let k = 0; k < tail; k++) bgMask[queue[k]] = 1;
      }
    }

    // 1px outer neutral anti-alias fringe cleanup
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const p = y * w + x;
        if (bgMask[p]) continue;
        const adjBg =
          (x > 0 && bgMask[p - 1]) ||
          (x < w - 1 && bgMask[p + 1]) ||
          (y > 0 && bgMask[p - w]) ||
          (y < h - 1 && bgMask[p + w]);
        if (adjBg && chromaArr[p] <= 24 && lumArr[p] >= 114) {
          bgMask[p] = 2;
        }
      }
    }

    for (let p = 0; p < w * h; p++) {
      if (bgMask[p]) {
        const i = p * 4;
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      }
    }
  }

  ctx.putImageData(imgData, 0, 0);
  if (tex.source[0]) {
    tex.source[0].image = canvas as unknown as HTMLImageElement;
    tex.source[0].update();
  }
  tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
}

/**
 * 將高清小學生主角正面幀同步更新至對話框、標題頁及榮譽證書頭像
 */
export function syncHeroPortraitToDom(scene: Phaser.Scene): void {
  if (!scene.textures.exists('hero')) return;
  const tex = scene.textures.get('hero');
  const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
  if (!src) return;

  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 168;
  const ctx = c.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(src, 0, 0, 64, 84, 0, 0, 128, 168);
  const url = c.toDataURL('image/png');

  document.querySelectorAll<HTMLImageElement>('#dialogue-portrait, .hero-avatar, .cert-avatar').forEach((img) => {
    img.src = url;
  });
}
