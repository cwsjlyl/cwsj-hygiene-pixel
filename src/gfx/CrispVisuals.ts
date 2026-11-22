import Phaser from 'phaser';

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
 * 安全無阻塞執行期 Sprite 濾鏡與去背檢查：
 * 若圖集四角已為透明 RGBA（如建置期已徹底去背之圖集），直接啟用 NEAREST 像素銳利濾鏡而不改寫 WebGL 貼圖來源，避免跨瀏覽器貼圖凍結。
 */
export function sanitizeSpriteTextureAlpha(scene: Phaser.Scene, texKey: string): void {
  try {
    if (!scene.textures.exists(texKey)) return;
    const tex = scene.textures.get(texKey);
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);

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

    const corners = [0, (w - 1) * 4, (h - 1) * w * 4, ((h - 1) * w + (w - 1)) * 4];
    const hasOpaqueCorners = corners.every((idx) => d[idx + 3] > 240);

    // 建置期已保證純透明 RGBA，直接返回避免破壞 WebGL HTMLImageElement TextureSource
    if (!hasOpaqueCorners) return;

    const passable = new Uint8Array(w * h);
    const lumArr = new Float32Array(w * h);
    const chromaArr = new Uint8Array(w * h);
    for (let p = 0; p < w * h; p++) {
      const i = p * 4;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
      lumArr[p] = (r + g + b) / 3;
      chromaArr[p] = maxC - minC;
      if (chromaArr[p] <= 22 && lumArr[p] >= 108) passable[p] = 1;
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

    for (let p = 0; p < w * h; p++) {
      if (bgMask[p]) {
        const i = p * 4;
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
      }
    }

    ctx.putImageData(imgData, 0, 0);
    if (tex.source[0]) {
      (tex.source[0] as unknown as { isCanvas: boolean }).isCanvas = true;
      tex.source[0].image = canvas as unknown as HTMLImageElement;
      tex.source[0].update();
    }
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
  } catch (err) {
    console.warn('[CrispVisuals] sanitizeSpriteTextureAlpha skipped:', texKey, err);
  }
}

export function syncHeroPortraitToDom(scene: Phaser.Scene): void {
  try {
    if (!scene.textures.exists('hero')) return;
    const tex = scene.textures.get('hero');
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!src || !src.width || !src.height) return;

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
  } catch (err) {
    console.warn('[CrispVisuals] syncHeroPortraitToDom skipped:', err);
  }
}
