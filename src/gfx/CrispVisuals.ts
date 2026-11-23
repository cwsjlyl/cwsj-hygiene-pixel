import Phaser from 'phaser';

const CRISP_FONT_STACK = '"PingFang HK", "Noto Sans TC", "Heiti TC", "Microsoft JhengHei", system-ui, sans-serif';

export function installCrispChineseTextPatch(): void {
  const proto = Phaser.GameObjects.Text.prototype as unknown as {
    updateText: () => Phaser.GameObjects.Text;
    __cwsjPatchedV5?: boolean;
  };
  if (proto.__cwsjPatchedV5) return;
  proto.__cwsjPatchedV5 = true;

  const origUpdate = proto.updateText;
  proto.updateText = function patchedText(this: Phaser.GameObjects.Text) {
    if (this.style) {
      if ((this.style.resolution ?? 1) < 3) {
        this.style.resolution = 3;
      }
      if (!this.style.fontFamily || this.style.fontFamily === 'Courier' || this.style.fontFamily === 'monospace') {
        this.style.fontFamily = CRISP_FONT_STACK;
      }
    }
    const res = origUpdate.call(this);
    if (this.texture) {
      this.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
    }
    if (this.frame?.source) {
      this.frame.source.scaleMode = Phaser.ScaleModes.LINEAR;
    }
    return res;
  };
}

export function sanitizeSpriteTextureAlpha(
  scene: Phaser.Scene,
  texKey: string,
  filterMode: Phaser.Textures.FilterMode = Phaser.Textures.FilterMode.NEAREST,
  stripNeonGreen = false
): void {
  try {
    if (!scene.textures.exists(texKey)) return;
    const tex = scene.textures.get(texKey);
    tex.setFilter(filterMode);

    if (!stripNeonGreen) return;

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
    let modified = false;

    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const r = d[i], g = d[i + 1], b = d[i + 2];
      if (g > 150 && g - r >= 48 && g - b >= 48) {
        d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; d[i + 3] = 0;
        modified = true;
      }
    }

    if (modified && tex.source[0]) {
      ctx.putImageData(imgData, 0, 0);
      (tex.source[0] as unknown as { isCanvas: boolean }).isCanvas = true;
      tex.source[0].image = canvas as unknown as HTMLImageElement;
      tex.source[0].update();
      tex.setFilter(filterMode);
    }
  } catch (err) {
    console.warn('[CrispVisuals] sanitizeSpriteTextureAlpha skipped:', texKey, err);
  }
}

export function syncHeroPortraitToDom(scene: Phaser.Scene): void {
  try {
    if (!scene.textures.exists('hero')) return;
    const tex = scene.textures.get('hero');
    const firstFrame = tex.get(0);
    const src = tex.getSourceImage() as HTMLImageElement | HTMLCanvasElement;
    if (!src || !src.width || !src.height) return;

    const fw = firstFrame?.cutWidth || Math.floor(src.width / 4);
    const fh = firstFrame?.cutHeight || Math.floor(src.height / 4);
    const srcColX = src.width >= 448 ? fw : 0;

    const c = document.createElement('canvas');
    c.width = 160;
    c.height = 160;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;
    const cropH = Math.min(fh, Math.round(fw * 1.08));
    ctx.drawImage(src, srcColX, 0, fw, cropH, 8, 6, 144, 148);
    const url = c.toDataURL('image/png');

    document.querySelectorAll<HTMLImageElement>('#dialogue-portrait, .hero-avatar, .cert-avatar').forEach((img) => {
      img.src = url;
    });
  } catch (err) {
    console.warn('[CrispVisuals] syncHeroPortraitToDom skipped:', err);
  }
}
