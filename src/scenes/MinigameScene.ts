import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { V6_HOME_PROPS_SCALE, V6_LIGHT_MG_NPCS, V6_LIGHT_STREET_TILES } from '../gfx/v5RuntimeConfig';
import { MedalRank } from '../state/gameState';

interface MinigameInitData {
  taskId: string;
  onComplete: (medal: MedalRank, bonusScore: number) => void;
  onCancel: () => void;
}

const MG_MULT = V6_LIGHT_MG_NPCS ? 2 : 1;
const STREET_TILE_MULT = V6_LIGHT_STREET_TILES ? 2 : 1;

export class MinigameScene extends Phaser.Scene {
  private taskId = '';
  private onCompleteCb!: (medal: MedalRank, bonusScore: number) => void;
  private onCancelCb!: () => void;

  private mistakes = 0;
  private combo = 0;
  private maxCombo = 0;
  private finished = false;
  private progFill!: Phaser.GameObjects.Rectangle;
  private statusText!: Phaser.GameObjects.Text;

  constructor() {
    super('MinigameScene');
  }

  init(data: MinigameInitData): void {
    this.taskId = data.taskId;
    this.onCompleteCb = data.onComplete;
    this.onCancelCb = data.onCancel;
    this.mistakes = 0;
    this.combo = 0;
    this.maxCombo = 0;
    this.finished = false;
  }

  create(): void {
    sound.playBgm('minigame');

    this.add.rectangle(640, 360, 1280, 720, 0x060b16, 0.9);
    this.add.rectangle(640, 396, 1080, 572, 0x0f172a).setStrokeStyle(6, 0xfbbf24);
    this.add.rectangle(640, 140, 1080, 62, 0x1e3a8a).setStrokeStyle(4, 0xfbbf24);

    this.add.rectangle(620, 194, 620, 20, 0x1e293b).setStrokeStyle(2, 0x64748b);
    this.progFill = this.add.rectangle(312, 194, 4, 14, 0x10b981).setOrigin(0, 0.5);

    this.statusText = this.add.text(985, 194, '連擊 x0', {
      fontSize: '21px', color: '#fde047', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
    }).setOrigin(0.5);

    const exitBtn = this.add.text(1132, 140, '✕ 返回', {
      fontSize: '19px', color: '#ffffff', backgroundColor: '#dc2626', padding: { x: 12, y: 7 }, fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    exitBtn.on('pointerdown', () => {
      sound.pop();
      this.exitScene(false, 'none', 0);
    });

    switch (this.taskId) {
      case 'wash_hands': this.setupWashHands(); break;
      case 'brush_teeth': this.setupBrushTeeth(); break;
      case 'trim_nails': this.setupTrimNails(); break;
      case 'cover_food': this.setupCoverFood(); break;
      case 'clear_saucer': this.setupClearSaucer(); break;
      case 'recycle_bottles': this.setupRecycleBottles(); break;
      case 'spray_mosquito': this.setupSprayMosquito(); break;
      case 'seal_rathole': this.setupSealRatHole(); break;
      case 'fehd_quiz': this.setupFehdQuiz(); break;
    }
  }

  private homeProp(x: number, y: number, key: string, scale: number): Phaser.GameObjects.Image {
    return this.add.image(x, y, 'home-props', key).setScale(scale * V6_HOME_PROPS_SCALE);
  }

  private mgImg(x: number, y: number, frame: number, scale: number): Phaser.GameObjects.Image {
    return this.add.image(x, y, 'mg', frame).setScale(scale * MG_MULT);
  }

  private mgSpr(x: number, y: number, frame: number, scale: number): Phaser.GameObjects.Sprite {
    return this.add.sprite(x, y, 'mg', frame).setScale(scale * MG_MULT);
  }

  private npcSpr(x: number, y: number, frame: number, scale: number): Phaser.GameObjects.Sprite {
    return this.add.sprite(x, y, 'npcs', frame).setScale(scale * MG_MULT);
  }

  private setHeader(title: string, tip: string): void {
    this.add.text(132, 140, title, {
      fontSize: '26px', color: '#fde047', fontStyle: 'bold', stroke: '#020617', strokeThickness: 4
    }).setOrigin(0, 0.5);
    this.add.text(640, 234, tip, {
      fontSize: '19px', color: '#e0f2fe', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3, wordWrap: { width: 1020 }
    }).setOrigin(0.5);
  }

  private updateProgress(ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    this.progFill.width = Math.max(4, 614 * r);
    this.maxCombo = Math.max(this.maxCombo, this.combo);
    this.statusText.setText(`連擊 x${this.combo}`);
  }

  private burst(x: number, y: number, color = 0x38bdf8, count = 8): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count;
      const p = this.add.rectangle(x, y, 8, 8, color);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * 44,
        y: y + Math.sin(ang) * 44,
        alpha: 0,
        scale: 0.3,
        duration: 340,
        onComplete: () => p.destroy()
      });
    }
  }

  private floatScore(x: number, y: number, label: string, color = '#fde047'): void {
    const t = this.add.text(x, y, label, {
      fontSize: '22px', color, fontStyle: 'bold', stroke: '#020617', strokeThickness: 4
    }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 38, alpha: 0, duration: 680, onComplete: () => t.destroy() });
  }

  private winGame(): void {
    if (this.finished) return;
    this.finished = true;
    sound.success();

    const medal: MedalRank = this.mistakes === 0 ? 'gold' : this.mistakes <= 2 ? 'silver' : 'bronze';
    const bonus = medal === 'gold' ? 80 : medal === 'silver' ? 40 : 15;
    const medalLabel = medal === 'gold' ? '🥇 金牌通關' : medal === 'silver' ? '🥈 銀牌通關' : '🥉 銅牌通關';

    this.add.rectangle(640, 410, 540, 200, 0x064e3b).setStrokeStyle(5, 0xfbbf24).setDepth(500);
    this.add.text(640, 405, `${medalLabel}！\n連擊獎勵 +${bonus} 分`, {
      fontSize: '30px', color: '#fde047', fontStyle: 'bold', align: 'center', stroke: '#020617', strokeThickness: 4
    }).setOrigin(0.5).setDepth(501);

    this.time.delayedCall(1100, () => this.exitScene(true, medal, bonus));
  }

  private exitScene(won: boolean, medal: MedalRank, bonus: number): void {
    document.getElementById('touch-controls')?.classList.remove('hidden');
    this.scene.stop();
    this.scene.resume('ExploreScene');
    if (won) this.onCompleteCb(medal, bonus);
    else this.onCancelCb();
  }

  private setupWashHands(): void {
    this.setHeader('🧼 洗手泡泡滅菌戰', '輕觸或滑過游走的「像素病毒與細菌」，發射番梘泡泡將雙手徹底洗淨（消滅 12 隻）！');
    this.add.rectangle(640, 442, 920, 355, 0x0c4a6e).setStrokeStyle(3, 0x38bdf8);
    this.homeProp(255, 525, 'sink_vanity', 1.15).setAlpha(0.85);

    this.mgImg(560, 450, 0, 2.3).setAlpha(0.95);
    this.mgImg(720, 450, 0, 2.3).setFlipX(true).setAlpha(0.95);
    const soap = this.mgImg(640, 575, 1, 1.5);

    let cleared = 0;
    const total = 12;

    const spawnGerm = () => {
      if (this.finished) return;
      const frame = Math.random() < 0.5 ? 3 : 4;
      const g = this.mgSpr(260 + Math.random() * 760, 295 + Math.random() * 245, frame, 1.25).setInteractive({ useHandCursor: true });
      this.tweens.add({
        targets: g,
        x: Phaser.Math.Clamp(g.x + (Math.random() - 0.5) * 260, 240, 1050),
        y: Phaser.Math.Clamp(g.y + (Math.random() - 0.5) * 180, 285, 560),
        duration: 1100 + Math.random() * 600,
        yoyo: true,
        repeat: -1
      });

      const zap = () => {
        if (!g.active || this.finished) return;
        const gx = g.x, gy = g.y;
        g.disableInteractive();
        const bub = this.mgImg(soap.x, soap.y - 20, 2, 0.9);
        this.tweens.add({ targets: soap, scaleY: 1.3 * MG_MULT, duration: 80, yoyo: true });
        this.tweens.add({
          targets: bub, x: gx, y: gy, duration: 150,
          onComplete: () => {
            bub.destroy();
            if (g.active) g.destroy();
            this.burst(gx, gy, 0x7dd3fc, 10);
            this.combo++;
            sound.combo(this.combo);
            cleared++;
            this.floatScore(gx, gy, '✨泡泡滅菌!');
            this.updateProgress(cleared / total);
            if (cleared >= total) this.winGame();
          }
        });
      };

      g.on('pointerdown', zap);
      g.on('pointerover', (p: Phaser.Input.Pointer) => { if (p.isDown) zap(); });
    };

    for (let i = 0; i < 6; i++) spawnGerm();
    this.time.addEvent({ delay: 650, repeat: 5, callback: spawnGerm });
  }

  private setupBrushTeeth(): void {
    this.setHeader('🪥 護齒刷牙大掃除', '按住並來回滑動刷洗全部 10 顆「黃色牙菌膜牙齒」（每顆刷 3 下），並拍走紅色蛀牙菌！');
    this.add.rectangle(640, 442, 920, 355, 0x3b0764).setStrokeStyle(3, 0xf472b6);
    this.homeProp(235, 325, 'mirror', 1.3);
    this.homeProp(1040, 330, 'towel', 1.3);

    const brush = this.mgImg(640, 540, 7, 1.7).setDepth(50);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      brush.setPosition(Phaser.Math.Clamp(p.x, 220, 1060), Phaser.Math.Clamp(p.y, 275, 590));
    });

    let cleanTeeth = 0;
    for (let i = 0; i < 10; i++) {
      const tx = 350 + (i % 5) * 145;
      const ty = i < 5 ? 360 : 500;
      const tooth = this.mgSpr(tx, ty, 6, 1.65).setInteractive({ useHandCursor: true });
      let scrubs = 0;
      let cooldown = 0;

      const scrub = () => {
        if (this.finished || scrubs >= 3 || this.time.now - cooldown < 140) return;
        cooldown = this.time.now;
        scrubs++;
        sound.pop();
        this.burst(tx, ty, 0xe0f2fe, 5);
        tooth.setAngle(scrubs % 2 === 0 ? -7 : 7);
        if (scrubs >= 3) {
          tooth.setFrame(5).setAngle(0);
          cleanTeeth++;
          this.combo++;
          sound.combo(this.combo);
          this.floatScore(tx, ty - 20, '✨潔白!');
          this.updateProgress(cleanTeeth / 10);
          if (cleanTeeth >= 10) this.winGame();
        }
      };

      tooth.on('pointerdown', scrub);
      tooth.on('pointerover', (p: Phaser.Input.Pointer) => { if (p.isDown) scrub(); });
    }

    this.time.addEvent({
      delay: 1900,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const imp = this.mgSpr(300 + Math.random() * 680, 430, 8, 1.25).setInteractive({ useHandCursor: true });
        imp.on('pointerdown', () => {
          this.combo++;
          sound.combo(this.combo);
          this.burst(imp.x, imp.y, 0xfb7185, 8);
          imp.destroy();
        });
        this.time.delayedCall(1600, () => { if (imp.active) imp.destroy(); });
      }
    });
  }

  private setupTrimNails(): void {
    this.setHeader('💅 精準剪甲節奏王', '當上方移動的「銀色指甲鉗」對準下方藏垢長指甲時，點擊畫面精準修剪全部 5 指！');
    this.add.rectangle(640, 442, 920, 355, 0x1e293b).setStrokeStyle(3, 0x38bdf8);
    this.homeProp(245, 515, 'computer_desk', 1.1).setAlpha(0.85);

    const fingers: { x: number; spr: Phaser.GameObjects.Sprite; trimmed: boolean }[] = [];
    for (let i = 0; i < 5; i++) {
      const fx = 360 + i * 145;
      const spr = this.mgSpr(fx, 518, 9, 1.9);
      this.add.circle(fx, 438, 18, 0x10b981, 0.28).setStrokeStyle(2, 0x34d399);
      fingers.push({ x: fx, spr, trimmed: false });
    }

    const clipper = this.mgSpr(280, 348, 11, 1.8).setAngle(90);
    this.tweens.add({ targets: clipper, x: 1020, duration: 1550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    let doneCount = 0;
    const zone = this.add.rectangle(640, 442, 920, 355, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.finished) return;
      this.tweens.add({ targets: clipper, y: 418, duration: 90, yoyo: true });
      const hit = fingers.find(f => !f.trimmed && Math.abs(f.x - clipper.x) <= 44);
      if (hit) {
        hit.trimmed = true;
        hit.spr.setFrame(10);
        doneCount++;
        this.combo++;
        sound.combo(this.combo);
        this.burst(hit.x, 455, 0x34d399, 10);
        this.floatScore(hit.x, 420, '✂️ 乾淨利落!');
        this.updateProgress(doneCount / 5);
        if (doneCount >= 5) this.winGame();
      } else {
        this.mistakes++;
        this.combo = 0;
        sound.wrong();
        this.cameras.main.shake(120, 0.006);
        this.floatScore(clipper.x, 390, '未對準綠圈！', '#fca5a5');
      }
    });
  }

  private setupCoverFood(): void {
    this.setHeader('🍲 餐桌防鼠保衛戰', '點擊 4 碟餸菜蓋上「防塵罩」，並拍走偷襲的老鼠與蒼蠅（完成加蓋及擊退 6 隻害蟲）！');
    this.add.rectangle(640, 442, 920, 355, 0x451a03).setStrokeStyle(3, 0xf59e0b);
    this.homeProp(640, 460, 'dining_table', 3.1);

    let covered = 0;
    let swatted = 0;
    const check = () => {
      this.updateProgress((covered + Math.min(6, swatted)) / 10);
      if (covered >= 4 && swatted >= 6) this.winGame();
    };

    const positions = [[510, 390], [770, 390], [510, 480], [770, 480]];
    positions.forEach(([px, py]) => {
      const dish = this.mgSpr(px, py, 12, 1.6).setInteractive({ useHandCursor: true });
      let isCov = false;
      dish.on('pointerdown', () => {
        if (isCov || this.finished) return;
        isCov = true;
        covered++;
        this.combo++;
        sound.combo(this.combo);
        const dome = this.mgImg(px, py - 50, 13, 1.65);
        this.tweens.add({ targets: dome, y: py - 6, duration: 200, ease: 'Bounce.easeOut' });
        this.floatScore(px, py - 30, '🛡️ 已加蓋!');
        check();
      });
    });

    this.time.addEvent({
      delay: 720,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const isRat = Math.random() < 0.6;
        const side = Math.random() < 0.5 ? 210 : 1070;
        const py = 295 + Math.random() * 275;
        const pest = isRat
          ? this.npcSpr(side, py, 24, 1.3).play('rat-scurry')
          : this.mgSpr(side, py, 15, 1.2);
        pest.setFlipX(side < 640).setInteractive({ useHandCursor: true });
        this.tweens.add({
          targets: pest, x: 640, y: 440, duration: 2400,
          onComplete: () => {
            if (pest.active) {
              this.mistakes++;
              this.combo = 0;
              sound.wrong();
              pest.destroy();
            }
          }
        });
        pest.on('pointerdown', () => {
          if (!pest.active || this.finished) return;
          swatted++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(pest.x, pest.y, 0xfbbf24, 8);
          this.floatScore(pest.x, pest.y, isRat ? '🐭 擊退老鼠!' : '🪰 拍走蒼蠅!');
          pest.destroy();
          check();
        });
      }
    });
  }

  private setupClearSaucer(): void {
    this.setHeader('🪴 倒積水滅孑孓挑戰', '連點 4 個積水花盆底盤倒走積水，並點擊消滅水中扭動的「孑孓」與飛出的白紋伊蚊！');
    this.add.rectangle(640, 442, 920, 355, 0x14532d).setStrokeStyle(3, 0x4ade80);
    this.homeProp(235, 350, 'plant_large', 1.1);
    this.homeProp(1045, 360, 'plant_whitepot', 1.2);

    let dryCount = 0;
    let larvaCleared = 0;
    const check = () => {
      this.updateProgress((dryCount * 2 + larvaCleared) / 16);
      if (dryCount >= 4 && larvaCleared >= 8) this.winGame();
    };

    for (let i = 0; i < 4; i++) {
      const sx = 310 + i * 220;
      const saucer = this.mgSpr(sx, 520, 16, 1.85).setInteractive({ useHandCursor: true });
      let taps = 0;
      saucer.on('pointerdown', () => {
        if (this.finished || taps >= 3) return;
        taps++;
        sound.pop();
        this.tweens.add({ targets: saucer, angle: taps * 10, duration: 90, yoyo: true });
        this.burst(sx, 510, 0x38bdf8, 6);
        if (taps >= 3) {
          saucer.setFrame(18);
          dryCount++;
          this.combo++;
          sound.combo(this.combo);
          this.floatScore(sx, 475, '✨積水清乾!');
          check();
        }
      });

      for (let k = 0; k < 2; k++) {
        const lv = this.mgSpr(sx - 24 + k * 48, 410 - k * 45, 17, 1.35).setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: lv, angle: { from: -18, to: 18 }, y: lv.y - 22, duration: 520, yoyo: true, repeat: -1 });
        lv.on('pointerdown', () => {
          if (this.finished) return;
          larvaCleared++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(lv.x, lv.y, 0x86efac, 8);
          this.floatScore(lv.x, lv.y, '🦟 消滅孑孓!');
          lv.destroy();
          check();
        });
      }
    }
  }

  private setupRecycleBottles(): void {
    this.setHeader('♻️ 香港三色回收快手', '看準中央出現的垃圾，點擊下方正確的「藍廢紙、黃鋁罐、啡膠樽、有蓋垃圾桶」（完成 8 件）！');
    this.add.rectangle(640, 442, 920, 355, 0x1e293b).setStrokeStyle(3, 0x60a5fa);

    const items = [
      { frame: 20, bin: 0, name: '廢報紙 → 藍廢紙箱' },
      { frame: 21, bin: 1, name: '汽水鋁罐 → 黃鋁罐箱' },
      { frame: 22, bin: 2, name: '飲品膠樽 → 啡膠樽箱' },
      { frame: 19, bin: 3, name: '食剩果皮 → 有蓋垃圾桶' }
    ];
    let solved = 0;
    let cur = items[2];

    const curSpr = this.mgSpr(640, 355, cur.frame, 2.2);
    const curLabel = this.add.text(640, 428, '請選擇下方正確回收桶！', {
      fontSize: '21px', color: '#fde047', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
    }).setOrigin(0.5);

    const bins = [
      { idx: 0, frame: 23, title: '藍：廢紙', x: 335 },
      { idx: 1, frame: 24, title: '黃：鋁罐', x: 538 },
      { idx: 2, frame: 25, title: '啡：膠樽', x: 742 },
      { idx: 3, frame: 14, title: '有蓋垃圾桶', x: 945 }
    ];

    bins.forEach(b => {
      const bs = this.mgSpr(b.x, 525, b.frame, 1.75).setInteractive({ useHandCursor: true });
      this.add.text(b.x, 592, b.title, {
        fontSize: '19px', color: '#ffffff', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
      }).setOrigin(0.5);
      bs.on('pointerdown', () => {
        if (this.finished) return;
        if (b.idx === cur.bin) {
          solved++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(b.x, 500, 0x34d399, 10);
          this.floatScore(b.x, 470, `✅ ${cur.name}`);
          this.updateProgress(solved / 8);
          if (solved >= 8) { this.winGame(); return; }
          cur = items[Math.floor(Math.random() * items.length)];
          curSpr.setFrame(cur.frame);
          this.tweens.add({ targets: curSpr, scale: { from: 0.6 * MG_MULT, to: 2.2 * MG_MULT }, duration: 200 });
        } else {
          this.mistakes++;
          this.combo = 0;
          sound.wrong();
          this.cameras.main.shake(120, 0.006);
          curLabel.setText('❌ 口訣：藍廢紙、黃鋁罐、啡膠樽，廚餘入有蓋桶！').setColor('#fca5a5');
        }
      });
    });
  }

  private setupSprayMosquito(): void {
    this.setHeader('🦟 冷氣止漏 ＋ DEET 驅蚊射擊', '先點左上「滴水冷氣」修好排水喉，再點擊噴灑 DEET 消滅 7 隻白紋伊蚊（切勿誤噴彩蝶）！');
    this.add.rectangle(640, 442, 920, 355, 0x064e3b).setStrokeStyle(3, 0x34d399);

    let acFixed = false;
    let kills = 0;
    const acSpr = this.add.sprite(300, 332, 'tiles-street', 9)
      .setScale(1.65 * STREET_TILE_MULT)
      .setInteractive({ useHandCursor: true });
    const acHint = this.add.text(300, 396, '🔧 點擊修好滴水冷氣', {
      fontSize: '18px', color: '#fde047', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
    }).setOrigin(0.5);
    acSpr.on('pointerdown', () => {
      if (acFixed || this.finished) return;
      acFixed = true;
      acSpr.setFrame(10);
      acHint.setText('✅ 排水喉已接妥').setColor('#6ee7b7');
      sound.combo(3);
      this.burst(300, 332, 0x38bdf8, 12);
      this.updateProgress((1 + kills) / 8);
      if (acFixed && kills >= 7) this.winGame();
    });

    const can = this.mgImg(640, 568, 26, 1.6).setDepth(40);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { can.x = Phaser.Math.Clamp(p.x, 260, 1020); });

    this.time.addEvent({
      delay: 750,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const isButterfly = Math.random() < 0.25;
        const sx = 370 + Math.random() * 630;
        const sy = 295 + Math.random() * 205;
        const target = isButterfly
          ? this.mgSpr(sx, sy, 28, 1.3)
          : this.npcSpr(sx, sy, 20, 1.45).play('mosquito-fly');
        target.setInteractive({ useHandCursor: true });
        this.tweens.add({
          targets: target,
          x: Phaser.Math.Clamp(sx + (Math.random() - 0.5) * 320, 320, 1030),
          y: Phaser.Math.Clamp(sy + (Math.random() - 0.5) * 160, 270, 510),
          duration: 950, yoyo: true, repeat: 2,
          onComplete: () => { if (target.active) target.destroy(); }
        });

        target.on('pointerdown', () => {
          if (this.finished) return;
          const mist = this.mgImg(target.x, target.y, 27, 1.4);
          this.tweens.add({ targets: mist, alpha: 0, scale: 2 * MG_MULT, duration: 300, onComplete: () => mist.destroy() });
          if (isButterfly) {
            this.mistakes++;
            this.combo = 0;
            sound.wrong();
            this.floatScore(target.x, target.y, '🦋 勿噴益蟲蝴蝶!', '#fca5a5');
          } else {
            kills++;
            this.combo++;
            sound.combo(this.combo);
            this.floatScore(target.x, target.y, '💨 DEET 滅蚊!');
            this.updateProgress(((acFixed ? 1 : 0) + Math.min(7, kills)) / 8);
            if (acFixed && kills >= 7) this.winGame();
          }
          target.destroy();
        });
      }
    });
  }

  private setupSealRatHole(): void {
    this.setHeader('🕳️ 防鼠三部曲：封鎖破損鼠洞', '先點選下方工具：① 用「水泥灰刀」批平 3 個鼠洞 → ② 再釘上「金屬鐵絲網」（切勿用廢報紙）！');
    this.add.rectangle(640, 442, 920, 355, 0x334155).setStrokeStyle(3, 0xfbbf24);

    let selectedTool: 'cement' | 'mesh' | 'paper' = 'cement';
    const tools = [
      { id: 'cement' as const, frame: 30, label: '① 水泥砂漿', x: 400 },
      { id: 'mesh' as const, frame: 31, label: '② 金屬防鼠網', x: 640 },
      { id: 'paper' as const, frame: 20, label: '❌ 塞舊報紙', x: 880 }
    ];
    const toolBoxes: Phaser.GameObjects.Rectangle[] = [];
    tools.forEach((t, idx) => {
      const box = this.add.rectangle(t.x, 548, 210, 80, 0x0f172a).setStrokeStyle(3, idx === 0 ? 0xfde047 : 0x64748b).setInteractive({ useHandCursor: true });
      toolBoxes.push(box);
      this.mgImg(t.x - 68, 548, t.frame, 1.0);
      this.add.text(t.x + 18, 548, t.label, {
        fontSize: '18px', color: '#ffffff', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
      }).setOrigin(0.5);
      box.on('pointerdown', () => {
        selectedTool = t.id;
        sound.pop();
        toolBoxes.forEach((b, bi) => b.setStrokeStyle(3, bi === idx ? 0xfde047 : 0x64748b));
      });
    });

    let sealedCount = 0;
    for (let i = 0; i < 3; i++) {
      const hxPos = 370 + i * 270;
      const hole = this.mgSpr(hxPos, 385, 29, 2.1).setInteractive({ useHandCursor: true });
      const stLabel = this.add.text(hxPos, 468, '狀態：破損鼠洞', {
        fontSize: '18px', color: '#fca5a5', fontStyle: 'bold', stroke: '#020617', strokeThickness: 3
      }).setOrigin(0.5);
      let stage = 0;

      hole.on('pointerdown', () => {
        if (this.finished || stage >= 2) return;
        if (selectedTool === 'paper') {
          this.mistakes++;
          sound.wrong();
          this.cameras.main.shake(140, 0.007);
          this.floatScore(hxPos, 350, '🐭 老鼠門齒咬穿報紙了！', '#fca5a5');
          return;
        }
        if (stage === 0 && selectedTool === 'cement') {
          stage = 1;
          hole.setTint(0x94a3b8);
          stLabel.setText('已批水泥 → 請釘鐵絲網').setColor('#fde047');
          this.combo++;
          sound.combo(this.combo);
          this.burst(hxPos, 385, 0xcbd5e1, 10);
          this.updateProgress((sealedCount * 2 + 1) / 6);
        } else if (stage === 1 && selectedTool === 'mesh') {
          stage = 2;
          hole.clearTint().setTexture('tiles-street', 15).setScale(2.1 * STREET_TILE_MULT);
          stLabel.setText('✅ 鐵絲網封妥！').setColor('#6ee7b7');
          sealedCount++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(hxPos, 385, 0x34d399, 12);
          this.updateProgress((sealedCount * 2) / 6);
          if (sealedCount >= 3) this.winGame();
        } else {
          sound.wrong();
          this.floatScore(hxPos, 350, stage === 0 ? '請先用 ① 水泥砂漿！' : '請改用 ② 金屬防鼠網！', '#fde047');
        }
      });
    }
  }

  private setupFehdQuiz(): void {
    this.setHeader('👮 食環署主任終極常識考核', '回答 3 道香港環境衛生常識問題，獲取彩雲聖若瑟小學榮譽證書！');
    this.npcSpr(265, 435, 0, 2.7);

    const qs = [
      {
        q: '1. 在香港預防白紋伊蚊傳播登革熱，花盆底盤應怎樣處理？',
        opts: ['每星期至少清理積水一次並刷洗底盤', '加入砂糖餵飼小昆蟲', '只噴香水掩蓋氣味'],
        ans: 0
      },
      {
        q: '2. 食環署推廣「防鼠三部曲」是指絕鼠糧、斷鼠路及哪一項？',
        opts: ['養貓捉鼠', '毀鼠藏（清除雜物及封塞鼠洞）', '擺放舊報紙'],
        ans: 1
      },
      {
        q: '3. 用梘液洗手時，應至少揉擦雙手多少秒才能有效殺滅病菌？',
        opts: ['3 秒沖水即可', '至少 20 秒（涵蓋指縫、手背及指甲縫）', '只在飯後抹乾雙手'],
        ans: 1
      }
    ];

    let qIdx = 0;
    const qText = this.add.text(375, 295, '', {
      fontSize: '22px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 700 }, stroke: '#020617', strokeThickness: 3, lineSpacing: 6
    });
    const optBtns: Phaser.GameObjects.Text[] = [];

    const renderQ = () => {
      optBtns.forEach(b => b.destroy());
      optBtns.length = 0;
      const cur = qs[qIdx];
      qText.setText(cur.q);
      cur.opts.forEach((op, oi) => {
        const btn = this.add.text(375, 392 + oi * 70, op, {
          fontSize: '19px',
          color: '#f8fafc',
          backgroundColor: '#1e293b',
          padding: { x: 18, y: 13 },
          fontStyle: 'bold',
          fixedWidth: 700,
          wordWrap: { width: 664 }
        }).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => {
          if (this.finished) return;
          if (oi === cur.ans) {
            qIdx++;
            this.combo++;
            sound.combo(this.combo);
            this.updateProgress(qIdx / qs.length);
            if (qIdx >= qs.length) this.winGame();
            else renderQ();
          } else {
            this.mistakes++;
            sound.wrong();
            btn.setBackgroundColor('#991b1b');
          }
        });
        optBtns.push(btn);
      });
    };
    renderQ();
  }
}
