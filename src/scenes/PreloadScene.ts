import Phaser from 'phaser';
import { sanitizeSpriteTextureAlpha } from '../gfx/CrispVisuals';
import { STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';
import {
  V5_HD_CHARS_ENABLED,
  V5_HOME_MAP_EXT,
  V5_STREET_MAP_EXT,
  V5_VALID_STREET_PROPS,
  V6_HOME_PROPS_EXT,
  V6_LIGHT_MG_NPCS,
  V6_LIGHT_STREET_TILES,
  V6_STREET_PROPS_ATLAS,
  V6_STREET_PROPS_EXT
} from '../gfx/v5RuntimeConfig';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.cameras.main;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0f172a);
    const card = this.add.graphics();
    card.fillStyle(0x1e293b, 0.96);
    card.fillRoundedRect(width / 2 - 250, height / 2 - 115, 500, 230, 18);
    card.lineStyle(3, 0x38bdf8, 1);
    card.strokeRoundedRect(width / 2 - 250, height / 2 - 115, 500, 230, 18);

    this.add
      .text(width / 2, height / 2 - 66, '彩雲聖若瑟小學', {
        fontFamily: '"Noto Sans TC", "PingFang HK", "Microsoft JhengHei", sans-serif',
        fontSize: '28px',
        fontStyle: '900',
        color: '#fde047',
        stroke: '#0f172a',
        strokeThickness: 4
      })
      .setOrigin(0.5);

    this.add
      .text(width / 2, height / 2 - 26, '個人及環境衛生大作戰・載入像素世界中…', {
        fontFamily: '"Noto Sans TC", "PingFang HK", "Microsoft JhengHei", sans-serif',
        fontSize: '18px',
        fontStyle: 'bold',
        color: '#e2e8f0'
      })
      .setOrigin(0.5);

    const barBg = this.add.graphics();
    barBg.fillStyle(0x0f172a, 1);
    barBg.fillRoundedRect(width / 2 - 190, height / 2 + 18, 380, 26, 13);
    barBg.lineStyle(2, 0x475569, 1);
    barBg.strokeRoundedRect(width / 2 - 190, height / 2 + 18, 380, 26, 13);

    const barFill = this.add.graphics();
    const pctText = this.add
      .text(width / 2, height / 2 + 66, '0%', {
        fontFamily: 'monospace',
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#38bdf8'
      })
      .setOrigin(0.5);

    this.load.on('progress', (val: number) => {
      barFill.clear();
      barFill.fillStyle(0x22c55e, 1);
      barFill.fillRoundedRect(width / 2 - 186, height / 2 + 22, Math.max(16, 372 * val), 18, 9);
      pctText.setText(`${Math.round(val * 100)}%`);
    });

    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      console.error(`[PreloadScene] Asset failed to load: key=${file.key}, url=${file.url}`);
    });

    const v = '?v=13';

    this.load.image('map-home', `./assets/maps/map-home.${V5_HOME_MAP_EXT}${v}`);
    this.load.image('map-street', `./assets/maps/map-street.${V5_STREET_MAP_EXT}${v}`);
    this.load.atlas(
      'home-props',
      `./assets/sprites/home-props-atlas.${V6_HOME_PROPS_EXT}${v}`,
      `./assets/sprites/home-props-atlas.json${v}`
    );

    if (V6_STREET_PROPS_ATLAS) {
      this.load.atlas(
        'street-props',
        `./assets/sprites/street-props-atlas.${V6_STREET_PROPS_EXT}${v}`,
        `./assets/sprites/street-props-atlas.json${v}`
      );
    } else {
      for (const spec of STREET_STANDALONE_PROP_SPECS) {
        if (!V5_VALID_STREET_PROPS.includes(spec.key)) continue;
        this.load.image(`street-prop-${spec.key}`, `./assets/sprites/props-street/${spec.key}.png${v}`);
      }
    }

    const streetTileSize = V6_LIGHT_STREET_TILES ? 32 : 64;
    this.load.spritesheet('tiles-street', `./assets/tilesets/tileset-hk-street.png${v}`, {
      frameWidth: streetTileSize,
      frameHeight: streetTileSize
    });

    if (V5_HD_CHARS_ENABLED) {
      this.load.spritesheet('hero', `./assets/sprites/char-v5-hero.webp${v}`, {
        frameWidth: 112,
        frameHeight: 148
      });
      this.load.spritesheet('char-mom', `./assets/sprites/char-v5-mom.webp${v}`, {
        frameWidth: 112,
        frameHeight: 148
      });
      this.load.spritesheet('char-sister', `./assets/sprites/char-v5-sister.webp${v}`, {
        frameWidth: 112,
        frameHeight: 148
      });
      this.load.spritesheet('char-passerby', `./assets/sprites/char-v5-passerby.webp${v}`, {
        frameWidth: 112,
        frameHeight: 148
      });
    } else {
      this.load.spritesheet('hero', `./assets/sprites/char-cwsj-schoolboy.png${v}`, {
        frameWidth: 48,
        frameHeight: 64
      });
    }

    const npcMgTileSize = V6_LIGHT_MG_NPCS ? 32 : 64;
    this.load.spritesheet('npcs', `./assets/sprites/sprites-npcs-pests.png${v}`, {
      frameWidth: npcMgTileSize,
      frameHeight: npcMgTileSize
    });
    this.load.spritesheet('mg', `./assets/sprites/minigame-sprites.png${v}`, {
      frameWidth: npcMgTileSize,
      frameHeight: npcMgTileSize
    });

    this.load.image('portrait-hero', `./assets/ui/portrait-student-boy.png${v}`);
    this.load.image('cwsj-logo', `./assets/ui/cwsj-logo.png${v}`);
  }

  create(): void {
    const crispMapKeys = ['map-home', 'map-street', 'home-props', 'street-props', 'cwsj-logo', 'portrait-hero'];
    for (const k of crispMapKeys) {
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    for (const spec of STREET_STANDALONE_PROP_SPECS) {
      const k = `street-prop-${spec.key}`;
      if (this.textures.exists(k)) {
        this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
    }

    if (V5_HD_CHARS_ENABLED) {
      for (const k of ['hero', 'char-mom', 'char-sister', 'char-passerby']) {
        if (this.textures.exists(k)) {
          this.textures.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      }
    } else {
      sanitizeSpriteTextureAlpha(this, 'hero', Phaser.Textures.FilterMode.NEAREST, true);
    }

    for (const k of ['npcs', 'mg', 'tiles-street']) {
      sanitizeSpriteTextureAlpha(this, k, Phaser.Textures.FilterMode.NEAREST, false);
    }

    this.createHeroAnimations();
    this.createPestAnimations();
    this.scene.start('ExploreScene', { area: 'home' });
  }

  private createHeroAnimations(): void {
    const dirs: Array<{ key: string; row: number }> = [
      { key: 'down', row: 0 },
      { key: 'left', row: 1 },
      { key: 'right', row: 2 },
      { key: 'up', row: 3 }
    ];
    dirs.forEach(({ key, row }) => {
      const base = row * 4;
      if (!this.anims.exists(`hero-walk-${key}`)) {
        this.anims.create({
          key: `hero-walk-${key}`,
          frames: this.anims.generateFrameNumbers('hero', {
            frames: [base, base + 1, base + 2, base + 3]
          }),
          frameRate: 8,
          repeat: -1
        });
      }
      if (!this.anims.exists(`hero-idle-${key}`)) {
        this.anims.create({
          key: `hero-idle-${key}`,
          frames: [{ key: 'hero', frame: base }],
          frameRate: 2,
          repeat: -1
        });
      }
    });

    if (V5_HD_CHARS_ENABLED) {
      const npcSheets: Array<{ sheet: string; prefix: string }> = [
        { sheet: 'char-mom', prefix: 'mom' },
        { sheet: 'char-sister', prefix: 'sister' },
        { sheet: 'char-passerby', prefix: 'passerby' }
      ];
      for (const { sheet, prefix } of npcSheets) {
        if (!this.textures.exists(sheet)) continue;
        dirs.forEach(({ key, row }) => {
          const base = row * 4;
          const walkKey = `${prefix}-walk-${key}`;
          if (!this.anims.exists(walkKey)) {
            this.anims.create({
              key: walkKey,
              frames: this.anims.generateFrameNumbers(sheet, {
                frames: [base, base + 1, base + 2, base + 3]
              }),
              frameRate: 6,
              repeat: -1
            });
          }
        });
      }
    }
  }

  private createPestAnimations(): void {
    if (!this.anims.exists('roach-scurry')) {
      this.anims.create({
        key: 'roach-scurry',
        frames: this.anims.generateFrameNumbers('npcs', { frames: [12, 13] }),
        frameRate: 7,
        repeat: -1
      });
    }
    if (!this.anims.exists('mosquito-fly')) {
      this.anims.create({
        key: 'mosquito-fly',
        frames: this.anims.generateFrameNumbers('npcs', { frames: [8, 9] }),
        frameRate: 9,
        repeat: -1
      });
    }
    if (!this.anims.exists('rat-run')) {
      this.anims.create({
        key: 'rat-run',
        frames: this.anims.generateFrameNumbers('npcs', { frames: [16, 17] }),
        frameRate: 7,
        repeat: -1
      });
    }
  }
}
