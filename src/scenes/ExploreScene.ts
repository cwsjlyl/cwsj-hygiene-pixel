import Phaser from 'phaser';
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
import { AreaId, gameState, TASKS } from '../state/gameState';
import { sound } from '../audio/RetroSound';

interface Hotspot {
  id: string;
  x: number;
  y: number;
  radius: number;
  label: string;
  type: 'task' | 'portal' | 'npc';
  marker?: Phaser.GameObjects.Container;
  npcName?: string;
  npcLines?: string[];
}

const COMPACT_HOME_RATIO = 2 / 3;

export class ExploreScene extends Phaser.Scene {
  private area: AreaId = 'home';
  private hero!: Phaser.Physics.Arcade.Sprite;
  private heroShadow!: Phaser.GameObjects.Ellipse;
  private heroFootOffsetY = 29;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: {
    W: Phaser.Input.Keyboard.Key;
    A: Phaser.Input.Keyboard.Key;
    S: Phaser.Input.Keyboard.Key;
    D: Phaser.Input.Keyboard.Key;
  };
  private interactKey!: Phaser.Input.Keyboard.Key;
  private joystick!: VirtualJoystick;
  private hotspots: Hotspot[] = [];
  private activeHotspot: Hotspot | null = null;
  private facing: 'down' | 'left' | 'right' | 'up' = 'down';
  private colliders!: Phaser.Physics.Arcade.StaticGroup;
  private obstacleRects: WorldRect[] = [];
  private worldW = 1280;
  private worldH = 920;
  private promptBubble!: Phaser.GameObjects.Container;
  private promptLabel!: Phaser.GameObjects.Text;
  private transitioning = false;

  private tapWaypoints: Array<{ x: number; y: number }> = [];
  private tapPendingHotspot: Hotspot | null = null;
  private tapMarker: Phaser.GameObjects.Arc | null = null;
  private tapStuckMs = 0;
  private tapLastPos = { x: 0, y: 0 };

  constructor() {
    super('ExploreScene');
  }

  init(data?: { area?: AreaId; spawnX?: number; spawnY?: number }): void {
    this.area = data?.area ?? gameState.currentArea ?? 'home';
    gameState.setArea(this.area);
    this.hotspots = [];
    this.activeHotspot = null;
    this.obstacleRects = [];
    this.transitioning = false;
    this.tapWaypoints = [];
    this.tapPendingHotspot = null;
    this.tapMarker = null;
    this.tapStuckMs = 0;
  }

  create(data?: { area?: AreaId; spawnX?: number; spawnY?: number }): void {
    this.colliders = this.physics.add.staticGroup();
    this.obstacleRects = [];

    if (this.area === 'home') {
      this.worldW = 1280;
      this.worldH = 920;
      this.buildCompactHdHomeScene();
    } else {
      this.worldW = 2112;
      this.worldH = 1152;
      this.buildHdStreetScene(this.worldW, this.worldH);
    }

    this.physics.world.setBounds(20, 20, this.worldW - 40, this.worldH - 36);

    const defaultHomeSpawn = {
      x: Math.round(845 * COMPACT_HOME_RATIO),
      y: Math.round(555 * COMPACT_HOME_RATIO)
    };
    const spawn = {
      x: data?.spawnX ?? (this.area === 'home' ? defaultHomeSpawn.x : 630),
      y: data?.spawnY ?? (this.area === 'home' ? defaultHomeSpawn.y : 555)
    };

    const heroScale = V5_HD_CHARS_ENABLED
      ? this.area === 'home'
        ? 0.58
        : 0.66
      : this.area === 'home'
        ? 1.15
        : 1.32;

    this.heroFootOffsetY = V5_HD_CHARS_ENABLED
      ? Math.round(50 * heroScale)
      : Math.round(21 * heroScale);

    this.heroShadow = this.add
      .ellipse(spawn.x, spawn.y + (this.area === 'home' ? 28 : 34), this.area === 'home' ? 32 : 38, 12, 0x000000, 0.32)
      .setDepth(spawn.y + 1);

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0).setScale(heroScale);
    this.hero.setCollideWorldBounds(true);
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    if (V5_HD_CHARS_ENABLED) {
      body.setSize(46, 32);
      body.setOffset(33, 108);
    } else {
      body.setSize(26, 20);
      body.setOffset(11, 43);
    }
    this.hero.play('hero-idle-down');

    this.physics.add.collider(this.hero, this.colliders);

    this.cameras.main.setBounds(0, 0, this.worldW, this.worldH);
    this.cameras.main.setRoundPixels(true);
    if (this.area === 'home') {
      this.cameras.main.startFollow(this.hero, true, 0.14, 0.14);
    } else {
      this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);
    }
    this.cameras.main.fadeIn(260, 15, 23, 42);

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = this.input.keyboard!.addKeys('W,A,S,D') as {
      W: Phaser.Input.Keyboard.Key;
      A: Phaser.Input.Keyboard.Key;
      S: Phaser.Input.Keyboard.Key;
      D: Phaser.Input.Keyboard.Key;
    };
    this.interactKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    this.joystick = new VirtualJoystick();
    this.createPromptBubble();
    this.bindDomActionButtons();
    this.bindTapToMove();
    this.syncHud();

    sound.startAreaBgm(this.area);
  }

  /**
   * Compact Home Scene (634x460 verified WebP -> 1268x920 crisp world + full exterior/interior wall collisions)
   */
  private buildCompactHdHomeScene(): void {
    const mapDispW = Math.round(1902 * COMPACT_HOME_RATIO);
    const mapDispH = Math.round(1380 * COMPACT_HOME_RATIO);
    const offsetX = Math.max(0, Math.round((this.worldW - mapDispW) / 2));
    const offsetY = Math.max(0, Math.round((this.worldH - mapDispH) / 2));

    const hx = (x1902: number): number => Math.round(x1902 * COMPACT_HOME_RATIO) + offsetX;
    const hy = (y1380: number): number => Math.round(y1380 * COMPACT_HOME_RATIO) + offsetY;
    const hs = (baseScale = 1): number => baseScale * COMPACT_HOME_RATIO;

    this.add.rectangle(0, 0, this.worldW, this.worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    this.add
      .image(offsetX, offsetY, 'map-home')
      .setOrigin(0, 0)
      .setDisplaySize(mapDispW, mapDispH)
      .setDepth(0);

    // Register all Home exterior & interior room partition walls (protagonist cannot walk through walls)
    buildHomeWallColliders(hx, hy, (cx, cy, w, h) => this.addFootCollider(cx, cy, w, h));

    // Room 1: Entrance Foyer
    const frontDoor = this.addHomeProp('front_door', hx(210), hy(108), {
      scale: hs(1.0),
      depth: 12,
      solid: false
    });
    this.addHomeProp('plant_small', hx(350), hy(145), { scale: hs(0.92), solid: true, footW: 32, footH: 22 });
    frontDoor.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'go_street');
      if (h) this.walkOrTriggerHotspot(h);
    });

    // Room 2: Kitchen & Dining
    this.addHomeProp('kitchen_top', hx(790), hy(92), { scale: hs(1.02), depth: 15, solid: false });
    this.addHomeProp('kitchen_bottom', hx(790), hy(174), { scale: hs(1.02), solid: true, footW: 156, footH: 38 });

    const foodDone = gameState.isDone('cover_food');
    const cakeTable = this.addHomeProp(foodDone ? 'dining_table' : 'cake_table', hx(595), hy(300), {
      scale: hs(1.02),
      solid: true,
      footW: 96,
      footH: 48
    });
    this.addHomeProp('chair_side', hx(495), hy(305), { scale: hs(0.92), solid: false });
    const rightChair = this.addHomeProp('chair_side', hx(695), hy(305), { scale: hs(0.92), solid: false });
    rightChair.setFlipX(true);

    // Room 3: Upper Restroom
    this.addHomeProp('mirror', hx(1025), hy(148), { scale: hs(0.95), depth: 14, solid: false });
    const upperSink = this.addHomeProp('sink_vanity', hx(1025), hy(228), {
      scale: hs(0.98),
      solid: true,
      footW: 66,
      footH: 34
    });
    this.addHomeProp('shower', hx(1235), hy(185), { scale: hs(0.95), solid: true, footW: 76, footH: 44 });
    this.addHomeProp('toilet', hx(1245), hy(355), { scale: hs(0.95), solid: true, footW: 44, footH: 34 });

    // Room 4: Master Bedroom
    this.addHomeProp('nightstand', hx(1445), hy(178), { scale: hs(0.95), solid: true, footW: 40, footH: 28 });
    this.addHomeProp('double_bed', hx(1615), hy(215), { scale: hs(1.02), solid: true, footW: 112, footH: 88 });
    this.addHomeProp('plant_large', hx(1775), hy(205), { scale: hs(0.95), solid: true, footW: 40, footH: 28 });

    // Room 5: Living Room
    this.addHomeProp('tv_cabinet', hx(365), hy(585), { scale: hs(1.02), solid: true, footW: 108, footH: 38 });
    this.addHomeProp('green_rug', hx(365), hy(765), { scale: hs(1.18), depth: 4, solid: false });
    this.addHomeProp('armchair_left', hx(180), hy(765), { scale: hs(0.98), solid: true, footW: 56, footH: 44 });
    this.addHomeProp('armchair_right', hx(550), hy(765), { scale: hs(0.98), solid: true, footW: 56, footH: 44 });
    this.addHomeProp('sofa_2seat', hx(365), hy(915), { scale: hs(1.04), solid: true, footW: 124, footH: 46 });

    // Room 6: Lower Bathroom
    this.addHomeProp('toilet', hx(1015), hy(748), { scale: hs(0.95), solid: true, footW: 44, footH: 34 });
    this.addHomeProp('bathtub', hx(1058), hy(912), { scale: hs(1.0), solid: true, footW: 122, footH: 46 });
    this.addHomeProp('mirror', hx(1252), hy(702), { scale: hs(0.95), depth: 14, solid: false });
    const lowerSink = this.addHomeProp('sink_vanity', hx(1252), hy(780), {
      scale: hs(0.98),
      solid: true,
      footW: 66,
      footH: 34
    });
    this.addHomeProp('towel', hx(1322), hy(735), { scale: hs(0.92), depth: 18, solid: false });

    // Room 7: Xiaoming's Bedroom
    this.addHomeProp('nightstand', hx(1555), hy(625), { scale: hs(0.95), solid: true, footW: 40, footH: 28 });
    this.addHomeProp('double_bed', hx(1705), hy(668), { scale: hs(0.96), solid: true, footW: 106, footH: 84 });
    this.addHomeProp('toy_box', hx(1725), hy(905), { scale: hs(0.96), solid: true, footW: 56, footH: 34 });
    this.addHomeProp('computer_desk', hx(1475), hy(892), { scale: hs(1.0), solid: true, footW: 96, footH: 40 });
    this.addHomeProp('chair_front', hx(1475), hy(946), { scale: hs(0.92), solid: false });

    // Room 8: Sunny Balcony
    this.addHomeProp('plant_large', hx(812), hy(1185), { scale: hs(0.98), solid: true, footW: 42, footH: 28 });
    const saucerPot = this.addHomeProp('plant_whitepot', hx(960), hy(1195), {
      scale: hs(1.06),
      solid: true,
      footW: 44,
      footH: 28
    });
    this.addHomeProp('plant_small', hx(1108), hy(1205), { scale: hs(0.96), solid: true, footW: 34, footH: 24 });
    this.addHomeProp('balcony_railing', hx(845), hy(1294), { scale: hs(1.0), depth: hy(1305), solid: false });
    this.addHomeProp('balcony_railing', hx(1075), hy(1294), { scale: hs(1.0), depth: hy(1305), solid: false });

    this.roomBadge(hx(215), hy(76), '🚪 玄關走廊');
    this.roomBadge(hx(685), hy(76), '🍽️ 廚房與飯廳');
    this.roomBadge(hx(1135), hy(76), '🚰 上方洗手間');
    this.roomBadge(hx(1585), hy(76), '🛏️ 主人睡房');
    this.roomBadge(hx(365), hy(495), '🛋️ 溫馨客廳');
    this.roomBadge(hx(1140), hy(668), '🛁 浴室梳洗區');
    this.roomBadge(hx(1590), hy(520), '🧸 小明睡房');
    this.roomBadge(hx(960), hy(1075), '🌿 陽光露台');

    const npcPropScale = V6_LIGHT_MG_NPCS ? 2 : 1;

    this.registerHotspot({
      id: 'wash_hands',
      x: hx(1025),
      y: hy(250),
      radius: 94,
      label: '潔手七步曲（洗手盆）',
      type: 'task'
    });
    upperSink.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'wash_hands');
      if (h) this.walkOrTriggerHotspot(h);
    });

    if (!foodDone) {
      const roach = this.add
        .sprite(hx(665), hy(340), 'npcs', 12)
        .setScale(0.62 * npcPropScale)
        .setDepth(hy(345));
      roach.play('roach-scurry');
      this.tweens.add({
        targets: roach,
        x: hx(715),
        duration: 950,
        yoyo: true,
        repeat: -1,
        onYoyo: () => roach.setFlipX(true),
        onRepeat: () => roach.setFlipX(false)
      });
    }
    this.registerHotspot({
      id: 'cover_food',
      x: hx(595),
      y: hy(318),
      radius: 94,
      label: '食物防污保衛戰（餐桌）',
      type: 'task'
    });
    cakeTable.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'cover_food');
      if (h) this.walkOrTriggerHotspot(h);
    });

    this.registerHotspot({
      id: 'brush_teeth',
      x: hx(1252),
      y: hy(800),
      radius: 94,
      label: '早晚護齒刷刷刷（梳洗台）',
      type: 'task'
    });
    lowerSink.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'brush_teeth');
      if (h) this.walkOrTriggerHotspot(h);
    });

    if (!gameState.isDone('clear_saucer')) {
      const puddle = this.add
        .ellipse(hx(960), hy(1228), 44, 16, 0x38bdf8, 0.78)
        .setStrokeStyle(2, 0x0284c7)
        .setDepth(hy(1190));
      this.tweens.add({ targets: puddle, scaleX: 1.12, alpha: 0.5, duration: 900, yoyo: true, repeat: -1 });

      const mos = this.add
        .sprite(hx(995), hy(1152), 'npcs', 8)
        .setScale(0.66 * npcPropScale)
        .setDepth(hy(1235));
      mos.play('mosquito-fly');
      this.tweens.add({ targets: mos, y: hy(1130), x: hx(930), duration: 1050, yoyo: true, repeat: -1 });
    }
    this.registerHotspot({
      id: 'clear_saucer',
      x: hx(960),
      y: hy(1210),
      radius: 96,
      label: '清理花盆底碟積水（露台）',
      type: 'task'
    });
    saucerPot.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'clear_saucer');
      if (h) this.walkOrTriggerHotspot(h);
    });

    const momX = hx(705);
    const momY = hy(560);
    const mom = this.add
      .sprite(momX, momY, V5_HD_CHARS_ENABLED ? 'char-mom' : 'npcs', V5_HD_CHARS_ENABLED ? 8 : 2)
      .setScale(V5_HD_CHARS_ENABLED ? 0.58 : 0.88 * npcPropScale)
      .setDepth(momY + 26);
    this.add.ellipse(momX, momY + 27, 28, 10, 0x000000, 0.28).setDepth(momY + 1);

    const momHotspot = this.registerHotspot({
      id: 'npc_mom',
      x: momX,
      y: momY,
      radius: 88,
      label: '與媽媽對話',
      type: 'npc',
      npcName: '媽媽',
      npcLines: [
        '小明，食飯前一定要去洗手間用梘液做足「潔手七步曲」呀！',
        '另外餐枱上面嘅鮮果忌廉蛋糕未蓋好防塵罩，小心惹蟑螂同蒼蠅；仲有露台盆栽底碟嘅積水都要清走，預防白紋伊蚊滋生！'
      ]
    });
    if (V5_HD_CHARS_ENABLED && this.anims.exists('mom-walk-right')) {
      mom.play('mom-walk-right');
      this.tweens.add({
        targets: mom,
        x: hx(880),
        duration: 3400,
        yoyo: true,
        repeat: -1,
        onUpdate: () => {
          mom.setDepth(mom.y + 26);
          momHotspot.x = mom.x;
          if (momHotspot.marker) momHotspot.marker.x = mom.x;
        },
        onYoyo: () => mom.play('mom-walk-left'),
        onRepeat: () => mom.play('mom-walk-right')
      });
    }

    const sisX = hx(1430);
    const sisY = hy(420);
    if (V5_HD_CHARS_ENABLED && this.textures.exists('char-sister')) {
      const sister = this.add.sprite(sisX, sisY, 'char-sister', 0).setScale(0.54).setDepth(sisY + 24);
      const sisHotspot = this.registerHotspot({
        id: 'npc_sister',
        x: sisX,
        y: sisY,
        radius: 84,
        label: '與妹妹對話',
        type: 'npc',
        npcName: '妹妹小欣',
        npcLines: [
          '哥哥！老師話早晚都要用含氟牙膏刷牙兩分鐘，仲要刷埋牙齦邊緣先唔會蛀牙㗎！',
          '做齊屋企四個衛生任務之後，我哋一齊由玄關大門出發去香港街道做環保小先鋒啦！'
        ]
      });
      if (this.anims.exists('sister-walk-right')) {
        sister.play('sister-walk-right');
        this.tweens.add({
          targets: sister,
          x: hx(1635),
          duration: 3000,
          yoyo: true,
          repeat: -1,
          onUpdate: () => {
            sister.setDepth(sister.y + 24);
            sisHotspot.x = sister.x;
            if (sisHotspot.marker) sisHotspot.marker.x = sister.x;
          },
          onYoyo: () => sister.play('sister-walk-left'),
          onRepeat: () => sister.play('sister-walk-right')
        });
      }
    }

    this.registerHotspot({
      id: 'go_street',
      x: hx(210),
      y: hy(168),
      radius: 94,
      label: '出門前往「香港街道」',
      type: 'portal'
    });
  }

  /**
   * HK Street Scene:
   * - Verified 704x384 map-street PNG rendered crisply at 2112x1152 (zero black background)
   * - All 10 pure-transparent foreground sprites displayed completely with 2.5D Y-sorting
   * - Full solid collisions for River (except Stone Arch Bridge walkway) and all Buildings/Props
   */
  private buildHdStreetScene(worldW: number, worldH: number): void {
    this.add.rectangle(0, 0, worldW, worldH, 0x0b1120).setOrigin(0, 0).setDepth(-10);
    this.add.image(0, 0, 'map-street').setOrigin(0, 0).setDisplaySize(worldW, worldH).setDepth(0);

    const streetScale = worldW / 1408;

    // Register solid colliders for River/Canal, Cha Chaan Teng, Dai Pai Dong, Footbridge towers, and Park props
    buildStreetWorldColliders(streetScale, (cx, cy, w, h) => this.addFootCollider(cx, cy, w, h));

    // Render all 10 complete pure-transparent foreground sprites
    for (const spec of STREET_STANDALONE_PROP_SPECS) {
      if (!V5_VALID_STREET_PROPS.includes(spec.key)) continue;
      let spr: Phaser.GameObjects.Image | null = null;
      if (V6_STREET_PROPS_ATLAS && this.textures.exists('street-props')) {
        const atlasTex = this.textures.get('street-props');
        if (atlasTex.has(spec.key)) {
          spr = this.add.image(0, 0, 'street-props', spec.key);
        }
      } else {
        const texKey = `street-prop-${spec.key}`;
        if (this.textures.exists(texKey)) {
          spr = this.add.image(0, 0, texKey);
        }
      }
      if (!spr) continue;

      const px = Math.round(spec.x * streetScale);
      const py = Math.round(spec.y * streetScale);
      const pw = Math.round(spec.w * streetScale);
      const ph = Math.round(spec.h * streetScale);
      spr.setOrigin(0, 0).setPosition(px, py).setDisplaySize(pw, ph);

      if (spec.layer === 'ground') {
        spr.setDepth(8);
      } else if (spec.layer === 'sign') {
        spr.setDepth(1450);
      } else {
        // Accurate ground-contact 2.5D depth sorting
        spr.setDepth(py + ph - 10);
      }
    }

    const streetTileScale = V6_LIGHT_STREET_TILES ? 2 : 1;
    const npcPropScale = V6_LIGHT_MG_NPCS ? 2 : 1;

    // Return-to-Home entrance below pedestrian footbridge
    const gateGlow = this.add
      .ellipse(1050, 340, 84, 30, 0x38bdf8, 0.34)
      .setStrokeStyle(2.5, 0xfde047)
      .setDepth(15);
    this.tweens.add({ targets: gateGlow, scaleX: 1.16, alpha: 0.65, duration: 850, yoyo: true, repeat: -1 });

    const gateDoor = this.add
      .image(1050, 295, 'home-props', 'front_door')
      .setDisplaySize(72, 92)
      .setDepth(296)
      .setInteractive({ useHandCursor: true });

    this.streetBadge(1050, 232, '🏠 返回家居入口');
    this.streetBadge(450, 225, '🌳 彩雲社區公園');
    this.streetBadge(1440, 232, '☕ 香港味道茶餐廳');
    this.streetBadge(1380, 650, '🍜 興發大排檔');
    this.streetBadge(1845, 472, '🏛️ 河道石拱橋');

    this.registerHotspot({
      id: 'go_home',
      x: 1050,
      y: 345,
      radius: 120,
      label: '返回「溫馨家居」',
      type: 'portal'
    });
    gateDoor.on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'go_home');
      if (h) this.walkOrTriggerHotspot(h);
    });

    // Street Task 1: 4-Color Recycle Bins
    if (!gameState.isDone('recycle_bottles')) {
      const binGlow = this.add
        .ellipse(442, 502, 130, 28, 0x22c55e, 0.32)
        .setStrokeStyle(2, 0x86efac)
        .setDepth(14);
      this.tweens.add({ targets: binGlow, scaleX: 1.1, alpha: 0.58, duration: 800, yoyo: true, repeat: -1 });
    }
    this.registerHotspot({
      id: 'recycle_bottles',
      x: 442,
      y: 505,
      radius: 120,
      label: '社區三色回收分類（回收桶）',
      type: 'task'
    });

    // Street Task 2: Cha Chaan Teng AC Stagnant Water & Mosquito Control
    const acUnit = this.add.sprite(1440, 355, 'mg', 21).setScale(1.0 * npcPropScale).setDepth(452);
    if (!gameState.isDone('spray_mosquito')) {
      const puddle = this.add.sprite(1440, 462, 'tiles-street', 13).setScale(0.95 * streetTileScale).setDepth(14);
      const m1 = this.add.sprite(1410, 418, 'npcs', 8).setScale(0.75 * npcPropScale).setDepth(495);
      const m2 = this.add.sprite(1472, 432, 'npcs', 8).setScale(0.72 * npcPropScale).setDepth(495);
      m1.play('mosquito-fly');
      m2.play('mosquito-fly');
      this.tweens.add({ targets: m1, x: 1468, y: 404, duration: 920, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: m2, x: 1412, y: 444, duration: 1120, yoyo: true, repeat: -1 });
      this.tweens.add({ targets: puddle, alpha: 0.65, duration: 900, yoyo: true, repeat: -1 });
    }
    this.registerHotspot({
      id: 'spray_mosquito',
      x: 1440,
      y: 462,
      radius: 120,
      label: '街道積水滅蚊行動（冷氣機滴水處）',
      type: 'task'
    });
    acUnit.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'spray_mosquito');
      if (h) this.walkOrTriggerHotspot(h);
    });

    // Street Task 3: Dai Pai Dong Alley Rat Hole Sealing
    const rHole = this.add
      .sprite(1375, 768, 'tiles-street', gameState.isDone('seal_rathole') ? 15 : 14)
      .setScale(1.0 * streetTileScale)
      .setDepth(772);
    if (!gameState.isDone('seal_rathole')) {
      const rat = this.add.sprite(1315, 808, 'npcs', 16).setScale(0.84 * npcPropScale).setDepth(812);
      rat.play('rat-run');
      this.tweens.add({
        targets: rat,
        x: 1445,
        duration: 1150,
        yoyo: true,
        repeat: -1,
        onYoyo: () => rat.setFlipX(true),
        onRepeat: () => rat.setFlipX(false)
      });
    }
    this.registerHotspot({
      id: 'seal_rathole',
      x: 1375,
      y: 790,
      radius: 120,
      label: '後巷防鼠堵塞工程（大排檔外牆）',
      type: 'task'
    });
    rHole.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'seal_rathole');
      if (h) this.walkOrTriggerHotspot(h);
    });

    // Street Task 4: FEHD Officer stationed on East Riverbank Promenade (reachable ONLY via Stone Arch Bridge!)
    const fehdX = 2015;
    const fehdY = 558;
    const fehd = this.add.sprite(fehdX, fehdY, 'npcs', 0).setScale(1.22 * npcPropScale).setDepth(fehdY + 28);
    this.add.ellipse(fehdX, fehdY + 34, 38, 12, 0x000000, 0.3).setDepth(fehdY + 1);
    this.registerHotspot({
      id: 'fehd_quiz',
      x: fehdX,
      y: fehdY,
      radius: 118,
      label: '衛生督察終極問答（食環署主任）',
      type: 'task'
    });
    fehd.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      const h = this.hotspots.find((item) => item.id === 'fehd_quiz');
      if (h) this.walkOrTriggerHotspot(h);
    });

    // Street Passerby NPC on main road
    const man = this.add
      .sprite(760, 585, V5_HD_CHARS_ENABLED ? 'char-passerby' : 'npcs', V5_HD_CHARS_ENABLED ? 8 : 3)
      .setScale(V5_HD_CHARS_ENABLED ? 0.65 : 1.05 * npcPropScale)
      .setDepth(615);
    const manHotspot = this.registerHotspot({
      id: 'npc_neighbor',
      x: 760,
      y: 585,
      radius: 105,
      label: '與街坊陳伯對話',
      type: 'npc',
      npcName: '街坊陳伯',
      npcLines: [
        '後生仔，過河記得一定要行東面座「河道石拱橋」，千祈唔好踩落河水或者撞入舖頭呀！',
        '幫手做埋分類回收、清除茶餐廳冷氣機積水同封好大排檔鼠洞，再去橋對岸搵食環署主任挑戰問答啦！'
      ]
    });
    if (V5_HD_CHARS_ENABLED && this.anims.exists('passerby-walk-right')) {
      man.play('passerby-walk-right');
      this.tweens.add({
        targets: man,
        x: 1320,
        duration: 5400,
        yoyo: true,
        repeat: -1,
        onUpdate: () => {
          man.setDepth(man.y + 30);
          manHotspot.x = man.x;
          if (manHotspot.marker) manHotspot.marker.x = man.x;
        },
        onYoyo: () => man.play('passerby-walk-left'),
        onRepeat: () => man.play('passerby-walk-right')
      });
    }
  }

  private addHomeProp(
    key: HomeStandalonePropKey,
    x: number,
    y: number,
    opts?: {
      scale?: number;
      depth?: number;
      solid?: boolean;
      footW?: number;
      footH?: number;
    }
  ): Phaser.GameObjects.Image {
    const scale = (opts?.scale ?? 1) * 4;
    const img = this.add.image(x, y, 'home-props', key).setScale(scale);
    const dispH = img.height * scale;
    img.setDepth(opts?.depth ?? Math.round(y + dispH * 0.34));

    if (opts?.solid) {
      const fw = Math.round((opts.footW ?? Math.max(28, img.width * (opts?.scale ?? 1) * 0.68)) * COMPACT_HOME_RATIO);
      const fh = Math.round((opts.footH ?? Math.max(20, img.height * (opts?.scale ?? 1) * 0.32)) * COMPACT_HOME_RATIO);
      this.addFootCollider(x, Math.round(y + dispH * 0.24), fw, fh);
    }
    return img;
  }

  private addFootCollider(cx: number, cy: number, w: number, h: number): void {
    const zone = this.add.rectangle(cx, cy, w, h, 0x000000, 0);
    this.physics.add.existing(zone, true);
    this.colliders.add(zone);
    this.obstacleRects.push({
      x1: cx - w / 2,
      y1: cy - h / 2,
      x2: cx + w / 2,
      y2: cy + h / 2
    });
  }

  private detectRoomName(x: number, y: number): string {
    if (this.area !== 'home') return '🏙️ 香港街道';
    const sx = x / COMPACT_HOME_RATIO;
    const sy = y / COMPACT_HOME_RATIO;
    if (sy >= 1000) return '🌿 陽光露台';
    if (sx < 430 && sy < 480) return '🚪 玄關走廊';
    if (sx >= 430 && sx < 940 && sy < 480) return '🍽️ 廚房與飯廳';
    if (sx >= 940 && sx < 1330 && sy < 460) return '🚰 上方洗手間';
    if (sx >= 1330 && sy < 510) return '🛏️ 主人睡房';
    if (sx < 680 && sy >= 480) return '🛋️ 溫馨客廳';
    if (sx >= 940 && sx < 1350 && sy >= 650) return '🛁 浴室梳洗區';
    if (sx >= 1350 && sy >= 510) return '🧸 小明睡房';
    return '🏠 中央走廊';
  }

  private roomBadge(x: number, y: number, text: string): void {
    const lbl = this.add
      .text(x, y, text, {
        fontFamily: '"Noto Sans TC", "PingFang HK", sans-serif',
        fontSize: '12px',
        fontStyle: '900',
        color: '#fef08a',
        backgroundColor: '#0f172ad9',
        padding: { x: 7, y: 3 }
      })
      .setOrigin(0.5)
      .setDepth(22);
    lbl.setStroke('#020617', 2);
  }

  private streetBadge(x: number, y: number, text: string): void {
    const lbl = this.add
      .text(x, y, text, {
        fontFamily: '"Noto Sans TC", "PingFang HK", sans-serif',
        fontSize: '15px',
        fontStyle: '900',
        color: '#fde047',
        backgroundColor: '#0f172ae6',
        padding: { x: 10, y: 4 }
      })
      .setOrigin(0.5)
      .setDepth(1480);
    lbl.setStroke('#020617', 3);
  }

  private registerHotspot(h: Hotspot): Hotspot {
    const isTaskDone = h.type === 'task' && gameState.isDone(h.id);
    const container = this.add.container(h.x, h.y - 44).setDepth(1520);

    const ringColor = isTaskDone ? 0x22c55e : h.type === 'portal' ? 0x38bdf8 : h.type === 'npc' ? 0xa855f7 : 0xfacc15;
    const badgeBg = this.add.circle(0, 0, 17, ringColor, 0.96).setStrokeStyle(3, 0x0f172a);
    const iconTxt = this.add
      .text(0, 0, isTaskDone ? '✓' : h.type === 'portal' ? '⇄' : h.type === 'npc' ? '💬' : '!', {
        fontFamily: '"Noto Sans TC", sans-serif',
        fontSize: isTaskDone || h.type === 'portal' ? '18px' : '16px',
        fontStyle: '900',
        color: isTaskDone ? '#ffffff' : '#0f172a'
      })
      .setOrigin(0.5);

    container.add([badgeBg, iconTxt]);
    container.setSize(48, 48);
    container.setInteractive({ useHandCursor: true }).on('pointerdown', () => {
      this.walkOrTriggerHotspot(h);
    });

    this.tweens.add({
      targets: container,
      y: h.y - 53,
      duration: 720,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    h.marker = container;
    this.hotspots.push(h);
    return h;
  }

  private walkOrTriggerHotspot(h: Hotspot): void {
    if (!this.hero) return;
    const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, h.x, h.y);
    if (dist <= h.radius + 16) {
      this.clearTapNavigation();
      this.triggerHotspot(h);
    } else {
      this.planTapPathTo(h.x, h.y, h);
    }
  }

  private createPromptBubble(): void {
    this.promptBubble = this.add.container(0, 0).setDepth(2100).setVisible(false);
    const bg = this.add
      .rectangle(0, 0, 260, 38, 0x0f172a, 0.94)
      .setStrokeStyle(2.5, 0xfde047)
      .setInteractive({ useHandCursor: true });
    this.promptLabel = this.add
      .text(0, 0, '', {
        fontFamily: '"Noto Sans TC", "PingFang HK", sans-serif',
        fontSize: '14px',
        fontStyle: '900',
        color: '#fef08a'
      })
      .setOrigin(0.5);

    bg.on('pointerdown', () => {
      if (this.activeHotspot) this.triggerHotspot(this.activeHotspot);
    });

    this.promptBubble.add([bg, this.promptLabel]);
  }

  private bindDomActionButtons(): void {
    const interactBtn = document.getElementById('btn-interact');
    if (interactBtn) {
      interactBtn.onclick = () => {
        sound.unlock();
        if (this.activeHotspot) {
          this.triggerHotspot(this.activeHotspot);
        } else {
          sound.blip(300, 0.06);
        }
      };
    }

    const switchBtn = document.getElementById('btn-area-switch');
    if (switchBtn) {
      switchBtn.onclick = () => {
        sound.unlock();
        if (this.transitioning) return;
        const nextArea: AreaId = this.area === 'home' ? 'street' : 'home';
        sound.portal();
        this.transitionToArea(nextArea);
      };
    }

    const soundBtn = document.getElementById('btn-sound');
    if (soundBtn) {
      soundBtn.onclick = () => {
        const enabled = sound.toggle();
        soundBtn.textContent = enabled ? '🔊 音效' : '🔇 靜音';
        if (enabled) sound.startAreaBgm(this.area);
      };
    }
  }

  private bindTapToMove(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer, currentlyOver: Phaser.GameObjects.GameObject[]) => {
      sound.unlock();
      if (this.transitioning || this.isModalOpen()) return;
      if (currentlyOver && currentlyOver.length > 0) return;

      const wx = Phaser.Math.Clamp(pointer.worldX, 28, this.worldW - 28);
      const wy = Phaser.Math.Clamp(pointer.worldY, 28, this.worldH - 24);

      let tappedHotspot: Hotspot | null = null;
      let bestDist = Infinity;
      for (const h of this.hotspots) {
        const d = Phaser.Math.Distance.Between(wx, wy, h.x, h.y);
        if (d <= 62 && d < bestDist) {
          bestDist = d;
          tappedHotspot = h;
        }
      }

      if (tappedHotspot) {
        this.walkOrTriggerHotspot(tappedHotspot);
        return;
      }

      this.planTapPathTo(wx, wy, null);
    });
  }

  private planTapPathTo(targetHeroX: number, targetHeroY: number, pendingHotspot: Hotspot | null): void {
    const startFx = this.hero.x;
    const startFy = this.hero.y + this.heroFootOffsetY;
    const goalFx = targetHeroX;
    const goalFy = targetHeroY + this.heroFootOffsetY;

    const footPath = findWalkablePath(
      startFx,
      startFy,
      goalFx,
      goalFy,
      this.worldW,
      this.worldH,
      this.obstacleRects,
      20,
      this.area === 'home' ? 12 : 14,
      this.area === 'home' ? 8 : 10
    );

    if (footPath.length === 0) {
      sound.blip(240, 0.05);
      return;
    }

    this.tapWaypoints = footPath.map((pt) => ({
      x: pt.x,
      y: pt.y - this.heroFootOffsetY
    }));
    this.tapPendingHotspot = pendingHotspot;
    this.tapStuckMs = 0;
    this.tapLastPos = { x: this.hero.x, y: this.hero.y };

    const finalPt = this.tapWaypoints[this.tapWaypoints.length - 1];
    this.showTapRipple(finalPt.x, finalPt.y + this.heroFootOffsetY * 0.65, pendingHotspot ? 0xfde047 : 0x38bdf8);
  }

  private showTapRipple(x: number, y: number, color: number): void {
    if (this.tapMarker) {
      this.tapMarker.destroy();
      this.tapMarker = null;
    }
    const ring = this.add.circle(x, y, 10, color, 0.28).setStrokeStyle(2.5, color).setDepth(1950);
    this.tapMarker = ring;
    this.tweens.add({
      targets: ring,
      scale: 2.1,
      alpha: 0,
      duration: 460,
      ease: 'Quad.easeOut',
      onComplete: () => {
        if (this.tapMarker === ring) this.tapMarker = null;
        ring.destroy();
      }
    });
  }

  private clearTapNavigation(): void {
    this.tapWaypoints = [];
    this.tapPendingHotspot = null;
    this.tapStuckMs = 0;
  }

  update(_time: number, delta: number): void {
    if (this.transitioning || !this.hero) return;

    if (this.isModalOpen()) {
      this.clearTapNavigation();
      this.hero.setVelocity(0, 0);
      this.hero.play(`hero-idle-${this.facing}`, true);
      return;
    }

    const speed = this.area === 'home' ? 215 : 275;
    let vx = 0;
    let vy = 0;

    if (this.cursors.left.isDown || this.wasd.A.isDown) vx -= 1;
    if (this.cursors.right.isDown || this.wasd.D.isDown) vx += 1;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy -= 1;
    if (this.cursors.down.isDown || this.wasd.S.isDown) vy += 1;

    if (Math.abs(this.joystick.dx) > 0.08 || Math.abs(this.joystick.dy) > 0.08) {
      vx = this.joystick.dx;
      vy = this.joystick.dy;
    }

    const hasManualInput = Math.abs(vx) > 0.05 || Math.abs(vy) > 0.05;
    if (hasManualInput) {
      this.clearTapNavigation();
    } else if (this.tapWaypoints.length > 0) {
      // Check if already within trigger range of pending hotspot
      if (this.tapPendingHotspot) {
        const hDist = Phaser.Math.Distance.Between(
          this.hero.x,
          this.hero.y,
          this.tapPendingHotspot.x,
          this.tapPendingHotspot.y
        );
        if (hDist <= this.tapPendingHotspot.radius - 6) {
          const pending = this.tapPendingHotspot;
          this.clearTapNavigation();
          this.hero.setVelocity(0, 0);
          this.hero.play(`hero-idle-${this.facing}`, true);
          this.triggerHotspot(pending);
          return;
        }
      }

      const wp = this.tapWaypoints[0];
      const dx = wp.x - this.hero.x;
      const dy = wp.y - this.hero.y;
      const dist = Math.hypot(dx, dy);
      const arriveRadius = this.tapWaypoints.length === 1 ? 12 : 16;

      if (dist <= arriveRadius) {
        this.tapWaypoints.shift();
        if (this.tapWaypoints.length === 0) {
          const pending = this.tapPendingHotspot;
          this.clearTapNavigation();
          this.hero.setVelocity(0, 0);
          this.hero.play(`hero-idle-${this.facing}`, true);
          if (pending && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, pending.x, pending.y) <= pending.radius + 26) {
            this.triggerHotspot(pending);
          }
          return;
        }
      } else {
        const moved = Math.hypot(this.hero.x - this.tapLastPos.x, this.hero.y - this.tapLastPos.y);
        this.tapLastPos = { x: this.hero.x, y: this.hero.y };
        if (moved < 0.45) {
          this.tapStuckMs += delta;
          if (this.tapStuckMs > 600) {
            const pending = this.tapPendingHotspot;
            this.clearTapNavigation();
            if (pending && Phaser.Math.Distance.Between(this.hero.x, this.hero.y, pending.x, pending.y) <= pending.radius + 28) {
              this.triggerHotspot(pending);
            }
          }
        } else {
          this.tapStuckMs = 0;
        }

        if (this.tapWaypoints.length > 0) {
          const curWp = this.tapWaypoints[0];
          const cdx = curWp.x - this.hero.x;
          const cdy = curWp.y - this.hero.y;
          const cdist = Math.max(1, Math.hypot(cdx, cdy));
          vx = cdx / cdist;
          vy = cdy / cdist;
        }
      }
    }

    const len = Math.hypot(vx, vy);
    if (len > 0.05) {
      const nx = (vx / Math.max(1, len)) * speed;
      const ny = (vy / Math.max(1, len)) * speed;
      this.hero.setVelocity(nx, ny);

      if (Math.abs(nx) > Math.abs(ny)) {
        this.facing = nx < 0 ? 'left' : 'right';
      } else {
        this.facing = ny < 0 ? 'up' : 'down';
      }
      this.hero.play(`hero-walk-${this.facing}`, true);
    } else {
      this.hero.setVelocity(0, 0);
      this.hero.play(`hero-idle-${this.facing}`, true);
    }

    const shadowOffset = this.area === 'home' ? 28 : 34;
    this.hero.setDepth(this.hero.y + 32);
    this.heroShadow.setPosition(this.hero.x, this.hero.y + shadowOffset).setDepth(this.hero.y + 1);

    const areaBadge = document.getElementById('hud-area-badge');
    if (areaBadge && this.area === 'home') {
      areaBadge.textContent = this.detectRoomName(this.hero.x, this.hero.y);
    }

    let nearest: Hotspot | null = null;
    let bestD = Infinity;
    for (const h of this.hotspots) {
      const d = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, h.x, h.y);
      if (d <= h.radius && d < bestD) {
        bestD = d;
        nearest = h;
      }
    }
    this.activeHotspot = nearest;

    const interactBtn = document.getElementById('btn-interact');
    if (nearest) {
      this.promptBubble.setPosition(nearest.x, nearest.y - 84).setVisible(true);
      const doneSuffix = nearest.type === 'task' && gameState.isDone(nearest.id) ? '（已完成・可重溫）' : '';
      this.promptLabel.setText(`⚡ ${nearest.label}${doneSuffix}`);
      const bg = this.promptBubble.first as Phaser.GameObjects.Rectangle;
      bg.width = Math.max(210, this.promptLabel.width + 30);
      interactBtn?.classList.add('ready');
    } else {
      this.promptBubble.setVisible(false);
      interactBtn?.classList.remove('ready');
    }

    if (Phaser.Input.Keyboard.JustDown(this.interactKey) && this.activeHotspot) {
      this.triggerHotspot(this.activeHotspot);
    }
  }

  private triggerHotspot(h: Hotspot): void {
    sound.unlock();
    this.clearTapNavigation();
    if (h.type === 'portal') {
      sound.portal();
      if (h.id === 'go_street') {
        this.transitionToArea('street', 1050, 415);
      } else {
        const homeDoorX = Math.round(210 * COMPACT_HOME_RATIO) + Math.max(0, Math.round((1280 - Math.round(1902 * COMPACT_HOME_RATIO)) / 2));
        const homeDoorY = Math.round(235 * COMPACT_HOME_RATIO);
        this.transitionToArea('home', homeDoorX, homeDoorY);
      }
      return;
    }

    if (h.type === 'npc') {
      sound.blip(620, 0.08);
      this.openNpcDialog(h.npcName ?? '街坊', h.npcLines ?? []);
      return;
    }

    if (h.type === 'task') {
      sound.blip(740, 0.09);
      this.hero.setVelocity(0, 0);
      this.scene.pause();
      this.scene.launch('MinigameScene', {
        taskId: h.id,
        onFinish: (didCompleteNew: boolean) => {
          this.refreshSceneMarkers();
          this.syncHud();
          if (didCompleteNew && gameState.allCompleted()) {
            this.time.delayedCall(380, () => this.showVictoryModal());
          }
        }
      });
    }
  }

  private transitionToArea(nextArea: AreaId, spawnX?: number, spawnY?: number): void {
    if (this.transitioning) return;
    this.transitioning = true;
    this.clearTapNavigation();
    this.cameras.main.fadeOut(240, 15, 23, 42);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
      this.scene.restart({ area: nextArea, spawnX, spawnY });
    });
  }

  private refreshSceneMarkers(): void {
    for (const h of this.hotspots) {
      if (h.type === 'task' && h.marker && gameState.isDone(h.id)) {
        const circle = h.marker.list[0] as Phaser.GameObjects.Arc;
        const txt = h.marker.list[1] as Phaser.GameObjects.Text;
        circle.setFillStyle(0x22c55e, 0.96);
        txt.setText('✓').setColor('#ffffff');
      }
    }
  }

  private syncHud(): void {
    const scoreEl = document.getElementById('hud-score');
    const progEl = document.getElementById('hud-progress');
    const areaBadge = document.getElementById('hud-area-badge');
    const switchBtn = document.getElementById('btn-area-switch');

    if (scoreEl) scoreEl.textContent = `${gameState.score}`;
    if (progEl) progEl.textContent = `${gameState.completedCount()} / ${TASKS.length}`;
    if (areaBadge) {
      areaBadge.textContent = this.area === 'home' ? '🏠 溫馨家居' : '🏙️ 香港街道';
    }
    if (switchBtn) {
      switchBtn.textContent = this.area === 'home' ? '🏙️ 前往香港街道' : '🏠 返回溫馨家居';
    }
  }

  private openNpcDialog(name: string, lines: string[]): void {
    const modal = document.getElementById('dialog-modal');
    const nameEl = document.getElementById('dialog-speaker');
    const textEl = document.getElementById('dialog-text');
    const nextBtn = document.getElementById('dialog-next-btn');
    if (!modal || !nameEl || !textEl || !nextBtn) return;

    let idx = 0;
    nameEl.textContent = name;
    textEl.textContent = lines[0] ?? '';
    modal.classList.remove('hidden');

    nextBtn.textContent = lines.length > 1 ? '下一句 ▶' : '明白！ ✓';
    nextBtn.onclick = () => {
      idx++;
      sound.blip(540, 0.06);
      if (idx < lines.length) {
        textEl.textContent = lines[idx];
        nextBtn.textContent = idx < lines.length - 1 ? '下一句 ▶' : '明白！ ✓';
      } else {
        modal.classList.add('hidden');
      }
    };
  }

  private showVictoryModal(): void {
    sound.fanfare();
    const modal = document.getElementById('victory-modal');
    const finalScore = document.getElementById('victory-score');
    if (finalScore) finalScore.textContent = `${gameState.score}`;
    modal?.classList.remove('hidden');
  }

  private isModalOpen(): boolean {
    const d = document.getElementById('dialog-modal');
    const v = document.getElementById('victory-modal');
    const intro = document.getElementById('intro-modal');
    return Boolean(
      (d && !d.classList.contains('hidden')) ||
        (v && !v.classList.contains('hidden')) ||
        (intro && !intro.classList.contains('hidden'))
    );
  }
}
