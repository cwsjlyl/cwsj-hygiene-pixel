import Phaser from 'phaser';

export class PreloadScene extends Phaser.Scene {
  constructor() {
    super('PreloadScene');
  }

  preload(): void {
    const { width, height } = this.scale;
    const barBg = this.add.rectangle(width / 2, height / 2, 420, 24, 0x1e293b).setStrokeStyle(3, 0x60a5fa);
    const barFill = this.add.rectangle(width / 2 - 204, height / 2, 4, 16, 0x10b981).setOrigin(0, 0.5);
    const txt = this.add.text(width / 2, height / 2 - 36, '載入高清像素圖集中...', {
      fontSize: '20px',
      color: '#fde047',
      fontStyle: 'bold'
    }).setOrigin(0.5);

    this.load.on('progress', (val: number) => {
      barFill.width = 408 * val;
    });

    this.load.spritesheet('hero', './assets/sprites/char-student-boy.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.spritesheet('npcs', './assets/sprites/sprites-npcs-pests.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.spritesheet('tiles-home', './assets/tilesets/tileset-home-interior.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.spritesheet('tiles-street', './assets/tilesets/tileset-hk-street.png', {
      frameWidth: 64,
      frameHeight: 64
    });

    this.load.on('complete', () => {
      barBg.destroy();
      barFill.destroy();
      txt.destroy();
    });
  }

  create(): void {
    const dirs = ['down', 'left', 'right', 'up'];
    dirs.forEach((dir, row) => {
      this.anims.create({
        key: `hero-walk-${dir}`,
        frames: this.anims.generateFrameNumbers('hero', { start: row * 4, end: row * 4 + 3 }),
        frameRate: 8,
        repeat: -1
      });
      this.anims.create({
        key: `hero-idle-${dir}`,
        frames: [{ key: 'hero', frame: row * 4 }],
        frameRate: 1
      });
    });

    this.anims.create({
      key: 'companion-float',
      frames: this.anims.generateFrameNumbers('npcs', { start: 16, end: 19 }),
      frameRate: 6,
      repeat: -1
    });

    this.anims.create({
      key: 'mosquito-fly',
      frames: this.anims.generateFrameNumbers('npcs', { start: 20, end: 23 }),
      frameRate: 10,
      repeat: -1
    });

    this.anims.create({
      key: 'rat-scurry',
      frames: this.anims.generateFrameNumbers('npcs', { start: 24, end: 25 }),
      frameRate: 7,
      repeat: -1
    });

    this.scene.start('ExploreScene');
  }
}
