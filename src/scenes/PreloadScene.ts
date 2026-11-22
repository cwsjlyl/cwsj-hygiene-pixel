import Phaser from 'phaser';
import { sanitizeSpriteTextureAlpha, syncHeroPortraitToDom } from '../gfx/CrispVisuals';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, 460, 26, 0x1e293b).setStrokeStyle(3, 0x60a5fa);
    const fill = this.add.rectangle(width / 2 - 224, height / 2, 4, 18, 0x10b981).setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 38, '載入高清家居與香港街道地圖及去背 Sprite 圖集...', {
      fontSize: '19px', color: '#fde047', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => { fill.width = 448 * v; });

    // Full-scene HD pixel maps
    this.load.image('map-home', './assets/maps/map-home.png');
    this.load.image('map-street', './assets/maps/map-street.png');

    // 26 zero-checkerboard 2.5D furniture & scene props atlas
    this.load.atlas('home-props', './assets/sprites/home-props-atlas.png', './assets/sprites/home-props-atlas.json');

    // CWSJ HD Primary Schoolboy 4x4 spritesheet (64x84 per frame) + NPCs + Minigame sprites
    this.load.spritesheet('hero', './assets/sprites/char-cwsj-schoolboy.png', { frameWidth: 64, frameHeight: 84 });
    this.load.spritesheet('npcs', './assets/sprites/sprites-npcs-pests.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('mg', './assets/sprites/minigame-sprites.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('tiles-street', './assets/tilesets/tileset-hk-street.png', { frameWidth: 64, frameHeight: 64 });

    this.load.on('complete', () => { bg.destroy(); fill.destroy(); label.destroy(); });
  }

  create(): void {
    // Enforce crisp NEAREST pixel filtering & double-verify ZERO checkerboard on all sprite textures!
    ['map-home', 'map-street'].forEach((mk) => {
      if (this.textures.exists(mk)) this.textures.get(mk).setFilter(Phaser.Textures.FilterMode.NEAREST);
    });
    ['hero', 'home-props', 'npcs', 'mg', 'tiles-street'].forEach((sk) => {
      sanitizeSpriteTextureAlpha(this, sk);
    });
    syncHeroPortraitToDom(this);

    // 4x4 CWSJ HD Schoolboy animations (rows: 0=down, 1=left, 2=right, 3=up; cols: 0..3)
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir, row) => {
      const b = row * 4;
      this.anims.create({
        key: `hero-idle-${dir}`,
        frames: [{ key: 'hero', frame: b }],
        frameRate: 2,
        repeat: -1
      });
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
    });

    this.anims.create({
      key: 'hero-cheer',
      frames: [{ key: 'hero', frame: 1 }, { key: 'hero', frame: 0 }, { key: 'hero', frame: 3 }, { key: 'hero', frame: 0 }],
      frameRate: 7,
      repeat: 1
    });

    ['fehd', 'mom', 'man', 'girl'].forEach((role, ri) => {
      this.anims.create({
        key: `npc-${role}-walk`,
        frames: [{ key: 'npcs', frame: ri * 4 }, { key: 'npcs', frame: ri * 4 + 1 }],
        frameRate: 4,
        repeat: -1
      });
    });

    this.anims.create({ key: 'companion-float', frames: this.anims.generateFrameNumbers('npcs', { start: 16, end: 19 }), frameRate: 6, repeat: -1 });
    this.anims.create({ key: 'mosquito-fly', frames: this.anims.generateFrameNumbers('npcs', { start: 20, end: 23 }), frameRate: 11, repeat: -1 });
    this.anims.create({ key: 'rat-scurry', frames: this.anims.generateFrameNumbers('npcs', { start: 24, end: 25 }), frameRate: 8, repeat: -1 });

    this.scene.start('ExploreScene');
  }
}
