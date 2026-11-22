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
      `${gameState.studentName}，歡迎回到全新高清像素家居！你可以用搖桿／方向鍵走近發光家具按 A，或直接輕觸物件互動。完成屋企 5 個衛生任務後，就從左上【玄關大門】前往香港街道冒險吧！`
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
    scale = 1.35,
    solidFoot = true,
    depthOffset = 0
  ): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, 'home-props', frame).setScale(scale);
    img.setDepth(y + img.displayHeight * 0.36 + depthOffset);
    if (solidFoot) {
      this.addFootCollider(x, y + img.displayHeight * 0.22, img.displayWidth * 0.62, Math.max(22, img.displayHeight * 0.26));
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
    this.physics.world.setBounds(36, 48, worldW - 72, worldH - 76);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    if (mapId === 'home') this.buildHdHomeScene(worldW, worldH);
    else this.buildHdStreetScene(worldW, worldH);

    const spawn = mapId === 'home' ? { x: 860, y: 760 } : { x: 640, y: 610 };
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
  // 1. Upgraded Full-Canvas HD Home Interior + 26 De-Checkered 2.5D Props
  // ==========================================================================
  private buildHdHomeScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-home').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    const roomBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.72)', padding: { x: 9, y: 4 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(30);
    };
    roomBadge(245, 290, '🚪 玄關走廊');
    roomBadge(820, 120, '🍳 廚房與飯廳');
    roomBadge(1520, 115, '🛁 浴室與洗手間');
    roomBadge(830, 610, '🛋️ 溫馨客廳');
    roomBadge(310, 835, '🛏️ 小明睡房');
    roomBadge(1620, 985, '🌿 陽光露台');

    // --- Zone A: Entrance Foyer (Top-Left) & Exit Door to HK Street ---
    const frontDoor = this.addHomeProp('door', 215, 138, 1.35, false, 10);
    this.addHomeProp('plant_whitepot', 335, 185, 1.25, true);
    const doorEmote = this.add.sprite(215, 58, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 8, duration: 650, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'go_street', x: 215, y: 185, radius: 115,
      label: '🚪 按 A 或輕觸大門前往「香港社區街道」',
      sprite: frontDoor, emote: doorEmote
    });

    // --- Zone B: Kitchen & Dining Room (Top-Center) + Task 4: Cover Food ---
    this.addHomeProp('kitchen_top', 720, 95, 1.35, false);
    this.addHomeProp('kitchen_bottom', 720, 195, 1.35, true);
    this.addHomeProp('chair_side', 655, 385, 1.3, false);
    this.addHomeProp('chair_side', 945, 385, 1.3, false).setFlipX(true);
    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addHomeProp(foodDone ? 'dining_table' : 'cake_table', 800, 385, 1.38, true);
    if (foodDone) {
      this.add.image(800, 355, 'mg', 13).setScale(1.15).setDepth(cakeTable.depth + 5);
    }
    this.registerTaskHotspot('cover_food', 800, 405, '🍲 按 A 或輕觸餐桌進入「餐桌防鼠保衛戰」', cakeTable);

    // --- Zone C: Dual Aqua Bathrooms (Right Wing) + Tasks 1 & 2: Wash Hands & Brush Teeth ---
    this.addHomeProp('shower', 1295, 210, 1.32, true);
    this.addHomeProp('mirror', 1475, 145, 1.35, false);
    const sinkSpr = this.addHomeProp('sink_vanity', 1475, 255, 1.35, true);
    this.registerTaskHotspot('wash_hands', 1475, 285, '🧼 按 A 或輕觸洗手盆進入「洗手泡泡滅菌戰」', sinkSpr);

    this.addHomeProp('mirror', 1690, 145, 1.35, false);
    const towelSpr = this.addHomeProp('towel', 1775, 185, 1.35, false);
    const toothVanity = this.addHomeProp('sink_vanity', 1690, 255, 1.35, true);
    void towelSpr;
    this.registerTaskHotspot('brush_teeth', 1690, 285, '🪥 按 A 或輕觸梳洗台進入「護齒刷牙大掃除」', toothVanity);

    // Lower Bathroom fixtures
    this.addHomeProp('toilet', 1310, 690, 1.32, true);
    this.addHomeProp('bathtub', 1640, 725, 1.35, true);

    // --- Zone D: Cozy Living Room (Center) + Mom & Sister NPCs ---
    this.addHomeProp('green_rug', 835, 920, 1.65, false, -500);
    this.addHomeProp('tv_cabinet', 835, 695, 1.32, true);
    this.addHomeProp('sofa_2seat', 835, 1020, 1.32, true);
    this.addHomeProp('armchair_left', 625, 945, 1.25, true);
    this.addHomeProp('armchair_right', 1045, 945, 1.25, true);

    const mom = this.add.sprite(740, 825, 'npcs', 4).setDepth(840).play('npc-mom-walk');
    this.tweens.add({ targets: mom, x: 960, duration: 3600, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'talk_mom', x: 850, y: 825, radius: 135,
      label: '👩 按 A 與媽媽對話查看衛生提示', sprite: mom
    });

    const sis = this.add.sprite(1080, 780, 'npcs', 12).setDepth(790).play('npc-girl-walk');
    this.tweens.add({ targets: sis, y: 880, duration: 2600, yoyo: true, repeat: -1 });

    // --- Zone E: Xiao Ming's Bedroom (Bottom-Left) + Task 3: Trim Nails ---
    this.addHomeProp('double_bed', 195, 1030, 1.38, true);
    this.addHomeProp('nightstand', 340, 965, 1.25, true);
    this.addHomeProp('toy_box', 195, 1245, 1.3, true);
    this.addHomeProp('chair_front', 475, 1185, 1.18, false);
    const deskSpr = this.addHomeProp('computer_desk', 475, 1120, 1.38, true);
    this.registerTaskHotspot('trim_nails', 475, 1145, '💅 按 A 或輕觸書桌進入「精準剪甲節奏王」', deskSpr);

    // --- Zone F: Sunny Balcony (Bottom-Right) + Task 5: Clear Flowerpot Saucer ---
    this.addHomeProp('balcony_railing', 1515, 1305, 1.4, true);
    this.addHomeProp('balcony_railing', 1735, 1305, 1.4, true);
    this.addHomeProp('plant_large', 1495, 1135, 1.32, true);
    this.addHomeProp('plant_small', 1765, 1175, 1.32, true);
    const potSpr = this.addHomeProp('plant_whitepot', 1640, 1155, 1.45, true);
    this.registerTaskHotspot('clear_saucer', 1640, 1175, '🪴 按 A 或輕觸花盆進入「倒積水滅孑孓挑戰」', potSpr);
  }

  // ==========================================================================
  // 2. Upgraded Full-Canvas HD Hong Kong Street & Choi Wan Park Scene
  // ==========================================================================
  private buildHdStreetScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    // Keep hero off building roofs & busy車道 while allowing full park, sidewalk & bridge exploration
    this.addFootCollider(1320, 145, 920, 220);

    const streetBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.75)', padding: { x: 9, y: 4 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(30);
    };
    streetBadge(310, 210, '🌳 彩雲社區公園');
    streetBadge(635, 190, '🌉 行人天橋往返家居');
    streetBadge(1380, 290, '🍜 香港味道茶餐廳 · 興發大排檔');
    streetBadge(1890, 455, '🏛️ 河道石拱橋廣場');

    // Return Home Entrance by Footbridge
    const homeEmote = this.add.sprite(635, 225, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: homeEmote, y: homeEmote.y - 7, duration: 620, yoyo: true, repeat: -1 });
    const gateDoor = this.addHomeProp('door', 635, 295, 1.15, false);
    this.registerInteractiveHotspot({
      id: 'go_home', x: 635, y: 325, radius: 115,
      label: '🏠 按 A 或輕觸返回「高清溫馨家居」', sprite: gateDoor, emote: homeEmote
    });

    // Patrolling Pedestrian NPC along HK Pink-Brick Sidewalk
    const man = this.add.sprite(980, 640, 'npcs', 8).setDepth(660).play('npc-man-walk');
    this.tweens.add({ targets: man, x: 1580, duration: 4800, yoyo: true, repeat: -1 });

    // Task 6: 3-Color Recycling Station in Choi Wan Park
    const recDone = gameState.isDone('recycle_bottles');
    this.add.image(330, 650, 'mg', 23).setScale(1.25).setDepth(655);
    this.add.image(395, 650, 'mg', 24).setScale(1.25).setDepth(655);
    this.add.image(460, 650, 'mg', 25).setScale(1.25).setDepth(655);
    const bottles = this.add.sprite(395, 715, 'tiles-street', recDone ? 19 : 21).setScale(1.25).setDepth(720);
    this.registerTaskHotspot('recycle_bottles', 395, 715, '♻️ 按 A 或輕觸進入「香港三色回收快手」', bottles);

    // Task 7: Dripping Tang Lau AC + Aedes Mosquito Bushes
    const mosDone = gameState.isDone('spray_mosquito');
    const acUnit = this.add.sprite(1040, 320, 'tiles-street', mosDone ? 10 : 9).setScale(1.35).setDepth(380);
    const puddle = this.add.sprite(1040, 445, 'tiles-street', mosDone ? 19 : 22).setScale(1.25).setDepth(440);
    if (mosDone) puddle.setVisible(false);
    if (!mosDone) {
      this.add.sprite(985, 395, 'npcs', 20).setDepth(490).play('mosquito-fly');
      this.add.sprite(1095, 415, 'npcs', 20).setDepth(490).play('mosquito-fly');
      this.time.addEvent({
        delay: 650, loop: true,
        callback: () => {
          if (gameState.currentMap !== 'street' || gameState.isDone('spray_mosquito')) return;
          const drop = this.add.rectangle(1040, 345, 6, 10, 0x38bdf8).setDepth(470);
          this.tweens.add({ targets: drop, y: 445, alpha: 0.2, duration: 480, onComplete: () => drop.destroy() });
        }
      });
    }
    this.registerTaskHotspot('spray_mosquito', 1040, 445, '🦟 按 A 或輕觸進入「冷氣止漏 ＋ DEET 驅蚊射擊」', acUnit);

    // Task 8: Cha Chaan Teng / Dai Pai Dong Wall Rat Hole
    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(1445, 415, 'tiles-street', ratDone ? 15 : 14).setScale(1.35).setDepth(425);
    if (!ratDone) {
      const rat = this.add.sprite(1380, 465, 'npcs', 24).setDepth(480).play('rat-scurry');
      this.tweens.add({ targets: rat, x: 1510, duration: 950, yoyo: true, repeat: -1 });
    }
    this.registerTaskHotspot('seal_rathole', 1445, 440, '🕳️ 按 A 或輕觸進入「防鼠三部曲：封堵鼠洞」', rHole);

    // Task 9: FEHD Officer Final Assessment at Canal Bridge Plaza
    const fehd = this.add.sprite(1845, 560, 'npcs', 0).setScale(1.25).setDepth(580).play('npc-fehd-walk');
    const fEmote = this.add.sprite(fehd.x, fehd.y - 54, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: fEmote, y: fEmote.y - 7, duration: 600, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'fehd_quiz', x: fehd.x, y: fehd.y, radius: 115,
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

    this.registerInteractiveHotspot({ id, x, y, radius: 115, label, sprite, ring, emote });
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
        ? `屋企仲有 ${rem} 項衛生任務未做完呀！記得去齊【右上浴室】、【左下睡房】、【正上飯廳】同【右下陽光露台】看看！`
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
        this.openDialogue('食環署主任廣播', '歡迎來到彩雲社區街道與公園！請幫忙到左邊公園做三色回收、到唐樓修好滴水冷氣與滅蚊、封好茶餐廳外牆鼠洞，最後到拱橋廣場找我考核！');
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
      if (x < 460 && y < 520) return '溫馨家居 · 🚪 玄關走廊';
      if (x >= 460 && x < 1180 && y < 520) return '溫馨家居 · 🍳 廚房與飯廳';
      if (x >= 1180 && y < 920) return '溫馨家居 · 🛁 浴室與洗手間';
      if (x < 620 && y >= 760) return '溫馨家居 · 🛏️ 小明睡房';
      if (x >= 1340 && y >= 920) return '溫馨家居 · 🌿 陽光露台';
      return '溫馨家居 · 🛋️ 客廳';
    }
    if (x < 680) return '香港社區 · 🌳 彩雲公園';
    if (x >= 1720) return '香港社區 · 🏛️ 河道拱橋廣場';
    return '香港社區 · 🍜 茶餐廳商舖街';
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
