import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const bg = this.add.rectangle(width / 2, height / 2, 440, 26, 0x1e293b).setStrokeStyle(3, 0x60a5fa);
    const fill = this.add.rectangle(width / 2 - 214, height / 2, 4, 18, 0x10b981).setOrigin(0, 0.5);
    const label = this.add.text(width / 2, height / 2 - 38, '載入 EPX 高清像素圖集與音樂引擎...', {
      fontSize: '20px', color: '#fde047', fontStyle: 'bold'
    }).setOrigin(0.5);

    this.load.on('progress', (v: number) => { fill.width = 428 * v; });

    this.load.spritesheet('hero', './assets/sprites/char-student-boy.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('npcs', './assets/sprites/sprites-npcs-pests.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('mg', './assets/sprites/minigame-sprites.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('tiles-home', './assets/tilesets/tileset-home-interior.png', { frameWidth: 64, frameHeight: 64 });
    this.load.spritesheet('tiles-street', './assets/tilesets/tileset-hk-street.png', { frameWidth: 64, frameHeight: 64 });

    this.load.on('complete', () => { bg.destroy(); fill.destroy(); label.destroy(); });
  }

  create(): void {
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir, row) => {
      const b = row * 6;
      this.anims.create({
        key: `hero-idle-${dir}`,
        frames: [{ key: 'hero', frame: b }, { key: 'hero', frame: b + 1 }],
        frameRate: 2.5,
        repeat: -1
      });
      this.anims.create({
        key: `hero-walk-${dir}`,
        frames: [
          { key: 'hero', frame: b + 2 },
          { key: 'hero', frame: b + 3 },
          { key: 'hero', frame: b + 4 },
          { key: 'hero', frame: b + 3 }
        ],
        frameRate: 9,
        repeat: -1
      });
    });

    this.anims.create({
      key: 'hero-cheer',
      frames: [{ key: 'hero', frame: 5 }, { key: 'hero', frame: 0 }, { key: 'hero', frame: 5 }],
      frameRate: 6,
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
