import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { VirtualJoystick } from '../input/VirtualJoystick';
import { gameState, MapId, MedalRank } from '../state/gameState';

interface MapHotspot {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  sprite?: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image;
  cleanFrame?: string | number;
  ring?: Phaser.GameObjects.Arc;
  emote?: Phaser.GameObjects.Sprite;
}

export class ExploreScene extends Phaser.Scene {
  private hero!: Phaser.Physics.Arcade.Sprite;
  private companion!: Phaser.GameObjects.Sprite;
  private colliders!: Phaser.Physics.Arcade.StaticGroup;
  private hotspots: MapHotspot[] = [];
  private activeHotspot: MapHotspot | null = null;
  private promptTag!: Phaser.GameObjects.Text;
  private trail: { x: number; y: number }[] = [];
  private facing: 'down' | 'left' | 'right' | 'up' = 'down';
  private stepTimer = 0;
  private dustTimer = 0;
  private cheering = false;

  private joystick!: VirtualJoystick;
  private dialogueOpen = false;
  private onDialogueNext: (() => void) | null = null;

  constructor() {
    super('ExploreScene');
  }

  create(): void {
    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(() => this.handleActionButton());

    document.getElementById('rpg-dialogue')!.addEventListener('pointerdown', () => {
      if (this.dialogueOpen) this.closeDialogue();
    });

    window.addEventListener('cwsj-restart-game', () => {
      this.buildWorld('home');
      this.refreshHud();
    });

    this.buildWorld(gameState.currentMap);
    this.refreshHud();

    this.openDialogue(
      '媽媽',
      `${gameState.studentName}，歡迎回到 100% 原圖高清像素家居！你可以用搖桿／方向鍵走近發光家具按 A，或在 iPad 直接輕觸發光任務點互動。完成屋企 5 個衛生任務後，就從左上【玄關大門】前往香港街道冒險吧！`
    );
  }

  private addFootCollider(cx: number, cy: number, w: number, h: number): void {
    const z = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
    this.physics.add.existing(z, true);
    this.colliders.add(z);
  }

  private addHomeProp(
    frame: string,
    x: number,
    y: number,
    scale = 1.0,
    solidFoot = false,
    depthOffset = 0
  ): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, 'home-props', frame).setScale(scale);
    img.setDepth(y + img.displayHeight * 0.36 + depthOffset);
    if (solidFoot) {
      this.addFootCollider(x, y + img.displayHeight * 0.22, img.displayWidth * 0.55, Math.max(20, img.displayHeight * 0.24));
    }
    return img;
  }

  private buildWorld(mapId: MapId): void {
    gameState.currentMap = mapId;
    sound.playBgm(mapId);
    this.children.removeAll(true);
    this.hotspots = [];
    this.trail = [];
    if (this.colliders) this.colliders.clear(true, true);
    this.colliders = this.physics.add.staticGroup();

    const worldW = mapId === 'home' ? 1902 : 2112;
    const worldH = mapId === 'home' ? 1380 : 1152;
    this.physics.world.setBounds(48, 52, worldW - 96, worldH - 96);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    if (mapId === 'home') this.buildHdHomeScene(worldW, worldH);
    else this.buildHdStreetScene(worldW, worldH);

    const spawn = mapId === 'home' ? { x: 855, y: 555 } : { x: 630, y: 535 };
    this.companion = this.add.sprite(spawn.x - 48, spawn.y + 8, 'npcs', 16).setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setScale(1.05);
    this.hero.setCollideWorldBounds(true);
    this.hero.play('hero-idle-down');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 20);
    body.setOffset(18, 60);

    this.physics.add.collider(this.hero, this.colliders);
    this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '15px', fontStyle: 'bold', color: '#0f172a',
      backgroundColor: '#fde047', padding: { x: 10, y: 5 }
    }).setOrigin(0.5, 1).setDepth(5000).setVisible(false);

    this.refreshHud();
  }

  // ==========================================================================
  // 1. 100% 原圖背景家居場景 (map-home.png: 1902 x 1380) + 精準對齊去背任務物件
  // ==========================================================================
  private buildHdHomeScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-home').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    // 阻擋露台左右外側深色背景邊界，完整保留室內與露台行走動線
    this.addFootCollider(260, 1210, 480, 320);
    this.addFootCollider(1640, 1210, 480, 320);

    const roomBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.74)', padding: { x: 9, y: 4 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(30);
    };
    roomBadge(220, 235, '🚪 玄關走廊');
    roomBadge(650, 88, '🍳 廚房與飯廳');
    roomBadge(1105, 88, '🧼 上方洗手間');
    roomBadge(1610, 88, '🛏️ 主人睡房');
    roomBadge(355, 505, '🛋️ 溫馨客廳');
    roomBadge(1145, 685, '🛁 浴室梳洗區');
    roomBadge(1610, 555, '💻 小明睡房');
    roomBadge(960, 1045, '🌿 陽光露台');

    // --- 左上玄關大門 (210, 105)：前往香港社區街道 ---
    const frontDoor = this.addHomeProp('door', 210, 105, 0.98, false, -5);
    const doorEmote = this.add.sprite(210, 42, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 8, duration: 650, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'go_street', x: 210, y: 165, radius: 120,
      label: '🚪 按 A 或輕觸大門前往「香港社區街道」',
      sprite: frontDoor, emote: doorEmote
    });

    // --- 中上飯廳餐桌 (640, 215)：任務 4 蓋好食物防鼠保衛戰 ---
    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addHomeProp(foodDone ? 'dining_table' : 'cake_table', 640, 215, 0.96, false);
    if (foodDone) {
      this.add.image(640, 192, 'mg', 13).setScale(1.1).setDepth(cakeTable.depth + 5);
    }
    this.registerTaskHotspot('cover_food', 640, 235, '🍲 按 A 或輕觸餐桌進入「餐桌防鼠保衛戰」', cakeTable);

    // --- 中右上方洗手間洗手盆 (1010, 245)：任務 1 洗手泡泡滅菌戰 ---
    const sinkSpr = this.addHomeProp('sink_vanity', 1010, 245, 0.94, false);
    this.registerTaskHotspot('wash_hands', 1010, 265, '🧼 按 A 或輕觸洗手盆進入「洗手泡泡滅菌戰」', sinkSpr);

    // --- 中下藍色磁磚浴室洗手盆 (1268, 775)：任務 2 護齒刷牙大掃除 ---
    this.addHomeProp('towel', 1335, 735, 0.95, false);
    const toothVanity = this.addHomeProp('sink_vanity', 1268, 775, 0.94, false);
    this.registerTaskHotspot('brush_teeth', 1268, 795, '🪥 按 A 或輕觸梳洗台進入「護齒刷牙大掃除」', toothVanity);

    // --- 右下小明睡房書桌 (1475, 915)：任務 3 精準剪甲節奏王 ---
    const deskSpr = this.addHomeProp('computer_desk', 1475, 915, 0.96, false);
    this.registerTaskHotspot('trim_nails', 1475, 928, '💅 按 A 或輕觸書桌進入「精準剪甲節奏王」', deskSpr);

    // --- 正下陽光露台盆栽 (960, 1195)：任務 5 倒積水滅孑孓挑戰 ---
    const potSpr = this.addHomeProp('plant_whitepot', 960, 1195, 1.12, false);
    this.registerTaskHotspot('clear_saucer', 960, 1210, '🪴 按 A 或輕觸花盆進入「倒積水滅孑孓挑戰」', potSpr);

    // --- 中央走廊與客廳入口：媽媽與妹妹互動 NPC ---
    const mom = this.add.sprite(640, 560, 'npcs', 4).setDepth(580).play('npc-mom-walk');
    this.tweens.add({ targets: mom, x: 810, duration: 3400, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'talk_mom', x: 725, y: 560, radius: 135,
      label: '👩 按 A 與媽媽對話查看衛生提示', sprite: mom
    });

    const sis = this.add.sprite(1430, 445, 'npcs', 12).setDepth(465).play('npc-girl-walk');
    this.tweens.add({ targets: sis, x: 1590, duration: 2800, yoyo: true, repeat: -1 });
  }

  // ==========================================================================
  // 2. 100% 原圖背景香港街道場景 (map-street.png: 1408 x 768 -> 1.5x = 2112 x 1152)
  // ==========================================================================
  private buildHdStreetScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    const streetBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.76)', padding: { x: 9, y: 4 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(30);
    };
    streetBadge(430, 290, '🌳 彩雲社區公園');
    streetBadge(1050, 215, '🌉 行人天橋返回家居');
    streetBadge(1440, 245, '🍜 香港味道茶餐廳');
    streetBadge(1375, 665, '🍲 興發大排檔');
    streetBadge(1865, 515, '🏛️ 河道石拱橋');

    // --- 中央行人天橋返回家居入口 (1050, 295) ---
    const homeEmote = this.add.sprite(1050, 232, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: homeEmote, y: homeEmote.y - 7, duration: 620, yoyo: true, repeat: -1 });
    const gateDoor = this.addHomeProp('door', 1050, 295, 0.92, false);
    this.registerInteractiveHotspot({
      id: 'go_home', x: 1050, y: 325, radius: 120,
      label: '🏠 按 A 或輕觸天橋入口返回「溫馨家居」', sprite: gateDoor, emote: homeEmote
    });

    // --- 街道行人路巡邏街坊 NPC ---
    const man = this.add.sprite(760, 585, 'npcs', 8).setDepth(605).play('npc-man-walk');
    this.tweens.add({ targets: man, x: 1320, duration: 4600, yoyo: true, repeat: -1 });

    // --- 左上彩雲社區公園 (425, 475)：任務 6 香港三色回收快手 ---
    const recDone = gameState.isDone('recycle_bottles');
    this.add.image(365, 455, 'mg', 23).setScale(1.15).setDepth(465);
    this.add.image(425, 455, 'mg', 24).setScale(1.15).setDepth(465);
    this.add.image(485, 455, 'mg', 25).setScale(1.15).setDepth(465);
    const bottles = this.add.sprite(425, 510, 'tiles-street', recDone ? 19 : 21).setScale(1.2).setDepth(520);
    this.registerTaskHotspot('recycle_bottles', 425, 510, '♻️ 按 A 或輕觸進入「香港三色回收快手」', bottles);

    // --- 右上「香港味道茶餐廳」外牆 (1440, 360)：任務 7 冷氣止漏與滅蚊 ---
    const mosDone = gameState.isDone('spray_mosquito');
    const acUnit = this.add.sprite(1440, 345, 'tiles-street', mosDone ? 10 : 9).setScale(1.3).setDepth(395);
    const puddle = this.add.sprite(1440, 465, 'tiles-street', mosDone ? 19 : 22).setScale(1.2).setDepth(460);
    if (mosDone) puddle.setVisible(false);
    if (!mosDone) {
      this.add.sprite(1385, 415, 'npcs', 20).setDepth(490).play('mosquito-fly');
      this.add.sprite(1495, 430, 'npcs', 20).setDepth(490).play('mosquito-fly');
      this.time.addEvent({
        delay: 650, loop: true,
        callback: () => {
          if (gameState.currentMap !== 'street' || gameState.isDone('spray_mosquito')) return;
          const drop = this.add.rectangle(1440, 370, 6, 10, 0x38bdf8).setDepth(475);
          this.tweens.add({ targets: drop, y: 465, alpha: 0.2, duration: 480, onComplete: () => drop.destroy() });
        }
      });
    }
    this.registerTaskHotspot('spray_mosquito', 1440, 455, '🦟 按 A 或輕觸進入「冷氣止漏 ＋ DEET 驅蚊射擊」', acUnit);

    // --- 中下「興發大排檔」外牆 (1375, 765)：任務 8 封堵鼠洞 ---
    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(1375, 765, 'tiles-street', ratDone ? 15 : 14).setScale(1.3).setDepth(775);
    if (!ratDone) {
      const rat = this.add.sprite(1315, 805, 'npcs', 24).setDepth(815).play('rat-scurry');
      this.tweens.add({ targets: rat, x: 1435, duration: 950, yoyo: true, repeat: -1 });
    }
    this.registerTaskHotspot('seal_rathole', 1375, 780, '🕳️ 按 A 或輕觸進入「防鼠三部曲：封堵鼠洞」', rHole);

    // --- 右側河道石拱橋 (1835, 645)：任務 9 食環署主任常識總考核 ---
    const fehd = this.add.sprite(1835, 645, 'npcs', 0).setScale(1.25).setDepth(665).play('npc-fehd-walk');
    const fEmote = this.add.sprite(fehd.x, fehd.y - 54, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: fEmote, y: fEmote.y - 7, duration: 600, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'fehd_quiz', x: fehd.x, y: fehd.y, radius: 120,
      label: '👮 按 A 或輕觸接受「食環署主任常識總考核」', sprite: fehd, emote: fEmote
    });
  }

  private registerInteractiveHotspot(h: MapHotspot): void {
    if (h.sprite) {
      h.sprite.setInteractive({ useHandCursor: true });
      h.sprite.on('pointerdown', () => {
        if (this.dialogueOpen) return;
        this.activeHotspot = h;
        this.handleActionButton();
      });
    }
    this.hotspots.push(h);
  }

  private registerTaskHotspot(
    id: string,
    x: number,
    y: number,
    label: string,
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image
  ): void {
    const done = gameState.isDone(id);
    const ring = this.add.circle(x, y + 14, 34, done ? 0x10b981 : 0xfde047, 0.22)
      .setStrokeStyle(3, done ? 0x34d399 : 0xfacc15)
      .setDepth(25);
    this.tweens.add({ targets: ring, scale: { from: 0.92, to: 1.12 }, alpha: { from: 0.18, to: 0.38 }, duration: 850, yoyo: true, repeat: -1 });

    const emote = this.add.sprite(x, y - 58, 'npcs', done ? 30 : 28).setDepth(4200);
    this.tweens.add({ targets: emote, y: emote.y - 7, duration: 580, yoyo: true, repeat: -1 });

    this.registerInteractiveHotspot({ id, x, y, radius: 120, label, sprite, ring, emote });
  }

  private launchArcadeMinigame(taskId: string, onWon: (medal: MedalRank, bonus: number) => void): void {
    document.getElementById('touch-controls')?.classList.add('hidden');
    this.scene.pause();
    this.scene.launch('MinigameScene', {
      taskId,
      onComplete: (medal: MedalRank, bonus: number) => onWon(medal, bonus),
      onCancel: () => {}
    });
  }

  private celebrateHero(): void {
    this.cheering = true;
    this.hero.play('hero-cheer');
    this.tweens.add({
      targets: this.hero, y: this.hero.y - 18, duration: 180, yoyo: true, repeat: 1,
      onComplete: () => { this.cheering = false; }
    });
  }

  private handleActionButton(): void {
    if (this.dialogueOpen) { this.closeDialogue(); return; }
    if (!this.activeHotspot) return;

    const h = this.activeHotspot;
    if (h.id === 'talk_mom') {
      const rem = 5 - gameState.completedCount('home');
      this.openDialogue('媽媽', rem > 0
        ? `屋企仲有 ${rem} 項衛生任務未做完呀！記得去齊【中上飯廳】、【上下洗手間／浴室】、【右下小明睡房】同【正下陽光露台】看看！`
        : '全屋都乾乾淨淨！快啲由左上【玄關大門】去香港社區街道幫食環署主任啦！');
      return;
    }
    if (h.id === 'go_street') {
      if (gameState.completedCount('home') < 5) {
        sound.wrong();
        this.openDialogue('出門提示', `請先完成屋企全部 5 項衛生任務（目前已完成 ${gameState.completedCount('home')} / 5 項），再出門前往社區街道吧！`);
      } else {
        sound.pop();
        this.buildWorld('street');
        this.openDialogue('食環署主任廣播', '歡迎來到彩雲社區街道與公園！請幫忙到左上公園做三色回收、到「香港味道茶餐廳」修好滴水冷氣與滅蚊、封好「興發大排檔」外牆鼠洞，最後到右側河道石拱橋找我考核！');
      }
      return;
    }
    if (h.id === 'go_home') { sound.pop(); this.buildWorld('home'); return; }

    if (h.id === 'fehd_quiz') {
      if (!gameState.allTasksDone()) {
        sound.wrong();
        this.openDialogue('食環署主任', `同學你好！請先完成全部 8 個家居與街道像素挑戰（目前 ${gameState.completedCount()} / 8），再找我進行終極認證吧！`);
        return;
      }
      this.launchArcadeMinigame('fehd_quiz', (_m, bonus) => {
        gameState.score += 200 + bonus;
        this.celebrateHero();
        this.refreshHud();
        this.openDialogue('食環署主任', `太棒了，${gameState.studentClass} 班 ${gameState.studentName} 同學！恭喜榮獲彩雲聖若瑟小學「衛生防護小先鋒」嘉許證書！`, () => this.showCertificate());
      });
      return;
    }

    if (gameState.isDone(h.id)) return;
    this.launchArcadeMinigame(h.id, (medal, bonus) => {
      const doneTask = gameState.completeTask(h.id, medal, bonus);
      this.buildWorld(gameState.currentMap);
      this.celebrateHero();
      this.refreshHud();
      if (doneTask) this.openDialogue(`🏅 完成：${doneTask.title}`, doneTask.summary);
    });
  }

  private openDialogue(speaker: string, text: string, onNext?: () => void): void {
    this.dialogueOpen = true;
    this.onDialogueNext = onNext ?? null;
    document.getElementById('dialogue-speaker')!.textContent = speaker;
    document.getElementById('dialogue-content')!.textContent = text;
    document.getElementById('rpg-dialogue')!.classList.remove('hidden');
  }

  private closeDialogue(): void {
    sound.pop();
    this.dialogueOpen = false;
    document.getElementById('rpg-dialogue')!.classList.add('hidden');
    const cb = this.onDialogueNext;
    this.onDialogueNext = null;
    if (cb) cb();
  }

  private detectRoomName(): string {
    const x = this.hero.x, y = this.hero.y;
    if (gameState.currentMap === 'home') {
      if (x < 430 && y < 480) return '溫馨家居 · 🚪 玄關走廊';
      if (x >= 430 && x < 940 && y < 480) return '溫馨家居 · 🍳 廚房與飯廳';
      if (x >= 940 && x < 1330 && y < 460) return '溫馨家居 · 🧼 上方洗手間';
      if (x >= 1330 && y < 510) return '溫馨家居 · 🛏️ 主人睡房';
      if (x < 680 && y >= 480 && y < 1000) return '溫馨家居 · 🛋️ 溫馨客廳';
      if (x >= 940 && x < 1350 && y >= 650 && y < 1000) return '溫馨家居 · 🛁 浴室梳洗區';
      if (x >= 1350 && y >= 510 && y < 1000) return '溫馨家居 · 💻 小明睡房';
      if (y >= 1000) return '溫馨家居 · 🌿 陽光露台';
      return '溫馨家居 · 🏠 中央走廊';
    }
    if (x < 720) return '香港社區 · 🌳 彩雲公園';
    if (x >= 1700) return '香港社區 · 🏛️ 河道石拱橋';
    if (y >= 620) return '香港社區 · 🍲 興發大排檔';
    return '香港社區 · 🍜 香港味道茶餐廳';
  }

  private refreshHud(): void {
    document.getElementById('hud-score')!.textContent = String(gameState.score);
    document.getElementById('hud-progress')!.textContent = `${gameState.completedCount()} / 8`;
    const listEl = document.getElementById('quest-list')!;
    listEl.innerHTML = '';
    gameState.tasks
      .filter(t => t.map === gameState.currentMap)
      .forEach(t => {
        const mIcon = t.medal === 'gold' ? '🥇' : t.medal === 'silver' ? '🥈' : t.medal === 'bronze' ? '🥉' : '⬜';
        const row = document.createElement('div');
        row.className = `q-item ${t.done ? 'done' : ''}`;
        row.textContent = `${mIcon} [${t.room}] ${t.title}`;
        listEl.appendChild(row);
      });
  }

  private showCertificate(): void {
    document.getElementById('cert-student')!.textContent = `${gameState.studentClass} 班 ${gameState.studentName}`;
    document.getElementById('cert-final-score')!.textContent = String(gameState.score);
    document.getElementById('cert-rank')!.textContent = gameState.score >= 1600 ? '🌟 金章特級衛生防護大使' : '🏅 優異衛生小先鋒';
    const d = new Date();
    document.getElementById('cert-date')!.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    document.getElementById('cert-overlay')!.classList.remove('hidden');
  }

  update(_time: number, delta: number): void {
    if (!this.hero) return;
    if (this.dialogueOpen || this.cheering) {
      this.hero.setVelocity(0, 0);
      if (!this.cheering) this.hero.play(`hero-idle-${this.facing}`, true);
      return;
    }

    const mv = this.joystick.getMovementVector();
    const speed = mv.sprint ? 330 : 220;
    this.hero.setVelocity(mv.x * speed, mv.y * speed);

    if (Math.hypot(mv.x, mv.y) > 0.08) {
      this.facing = Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x < 0 ? 'left' : 'right') : (mv.y < 0 ? 'up' : 'down');
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 16) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 8).setDepth(pt.y);
      }

      this.stepTimer += delta;
      if (this.stepTimer > (mv.sprint ? 195 : 285)) {
        this.stepTimer = 0;
        sound.step();
      }

      if (mv.sprint) {
        this.dustTimer += delta;
        if (this.dustTimer > 95) {
          this.dustTimer = 0;
          const dust = this.add.rectangle(this.hero.x + (Math.random() - 0.5) * 14, this.hero.y + 34, 7, 7, 0xe2e8f0, 0.8).setDepth(this.hero.y);
          this.tweens.add({ targets: dust, y: dust.y - 10, alpha: 0, scale: 0.3, duration: 280, onComplete: () => dust.destroy() });
        }
      }
    } else {
      this.hero.play(`hero-idle-${this.facing}`, true);
    }

    this.hero.setDepth(this.hero.y + 34);
    document.getElementById('hud-location-tag')!.textContent = `📍 ${this.detectRoomName()}`;

    let nearest: MapHotspot | null = null;
    let best = Infinity;
    for (const h of this.hotspots) {
      if (gameState.isDone(h.id)) continue;
      const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, h.x, h.y);
      if (d <= h.radius && d < best) { best = d; nearest = h; }
    }
    this.activeHotspot = nearest;
    if (nearest) {
      this.promptTag.setText(nearest.label).setPosition(nearest.x, nearest.y - 82).setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
