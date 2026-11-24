import Phaser from 'phaser';
import { sanitizeSpriteTextureAlpha, syncHeroPortraitToDom } from '../gfx/CrispVisuals';
import { STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';
import {
  V5_HD_CHARS_ENABLED,
  V5_HD_CHARS_EXT,
  V5_HOME_MAP_EXT,
  V5_STREET_MAP_EXT,
  V5_VALID_STREET_PROPS,
  V6_HOME_PROPS_EXT,
  V6_LIGHT_MG_NPCS,
  V6_LIGHT_STREET_TILES,
  V6_STREET_PROPS_ATLAS,
  V6_STREET_PROPS_EXT,
  V8_CHAR_MOM_EXT,
  V8_CHAR_PASSERBY_EXT
} from '../gfx/v5RuntimeConfig';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, 500, 30, 0x1e293b).setStrokeStyle(3, 0x60a5fa);
    const fill = this.add.rectangle(width / 2 - 244, height / 2, 4, 20, 0x10b981).setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 42, '載入 iPad 高清像素場景與角色...', {
      fontSize: '22px', color: '#fde047', fontStyle: 'bold', stroke: '#090d16', strokeThickness: 4
    }).setOrigin(0.5);

    this.load.on('progress', (val: number) => { fill.width = 488 * val; });
    this.load.on('loaderror', (file: { key?: string; url?: string }) => {
      console.warn('[PreloadScene] Asset load warning:', file?.key, file?.url);
    });

    const v = '?v=14';
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
      STREET_STANDALONE_PROP_SPECS.forEach((spec) => {
        if (V5_VALID_STREET_PROPS.includes(spec.key)) {
          this.load.image(`prop-street-${spec.key}`, `./assets/sprites/props-street/${spec.key}.png${v}`);
        }
      });
    }

    if (V5_HD_CHARS_ENABLED) {
      this.load.spritesheet('hero', `./assets/sprites/char-v5-hero.${V5_HD_CHARS_EXT}${v}`, { frameWidth: 112, frameHeight: 148 });
      this.load.spritesheet('char-mom', `./assets/sprites/char-v5-mom.${V8_CHAR_MOM_EXT}${v}`, { frameWidth: 112, frameHeight: 148 });
      this.load.spritesheet('char-sister', `./assets/sprites/char-v5-sister.${V5_HD_CHARS_EXT}${v}`, { frameWidth: 112, frameHeight: 148 });
      this.load.spritesheet('char-passerby', `./assets/sprites/char-v5-passerby.${V8_CHAR_PASSERBY_EXT}${v}`, { frameWidth: 112, frameHeight: 148 });
    } else {
      this.load.spritesheet('hero', `./assets/sprites/char-cwsj-schoolboy.png${v}`, { frameWidth: 64, frameHeight: 84 });
    }

    const mgNpcFrame = V6_LIGHT_MG_NPCS ? 32 : 64;
    const streetTileFrame = V6_LIGHT_STREET_TILES ? 32 : 64;
    this.load.spritesheet('npcs', `./assets/sprites/sprites-npcs-pests.png${v}`, { frameWidth: mgNpcFrame, frameHeight: mgNpcFrame });
    this.load.spritesheet('mg', `./assets/sprites/minigame-sprites.png${v}`, { frameWidth: mgNpcFrame, frameHeight: mgNpcFrame });
    this.load.spritesheet('tiles-street', `./assets/tilesets/tileset-hk-street.png${v}`, { frameWidth: streetTileFrame, frameHeight: streetTileFrame });

    this.load.on('complete', () => { bg.destroy(); fill.destroy(); label.destroy(); });
  }

  create(): void {
    try {
      if (this.textures.exists('map-home')) {
        this.textures.get('map-home').setFilter(Phaser.Textures.FilterMode.NEAREST);
      }
      if (this.textures.exists('map-street')) {
        // 1408x768 HD native map supersampled onto 1280x720 iPad viewport -> LINEAR keeps text & edges crisp
        this.textures.get('map-street').setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      if (this.textures.exists('home-props')) {
        this.textures.get('home-props').setFilter(Phaser.Textures.FilterMode.LINEAR);
      }
      if (this.textures.exists('street-props')) {
        this.textures.get('street-props').setFilter(Phaser.Textures.FilterMode.NEAREST);
      }

      sanitizeSpriteTextureAlpha(this, 'hero', Phaser.Textures.FilterMode.NEAREST, false);
      sanitizeSpriteTextureAlpha(this, 'npcs', Phaser.Textures.FilterMode.NEAREST, false);
      sanitizeSpriteTextureAlpha(this, 'mg', Phaser.Textures.FilterMode.NEAREST, false);
      sanitizeSpriteTextureAlpha(this, 'tiles-street', Phaser.Textures.FilterMode.NEAREST, false);

      ['char-mom', 'char-sister', 'char-passerby'].forEach((ck) => {
        if (this.textures.exists(ck)) {
          this.textures.get(ck).setFilter(Phaser.Textures.FilterMode.NEAREST);
        }
      });

      syncHeroPortraitToDom(this);

      const dirs = ['down', 'left', 'right', 'up'];
      dirs.forEach((dir, row) => {
        const b = row * 4;
        const idleFrame = V5_HD_CHARS_ENABLED ? b + 1 : b;
        const walkFrames = V5_HD_CHARS_ENABLED
          ? [
              { key: 'hero', frame: b },
              { key: 'hero', frame: b + 1 },
              { key: 'hero', frame: b + 2 },
              { key: 'hero', frame: b + 3 }
            ]
          : [
              { key: 'hero', frame: b + 1 },
              { key: 'hero', frame: b + 2 },
              { key: 'hero', frame: b + 3 },
              { key: 'hero', frame: b }
            ];
        if (!this.anims.exists(`hero-idle-${dir}`)) {
          this.anims.create({
            key: `hero-idle-${dir}`,
            frames: [{ key: 'hero', frame: idleFrame }],
            frameRate: 2,
            repeat: -1
          });
        }
        if (!this.anims.exists(`hero-walk-${dir}`)) {
          this.anims.create({
            key: `hero-walk-${dir}`,
            frames: walkFrames,
            frameRate: 8,
            repeat: -1
          });
        }
      });

      if (!this.anims.exists('hero-cheer')) {
        const cheerFrames = V5_HD_CHARS_ENABLED
          ? [{ key: 'hero', frame: 0 }, { key: 'hero', frame: 1 }, { key: 'hero', frame: 2 }, { key: 'hero', frame: 1 }]
          : [{ key: 'hero', frame: 1 }, { key: 'hero', frame: 0 }, { key: 'hero', frame: 3 }, { key: 'hero', frame: 0 }];
        this.anims.create({
          key: 'hero-cheer',
          frames: cheerFrames,
          frameRate: 7,
          repeat: 1
        });
      }

      if (V5_HD_CHARS_ENABLED) {
        [
          { tex: 'char-mom', prefix: 'hd-mom' },
          { tex: 'char-sister', prefix: 'hd-sister' },
          { tex: 'char-passerby', prefix: 'hd-passerby' }
        ].forEach(({ tex, prefix }) => {
          if (!this.textures.exists(tex)) return;
          dirs.forEach((dir, row) => {
            const b = row * 4;
            const k = `${prefix}-${dir}`;
            if (!this.anims.exists(k)) {
              this.anims.create({
                key: k,
                frames: [
                  { key: tex, frame: b },
                  { key: tex, frame: b + 1 },
                  { key: tex, frame: b + 2 },
                  { key: tex, frame: b + 3 }
                ],
                frameRate: 6,
                repeat: -1
              });
            }
          });
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
