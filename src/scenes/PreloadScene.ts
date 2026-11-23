import Phaser from 'phaser';
import { sanitizeSpriteTextureAlpha, syncHeroPortraitToDom } from '../gfx/CrispVisuals';
import { HOME_STANDALONE_PROP_KEYS, STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, 460, 26, 0x1e293b).setStrokeStyle(3, 0x60a5fa);
    const fill = this.add.rectangle(width / 2 - 224, height / 2, 4, 18, 0x10b981).setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 38, '載入 V4 超解析度高清地圖與 38 件獨立無損去背物件...', {
      fontSize: '19px', color: '#fde047', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => { fill.width = 448 * v; });
    this.load.on('loaderror', (file: { key?: string; url?: string }) => {
      console.warn('[PreloadScene] Asset load warning:', file?.key, file?.url);
    });

    const v = '?v=6';
    this.load.image('map-home', `./assets/maps/map-home.png${v}`);
    this.load.image('map-street', `./assets/maps/map-street.png${v}`);
    this.load.atlas('home-props', `./assets/sprites/home-props-atlas.png${v}`, `./assets/sprites/home-props-atlas.json${v}`);

    HOME_STANDALONE_PROP_KEYS.forEach((key) => {
      this.load.image(`prop-home-${key}`, `./assets/sprites/props-home/${key}.png${v}`);
    });
    STREET_STANDALONE_PROP_SPECS.forEach((spec) => {
      this.load.image(`prop-street-${spec.key}`, `./assets/sprites/props-street/${spec.key}.png${v}`);
    });

    this.load.spritesheet('hero', `./assets/sprites/char-cwsj-schoolboy.png${v}`, { frameWidth: 64, frameHeight: 84 });
    this.load.spritesheet('npcs', `./assets/sprites/sprites-npcs-pests.png${v}`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('mg', `./assets/sprites/minigame-sprites.png${v}`, { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('tiles-street', `./assets/tilesets/tileset-hk-street.png${v}`, { frameWidth: 64, frameHeight: 64 });

    this.load.on('complete', () => { bg.destroy(); fill.destroy(); label.destroy(); });
  }

  create(): void {
    try {
      // 1:1 EPX-2x Compact Home map uses NEAREST for razor-sharp pixel fidelity
      if (this.textures.exists('map-home')) {
        this.textures.get('map-home').setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      // 2x-EPX supersampled Street map & standalone props use LINEAR supersampling when scaled
      if (this.textures.exists('map-street')) {
        this.textures.get('map-street').setFilter(Phaser.Textures.FilterMode.LINEAR);
      }

      ['hero', 'home-props', 'npcs', 'mg', 'tiles-street'].forEach((sk) => {
        sanitizeSpriteTextureAlpha(this, sk);
      });

      HOME_STANDALONE_PROP_KEYS.forEach((key) => {
        const tk = `prop-home-${key}`;
        if (this.textures.exists(tk)) {
          this.textures.get(tk).setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
      });
      STREET_STANDALONE_PROP_SPECS.forEach((spec) => {
        const tk = `prop-street-${spec.key}`;
        if (this.textures.exists(tk)) {
          this.textures.get(tk).setFilter(Phaser.Textures.FilterMode.LINEAR);
        }
      });

      syncHeroPortraitToDom(this);

      const dirs = ['down', 'left', 'right', 'up'];
      dirs.forEach((dir, row) => {
        const b = row * 4;
        if (!this.anims.exists(`hero-idle-${dir}`)) {
          this.anims.create({
            key: `hero-idle-${dir}`,
            frames: [{ key: 'hero', frame: b }],
            frameRate: 2,
            repeat: -1
          });
        }
        if (!this.anims.exists(`hero-walk-${dir}`)) {
          this.anims.create({
            key: `hero-walk-${dir}`,
            frames: [
              { key: 'hero', frame: b + 1 },
              { key: 'hero', frame: b + 2 },
              { key: 'hero', frame: b + 3 },
              { key: 'hero', frame: b }
            ],
            frameRate: 9,
            repeat: -1
          });
        }
      });

      if (!this.anims.exists('hero-cheer')) {
        this.anims.create({
          key: 'hero-cheer',
          frames: [{ key: 'hero', frame: 1 }, { key: 'hero', frame: 0 }, { key: 'hero', frame: 3 }, { key: 'hero', frame: 0 }],
          frameRate: 7,
          repeat: 1
        });
      }

      ['fehd', 'mom', 'man', 'girl'].forEach((role, ri) => {
        const k = `npc-${role}-walk`;
        if (!this.anims.exists(k)) {
          this.anims.create({
            key: k,
            frames: [{ key: 'npcs', frame: ri * 4 }, { key: 'npcs', frame: ri * 4 + 1 }],
            frameRate: 4,
            repeat: -1
          });
        }
      });

      if (!this.anims.exists('companion-float')) {
        this.anims.create({ key: 'companion-float', frames: this.anims.generateFrameNumbers('npcs', { start: 16, end: 19 }), frameRate: 6, repeat: -1 });
      }
      if (!this.anims.exists('mosquito-fly')) {
        this.anims.create({ key: 'mosquito-fly', frames: this.anims.generateFrameNumbers('npcs', { start: 20, end: 23 }), frameRate: 11, repeat: -1 });
      }
      if (!this.anims.exists('rat-scurry')) {
        this.anims.create({ key: 'rat-scurry', frames: this.anims.generateFrameNumbers('npcs', { start: 24, end: 25 }), frameRate: 8, repeat: -1 });
      }
    } catch (err) {
      console.error('[PreloadScene] Non-fatal init error:', err);
    }

    this.scene.start('ExploreScene');
  }
}
