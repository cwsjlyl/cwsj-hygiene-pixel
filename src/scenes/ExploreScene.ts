import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { HomeStandalonePropKey, STREET_STANDALONE_PROP_SPECS } from '../gfx/v4StandaloneAssetKeys';
import {
  V5_HD_CHARS_ENABLED,
  V5_VALID_STREET_PROPS,
  V6_LIGHT_MG_NPCS,
  V6_LIGHT_STREET_TILES,
  V6_STREET_PROPS_ATLAS
} from '../gfx/v5RuntimeConfig';
import {
  buildHomeWallColliders,
  buildStreetWorldColliders,
  findWalkablePath,
  WorldRect
} from '../gfx/worldCollisions';
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

interface TapWalkState {
  waypoints: Array<{ x: number; y: number }>;
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
  private heroFootOffsetY = 24;
  private companion!: Phaser.GameObjects.Sprite;
  private colliders!: Phaser.Physics.Arcade.StaticGroup;
  private obstacleRects: WorldRect[] = [];
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

  private tapState: TapWalkState | null = null;
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
      `${gameState.studentName}，歡迎回到溫馨像素家居！在 iPad 上可直接輕觸房間地面或發光家具自動穿門走過去。完成屋企 5 個衛生任務後，就從左上【玄關大門】前往高清香港社區街道吧！`
    );
  }

  private clearTapTarget(): void {
    this.tapState = null;
    if (this.tapMarker) {
      this.tapMarker.destroy();
      this.tapMarker = null;
    }
  }

  private setTapDestination(wx: number, wy: number, pendingHotspot: MapHotspot | null = null): void {
    if (!this.hero) return;
    const padX = 24;
    const padY = 24;
    const tx = Phaser.Math.Clamp(wx, padX, this.worldW - padX);
    const ty = Phaser.Math.Clamp(wy, padY, this.worldH - padY);

    const startFx = this.hero.x;
    const startFy = this.hero.y + this.heroFootOffsetY;
    const goalFx = tx;
    const goalFy = ty + this.heroFootOffsetY;

    const footPath = findWalkablePath(
      startFx,
      startFy,
      goalFx,
      goalFy,
      this.worldW,
      this.worldH,
      this.obstacleRects,
      16,
      gameState.currentMap === 'home' ? 11 : 9,
      gameState.currentMap === 'home' ? 7 : 6
    );

    if (footPath.length === 0) {
      sound.wrong();
      return;
    }

    const waypoints = footPath.map((pt) => ({
      x: pt.x,
      y: pt.y - this.heroFootOffsetY
    }));

    if (this.tapMarker) {
      this.tapMarker.destroy();
      this.tapMarker = null;
    }

    const finalPt = waypoints[waypoints.length - 1];
    const ringColor = pendingHotspot ? 0xfacc15 : 0x38bdf8;
    const marker = this.add.circle(finalPt.x, finalPt.y + this.heroFootOffsetY * 0.6, 15, ringColor, 0.22)
      .setStrokeStyle(2.5, ringColor, 0.95)
      .setDepth(45);
    this.tweens.add({
      targets: marker,
      scale: { from: 0.78, to: 1.16 },
      alpha: { from: 0.9, to: 0.3 },
      duration: 500,
      yoyo: true,
      repeat: -1
    });
    this.tapMarker = marker;
    this.tapState = {
      waypoints,
      pendingHotspot,
      stuckMs: 0,
      lastX: this.hero.x,
      lastY: this.hero.y
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
    let bestDist = 48;
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
    this.obstacleRects.push({
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2
    });
  }

  /**
   * Renders a Home prop from the 1024x512 HD atlas at exact calibrated pixel dimensions (dispW x dispH)
   * so beds, nightstands, desks, chairs, bathtubs, and plants have true-to-life proportions.
   */
  private addHomePropSized(
    key: HomeStandalonePropKey,
    x: number,
    y: number,
    dispW: number,
    dispH: number,
    solidFoot = false,
    depthOffset = 0
  ): Phaser.GameObjects.Image {
    const img = this.add.image(x, y, 'home-props', key);
    img.setDisplaySize(dispW, dispH);
    img.setDepth(Math.round(y + dispH * 0.36 + depthOffset));
    if (solidFoot) {
      this.addFootCollider(
        x,
        Math.round(y + dispH * 0.24),
        Math.max(18, Math.round(dispW * 0.56)),
        Math.max(12, Math.round(dispH * 0.22))
      );
    }
    return img;
  }

  private buildWorld(mapId: MapId): void {
    gameState.currentMap = mapId;
    sound.playBgm(mapId);
    this.tapState = null;
    this.tapMarker = null;
    this.children.removeAll(true);
    this.hotspots = [];
    this.obstacleRects = [];
    this.trail = [];
    if (this.colliders) this.colliders.clear(true, true);
    this.colliders = this.physics.add.staticGroup();

    // Street is now a compact single-screen iPad world (1280x720) backed by 1408x768 HD map texture!
    this.worldW = 1280;
    this.worldH = mapId === 'home' ? 920 : 720;
    const padX = 20;
    const padY = 20;
    this.physics.world.setBounds(padX, padY, this.worldW - padX * 2, this.worldH - padY * 2);
    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);

    if (mapId === 'home') this.buildCompactHdHomeScene();
    else this.buildHdStreetScene(this.worldW, this.worldH);

    const streetSpawnX = Math.round((420 / 1408) * this.worldW);
    const streetSpawnY = Math.round((368 / 768) * this.worldH);
    const spawn = mapId === 'home'
      ? { x: hx(845), y: hy(555) }
      : { x: streetSpawnX, y: streetSpawnY };

    // Calibrated character & companion scales matching furniture & compact iPad street
    const heroScale = V5_HD_CHARS_ENABLED
      ? (mapId === 'home' ? 0.48 : 0.43)
      : (mapId === 'home' ? 0.80 : 0.72);
    const compScale = (mapId === 'home' ? 0.54 : 0.48) * MG_NPC_MULT;

    this.heroFootOffsetY = V5_HD_CHARS_ENABLED
      ? Math.round(50 * heroScale)
      : Math.round(28 * heroScale);

    this.companion = this.add.sprite(spawn.x - 32, spawn.y + 4, 'npcs', 16)
      .setScale(compScale)
      .setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setScale(heroScale);
    this.hero.setCollideWorldBounds(true);
    this.hero.play('hero-idle-down');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    if (V5_HD_CHARS_ENABLED) {
      body.setSize(42, 28);
      body.setOffset(35, 110);
    } else {
      body.setSize(26, 18);
      body.setOffset(19, 62);
    }

    this.physics.add.collider(this.hero, this.colliders);
    this.cameras.main.startFollow(this.hero, true, 0.16, 0.16);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#0f172a',
      backgroundColor: '#fde047',
      padding: { x: 12, y: 6 }
    }).setOrigin(0.5, 1).setDepth(5000).setVisible(false);

    this.refreshHud();
  }

  private buildCompactHdHomeScene(): void {
    this.add.rectangle(0, 0, this.worldW, this.worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    const bg = this.add.image(COMPACT_HOME_PAD_X, 0, 'map-home').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(1268, 920);

    buildHomeWallColliders(hx, hy, (cx, cy, w, h) => this.addFootCollider(cx, cy, w, h));

    const roomBadge = (x1902: number, y1380: number, txt: string) => {
      this.add.text(hx(x1902), hy(y1380), txt, {
        fontSize: '16px',
        color: '#fef08a',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 9, y: 4 },
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

    // Room 1: Entrance Foyer
    const frontDoor = this.addHomePropSized('door', hx(210), hy(98), 68, 84, false, -5);
    this.addHomePropSized('plant_small', hx(350), hy(148), 34, 48, true);
    const doorEmote = this.add.sprite(hx(210), hy(42), 'npcs', 29).setScale(0.56 * MG_NPC_MULT).setDepth(4200);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 5, duration: 650, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'go_street', x: hx(210), y: hy(168), radius: 88,
      label: '🚪 按 A 或輕觸大門前往「香港社區街道」',
      sprite: frontDoor, emote: doorEmote
    });

    // Room 2: Kitchen & Dining
    this.addHomePropSized('kitchen_top', hx(785), hy(88), 138, 54, false, -18);
    this.addHomePropSized('kitchen_bottom', hx(785), hy(164), 138, 54, true);
    this.addHomePropSized('chair_side', hx(496), hy(304), 36, 58, false);
    this.addHomePropSized('chair_side', hx(694), hy(304), 36, 58, false).setFlipX(true);
    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addHomePropSized(foodDone ? 'dining_table' : 'cake_table', hx(595), hy(300), 122, 80, true);
    if (foodDone) {
      this.add.image(hx(595), hy(280), 'mg', 13).setScale(0.66 * MG_NPC_MULT).setDepth(cakeTable.depth + 5);
    }
    this.registerTaskHotspot('cover_food', hx(595), hy(316), '🍲 按 A 或輕觸餐桌進入「餐桌防鼠保衛戰」', cakeTable, 92);

    // Room 3: Upper Restroom
    this.addHomePropSized('mirror', hx(1025), hy(142), 40, 36, false, -20);
    const sinkSpr = this.addHomePropSized('sink_vanity', hx(1025), hy(224), 74, 68, false);
    this.addHomePropSized('shower', hx(1235), hy(186), 72, 88, true);
    this.addHomePropSized('toilet', hx(1245), hy(355), 38, 62, true);
    this.registerTaskHotspot('wash_hands', hx(1025), hy(248), '🧼 按 A 或輕觸洗手盆進入「洗手泡泡滅菌戰」', sinkSpr, 92);

    // Room 4: Master Bedroom (calibrated generous double bed + compact nightstand)
    this.addHomePropSized('nightstand', hx(1450), hy(190), 38, 46, true);
    this.addHomePropSized('double_bed', hx(1615), hy(242), 118, 146, true);
    this.addHomePropSized('plant_large', hx(1772), hy(210), 48, 68, true);

    // Room 5: Living Room
    this.addHomePropSized('tv_cabinet', hx(365), hy(580), 114, 76, true);
    this.addHomePropSized('green_rug', hx(365), hy(765), 156, 104, false).setDepth(8);
    this.addHomePropSized('armchair_left', hx(182), hy(765), 64, 74, true);
    this.addHomePropSized('armchair_right', hx(548), hy(765), 64, 74, true);
    this.addHomePropSized('sofa_2seat', hx(365), hy(912), 142, 86, true);

    // Room 6: Lower Bathroom
    this.addHomePropSized('toilet', hx(1015), hy(748), 38, 62, true);
    this.addHomePropSized('bathtub', hx(1062), hy(912), 118, 76, true);
    this.addHomePropSized('mirror', hx(1252), hy(698), 40, 36, false, -20);
    this.addHomePropSized('towel', hx(1318), hy(730), 32, 30, false);
    const toothVanity = this.addHomePropSized('sink_vanity', hx(1252), hy(778), 74, 68, false);
    this.registerTaskHotspot('brush_teeth', hx(1252), hy(798), '🪥 按 A 或輕觸梳洗台進入「護齒刷牙大掃除」', toothVanity, 92);

    // Room 7: Xiaoming's Bedroom (calibrated cozy bed clearly larger than hero + proper desk/chair ratio)
    this.addHomePropSized('nightstand', hx(1552), hy(632), 36, 44, true);
    this.addHomePropSized('double_bed', hx(1695), hy(684), 98, 124, true);
    this.addHomePropSized('toy_box', hx(1725), hy(905), 56, 52, true);
    const deskSpr = this.addHomePropSized('computer_desk', hx(1475), hy(886), 86, 76, false);
    this.addHomePropSized('chair_front', hx(1475), hy(934), 40, 56, false, 6);
    this.registerTaskHotspot('trim_nails', hx(1475), hy(908), '💅 按 A 或輕觸書桌進入「精準剪甲節奏王」', deskSpr, 92);

    // Room 8: Sunny Balcony
    this.addHomePropSized('plant_large', hx(812), hy(1185), 48, 68, true);
    this.addHomePropSized('plant_small', hx(1108), hy(1205), 34, 48, true);
    this.addHomePropSized('balcony_railing', hx(845), hy(1294), 106, 42, false, 20);
    this.addHomePropSized('balcony_railing', hx(1075), hy(1294), 106, 42, false, 20);
    const potSpr = this.addHomePropSized('plant_whitepot', hx(960), hy(1195), 46, 66, false);
    this.registerTaskHotspot('clear_saucer', hx(960), hy(1210), '🪴 按 A 或輕觸花盆進入「倒積水滅孑孓挑戰」', potSpr, 94);

    // Full-color Mom sprite in Central Corridor
    const useHdMom = V5_HD_CHARS_ENABLED && this.textures.exists('char-mom');
    const mom = useHdMom
      ? this.add.sprite(hx(705), hy(560), 'char-mom', 8).setScale(0.53).setDepth(hy(580)).play('hd-mom-right')
      : this.add.sprite(hx(705), hy(560), 'npcs', 4).setScale(0.9 * MG_NPC_MULT).setDepth(hy(580)).play('npc-mom-walk');
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
      id: 'talk_mom', x: hx(792), y: hy(560), radius: 92,
      label: '👩 按 A 或輕觸與媽媽對話查看衛生提示', sprite: mom
    });

    // Younger Sister sprite in Master Bedroom
    const useHdSis = V5_HD_CHARS_ENABLED && this.textures.exists('char-sister');
    const sis = useHdSis
      ? this.add.sprite(hx(1430), hy(435), 'char-sister', 8).setScale(0.43).setDepth(hy(455)).play('hd-sister-right')
      : this.add.sprite(hx(1430), hy(435), 'npcs', 12).setScale(0.78 * MG_NPC_MULT).setDepth(hy(455)).play('npc-girl-walk');
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

  /**
   * Single-Screen iPad HD Hong Kong Street (1280x720 world backed by 1408x768 native HD PNG)
   * - Razor-sharp supersampled visuals & short, comfortable walking distances for iPad students
   */
  private buildHdStreetScene(worldW: number, worldH: number): void {
    this.add.rectangle(0, 0, worldW, worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    const bg = this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDepth(0);
    bg.setDisplaySize(worldW, worldH);

    const sx = (x1408: number): number => Math.round((x1408 / 1408) * worldW);
    const sy = (y768: number): number => Math.round((y768 / 768) * worldH);

    buildStreetWorldColliders(sx, sy, (cx, cy, w, h) => this.addFootCollider(cx, cy, w, h));

    const streetPropMap = new Map<string, Phaser.GameObjects.Image>();
    const hasStreetAtlas = V6_STREET_PROPS_ATLAS && this.textures.exists('street-props');
    const streetAtlasTex = hasStreetAtlas ? this.textures.get('street-props') : null;

    for (const spec of STREET_STANDALONE_PROP_SPECS) {
      if (!V5_VALID_STREET_PROPS.includes(spec.key)) continue;
      const useAtlas = Boolean(streetAtlasTex && streetAtlasTex.has(spec.key));
      const tk = `prop-street-${spec.key}`;
      if (!useAtlas && !this.textures.exists(tk)) continue;

      const cx = sx(spec.x + spec.w * 0.5);
      const cy = sy(spec.y + spec.h * 0.5);
      const spr = useAtlas
        ? this.add.image(cx, cy, 'street-props', spec.key)
        : this.add.image(cx, cy, tk);
      spr.setDisplaySize(Math.max(8, sx(spec.w)), Math.max(8, sy(spec.h)));

      const bottomY = sy(spec.y + spec.h);
      if (spec.layer === 'ground') spr.setDepth(16);
      else if (spec.layer === 'sign') spr.setDepth(bottomY + 120);
      else spr.setDepth(bottomY - 8);
      streetPropMap.set(spec.key, spr);
    }

    const streetBadge = (x1408: number, y768: number, txt: string) => {
      this.add.text(sx(x1408), sy(y768), txt, {
        fontSize: '15px',
        color: '#fef08a',
        backgroundColor: 'rgba(15,23,42,0.88)',
        padding: { x: 9, y: 4 },
        fontStyle: 'bold',
        stroke: '#020617',
        strokeThickness: 3
      }).setOrigin(0.5).setDepth(3500);
    };
    streetBadge(290, 155, '🌳 彩雲社區公園');
    streetBadge(700, 128, '🌉 行人天橋返回家居');
    streetBadge(955, 148, '🍜 香港味道茶餐廳');
    streetBadge(915, 428, '🍲 興發大排檔');
    streetBadge(1230, 308, '🏛️ 河道石拱橋');

    // Return-to-Home entrance below footbridge
    const homeEmote = this.add.sprite(sx(700), sy(154), 'npcs', 29).setScale(0.54 * MG_NPC_MULT).setDepth(4200);
    this.tweens.add({ targets: homeEmote, y: homeEmote.y - 5, duration: 620, yoyo: true, repeat: -1 });
    const gateDoor = this.add.image(sx(700), sy(196), 'home-props', 'door');
    gateDoor.setDisplaySize(48, 60);
    gateDoor.setDepth(sy(196) + 22);

    this.registerInteractiveHotspot({
      id: 'go_home', x: sx(700), y: sy(224), radius: 80,
      label: '🏠 按 A 或輕觸天橋入口返回「溫馨家居」', sprite: gateDoor, emote: homeEmote
    });

    // Full-color Street Passerby (Uncle Chan)
    const useHdMan = V5_HD_CHARS_ENABLED && this.textures.exists('char-passerby');
    const man = useHdMan
      ? this.add.sprite(sx(510), sy(388), 'char-passerby', 8).setScale(0.45).setDepth(sy(404)).play('hd-passerby-right')
      : this.add.sprite(sx(510), sy(388), 'npcs', 8).setScale(0.75 * MG_NPC_MULT).setDepth(sy(404)).play('npc-man-walk');
    this.tweens.add({
      targets: man,
      x: sx(880),
      duration: 3800,
      yoyo: true,
      repeat: -1,
      onYoyo: () => { if (useHdMan) man.play('hd-passerby-left', true); },
      onRepeat: () => { if (useHdMan) man.play('hd-passerby-right', true); }
    });

    // Street Task 1: 4-Color Recycle Bins
    const recDone = gameState.isDone('recycle_bottles');
    const recycleSpr = streetPropMap.get('recycle_bins');
    const bottles = this.add.sprite(sx(294), sy(342), 'tiles-street', recDone ? 19 : 21)
      .setScale(0.72 * STREET_TILE_MULT)
      .setDepth(sy(350));
    if (recycleSpr) {
      recycleSpr.setInteractive({ useHandCursor: true });
      recycleSpr.on('pointerdown', () => {
        const found = this.hotspots.find((item) => item.id === 'recycle_bottles');
        if (found) {
          this.walkToOrTriggerHotspot(found);
        }
      });
    }
    this.registerTaskHotspot('recycle_bottles', sx(294), sy(338), '♻️ 按 A 或輕觸進入「香港三色回收快手」', bottles, 82);

    // Street Task 2: Cha Chaan Teng AC Stagnant Water & Mosquitoes (calibrated mosquito & AC scale)
    const mosDone = gameState.isDone('spray_mosquito');
    const acUnit = this.add.sprite(sx(960), sy(230), 'tiles-street', mosDone ? 10 : 9)
      .setScale(0.76 * STREET_TILE_MULT)
      .setDepth(sy(302));
    const puddle = this.add.sprite(sx(960), sy(310), 'tiles-street', mosDone ? 19 : 22)
      .setScale(0.72 * STREET_TILE_MULT)
      .setDepth(sy(308));
    if (mosDone) puddle.setVisible(false);
    if (!mosDone) {
      this.add.sprite(sx(925), sy(276), 'npcs', 20).setScale(0.48 * MG_NPC_MULT).setDepth(sy(325)).play('mosquito-fly');
      this.add.sprite(sx(995), sy(286), 'npcs', 20).setScale(0.48 * MG_NPC_MULT).setDepth(sy(325)).play('mosquito-fly');
      this.time.addEvent({
        delay: 650, loop: true,
        callback: () => {
          if (gameState.currentMap !== 'street' || gameState.isDone('spray_mosquito')) return;
          const drop = this.add.rectangle(sx(960), sy(246), 4, 7, 0x38bdf8).setDepth(sy(316));
          this.tweens.add({ targets: drop, y: sy(310), alpha: 0.2, duration: 460, onComplete: () => drop.destroy() });
        }
      });
    }
    this.registerTaskHotspot('spray_mosquito', sx(960), sy(305), '🦟 按 A 或輕觸進入「冷氣止漏 ＋ DEET 驅蚊射擊」', acUnit, 82);

    // Street Task 3: Dai Pai Dong Alley Rat Hole Sealing (calibrated rat & hole scale)
    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(sx(917), sy(510), 'tiles-street', ratDone ? 15 : 14)
      .setScale(0.76 * STREET_TILE_MULT)
      .setDepth(sy(516));
    if (!ratDone) {
      const rat = this.add.sprite(sx(876), sy(536), 'npcs', 24).setScale(0.56 * MG_NPC_MULT).setDepth(sy(544)).play('rat-scurry');
      this.tweens.add({ targets: rat, x: sx(956), duration: 920, yoyo: true, repeat: -1 });
    }
    this.registerTaskHotspot('seal_rathole', sx(917), sy(522), '🕳️ 按 A 或輕觸進入「防鼠三部曲：封堵鼠洞」', rHole, 82);

    // Street Task 4: FEHD Officer on East Riverbank Promenade (reachable ONLY via Stone Arch Bridge)
    const fehd = this.add.sprite(sx(1345), sy(372), 'npcs', 0).setScale(0.84 * MG_NPC_MULT).setDepth(sy(390)).play('npc-fehd-walk');
    const fEmote = this.add.sprite(fehd.x, fehd.y - 38, 'npcs', 29).setScale(0.56 * MG_NPC_MULT).setDepth(4200);
    this.tweens.add({ targets: fEmote, y: fEmote.y - 5, duration: 600, yoyo: true, repeat: -1 });
    this.registerInteractiveHotspot({
      id: 'fehd_quiz', x: fehd.x, y: fehd.y, radius: 84,
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
    radius = 90
  ): void {
    const isHome = gameState.currentMap === 'home';
    const done = gameState.isDone(id);
    const ring = this.add.circle(x, y + (isHome ? 10 : 10), isHome ? 24 : 24, done ? 0x10b981 : 0xfde047, 0.22)
      .setStrokeStyle(2.5, done ? 0x34d399 : 0xfacc15)
      .setDepth(25);
    this.tweens.add({ targets: ring, scale: { from: 0.92, to: 1.12 }, alpha: { from: 0.18, to: 0.38 }, duration: 850, yoyo: true, repeat: -1 });

    const emote = this.add.sprite(x, y - (isHome ? 42 : 38), 'npcs', done ? 30 : 28)
      .setScale(0.54 * MG_NPC_MULT)
      .setDepth(4200);
    this.tweens.add({ targets: emote, y: emote.y - 5, duration: 580, yoyo: true, repeat: -1 });

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
      targets: this.hero, y: this.hero.y - 14, duration: 180, yoyo: true, repeat: 1,
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
        this.openDialogue('食環署主任廣播', '歡迎來到高清緊湊版彩雲社區街道！全街景一覽無遺，請幫忙到左上公園做三色回收、到「香港味道茶餐廳」修好冷氣與滅蚊、封好「興發大排檔」外牆鼠洞，最後經右方「河道石拱橋」過河找我考核！');
      }
      return;
    }
    if (h.id === 'go_home') { sound.pop(); this.buildWorld('home'); return; }

    if (h.id === 'fehd_quiz') {
      if (!gameState.allTasksDone()) {
        sound.wrong();
        this.openDialogue('食環署主任', `同學你好！請先完成全部 8 個家居與街道像素挑戰（目前 ${gameState.completedCount()} / 8），再過橋找我進行終極認證吧！`);
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
    const x1408 = (x / this.worldW) * 1408;
    const y768 = (y / this.worldH) * 768;
    if (x1408 < 520) return '香港社區 · 🌳 彩雲公園';
    if (x1408 >= 1130) return '香港社區 · 🏛️ 河道石拱橋';
    if (y768 >= 415) return '香港社區 · 🍲 興發大排檔';
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
      if (this.tapState) this.clearTapTarget();
    } else if (this.tapState && this.tapState.waypoints.length > 0) {
      const pending = this.tapState.pendingHotspot;
      if (pending) {
        const hDist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, pending.x, pending.y);
        if (hDist <= Math.max(40, pending.radius * 0.78)) {
          this.clearTapTarget();
          this.hero.setVelocity(0, 0);
          if (!gameState.isDone(pending.id)) {
            this.activeHotspot = pending;
            this.handleActionButton();
            return;
          }
        }
      }

      const wp = this.tapState.waypoints[0];
      const dx = wp.x - this.hero.x;
      const dy = wp.y - this.hero.y;
      const dist = Math.hypot(dx, dy);
      const arriveDist = this.tapState.waypoints.length === 1 ? 12 : 15;

      if (dist <= arriveDist) {
        this.tapState.waypoints.shift();
        if (this.tapState.waypoints.length === 0) {
          this.clearTapTarget();
          this.hero.setVelocity(0, 0);
          if (pending && !gameState.isDone(pending.id) && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, pending.x, pending.y) <= pending.radius + 14) {
            this.activeHotspot = pending;
            this.handleActionButton();
            return;
          }
        }
      } else {
        const moved = Math.hypot(this.hero.x - this.tapState.lastX, this.hero.y - this.tapState.lastY);
        this.tapState.lastX = this.hero.x;
        this.tapState.lastY = this.hero.y;
        if (moved < 0.35 * Math.max(0.5, delta / 16.67)) {
          this.tapState.stuckMs += delta;
        } else {
          this.tapState.stuckMs = 0;
        }

        if (this.tapState.stuckMs > 650) {
          this.clearTapTarget();
        } else {
          moveX = dx / dist;
          moveY = dy / dist;
          speedMult = 1.15;
          isSprint = false;
        }
      }
    }

    const baseSpeed = gameState.currentMap === 'home' ? 195 : 210;
    const speed = isSprint ? baseSpeed * 1.45 : baseSpeed * speedMult;
    this.hero.setVelocity(moveX * speed, moveY * speed);

    if (Math.hypot(moveX, moveY) > 0.08) {
      this.facing = Math.abs(moveX) > Math.abs(moveY) ? (moveX < 0 ? 'left' : 'right') : (moveY < 0 ? 'up' : 'down');
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 14) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 4).setDepth(pt.y);
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
          const dust = this.add.rectangle(this.hero.x + (Math.random() - 0.5) * 12, this.hero.y + 24, 5, 5, 0xe2e8f0, 0.8).setDepth(this.hero.y);
          this.tweens.add({ targets: dust, y: dust.y - 8, alpha: 0, scale: 0.3, duration: 250, onComplete: () => dust.destroy() });
        }
      }
    } else {
      this.hero.play(`hero-idle-${this.facing}`, true);
    }

    this.hero.setDepth(this.hero.y + 26);
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
      const clampedX = Phaser.Math.Clamp(nearest.x, 215, this.worldW - 215);
      const clampedY = Math.max(42, nearest.y - (gameState.currentMap === 'home' ? 66 : 62));
      this.promptTag.setText(nearest.label).setPosition(clampedX, clampedY).setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
