import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { gameState, MedalRank } from '../state/gameState';

export interface MinigameLaunchData {
  taskId: string;
  onComplete: (medal: MedalRank, bonus: number) => void;
  onCancel: () => void;
}

export class MinigameScene extends Phaser.Scene {
  private taskId = '';
  private onComplete!: (medal: MedalRank, bonus: number) => void;
  private onCancel!: () => void;
  private combo = 0;
  private mistakes = 0;
  private finished = false;
  private statusText!: Phaser.GameObjects.Text;
  private progFill!: Phaser.GameObjects.Rectangle;

  constructor() {
    super('MinigameScene');
  }

  init(data: MinigameLaunchData): void {
    this.taskId = data.taskId;
    this.onComplete = data.onComplete;
    this.onCancel = data.onCancel;
    this.combo = 0;
    this.mistakes = 0;
    this.finished = false;
  }

  create(): void {
    sound.playBgm('minigame');

    // Dimmed pixel backdrop + retro arcade cabinet frame
    this.add.rectangle(640, 360, 1280, 720, 0x060b16, 0.88);
    this.add.rectangle(640, 392, 1060, 560, 0x0f172a).setStrokeStyle(6, 0xfbbf24);
    this.add.rectangle(640, 142, 1060, 58, 0x1e3a8a).setStrokeStyle(4, 0xfbbf24);

    // Progress bar
    this.add.rectangle(640, 192, 620, 18, 0x1e293b).setStrokeStyle(2, 0x64748b);
    this.progFill = this.add.rectangle(332, 192, 4, 12, 0x10b981).setOrigin(0, 0.5);

    this.statusText = this.add.text(980, 192, '連擊 x0', {
      fontSize: '18px', color: '#fde047', fontStyle: 'bold'
    }).setOrigin(0.5);

    // Exit button
    const exitBtn = this.add.text(1135, 142, '✕ 返回', {
      fontSize: '17px', color: '#ffffff', backgroundColor: '#dc2626', padding: { x: 10, y: 6 }, fontStyle: 'bold'
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });
    exitBtn.on('pointerdown', () => {
      sound.pop();
      this.exitScene(false);
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

  private setHeader(title: string, tip: string): void {
    this.add.text(140, 142, title, { fontSize: '23px', color: '#fde047', fontStyle: 'bold' }).setOrigin(0, 0.5);
    this.add.text(640, 228, tip, { fontSize: '16px', color: '#bae6fd', fontStyle: 'bold' }).setOrigin(0.5);
  }

  private updateProgress(ratio: number): void {
    this.progFill.width = Math.max(4, Math.min(1, ratio) * 616);
    this.statusText.setText(`連擊 x${this.combo}`);
  }

  private burst(x: number, y: number, color = 0x38bdf8, count = 10): void {
    for (let i = 0; i < count; i++) {
      const ang = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      const spd = 35 + Math.random() * 45;
      const p = this.add.rectangle(x, y, 8, 8, color);
      this.tweens.add({
        targets: p,
        x: x + Math.cos(ang) * spd,
        y: y + Math.sin(ang) * spd,
        alpha: 0,
        scale: 0.3,
        duration: 380,
        onComplete: () => p.destroy()
      });
    }
  }

  private floatScore(x: number, y: number, label: string, color = '#fde047'): void {
    const t = this.add.text(x, y, label, { fontSize: '19px', color, fontStyle: 'bold', stroke: '#0f172a', strokeThickness: 4 }).setOrigin(0.5);
    this.tweens.add({ targets: t, y: y - 38, alpha: 0, duration: 650, onComplete: () => t.destroy() });
  }

  private winGame(): void {
    if (this.finished) return;
    this.finished = true;
    sound.success();
    const medal: MedalRank = this.mistakes === 0 ? 'gold' : this.mistakes <= 2 ? 'silver' : 'bronze';
    const bonus = medal === 'gold' ? 80 : medal === 'silver' ? 40 : 15;
    const medalLabel = medal === 'gold' ? '🥇 金牌通關' : medal === 'silver' ? '🥈 銀牌通關' : '🥉 銅牌通關';

    const card = this.add.rectangle(640, 410, 520, 190, 0x064e3b).setStrokeStyle(5, 0xfbbf24).setDepth(500);
    const txt = this.add.text(640, 390, `${medalLabel}！\n連擊獎勵 +${bonus} 分`, {
      fontSize: '28px', color: '#fde047', fontStyle: 'bold', align: 'center'
    }).setOrigin(0.5).setDepth(501);
    void card; void txt;

    this.time.delayedCall(1100, () => this.exitScene(true, medal, bonus));
  }

  private exitScene(won: boolean, medal: MedalRank = 'gold', bonus = 0): void {
    document.getElementById('touch-controls')?.classList.remove('hidden');
    sound.playBgm(gameState.currentMap);
    this.scene.stop();
    this.scene.resume('ExploreScene');
    if (won) this.onComplete(medal, bonus);
    else this.onCancel();
  }

  // 1. 洗手泡泡滅菌戰 (Pixel Hands + Soap Bubble Shooter vs Bouncing Pixel Viruses!)
  private setupWashHands(): void {
    this.setHeader('🧼 洗手泡泡滅菌戰', '輕觸或滑過游走的「像素病毒與細菌」，發射番梘泡泡將雙手徹底洗淨（消滅 12 隻）！');
    this.add.rectangle(640, 435, 920, 360, 0x0c4a6e).setStrokeStyle(3, 0x38bdf8);

    // Pixel Left & Right Hands + Soap Dispenser
    this.add.image(560, 450, 'mg', 0).setScale(2.3).setAlpha(0.9);
    this.add.image(720, 450, 'mg', 0).setScale(2.3).setFlipX(true).setAlpha(0.9);
    const soap = this.add.image(640, 575, 'mg', 1).setScale(1.6);

    let cleared = 0;
    const total = 12;
    const spawnGerm = () => {
      if (this.finished) return;
      const frame = Math.random() < 0.5 ? 3 : 4;
      const g = this.add.sprite(240 + Math.random() * 800, 290 + Math.random() * 250, 'mg', frame).setScale(1.25).setInteractive({ useHandCursor: true });
      this.tweens.add({
        targets: g,
        x: Phaser.Math.Clamp(g.x + (Math.random() - 0.5) * 260, 220, 1060),
        y: Phaser.Math.Clamp(g.y + (Math.random() - 0.5) * 180, 280, 560),
        duration: 1100 + Math.random() * 600,
        yoyo: true,
        repeat: -1
      });

      const popGerm = () => {
        if (this.finished || !g.active) return;
        g.disableInteractive();
        this.combo++;
        sound.combo(this.combo);
        this.tweens.add({ targets: soap, scaleY: 1.3, duration: 80, yoyo: true });

        const bubble = this.add.image(soap.x, soap.y - 30, 'mg', 2).setScale(1.1);
        this.tweens.add({
          targets: bubble,
          x: g.x, y: g.y, duration: 150,
          onComplete: () => {
            bubble.destroy();
            this.burst(g.x, g.y, 0xbae6fd, 10);
            this.floatScore(g.x, g.y, '+泡泡潔淨!');
            g.destroy();
            cleared++;
            this.updateProgress(cleared / total);
            if (cleared >= total) this.winGame();
            else if (cleared + 4 <= total) spawnGerm();
          }
        });
      };
      g.on('pointerdown', popGerm);
      g.on('pointerover', (p: Phaser.Input.Pointer) => { if (p.isDown) popGerm(); });
    };
    for (let i = 0; i < 5; i++) spawnGerm();
  }

  // 2. 護齒刷牙大掃除 (Pixel Teeth Row + Draggable Pixel Toothbrush + Cavity Imps!)
  private setupBrushTeeth(): void {
    this.setHeader('🪥 護齒刷牙大掃除', '按住並來回滑動刷洗全部 10 顆「黃色牙菌膜像素牙齒」（每顆刷 3 下），並拍走紅色蛀牙菌！');
    this.add.rectangle(640, 435, 920, 360, 0x3b0764).setStrokeStyle(3, 0xf472b6);

    const brush = this.add.image(640, 540, 'mg', 7).setScale(1.7).setDepth(50);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      brush.setPosition(Phaser.Math.Clamp(p.x, 220, 1060), Phaser.Math.Clamp(p.y, 270, 590));
    });

    let cleanTeeth = 0;
    for (let i = 0; i < 10; i++) {
      const tx = 350 + (i % 5) * 145;
      const ty = i < 5 ? 355 : 495;
      const tooth = this.add.sprite(tx, ty, 'mg', 6).setScale(1.65).setInteractive({ useHandCursor: true });
      let scrubs = 0;
      let cooldown = 0;

      const doScrub = () => {
        if (this.finished || scrubs >= 3 || this.time.now < cooldown) return;
        cooldown = this.time.now + 130;
        scrubs++;
        sound.pop();
        const foam = this.add.image(tx + (Math.random() - 0.5) * 30, ty, 'mg', 2).setScale(0.8);
        this.tweens.add({ targets: foam, y: ty - 28, alpha: 0, duration: 350, onComplete: () => foam.destroy() });

        if (scrubs >= 3) {
          tooth.setFrame(5);
          this.combo++;
          sound.combo(this.combo);
          this.burst(tx, ty, 0xffffff, 8);
          this.floatScore(tx, ty - 20, '✨潔白!');
          cleanTeeth++;
          this.updateProgress(cleanTeeth / 10);
          if (cleanTeeth >= 10) this.winGame();
        } else {
          tooth.setAlpha(0.85 + scrubs * 0.05);
        }
      };
      tooth.on('pointerdown', doScrub);
      tooth.on('pointerover', (p: Phaser.Input.Pointer) => { if (p.isDown) doScrub(); });
    }

    // Spawn pesky Cavity Imps for extra arcade fun!
    this.time.addEvent({
      delay: 1800,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const imp = this.add.sprite(300 + Math.random() * 680, 425, 'mg', 8).setScale(1.25).setInteractive({ useHandCursor: true });
        imp.on('pointerdown', () => {
          this.combo++;
          sound.combo(this.combo);
          this.burst(imp.x, imp.y, 0xf43f5e, 8);
          this.floatScore(imp.x, imp.y, '+擊退蛀牙菌!');
          imp.destroy();
        });
        this.time.delayedCall(1500, () => { if (imp.active) imp.destroy(); });
      }
    });
  }

  // 3. 精準剪甲節奏王 (5 Dirty Long-Nail Fingers + Moving Pixel Nail Clippers!)
  private setupTrimNails(): void {
    this.setHeader('💅 精準剪甲節奏王', '當上方移動的「像素銀色指甲鉗」對準下方藏垢長指甲時，點擊畫面精準修剪全部 5 指！');
    this.add.rectangle(640, 435, 920, 360, 0x1e293b).setStrokeStyle(3, 0x38bdf8);

    const fingers: { x: number; spr: Phaser.GameObjects.Sprite; trimmed: boolean }[] = [];
    for (let i = 0; i < 5; i++) {
      const fx = 340 + i * 150;
      const spr = this.add.sprite(fx, 515, 'mg', 9).setScale(1.9);
      this.add.circle(fx, 435, 18, 0x10b981, 0.28).setStrokeStyle(2, 0x34d399);
      fingers.push({ x: fx, spr, trimmed: false });
    }

    const clipper = this.add.sprite(260, 345, 'mg', 11).setScale(1.8).setAngle(90);
    this.tweens.add({ targets: clipper, x: 1020, duration: 1550, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });

    let doneCount = 0;
    const zone = this.add.rectangle(640, 435, 920, 360, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
    zone.on('pointerdown', () => {
      if (this.finished) return;
      this.tweens.add({ targets: clipper, y: 415, duration: 90, yoyo: true });
      const hit = fingers.find(f => !f.trimmed && Math.abs(f.x - clipper.x) <= 44);
      if (hit) {
        hit.trimmed = true;
        hit.spr.setFrame(10);
        doneCount++;
        this.combo++;
        sound.combo(this.combo);
        this.burst(hit.x, 450, 0x34d399, 12);
        this.floatScore(hit.x, 420, '✂️ 乾淨利落!');
        this.updateProgress(doneCount / 5);
        if (doneCount >= 5) this.winGame();
      } else {
        this.mistakes++;
        this.combo = 0;
        sound.wrong();
        this.cameras.main.shake(120, 0.006);
        this.floatScore(clipper.x, 380, '未對準指甲!', '#fca5a5');
      }
    });
  }

  // 4. 餐桌防鼠保衛戰 (Cover 4 Pixel Dishes with Mesh Domes & Swat Scurrying Rats/Flies!)
  private setupCoverFood(): void {
    this.setHeader('🍲 餐桌防鼠保衛戰', '點擊 4 碟餸菜蓋上「像素防塵罩」，並拍走偷襲的像素老鼠與蒼蠅（完成加蓋及擊退 6 隻害蟲）！');
    this.add.rectangle(640, 435, 920, 360, 0x451a03).setStrokeStyle(3, 0xf59e0b);
    this.add.rectangle(640, 435, 520, 220, 0xd97706).setStrokeStyle(4, 0xfde68a);

    let covered = 0;
    let swatted = 0;
    const checkWin = () => {
      this.updateProgress((covered + Math.min(6, swatted)) / 10);
      if (covered >= 4 && swatted >= 6) this.winGame();
    };

    const positions = [[510, 385], [770, 385], [510, 485], [770, 485]];
    positions.forEach(([px, py]) => {
      const dish = this.add.sprite(px, py, 'mg', 12).setScale(1.6).setInteractive({ useHandCursor: true });
      let isCov = false;
      dish.on('pointerdown', () => {
        if (isCov || this.finished) return;
        isCov = true;
        covered++;
        this.combo++;
        sound.combo(this.combo);
        const dome = this.add.image(px, py - 40, 'mg', 13).setScale(1.7);
        this.tweens.add({ targets: dome, y: py - 4, duration: 180, ease: 'Bounce.easeOut' });
        this.floatScore(px, py - 30, '🛡️已加蓋!');
        checkWin();
      });
    });

    this.time.addEvent({
      delay: 750,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const isRat = Math.random() < 0.6;
        const side = Math.random() < 0.5 ? 210 : 1070;
        const py = 290 + Math.random() * 280;
        const pest = isRat
          ? this.add.sprite(side, py, 'npcs', 24).setScale(1.3).play('rat-scurry')
          : this.add.sprite(side, py, 'mg', 15).setScale(1.2);
        pest.setFlipX(side < 640).setInteractive({ useHandCursor: true });
        this.tweens.add({
          targets: pest, x: 640, y: 435, duration: 2400,
          onComplete: () => {
            if (pest.active) {
              this.mistakes++;
              sound.wrong();
              this.cameras.main.shake(100, 0.005);
              pest.destroy();
            }
          }
        });
        pest.on('pointerdown', () => {
          if (this.finished) return;
          swatted++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(pest.x, pest.y, 0xfbbf24, 9);
          this.floatScore(pest.x, pest.y, '💥擊退害蟲!');
          pest.destroy();
          checkWin();
        });
      }
    });
  }

  // 5. 倒積水滅孑孓挑戰 (Tip 4 Waterlogged Saucers & Zap Wriggling Larvae / Aedes Mosquitoes!)
  private setupClearSaucer(): void {
    this.setHeader('🪴 倒積水滅孑孓挑戰', '連點 4 個積水花盆底盤倒走積水，並點擊消滅水中扭動的「像素孑孓」與飛出的白紋伊蚊！');
    this.add.rectangle(640, 435, 920, 360, 0x14532d).setStrokeStyle(3, 0x4ade80);

    let dryCount = 0;
    let larvaCleared = 0;
    const check = () => {
      this.updateProgress((dryCount * 2 + Math.min(6, larvaCleared)) / 14);
      if (dryCount >= 4 && larvaCleared >= 6) this.winGame();
    };

    for (let i = 0; i < 4; i++) {
      const sx = 310 + i * 220;
      const saucer = this.add.sprite(sx, 515, 'mg', 16).setScale(1.85).setInteractive({ useHandCursor: true });
      let taps = 0;
      saucer.on('pointerdown', () => {
        if (this.finished || taps >= 3) return;
        taps++;
        sound.pop();
        this.tweens.add({ targets: saucer, angle: taps * 10, duration: 90, yoyo: true });
        this.burst(sx, 505, 0x38bdf8, 6);
        if (taps >= 3) {
          saucer.setFrame(18);
          dryCount++;
          this.combo++;
          sound.combo(this.combo);
          this.floatScore(sx, 470, '✨積水清乾!');
          check();
        }
      });

      // Spawn 2 wriggling larvae above waterlogged saucer
      for (let k = 0; k < 2; k++) {
        const lv = this.add.sprite(sx - 24 + k * 48, 405 - k * 45, 'mg', 17).setScale(1.35).setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: lv, angle: { from: -18, to: 18 }, y: lv.y - 22, duration: 520, yoyo: true, repeat: -1 });
        lv.on('pointerdown', () => {
          if (this.finished) return;
          larvaCleared++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(lv.x, lv.y, 0x6ee7b7, 8);
          this.floatScore(lv.x, lv.y, '+消滅孑孓!');
          lv.destroy();
          check();
        });
      }
    }
  }

  // 6. 香港三色回收快手 (Sort Pixel Bottles, Paper, Cans & Food Waste into 4 Pixel Bins!)
  private setupRecycleBottles(): void {
    this.setHeader('♻️ 香港三色回收快手', '看準中央出現的垃圾，點擊下方正確的「藍廢紙、黃鋁罐、啡膠樽、有蓋垃圾桶」（完成 8 件）！');
    this.add.rectangle(640, 435, 920, 360, 0x1e293b).setStrokeStyle(3, 0x60a5fa);

    const items = [
      { frame: 20, bin: 0, name: '廢報紙 → 藍廢紙箱' },
      { frame: 21, bin: 1, name: '空鋁罐 → 黃鋁罐箱' },
      { frame: 19, bin: 2, name: '積水膠樽 → 清空入啡膠樽箱' },
      { frame: 22, bin: 3, name: '果皮廚餘 → 有蓋垃圾桶' }
    ];
    let sorted = 0;
    let cur = items[2]; // Start with plastic bottle!

    const curSpr = this.add.sprite(640, 355, 'mg', cur.frame).setScale(2.2);
    const curLabel = this.add.text(640, 425, '請選擇下方正確回收桶！', { fontSize: '18px', color: '#fde047', fontStyle: 'bold' }).setOrigin(0.5);

    const bins = [
      { idx: 0, frame: 23, title: '藍：廢紙', x: 340 },
      { idx: 1, frame: 24, title: '黃：鋁罐', x: 540 },
      { idx: 2, frame: 25, title: '啡：膠樽', x: 740 },
      { idx: 3, frame: 14, title: '有蓋垃圾桶', x: 940 }
    ];

    bins.forEach(b => {
      const bs = this.add.sprite(b.x, 525, 'mg', b.frame).setScale(1.75).setInteractive({ useHandCursor: true });
      this.add.text(b.x, 588, b.title, { fontSize: '16px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      bs.on('pointerdown', () => {
        if (this.finished) return;
        if (b.idx === cur.bin) {
          sorted++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(b.x, 510, 0x34d399, 10);
          this.floatScore(b.x, 475, `✅ ${cur.name}`);
          this.updateProgress(sorted / 8);
          if (sorted >= 8) {
            this.winGame();
          } else {
            cur = items[Math.floor(Math.random() * items.length)];
            curSpr.setFrame(cur.frame);
            this.tweens.add({ targets: curSpr, scale: { from: 0.6, to: 2.2 }, duration: 200 });
          }
        } else {
          this.mistakes++;
          this.combo = 0;
          sound.wrong();
          this.cameras.main.shake(120, 0.006);
          curLabel.setText('⚠️ 口訣：藍廢紙、黃鋁罐、啡膠樽、廚餘入有蓋桶！');
        }
      });
    });
  }

  // 7. 冷氣止漏 ＋ DEET 驅蚊射擊 (Fix Dripping AC + Spray Aedes Mosquitoes, Avoid Butterflies!)
  private setupSprayMosquito(): void {
    this.setHeader('🦟 冷氣止漏 ＋ DEET 驅蚊射擊', '先點左上「滴水冷氣」修好排水喉，再點擊噴灑 DEET 消滅 7 隻白紋伊蚊（切勿誤噴彩蝶）！');
    this.add.rectangle(640, 435, 920, 360, 0x064e3b).setStrokeStyle(3, 0x34d399);

    let acFixed = false;
    let kills = 0;
    const acSpr = this.add.sprite(290, 325, 'tiles-street', 9).setScale(1.6).setInteractive({ useHandCursor: true });
    const acHint = this.add.text(290, 385, '🔧 點擊修好滴水冷氣', { fontSize: '15px', color: '#fde047', fontStyle: 'bold' }).setOrigin(0.5);
    acSpr.on('pointerdown', () => {
      if (acFixed || this.finished) return;
      acFixed = true;
      acSpr.setFrame(10);
      acHint.setText('✅ 排水喉已接妥').setColor('#6ee7b7');
      sound.combo(3);
      this.burst(290, 325, 0x38bdf8, 12);
      this.updateProgress((1 + kills) / 8);
      if (acFixed && kills >= 7) this.winGame();
    });

    const can = this.add.image(640, 565, 'mg', 26).setScale(1.6).setDepth(40);
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => { can.x = Phaser.Math.Clamp(p.x, 260, 1020); });

    this.time.addEvent({
      delay: 720,
      loop: true,
      callback: () => {
        if (this.finished) return;
        const isButterfly = Math.random() < 0.25;
        const sx = 360 + Math.random() * 640;
        const sy = 290 + Math.random() * 210;
        const target = isButterfly
          ? this.add.sprite(sx, sy, 'mg', 28).setScale(1.3)
          : this.add.sprite(sx, sy, 'npcs', 20).setScale(1.45).play('mosquito-fly');
        target.setInteractive({ useHandCursor: true });
        this.tweens.add({ targets: target, x: sx + (Math.random() - 0.5) * 180, y: sy - 30, duration: 1500, yoyo: true });

        target.on('pointerdown', () => {
          if (this.finished) return;
          sound.spray();
          const mist = this.add.image(target.x, target.y, 'mg', 27).setScale(1.4);
          this.tweens.add({ targets: mist, alpha: 0, scale: 2, duration: 300, onComplete: () => mist.destroy() });

          if (isButterfly) {
            this.mistakes++;
            this.combo = 0;
            sound.wrong();
            this.cameras.main.shake(120, 0.006);
            this.floatScore(target.x, target.y, '⚠️ 別噴益蟲彩蝶!', '#fca5a5');
            target.destroy();
          } else {
            kills++;
            this.combo++;
            sound.combo(this.combo);
            this.burst(target.x, target.y, 0x6ee7b7, 8);
            this.floatScore(target.x, target.y, '+消滅白紋伊蚊!');
            target.destroy();
            this.updateProgress(((acFixed ? 1 : 0) + Math.min(7, kills)) / 8);
            if (acFixed && kills >= 7) this.winGame();
          }
        });
        this.time.delayedCall(2100, () => { if (target.active) target.destroy(); });
      }
    });
  }

  // 8. 防鼠三部曲：水泥鐵網封鼠洞 (2-Step Tool Crafting: Cement Trowel -> Steel Mesh, Newspaper Trap!)
  private setupSealRatHole(): void {
    this.setHeader('🕳️ 防鼠三部曲：封鎖破損鼠洞', '先點選下方工具：① 用「水泥灰刀」批平 3 個鼠洞 → ② 再釘上「金屬鐵絲網」（切勿用廢報紙）！');
    this.add.rectangle(640, 435, 920, 360, 0x334155).setStrokeStyle(3, 0xfbbf24);

    let selectedTool: 'cement' | 'mesh' | 'paper' = 'cement';
    const tools = [
      { id: 'cement' as const, frame: 30, label: '① 水泥砂漿', x: 420 },
      { id: 'mesh' as const, frame: 31, label: '② 金屬防鼠網', x: 640 },
      { id: 'paper' as const, frame: 20, label: '❌ 塞舊報紙', x: 860 }
    ];
    const toolBoxes: Phaser.GameObjects.Rectangle[] = [];
    tools.forEach((t, idx) => {
      const box = this.add.rectangle(t.x, 545, 175, 76, 0x0f172a).setStrokeStyle(3, idx === 0 ? 0xfde047 : 0x64748b).setInteractive({ useHandCursor: true });
      toolBoxes.push(box);
      this.add.image(t.x - 52, 545, 'mg', t.frame).setScale(1.0);
      this.add.text(t.x + 18, 545, t.label, { fontSize: '15px', color: '#ffffff', fontStyle: 'bold' }).setOrigin(0.5);
      box.on('pointerdown', () => {
        selectedTool = t.id;
        sound.pop();
        toolBoxes.forEach((b, bi) => b.setStrokeStyle(3, bi === idx ? 0xfde047 : 0x64748b));
      });
    });

    let sealedCount = 0;
    for (let i = 0; i < 3; i++) {
      const hx = 370 + i * 270;
      const hole = this.add.sprite(hx, 385, 'mg', 29).setScale(2.1).setInteractive({ useHandCursor: true });
      const stLabel = this.add.text(hx, 465, '狀態：破損鼠洞', { fontSize: '15px', color: '#fca5a5', fontStyle: 'bold' }).setOrigin(0.5);
      let stage = 0; // 0=open, 1=cemented, 2=meshed

      hole.on('pointerdown', () => {
        if (this.finished || stage === 2) return;
        if (selectedTool === 'paper') {
          this.mistakes++;
          sound.wrong();
          this.cameras.main.shake(140, 0.007);
          this.floatScore(hx, 350, '🐭 老鼠門齒咬穿報紙了！', '#fca5a5');
          return;
        }
        if (stage === 0 && selectedTool === 'cement') {
          stage = 1;
          hole.setTint(0x94a3b8);
          stLabel.setText('已批水泥 → 請釘鐵絲網').setColor('#fde047');
          this.combo++;
          sound.combo(this.combo);
          this.burst(hx, 385, 0xcbd5e1, 10);
          this.updateProgress((sealedCount * 2 + 1) / 6);
        } else if (stage === 1 && selectedTool === 'mesh') {
          stage = 2;
          hole.clearTint().setTexture('tiles-street', 15);
          stLabel.setText('✅ 堅固封死！').setColor('#6ee7b7');
          sealedCount++;
          this.combo++;
          sound.combo(this.combo);
          this.burst(hx, 385, 0x34d399, 12);
          this.updateProgress((sealedCount * 2) / 6);
          if (sealedCount >= 3) this.winGame();
        } else {
          sound.wrong();
          this.floatScore(hx, 350, stage === 0 ? '請先用 ① 水泥砂漿！' : '請改用 ② 金屬防鼠網！', '#fde047');
        }
      });
    }
  }

  // 9. 食環署主任像素考核劇場
  private setupFehdQuiz(): void {
    this.setHeader('👮 食環署主任終極常識考核', '回答 3 道香港環境衛生常識問題，獲取彩雲聖若瑟小學榮譽證書！');
    this.add.sprite(285, 425, 'npcs', 0).setScale(2.6);

    const qs = [
      {
        q: '1. 在香港，負責保持社區環境衛生、滅蚊滅鼠及管理公眾垃圾桶的政府部門是？',
        opts: ['A. 食物環境衞生署（食環署 FEHD）', 'B. 香港天文台', 'C. 路政署'],
        ans: 0
      },
      {
        q: '2. 養成良好個人衛生及清除積水、妥善處理垃圾，最重要的作用是？',
        opts: ['A. 只為應付學校檢查', 'B. 杜絕病菌及蚊鼠傳播媒介，減低患上登革熱與鼠疫等傳染病機會', 'C. 增加垃圾桶數量'],
        ans: 1
      },
      {
        q: '3. 小四同學在日常生活中，怎樣做才能有效協助社區防蚊防鼠？',
        opts: ['A. 把飲完的膠樽留在公園長椅', 'B. 不亂拋垃圾、清空膠樽投入啡色回收箱，並定期倒走花盆底盤積水', 'C. 用紙皮塞住後巷渠道'],
        ans: 1
      }
    ];

    let qIdx = 0;
    const qText = this.add.text(400, 305, '', { fontSize: '20px', color: '#ffffff', fontStyle: 'bold', wordWrap: { width: 660 } });
    const optBtns: Phaser.GameObjects.Text[] = [];

    const renderQ = () => {
      optBtns.forEach(b => b.destroy());
      optBtns.length = 0;
      const cur = qs[qIdx];
      qText.setText(cur.q);
      cur.opts.forEach((op, oi) => {
        const btn = this.add.text(400, 395 + oi * 62, op, {
          fontSize: '17px', color: '#f8fafc', backgroundColor: '#1e293b', padding: { x: 16, y: 12 }, fontStyle: 'bold', fixedWidth: 650
        }).setInteractive({ useHandCursor: true });
        btn.on('pointerdown', () => {
          if (this.finished) return;
          if (oi === cur.ans) {
            this.combo++;
            sound.combo(this.combo);
            this.burst(700, btn.y, 0x34d399, 12);
            qIdx++;
            this.updateProgress(qIdx / qs.length);
            if (qIdx >= qs.length) {
              gameState.fehdQuizPassed = true;
              this.winGame();
            } else {
              renderQ();
            }
          } else {
            this.mistakes++;
            sound.wrong();
            this.cameras.main.shake(120, 0.006);
            this.floatScore(700, btn.y, '再想一想課本知識！', '#fca5a5');
          }
        });
        optBtns.push(btn);
      });
    };
    renderQ();
  }
}
