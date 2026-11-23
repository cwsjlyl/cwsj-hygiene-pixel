import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { HomeStandalonePropKey, STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';
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

const COMPACT_HOME_PAD_X = 6;
const COMPACT_HOME_RATIO = 2 / 3;

function hx(x1902: number): number {
  return Math.round(COMPACT_HOME_PAD_X + x1902 * COMPACT_HOME_RATIO);
}

function hy(y1380: number): number {
  return Math.round(y1380 * COMPACT_HOME_RATIO);
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
  private worldW = 1280;
  private worldH = 920;

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
      `${gameState.studentName}，歡迎回到 V4 緊湊版高清像素家居！全屋一目了然，你可以用搖桿／方向鍵走近發光家具按 A，或在 iPad 直接輕觸發光任務點互動。完成屋企 5 個衛生任務後，就從左上【玄關大門】前往香港街道冒險吧！`
    );
  }

  private addFootCollider(cx: number, cy: number, w: number, h: number): void {
    const z = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
    this.physics.add.existing(z, true);
    this.colliders.add(z);
  }

  /**
   * 載入 V4 2x-EPX 無損去背獨立家具貼圖，若缺漏則自動回退至無損圖集 frame
   */
  private addStandaloneHomeProp(
    key: HomeStandalonePropKey,
    x: number,
    y: number,
    compactScale = 1.0,
    solidFoot = false,
    depthOffset = 0
  ): Phaser.GameObjects.Image {
    const standaloneKey = `prop-home-${key}`;
    const hasStandalone = this.textures.exists(standaloneKey);
    const img = hasStandalone
      ? this.add.image(x, y, standaloneKey).setScale(0.5 * COMPACT_HOME_RATIO * compactScale)
      : this.add.image(x, y, 'home-props', key).setScale(COMPACT_HOME_RATIO * compactScale);

    img.setDepth(y + img.displayHeight * 0.36 + depthOffset);
    if (solidFoot) {
      this.addFootCollider(x, y + img.displayHeight * 0.22, img.displayWidth * 0.55, Math.max(16, img.displayHeight * 0.24));
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

    this.worldW = mapId === 'home' ? 1280 : 2112;
    this.worldH = mapId === 'home' ? 920 : 1152;
    const padX = mapId === 'home' ? 36 : 48;
    const padY = mapId === 'home' ? 36 : 52;
    this.physics.world.setBounds(padX, padY, this.worldW - padX * 2, this.worldH - padY * 2);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    if (mapId === 'home') this.buildCompactHdHomeScene();
    else this.buildHdStreetScene(this.worldW, this.worldH);

    const spawn = mapId === 'home' ? { x: hx(855), y: hy(555) } : { x: 630, y: 535 };
    const heroScale = mapId === 'home' ? 0.92 : 1.05;
    const compScale = mapId === 'home' ? 0.88 : 1.0;

    this.companion = this.add.sprite(spawn.x - 40, spawn.y + 6, 'npcs', 16)
      .setScale(compScale)
      .setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setScale(heroScale);
    this.hero.setCollideWorldBounds(true);
    this.hero.play('hero-idle-down');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setSize(28, 20);
    body.setOffset(18, 60);

    this.physics.add.collider(this.hero, this.colliders);
    this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '15px', fontStyle: 'bold', color: '#0f172a',
      backgroundColor: '#fde047', padding: { x: 10, y: 5 }
    }).setOrigin(0.5, 1).setDepth(5000).setVisible(false);

    this.refreshHud();
  }

  // ==========================================================================
  // 1. V4 緊湊版 EPX-2x 高清溫馨家居場景 (1268 x 920 1:1 銳利像素置中於 1280 x 920)
  //    搭配獨立無損 LXP1 去背家具貼圖，橫向全屋一覽無遺、動線緊湊輕快
  // ==========================================================================
  private buildCompactHdHomeScene(): void {
    this.add.rectangle(0, 0, this.worldW, this.worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    const bg = this.add.image(COMPACT_HOME_PAD_X, 0, 'map-home').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(1268, 920);

    // 阻擋露台左右外側深色背景邊界，完整保留室內與陽光露台行走動線
    this.addFootCollider(hx(260), hy(1210), Math.round(480 * COMPACT_HOME_RATIO), Math.round(320 * COMPACT_HOME_RATIO));
    this.addFootCollider(hx(1640), hy(1210), Math.round(480 * COMPACT_HOME_RATIO), Math.round(320 * COMPACT_HOME_RATIO));

    const roomBadge = (x1902: number, y1380: number, txt: string) => {
      this.add.text(hx(x1902), hy(y1380), txt, {
        fontSize: '14px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.76)', padding: { x: 8, y: 3 }, fontStyle: 'bold'
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

    // --- 左上玄關大門：前往香港社區街道 ---
    const frontDoor = this.addStandaloneHomeProp('door', hx(210), hy(105), 1.0, false, -5);
    const doorEmote = this.add.sprite(hx(210), hy(44), 'npcs', 29).setScale(0.9).setDepth(4200);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 6, duration: 650, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'go_street', x: hx(210), y: hy(165), radius: 92,
      label: '🚪 按 A 或輕觸大門前往「香港社區街道」',
      sprite: frontDoor, emote: doorEmote
    });

    // --- 中上飯廳餐桌與餐椅：任務 4 蓋好食物防鼠保衛戰 ---
    this.addStandaloneHomeProp('chair_side', hx(535), hy(218), 0.94, false);
    this.addStandaloneHomeProp('chair_side', hx(745), hy(218), 0.94, false).setFlipX(true);
    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addStandaloneHomeProp(foodDone ? 'dining_table' : 'cake_table', hx(640), hy(215), 1.0, false);
    if (foodDone) {
      this.add.image(hx(640), hy(192), 'mg', 13).setScale(0.85).setDepth(cakeTable.depth + 5);
    }
    this.registerTaskHotspot('cover_food', hx(640), hy(235), '🍲 按 A 或輕觸餐桌進入「餐桌防鼠保衛戰」', cakeTable, 92);

    // --- 中右上方洗手間洗手盆與鏡子：任務 1 洗手泡泡滅菌戰 ---
    this.addStandaloneHomeProp('mirror', hx(1010), hy(172), 0.96, false, -20);
    const sinkSpr = this.addStandaloneHomeProp('sink_vanity', hx(1010), hy(245), 0.98, false);
    this.registerTaskHotspot('wash_hands', hx(1010), hy(265), '🧼 按 A 或輕觸洗手盆進入「洗手泡泡滅菌戰」', sinkSpr, 92);

    // --- 中下藍色磁磚浴室梳洗台、鏡子與毛巾：任務 2 護齒刷牙大掃除 ---
    this.addStandaloneHomeProp('mirror', hx(1268), hy(702), 0.96, false, -20);
    this.addStandaloneHomeProp('towel', hx(1340), hy(735), 0.98, false);
    const toothVanity = this.addStandaloneHomeProp('sink_vanity', hx(1268), hy(775), 0.98, false);
    this.registerTaskHotspot('brush_teeth', hx(1268), hy(795), '🪥 按 A 或輕觸梳洗台進入「護齒刷牙大掃除」', toothVanity, 92);

    // --- 右下小明睡房書桌與座椅：任務 3 精準剪甲節奏王 ---
    const deskSpr = this.addStandaloneHomeProp('computer_desk', hx(1475), hy(915), 1.0, false);
    this.addStandaloneHomeProp('chair_front', hx(1475), hy(952), 0.9, false, 6);
    this.registerTaskHotspot('trim_nails', hx(1475), hy(928), '💅 按 A 或輕觸書桌進入「精準剪甲節奏王」', deskSpr, 92);

    // --- 正下陽光露台盆栽組與護欄：任務 5 倒積水滅孑孓挑戰 ---
    this.addStandaloneHomeProp('plant_large', hx(815), hy(1185), 0.95, false);
    this.addStandaloneHomeProp('plant_small', hx(1105), hy(1202), 0.98, false);
    this.addStandaloneHomeProp('balcony_railing', hx(835), hy(1292), 1.0, false, 20);
    this.addStandaloneHomeProp('balcony_railing', hx(1085), hy(1292), 1.0, false, 20);
    const potSpr = this.addStandaloneHomeProp('plant_whitepot', hx(960), hy(1195), 1.15, false);
    this.registerTaskHotspot('clear_saucer', hx(960), hy(1210), '🪴 按 A 或輕觸花盆進入「倒積水滅孑孓挑戰」', potSpr, 95);

    // --- 中央走廊與睡房：媽媽與妹妹互動 NPC ---
    const mom = this.add.sprite(hx(640), hy(560), 'npcs', 4).setScale(0.92).setDepth(hy(580)).play('npc-mom-walk');
    this.tweens.add({ targets: mom, x: hx(810), duration: 3200, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'talk_mom', x: hx(725), y: hy(560), radius: 96,
      label: '👩 按 A 與媽媽對話查看衛生提示', sprite: mom
    });

    const sis = this.add.sprite(hx(1430), hy(445), 'npcs', 12).setScale(0.92).setDepth(hy(465)).play('npc-girl-walk');
    this.tweens.add({ targets: sis, x: hx(1590), duration: 2600, yoyo: true, repeat: -1 });
  }

  // ==========================================================================
  // 2. V4 EPX-2x 高清香港街道場景 + 12 件無損 LXP1 獨立街道前景物件 2.5D 景深疊加
  // ==========================================================================
  private buildHdStreetScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    const streetScale = worldW / 1408; // 1.5x world alignment over 2816x1536 EPX-2x texture
    const streetPropMap = new Map<string, Phaser.GameObjects.Image>();

    for (const spec of STREET_STANDALONE_PROP_SPECS) {
      const tk = `prop-street-${spec.key}`;
      if (!this.textures.exists(tk)) continue;
      const cx = (spec.x + spec.w * 0.5) * streetScale;
      const cy = (spec.y + spec.h * 0.5) * streetScale;
      const spr = this.add.image(cx, cy, tk);
      spr.setDisplaySize(spec.w * streetScale, spec.h * streetScale);

      if (spec.layer === 'ground') {
        spr.setDepth(16);
      } else if (spec.layer === 'sign') {
        spr.setDepth((spec.y + spec.h) * streetScale + 140);
      } else {
        spr.setDepth((spec.y + spec.h * 0.82) * streetScale);
      }
      streetPropMap.set(spec.key, spr);
    }

    const streetBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.76)', padding: { x: 9, y: 4 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(3500);
    };
    streetBadge(430, 240, '🌳 彩雲社區公園');
    streetBadge(1050, 200, '🌉 行人天橋返回家居');
    streetBadge(1440, 228, '🍜 香港味道茶餐廳');
    streetBadge(1375, 650, '🍲 興發大排檔');
    streetBadge(1865, 495, '🏛️ 河道石拱橋');

    // --- 中央行人天橋返回家居入口 (1050, 295) ---
    const homeEmote = this.add.sprite(1050, 232, 'npcs', 29).setDepth(4200);
    this.tweens.add({ targets: homeEmote, y: homeEmote.y - 7, duration: 620, yoyo: true, repeat: -1 });
    const standaloneDoorKey = 'prop-home-door';
    const gateDoor = this.textures.exists(standaloneDoorKey)
      ? this.add.image(1050, 295, standaloneDoorKey).setScale(0.46)
      : this.add.image(1050, 295, 'home-props', 'door').setScale(0.92);
    gateDoor.setDepth(295 + gateDoor.displayHeight * 0.36);

    this.registerInteractiveHotspot({
      id: 'go_home', x: 1050, y: 325, radius: 120,
      label: '🏠 按 A 或輕觸天橋入口返回「溫馨家居」', sprite: gateDoor, emote: homeEmote
    });

    // --- 街道行人路巡邏街坊 NPC ---
    const man = this.add.sprite(760, 585, 'npcs', 8).setDepth(605).play('npc-man-walk');
    this.tweens.add({ targets: man, x: 1320, duration: 4600, yoyo: true, repeat: -1 });

    // --- 左上彩雲社區公園 (441, 474)：任務 6 香港三色回收快手（直接使用無損獨立三色回收桶！）---
    const recDone = gameState.isDone('recycle_bottles');
    const recycleSpr = streetPropMap.get('recycle_bins');
    const bottles = this.add.sprite(441, 514, 'tiles-street', recDone ? 19 : 21).setScale(1.2).setDepth(524);
    if (recycleSpr) {
      recycleSpr.setInteractive({ useHandCursor: true });
      recycleSpr.on('pointerdown', () => {
        if (this.dialogueOpen) return;
        const found = this.hotspots.find((item) => item.id === 'recycle_bottles');
        if (found) {
          this.activeHotspot = found;
          this.handleActionButton();
        }
      });
    }
    this.registerTaskHotspot('recycle_bottles', 441, 505, '♻️ 按 A 或輕觸進入「香港三色回收快手」', bottles, 120);

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
    this.registerTaskHotspot('spray_mosquito', 1440, 455, '🦟 按 A 或輕觸進入「冷氣止漏 ＋ DEET 驅蚊射擊」', acUnit, 120);

    // --- 中下「興發大排檔」外牆 (1375, 765)：任務 8 封堵鼠洞 ---
    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(1375, 765, 'tiles-street', ratDone ? 15 : 14).setScale(1.3).setDepth(775);
    if (!ratDone) {
      const rat = this.add.sprite(1315, 805, 'npcs', 24).setDepth(815).play('rat-scurry');
      this.tweens.add({ targets: rat, x: 1435, duration: 950, yoyo: true, repeat: -1 });
    }
    this.registerTaskHotspot('seal_rathole', 1375, 780, '🕳️ 按 A 或輕觸進入「防鼠三部曲：封堵鼠洞」', rHole, 120);

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
    sprite: Phaser.GameObjects.Sprite | Phaser.GameObjects.Image,
    radius = 110
  ): void {
    const isHome = gameState.currentMap === 'home';
    const done = gameState.isDone(id);
    const ring = this.add.circle(x, y + (isHome ? 10 : 14), isHome ? 26 : 34, done ? 0x10b981 : 0xfde047, 0.22)
      .setStrokeStyle(3, done ? 0x34d399 : 0xfacc15)
      .setDepth(25);
    this.tweens.add({ targets: ring, scale: { from: 0.92, to: 1.12 }, alpha: { from: 0.18, to: 0.38 }, duration: 850, yoyo: true, repeat: -1 });

    const emote = this.add.sprite(x, y - (isHome ? 46 : 58), 'npcs', done ? 30 : 28)
      .setScale(isHome ? 0.88 : 1.0)
      .setDepth(4200);
    this.tweens.add({ targets: emote, y: emote.y - 6, duration: 580, yoyo: true, repeat: -1 });

    this.registerInteractiveHotspot({ id, x, y, radius, label, sprite, ring, emote });
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
      targets: this.hero, y: this.hero.y - 16, duration: 180, yoyo: true, repeat: 1,
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
      if (x < hx(430) && y < hy(480)) return '溫馨家居 · 🚪 玄關走廊';
      if (x >= hx(430) && x < hx(940) && y < hy(480)) return '溫馨家居 · 🍳 廚房與飯廳';
      if (x >= hx(940) && x < hx(1330) && y < hy(460)) return '溫馨家居 · 🧼 上方洗手間';
      if (x >= hx(1330) && y < hy(510)) return '溫馨家居 · 🛏️ 主人睡房';
      if (x < hx(680) && y >= hy(480) && y < hy(1000)) return '溫馨家居 · 🛋️ 溫馨客廳';
      if (x >= hx(940) && x < hx(1350) && y >= hy(650) && y < hy(1000)) return '溫馨家居 · 🛁 浴室梳洗區';
      if (x >= hx(1350) && y >= hy(510) && y < hy(1000)) return '溫馨家居 · 💻 小明睡房';
      if (y >= hy(1000)) return '溫馨家居 · 🌿 陽光露台';
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
    const baseSpeed = gameState.currentMap === 'home' ? 195 : 225;
    const speed = mv.sprint ? baseSpeed * 1.48 : baseSpeed;
    this.hero.setVelocity(mv.x * speed, mv.y * speed);

    if (Math.hypot(mv.x, mv.y) > 0.08) {
      this.facing = Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x < 0 ? 'left' : 'right') : (mv.y < 0 ? 'up' : 'down');
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 15) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 6).setDepth(pt.y);
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
          const dust = this.add.rectangle(this.hero.x + (Math.random() - 0.5) * 14, this.hero.y + 30, 6, 6, 0xe2e8f0, 0.8).setDepth(this.hero.y);
          this.tweens.add({ targets: dust, y: dust.y - 9, alpha: 0, scale: 0.3, duration: 260, onComplete: () => dust.destroy() });
        }
      }
    } else {
      this.hero.play(`hero-idle-${this.facing}`, true);
    }

    this.hero.setDepth(this.hero.y + 32);
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
      const clampedX = Phaser.Math.Clamp(nearest.x, 195, this.worldW - 195);
      const clampedY = Math.max(40, nearest.y - (gameState.currentMap === 'home' ? 68 : 82));
      this.promptTag.setText(nearest.label).setPosition(clampedX, clampedY).setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
