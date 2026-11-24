import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { HomeStandalonePropKey, STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';
import {
  V5_HD_CHARS_ENABLED,
  V5_VALID_STREET_PROPS,
  V6_HOME_PROPS_SCALE,
  V6_LIGHT_MG_NPCS,
  V6_LIGHT_STREET_TILES,
  V6_STREET_PROPS_ATLAS
} from '../gfx/v5RuntimeConfig';
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

interface TapWalkTarget {
  x: number;
  y: number;
  pendingHotspot: MapHotspot | null;
  stuckMs: number;
  lastX: number;
  lastY: number;
}

const COMPACT_HOME_PAD_X = 6;
const COMPACT_HOME_RATIO = 2 / 3;
const MG_NPC_MULT = V6_LIGHT_MG_NPCS ? 2 : 1;
const STREET_TILE_MULT = V6_LIGHT_STREET_TILES ? 2 : 1;

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

  private tapTarget: TapWalkTarget | null = null;
  private tapMarker: Phaser.GameObjects.Arc | null = null;
  private lastHotspotTapAt = 0;

  private joystick!: VirtualJoystick;
  private dialogueOpen = false;
  private onDialogueNext: (() => void) | null = null;

  constructor() {
    super('ExploreScene');
  }

  create(): void {
    this.input.addPointer(3);
    this.joystick = new VirtualJoystick(() => this.handleActionButton());

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.handleMapTap(pointer);
    });

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
      `${gameState.studentName}，歡迎回到溫馨像素家居！全屋與香港街道擺設均已升級為 iPad 輕量極速版，你可以輕觸地圖任意地點走過去，或點選發光家具自動上前互動。完成屋企 5 個衛生任務後，就從左上【玄關大門】出發吧！`
    );
  }

  private clearTapTarget(): void {
    this.tapTarget = null;
    if (this.tapMarker) {
      this.tapMarker.destroy();
      this.tapMarker = null;
    }
  }

  private setTapDestination(wx: number, wy: number, pendingHotspot: MapHotspot | null = null): void {
    const padX = gameState.currentMap === 'home' ? 40 : 52;
    const padY = gameState.currentMap === 'home' ? 40 : 56;
    const tx = Phaser.Math.Clamp(wx, padX, this.worldW - padX);
    const ty = Phaser.Math.Clamp(wy, padY, this.worldH - padY);

    if (this.tapMarker) {
      this.tapMarker.destroy();
      this.tapMarker = null;
    }

    const ringColor = pendingHotspot ? 0xfacc15 : 0x38bdf8;
    const marker = this.add.circle(tx, ty, 18, ringColor, 0.22)
      .setStrokeStyle(3, ringColor, 0.95)
      .setDepth(45);
    this.tweens.add({
      targets: marker,
      scale: { from: 0.78, to: 1.18 },
      alpha: { from: 0.9, to: 0.3 },
      duration: 520,
      yoyo: true,
      repeat: -1
    });
    this.tapMarker = marker;
    this.tapTarget = {
      x: tx,
      y: ty,
      pendingHotspot,
      stuckMs: 0,
      lastX: this.hero ? this.hero.x : tx,
      lastY: this.hero ? this.hero.y : ty
    };
  }

  private walkToOrTriggerHotspot(h: MapHotspot): void {
    if (this.dialogueOpen || this.cheering || !this.hero) return;
    this.lastHotspotTapAt = this.time.now;
    const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, h.x, h.y);
    if (dist <= h.radius) {
      this.clearTapTarget();
      this.activeHotspot = h;
      this.handleActionButton();
    } else {
      this.setTapDestination(h.x, h.y, h);
    }
  }

  private handleMapTap(pointer: Phaser.Input.Pointer): void {
    if (this.dialogueOpen || this.cheering || !this.hero) return;
    if (this.time.now - this.lastHotspotTapAt < 65) return;

    const titleOv = document.getElementById('title-overlay');
    const certOv = document.getElementById('cert-overlay');
    if ((titleOv && !titleOv.classList.contains('hidden')) || (certOv && !certOv.classList.contains('hidden'))) {
      return;
    }

    const rawEvt = pointer.event as Event | undefined;
    const targetEl = rawEvt?.target as HTMLElement | null | undefined;
    if (targetEl && targetEl.tagName && targetEl.tagName.toUpperCase() !== 'CANVAS') {
      return;
    }

    pointer.updateWorldPoint(this.cameras.main);
    const wx = pointer.worldX;
    const wy = pointer.worldY;

    let tappedHotspot: MapHotspot | null = null;
    let bestDist = 56;
    for (const h of this.hotspots) {
      if (gameState.isDone(h.id)) continue;
      const d = Phaser.Math.Distance.Between(wx, wy, h.x, h.y);
      if (d <= bestDist) {
        bestDist = d;
        tappedHotspot = h;
      }
    }

    if (tappedHotspot) {
      this.walkToOrTriggerHotspot(tappedHotspot);
    } else {
      this.setTapDestination(wx, wy, null);
    }
  }

  private addFootCollider(cx: number, cy: number, w: number, h: number): void {
    const z = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
    this.physics.add.existing(z, true);
    this.colliders.add(z);
  }

  private addHomeProp(
    key: HomeStandalonePropKey,
    x: number,
    y: number,
    unitScale = 1.0,
    solidFoot = false,
    depthOffset = 0
  ): Phaser.GameObjects.Image {
    const standaloneKey = `prop-home-${key}`;
    const hasStandalone = this.textures.exists(standaloneKey);
    const img = hasStandalone
      ? this.add.image(x, y, standaloneKey).setScale(0.46 * unitScale)
      : this.add.image(x, y, 'home-props', key).setScale(COMPACT_HOME_RATIO * V6_HOME_PROPS_SCALE * unitScale);

    img.setDepth(y + img.displayHeight * 0.36 + depthOffset);
    if (solidFoot) {
      this.addFootCollider(
        x,
        y + img.displayHeight * 0.24,
        Math.max(20, img.displayWidth * 0.48),
        Math.max(14, img.displayHeight * 0.18)
      );
    }
    return img;
  }

  private buildWorld(mapId: MapId): void {
    gameState.currentMap = mapId;
    sound.playBgm(mapId);
    this.tapTarget = null;
    this.tapMarker = null;
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

    const spawn = mapId === 'home' ? { x: hx(845), y: hy(555) } : { x: 630, y: 535 };
    const heroScale = V5_HD_CHARS_ENABLED
      ? (mapId === 'home' ? 0.58 : 0.66)
      : (mapId === 'home' ? 0.94 : 1.08);
    const compScale = (mapId === 'home' ? 0.88 : 1.0) * MG_NPC_MULT;

    this.companion = this.add.sprite(spawn.x - 42, spawn.y + 6, 'npcs', 16)
      .setScale(compScale)
      .setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setScale(heroScale);
    this.hero.setCollideWorldBounds(true);
    this.hero.play('hero-idle-down');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    if (V5_HD_CHARS_ENABLED) {
      body.setSize(46, 32);
      body.setOffset(33, 108);
    } else {
      body.setSize(28, 20);
      body.setOffset(18, 60);
    }

    this.physics.add.collider(this.hero, this.colliders);
    this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#0f172a',
      backgroundColor: '#fde047',
      padding: { x: 14, y: 7 }
    }).setOrigin(0.5, 1).setDepth(5000).setVisible(false);

    this.refreshHud();
  }

  private buildCompactHdHomeScene(): void {
    this.add.rectangle(0, 0, this.worldW, this.worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    const bg = this.add.image(COMPACT_HOME_PAD_X, 0, 'map-home').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(1268, 920);

    this.addFootCollider(hx(260), hy(1210), Math.round(480 * COMPACT_HOME_RATIO), Math.round(320 * COMPACT_HOME_RATIO));
    this.addFootCollider(hx(1640), hy(1210), Math.round(480 * COMPACT_HOME_RATIO), Math.round(320 * COMPACT_HOME_RATIO));

    const roomBadge = (x1902: number, y1380: number, txt: string) => {
      this.add.text(hx(x1902), hy(y1380), txt, {
        fontSize: '17px',
        color: '#fef08a',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 10, y: 4 },
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(3600);
    };
    roomBadge(215, 248, '🚪 玄關走廊');
    roomBadge(565, 76, '🍳 廚房與飯廳');
    roomBadge(1125, 76, '🧼 上方洗手間');
    roomBadge(1615, 76, '🛏️ 主人睡房');
    roomBadge(365, 495, '🛋️ 溫馨客廳');
    roomBadge(1140, 668, '🛁 浴室梳洗區');
    roomBadge(1535, 540, '💻 小明睡房');
    roomBadge(960, 1045, '🌿 陽光露台');

    const frontDoor = this.addHomeProp('door', hx(210), hy(108), 1.0, false, -5);
    this.addHomeProp('plant_small', hx(350), hy(145), 0.92, false);
    const doorEmote = this.add.sprite(hx(210), hy(44), 'npcs', 29).setScale(0.95 * MG_NPC_MULT).setDepth(4200);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 6, duration: 650, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'go_street', x: hx(210), y: hy(168), radius: 94,
      label: '🚪 按 A 或輕觸大門前往「香港社區街道」',
      sprite: frontDoor, emote: doorEmote
    });

    this.addHomeProp('kitchen_top', hx(790), hy(92), 0.84, false, -18);
    this.addHomeProp('kitchen_bottom', hx(790), hy(174), 0.84, true);
    this.addHomeProp('chair_side', hx(495), hy(305), 0.92, false);
    this.addHomeProp('chair_side', hx(695), hy(305), 0.92, false).setFlipX(true);
    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addHomeProp(foodDone ? 'dining_table' : 'cake_table', hx(595), hy(300), 0.96, false);
    if (foodDone) {
      this.add.image(hx(595), hy(276), 'mg', 13).setScale(0.88 * MG_NPC_MULT).setDepth(cakeTable.depth + 5);
    }
    this.registerTaskHotspot('cover_food', hx(595), hy(318), '🍲 按 A 或輕觸餐桌進入「餐桌防鼠保衛戰」', cakeTable, 94);

    this.addHomeProp('mirror', hx(1025), hy(148), 0.95, false, -20);
    const sinkSpr = this.addHomeProp('sink_vanity', hx(1025), hy(228), 0.96, false);
    this.addHomeProp('shower', hx(1235), hy(185), 0.88, true);
    this.addHomeProp('toilet', hx(1245), hy(355), 0.9, true);
    this.registerTaskHotspot('wash_hands', hx(1025), hy(250), '🧼 按 A 或輕觸洗手盆進入「洗手泡泡滅菌戰」', sinkSpr, 94);

    this.addHomeProp('nightstand', hx(1445), hy(178), 0.92, true);
    this.addHomeProp('double_bed', hx(1615), hy(215), 0.96, true);
    this.addHomeProp('plant_large', hx(1775), hy(205), 0.88, false);

    this.addHomeProp('tv_cabinet', hx(365), hy(585), 0.95, true);
    this.addHomeProp('green_rug', hx(365), hy(765), 1.02, false).setDepth(8);
    this.addHomeProp('armchair_left', hx(180), hy(765), 0.92, true);
    this.addHomeProp('armchair_right', hx(550), hy(765), 0.92, true);
    this.addHomeProp('sofa_2seat', hx(365), hy(915), 0.96, true);

    this.addHomeProp('toilet', hx(1015), hy(748), 0.88, true);
    this.addHomeProp('bathtub', hx(1058), hy(912), 0.88, true);
    this.addHomeProp('mirror', hx(1252), hy(702), 0.95, false, -20);
    this.addHomeProp('towel', hx(1322), hy(735), 0.95, false);
    const toothVanity = this.addHomeProp('sink_vanity', hx(1252), hy(780), 0.96, false);
    this.registerTaskHotspot('brush_teeth', hx(1252), hy(800), '🪥 按 A 或輕觸梳洗台進入「護齒刷牙大掃除」', toothVanity, 94);

    this.addHomeProp('nightstand', hx(1555), hy(625), 0.86, true);
    this.addHomeProp('double_bed', hx(1705), hy(668), 0.8, true);
    this.addHomeProp('toy_box', hx(1725), hy(905), 0.92, true);
    const deskSpr = this.addHomeProp('computer_desk', hx(1475), hy(892), 0.96, false);
    this.addHomeProp('chair_front', hx(1475), hy(946), 0.88, false, 6);
    this.registerTaskHotspot('trim_nails', hx(1475), hy(912), '💅 按 A 或輕觸書桌進入「精準剪甲節奏王」', deskSpr, 94);

    this.addHomeProp('plant_large', hx(812), hy(1185), 0.94, false);
    this.addHomeProp('plant_small', hx(1108), hy(1205), 0.96, false);
    this.addHomeProp('balcony_railing', hx(845), hy(1294), 0.86, false, 20);
    this.addHomeProp('balcony_railing', hx(1075), hy(1294), 0.86, false, 20);
    const potSpr = this.addHomeProp('plant_whitepot', hx(960), hy(1195), 1.08, false);
    this.registerTaskHotspot('clear_saucer', hx(960), hy(1210), '🪴 按 A 或輕觸花盆進入「倒積水滅孑孓挑戰」', potSpr, 96);

    const useHdMom = V5_HD_CHARS_ENABLED && this.textures.exists('char-mom');
    const mom = useHdMom
      ? this.add.sprite(hx(705), hy(560), 'char-mom', 8).setScale(0.58).setDepth(hy(580)).play('hd-mom-right')
      : this.add.sprite(hx(705), hy(560), 'npcs', 4).setScale(0.95 * MG_NPC_MULT).setDepth(hy(580)).play('npc-mom-walk');
    this.tweens.add({
      targets: mom,
      x: hx(880),
      duration: 3200,
      yoyo: true,
      repeat: -1,
      onYoyo: () => { if (useHdMom) mom.play('hd-mom-left', true); },
      onRepeat: () => { if (useHdMom) mom.play('hd-mom-right', true); }
    });
    this.registerInteractiveHotspot({
      id: 'talk_mom', x: hx(792), y: hy(560), radius: 98,
      label: '👩 按 A 或輕觸與媽媽對話查看衛生提示', sprite: mom
    });

    const useHdSis = V5_HD_CHARS_ENABLED && this.textures.exists('char-sister');
    const sis = useHdSis
      ? this.add.sprite(hx(1430), hy(430), 'char-sister', 8).setScale(0.56).setDepth(hy(450)).play('hd-sister-right')
      : this.add.sprite(hx(1430), hy(430), 'npcs', 12).setScale(0.95 * MG_NPC_MULT).setDepth(hy(450)).play('npc-girl-walk');
    this.tweens.add({
      targets: sis,
      x: hx(1635),
      duration: 2600,
      yoyo: true,
      repeat: -1,
      onYoyo: () => { if (useHdSis) sis.play('hd-sister-left', true); },
      onRepeat: () => { if (useHdSis) sis.play('hd-sister-right', true); }
    });
  }

  private buildHdStreetScene(worldW: number, worldH: number): void {
    const bg = this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    const streetScale = worldW / 1408;
    const streetPropMap = new Map<string, Phaser.GameObjects.Image>();
    const hasStreetAtlas = V6_STREET_PROPS_ATLAS && this.textures.exists('street-props');
    const streetAtlasTex = hasStreetAtlas ? this.textures.get('street-props') : null;

    for (const spec of STREET_STANDALONE_PROP_SPECS) {
      if (!V5_VALID_STREET_PROPS.includes(spec.key)) continue;
      const useAtlas = Boolean(streetAtlasTex && streetAtlasTex.has(spec.key));
      const tk = `prop-street-${spec.key}`;
      if (!useAtlas && !this.textures.exists(tk)) continue;

      const cx = Math.round((spec.x + spec.w * 0.5) * streetScale);
      const cy = Math.round((spec.y + spec.h * 0.5) * streetScale);
      const spr = useAtlas
        ? this.add.image(cx, cy, 'street-props', spec.key)
        : this.add.image(cx, cy, tk);
      spr.setDisplaySize(Math.round(spec.w * streetScale), Math.round(spec.h * streetScale));

      if (spec.layer === 'ground') spr.setDepth(16);
      else if (spec.layer === 'sign') spr.setDepth(Math.round((spec.y + spec.h) * streetScale) + 140);
      else spr.setDepth(Math.round((spec.y + spec.h * 0.82) * streetScale));
      streetPropMap.set(spec.key, spr);
    }

    const streetBadge = (x: number, y: number, txt: string) => {
      this.add.text(x, y, txt, {
        fontSize: '19px',
        color: '#fef08a',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 12, y: 6 },
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(3500);
    };
    streetBadge(430, 240, '🌳 彩雲社區公園');
    streetBadge(1050, 200, '🌉 行人天橋返回家居');
    streetBadge(1440, 228, '🍜 香港味道茶餐廳');
    streetBadge(1375, 650, '🍲 興發大排檔');
    streetBadge(1865, 495, '🏛️ 河道石拱橋');

    const homeEmote = this.add.sprite(1050, 232, 'npcs', 29).setScale(MG_NPC_MULT).setDepth(4200);
    this.tweens.add({ targets: homeEmote, y: homeEmote.y - 7, duration: 620, yoyo: true, repeat: -1 });
    const standaloneDoorKey = 'prop-home-door';
    const gateDoor = this.textures.exists(standaloneDoorKey)
      ? this.add.image(1050, 295, standaloneDoorKey).setScale(0.46)
      : this.add.image(1050, 295, 'home-props', 'door').setScale(0.92 * V6_HOME_PROPS_SCALE);
    gateDoor.setDepth(295 + gateDoor.displayHeight * 0.36);

    this.registerInteractiveHotspot({
      id: 'go_home', x: 1050, y: 325, radius: 120,
      label: '🏠 按 A 或輕觸天橋入口返回「溫馨家居」', sprite: gateDoor, emote: homeEmote
    });

    const useHdMan = V5_HD_CHARS_ENABLED && this.textures.exists('char-passerby');
    const man = useHdMan
      ? this.add.sprite(760, 585, 'char-passerby', 8).setScale(0.65).setDepth(605).play('hd-passerby-right')
      : this.add.sprite(760, 585, 'npcs', 8).setScale(1.05 * MG_NPC_MULT).setDepth(605).play('npc-man-walk');
    this.tweens.add({
      targets: man,
      x: 1320,
      duration: 4600,
      yoyo: true,
      repeat: -1,
      onYoyo: () => { if (useHdMan) man.play('hd-passerby-left', true); },
      onRepeat: () => { if (useHdMan) man.play('hd-passerby-right', true); }
    });

    const recDone = gameState.isDone('recycle_bottles');
    const recycleSpr = streetPropMap.get('recycle_bins');
    const bottles = this.add.sprite(441, 514, 'tiles-street', recDone ? 19 : 21)
      .setScale(1.25 * STREET_TILE_MULT)
      .setDepth(524);
    if (recycleSpr) {
      recycleSpr.setInteractive({ useHandCursor: true });
      recycleSpr.on('pointerdown', () => {
        const found = this.hotspots.find((item) => item.id === 'recycle_bottles');
        if (found) {
          this.walkToOrTriggerHotspot(found);
        }
      });
    }
    this.registerTaskHotspot('recycle_bottles', 441, 505, '♻️ 按 A 或輕觸進入「香港三色回收快手」', bottles, 120);

    const mosDone = gameState.isDone('spray_mosquito');
    const acUnit = this.add.sprite(1440, 345, 'tiles-street', mosDone ? 10 : 9)
      .setScale(1.3 * STREET_TILE_MULT)
      .setDepth(395);
    const puddle = this.add.sprite(1440, 465, 'tiles-street', mosDone ? 19 : 22)
      .setScale(1.2 * STREET_TILE_MULT)
      .setDepth(460);
    if (mosDone) puddle.setVisible(false);
    if (!mosDone) {
      this.add.sprite(1385, 415, 'npcs', 20).setScale(MG_NPC_MULT).setDepth(490).play('mosquito-fly');
      this.add.sprite(1495, 430, 'npcs', 20).setScale(MG_NPC_MULT).setDepth(490).play('mosquito-fly');
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

    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(1375, 765, 'tiles-street', ratDone ? 15 : 14)
      .setScale(1.3 * STREET_TILE_MULT)
      .setDepth(775);
    if (!ratDone) {
      const rat = this.add.sprite(1315, 805, 'npcs', 24).setScale(MG_NPC_MULT).setDepth(815).play('rat-scurry');
      this.tweens.add({ targets: rat, x: 1435, duration: 950, yoyo: true, repeat: -1 });
    }
    this.registerTaskHotspot('seal_rathole', 1375, 780, '🕳️ 按 A 或輕觸進入「防鼠三部曲：封堵鼠洞」', rHole, 120);

    const fehd = this.add.sprite(1835, 645, 'npcs', 0).setScale(1.28 * MG_NPC_MULT).setDepth(665).play('npc-fehd-walk');
    const fEmote = this.add.sprite(fehd.x, fehd.y - 54, 'npcs', 29).setScale(MG_NPC_MULT).setDepth(4200);
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
        this.walkToOrTriggerHotspot(h);
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
      .setScale((isHome ? 0.92 : 1.0) * MG_NPC_MULT)
      .setDepth(4200);
    this.tweens.add({ targets: emote, y: emote.y - 6, duration: 580, yoyo: true, repeat: -1 });

    this.registerInteractiveHotspot({ id, x, y, radius, label, sprite, ring, emote });
  }

  private launchArcadeMinigame(taskId: string, onWon: (medal: MedalRank, bonus: number) => void): void {
    this.clearTapTarget();
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
        ? `屋企仲有 ${rem} 項衛生任務未做完呀！你可以直接點選地圖或發光家具走去【中上飯廳】、【上下洗手間／浴室】、【右下小明睡房】同【正下陽光露台】看看！`
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
        this.openDialogue('食環署主任廣播', '歡迎來到彩雲社區街道與公園！你可以直接點選地面走向目標，幫忙到左上公園做三色回收、到「香港味道茶餐廳」修好滴水冷氣與滅蚊、封好「興發大排檔」外牆鼠洞，最後到右側河道石拱橋找我考核！');
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
    this.clearTapTarget();
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

    const joyMv = this.joystick.getMovementVector();
    let moveX = joyMv.x;
    let moveY = joyMv.y;
    let isSprint = joyMv.sprint;
    let speedMult = 1.0;

    if (Math.hypot(joyMv.x, joyMv.y) > 0.08) {
      if (this.tapTarget) this.clearTapTarget();
    } else if (this.tapTarget) {
      const dx = this.tapTarget.x - this.hero.x;
      const dy = this.tapTarget.y - this.hero.y;
      const dist = Math.hypot(dx, dy);
      const pending = this.tapTarget.pendingHotspot;
      const arriveDist = pending ? Math.max(44, pending.radius * 0.72) : 14;

      if (dist <= arriveDist) {
        this.clearTapTarget();
        this.hero.setVelocity(0, 0);
        if (pending && !gameState.isDone(pending.id)) {
          this.activeHotspot = pending;
          this.handleActionButton();
          return;
        }
      } else {
        let ux = dx / dist;
        let uy = dy / dist;
        const body = this.hero.body as Phaser.Physics.Arcade.Body;
        if ((body.blocked.left || body.blocked.right) && Math.abs(dy) > 12) {
          ux = 0;
          uy = Math.sign(dy);
        } else if ((body.blocked.up || body.blocked.down) && Math.abs(dx) > 12) {
          uy = 0;
          ux = Math.sign(dx);
        }

        const moved = Math.hypot(this.hero.x - this.tapTarget.lastX, this.hero.y - this.tapTarget.lastY);
        this.tapTarget.lastX = this.hero.x;
        this.tapTarget.lastY = this.hero.y;
        if (moved < 0.35 * Math.max(0.5, delta / 16.67)) {
          this.tapTarget.stuckMs += delta;
        } else {
          this.tapTarget.stuckMs = 0;
        }

        if (this.tapTarget.stuckMs > 550) {
          this.clearTapTarget();
        } else {
          moveX = ux;
          moveY = uy;
          speedMult = 1.15;
          isSprint = false;
        }
      }
    }

    const baseSpeed = gameState.currentMap === 'home' ? 195 : 225;
    const speed = isSprint ? baseSpeed * 1.48 : baseSpeed * speedMult;
    this.hero.setVelocity(moveX * speed, moveY * speed);

    if (Math.hypot(moveX, moveY) > 0.08) {
      this.facing = Math.abs(moveX) > Math.abs(moveY) ? (moveX < 0 ? 'left' : 'right') : (moveY < 0 ? 'up' : 'down');
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 15) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 6).setDepth(pt.y);
      }

      this.stepTimer += delta;
      if (this.stepTimer > (isSprint ? 195 : 285)) {
        this.stepTimer = 0;
        sound.step();
      }

      if (isSprint) {
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
      const clampedX = Phaser.Math.Clamp(nearest.x, 225, this.worldW - 225);
      const clampedY = Math.max(46, nearest.y - (gameState.currentMap === 'home' ? 72 : 86));
      this.promptTag.setText(nearest.label).setPosition(clampedX, clampedY).setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
