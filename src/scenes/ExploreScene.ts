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
  sprite?: Phaser.GameObjects.Sprite;
  cleanFrame?: number;
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
      `${gameState.studentName}，歡迎回到擴充版六大房間新居！先去左上【浴室】洗手刷牙、左下【睡房】剪指甲、右中【飯廳】蓋食物及右下【陽光露台】倒積水，再去香港街道冒險吧！`
    );
  }

  private addWallBlock(x: number, y: number, w: number, h: number): void {
    const z = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
    this.physics.add.existing(z, true);
    this.colliders.add(z);
  }

  private buildWorld(mapId: MapId): void {
    gameState.currentMap = mapId;
    sound.playBgm(mapId);
    this.children.removeAll(true);
    this.hotspots = [];
    this.trail = [];
    if (this.colliders) this.colliders.clear(true, true);
    this.colliders = this.physics.add.staticGroup();

    const cols = mapId === 'home' ? 34 : 38;
    const rows = 22;
    const worldW = cols * 64;
    const worldH = rows * 64;
    this.physics.world.setBounds(0, 0, worldW, worldH);
    this.cameras.main.setBounds(0, 0, worldW, worldH);

    if (mapId === 'home') this.buildExpandedHome(cols, rows);
    else this.buildExpandedStreet(cols, rows);

    const spawn = mapId === 'home' ? { x: 15 * 64, y: 10 * 64 } : { x: 13 * 64, y: 6 * 64 };
    this.companion = this.add.sprite(spawn.x - 48, spawn.y + 8, 'npcs', 16).setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0);
    this.hero.setCollideWorldBounds(true);
    this.hero.play('hero-idle-down');
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setSize(32, 22);
    body.setOffset(16, 38);

    this.physics.add.collider(this.hero, this.colliders);
    this.cameras.main.startFollow(this.hero, true, 0.12, 0.12);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '15px', fontStyle: 'bold', color: '#0f172a',
      backgroundColor: '#fde047', padding: { x: 10, y: 5 }
    }).setOrigin(0.5, 1).setDepth(4000).setVisible(false);

    this.refreshHud();
  }

  // ==========================================================================
  // Expanded 6-Room Hong Kong Apartment (34x22 = 2176x1408 scrolling world!)
  // ==========================================================================
  private buildExpandedHome(cols: number, rows: number): void {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * 64 + 32, y = r * 64 + 32;
        // Outer perimeter walls
        if (r === 0 || r === rows - 1 || c === 0 || c === cols - 1) {
          this.add.image(x, y, 'tiles-home', 8).setDepth(10);
          continue;
        }
        if (r === 1) {
          let wf = 9;
          if (c === 3 || c === 4) wf = 10; // Bathroom mirrors
          else if (c === 13 || c === 18 || c === 26) wf = 11; // Sunlit windows
          else if (c === 15) wf = 13; // Hygiene poster
          this.add.image(x, y, 'tiles-home', wf).setDepth(20);
          continue;
        }
        // Floor zones across 6 distinct rooms:
        let ff = (r + c) % 2 === 0 ? 0 : 1;
        if (c <= 9 && r <= 10) ff = (c === 5 && r === 6) ? 3 : 2; // Bathroom aqua tiles
        else if (c <= 9 && r >= 11) ff = (c >= 4 && c <= 6 && r >= 15 && r <= 17) ? 45 : ff; // Bedroom + pink rug
        else if (c >= 22 && r <= 11) ff = 4; // Kitchen & Dining checkerboard
        else if (c >= 27 && r >= 12) ff = 5; // Sunny Balcony cedar deck
        else if ((c === 14 || c === 15 || c === 16 || c === 17) && (r >= 8 && r <= 11)) {
          ff = (c % 2 === 0) ? 6 : 7; // Large Living Room woven carpet
        }
        this.add.image(x, y, 'tiles-home', ff);
      }
    }

    // Outer boundary colliders
    this.addWallBlock(0, 0, cols * 64, 128);
    this.addWallBlock(0, (rows - 1) * 64, cols * 64, 64);
    this.addWallBlock(0, 0, 64, rows * 64);
    this.addWallBlock((cols - 1) * 64, 0, 64, rows * 64);

    // Interior Partition Walls with Open Doorways!
    const drawWallSpan = (c1: number, c2: number, row: number) => {
      for (let c = c1; c <= c2; c++) {
        this.add.image(c * 64 + 32, row * 64 + 32, 'tiles-home', 15).setDepth(row * 64 + 48);
      }
      this.addWallBlock(c1 * 64, row * 64 + 8, (c2 - c1 + 1) * 64, 48);
    };
    const drawVertWall = (col: number, r1: number, r2: number) => {
      for (let r = r1; r <= r2; r++) {
        this.add.image(col * 64 + 32, r * 64 + 32, 'tiles-home', 15).setDepth(r * 64 + 48);
      }
      this.addWallBlock(col * 64 + 8, r1 * 64, 48, (r2 - r1 + 1) * 64);
    };

    // Bathroom / Bedroom horizontal divider (doorway gap at cols 6..7)
    drawWallSpan(1, 5, 10);
    drawWallSpan(8, 9, 10);
    // Left wing vertical divider (doorways at rows 5..6 for Bathroom & rows 15..16 for Bedroom!)
    drawVertWall(9, 2, 4);
    drawVertWall(9, 7, 14);
    drawVertWall(9, 17, 20);
    // Right wing vertical divider (doorways at rows 6..7 for Kitchen & rows 15..16 for Foyer/Balcony!)
    drawVertWall(22, 2, 5);
    drawVertWall(22, 8, 14);
    drawVertWall(22, 17, 20);
    // Kitchen / Foyer+Balcony horizontal divider (doorway at cols 24..25)
    drawWallSpan(22, 23, 11);
    drawWallSpan(26, 32, 11);

    // Room Floor Labels
    const roomSign = (tx: number, ty: number, txt: string) => {
      this.add.text(tx * 64, ty * 64, txt, {
        fontSize: '15px', color: '#fef08a', backgroundColor: 'rgba(15,23,42,0.65)', padding: { x: 8, y: 3 }, fontStyle: 'bold'
      }).setOrigin(0.5).setDepth(35);
    };
    roomSign(5, 4.2, '🛁 浴室與洗手間');
    roomSign(5, 13.2, '🛏️ 小明睡房');
    roomSign(15.5, 4.2, '🛋️ 溫馨客廳');
    roomSign(27.5, 4.2, '🍳 廚房與飯廳');
    roomSign(24.5, 13.2, '🚪 玄關走廊');
    roomSign(30, 13.2, '🌿 陽光露台');

    // --- 1. Bathroom Furniture & Tasks (Wash Hands & Brush Teeth) ---
    this.add.image(2 * 64 + 32, 3 * 64 + 32, 'tiles-home', 40).setDepth(220); // Bathtub
    this.add.image(7 * 64 + 32, 2 * 64 + 32, 'tiles-home', 31).setDepth(170); // Toilet
    this.add.image(8 * 64 + 32, 2 * 64 + 32, 'tiles-home', 36).setDepth(170); // Washing Machine
    this.addWallBlock(2 * 64, 3 * 64, 64, 56);
    this.addWallBlock(7 * 64, 2 * 64, 128, 56);

    const s1 = this.add.sprite(3 * 64 + 32, 2 * 64 + 36, 'tiles-home', gameState.isDone('wash_hands') ? 17 : 16).setDepth(175);
    this.registerTask('wash_hands', s1.x, s1.y + 24, '🧼 按 A 進入「洗手泡泡滅菌戰」', s1, 17);

    const s2 = this.add.sprite(4 * 64 + 32, 2 * 64 + 36, 'tiles-home', gameState.isDone('brush_teeth') ? 17 : 16).setDepth(175);
    this.registerTask('brush_teeth', s2.x, s2.y + 24, '🪥 按 A 進入「護齒刷牙大掃除」', s2, 17);

    // --- 2. Student Bedroom Furniture & Task (Trim Nails) ---
    this.add.image(2 * 64 + 32, 12 * 64 + 32, 'tiles-home', 24).setDepth(800);
    this.add.image(2 * 64 + 32, 13 * 64 + 32, 'tiles-home', 32).setDepth(860); // Bed
    this.add.image(4 * 64 + 32, 11 * 64 + 32, 'tiles-home', 33).setDepth(740);
    this.add.image(4 * 64 + 32, 12 * 64 + 32, 'tiles-home', 41).setDepth(800); // Wardrobe
    this.add.image(6 * 64 + 32, 11 * 64 + 32, 'tiles-home', 30).setDepth(740);
    this.add.image(6 * 64 + 32, 12 * 64 + 32, 'tiles-home', 38).setDepth(800); // Bookshelf
    this.add.image(2 * 64 + 32, 17 * 64 + 32, 'tiles-home', 34).setDepth(1120); // PC Study Desk
    this.add.image(3 * 64 + 32, 17 * 64 + 32, 'tiles-home', 35).setDepth(1120);
    this.addWallBlock(2 * 64, 12 * 64, 64, 120);
    this.addWallBlock(4 * 64, 11 * 64, 192, 112);

    const nailDesk = this.add.sprite(6 * 64 + 32, 18 * 64 + 32, 'tiles-home', 18).setDepth(1180);
    this.addWallBlock(6 * 64 + 6, 18 * 64 + 10, 52, 44);
    this.registerTask('trim_nails', nailDesk.x, nailDesk.y, '💅 按 A 進入「精準剪甲節奏王」', nailDesk, 18);

    // --- 3. Living Room Furniture + Patrolling Mom & Sister NPCs ---
    this.add.image(15 * 64 + 32, 3 * 64 + 32, 'tiles-home', 39).setDepth(230); // Widescreen TV
    this.add.image(15 * 64 + 32, 7 * 64 + 32, 'tiles-home', 25).setDepth(480); // Sofa L
    this.add.image(16 * 64 + 32, 7 * 64 + 32, 'tiles-home', 26).setDepth(480); // Sofa R
    this.add.image(15 * 64 + 64, 9 * 64 + 32, 'tiles-home', 42).setDepth(600); // Coffee Table
    this.add.image(11 * 64 + 32, 3 * 64 + 32, 'tiles-home', 43).setDepth(230);
    this.add.image(20 * 64 + 32, 3 * 64 + 32, 'tiles-home', 43).setDepth(230);
    this.addWallBlock(15 * 64, 7 * 64 + 8, 128, 48);

    const mom = this.add.sprite(13 * 64 + 32, 11 * 64 + 32, 'npcs', 4).setDepth(740).play('npc-mom-walk');
    this.tweens.add({ targets: mom, x: 18 * 64 + 32, duration: 3600, yoyo: true, repeat: -1 });
    this.hotspots.push({ id: 'talk_mom', x: 15 * 64 + 32, y: 11 * 64 + 32, radius: 130, label: '👩 按 A 與巡視中的媽媽對話' });

    const sis = this.add.sprite(18 * 64 + 32, 15 * 64 + 32, 'npcs', 12).setDepth(990).play('npc-girl-walk');
    this.tweens.add({ targets: sis, y: 17 * 64 + 32, duration: 2600, yoyo: true, repeat: -1 });

    // --- 4. Kitchen & Dining Room + Cover Food Task ---
    this.add.image(25 * 64 + 32, 2 * 64 + 32, 'tiles-home', 27).setDepth(170);
    this.add.image(26 * 64 + 32, 2 * 64 + 32, 'tiles-home', 28).setDepth(170);
    this.add.image(28 * 64 + 32, 2 * 64 + 32, 'tiles-home', 29).setDepth(180);
    this.add.image(28 * 64 + 32, 3 * 64 + 32, 'tiles-home', 37).setDepth(230);
    this.add.image(30 * 64 + 32, 3 * 64 + 32, 'tiles-home', 23).setDepth(220); // Covered Bin
    this.addWallBlock(25 * 64, 2 * 64, 256, 96);

    const dTable = this.add.sprite(27 * 64 + 32, 7 * 64 + 32, 'tiles-home', gameState.isDone('cover_food') ? 20 : 19).setDepth(480);
    this.add.image(26 * 64 + 32, 7 * 64 + 32, 'tiles-home', 35).setDepth(475);
    this.add.image(28 * 64 + 32, 7 * 64 + 32, 'tiles-home', 35).setDepth(475);
    this.addWallBlock(27 * 64 + 6, 7 * 64 + 8, 52, 46);
    this.registerTask('cover_food', dTable.x, dTable.y, '🍲 按 A 進入「餐桌防鼠保衛戰」', dTable, 20);

    // --- 5. Entrance Foyer & Exit Door (cols 23..26, rows 12..20) ---
    this.add.image(24 * 64 + 32, 19 * 64 + 32, 'tiles-home', 14).setDepth(40);
    this.add.image(24 * 64 + 32, 20 * 64 + 16, 'tiles-home', 12).setDepth(1320);
    const doorEmote = this.add.sprite(24 * 64 + 32, 18 * 64 + 36, 'npcs', 29).setDepth(2500);
    this.tweens.add({ targets: doorEmote, y: doorEmote.y - 8, duration: 650, yoyo: true, repeat: -1 });
    this.hotspots.push({ id: 'go_street', x: 24 * 64 + 32, y: 19 * 64 + 20, radius: 92, label: '🚪 按 A 出門前往「香港社區街道」', emote: doorEmote });

    // --- 6. Sunny Balcony & Flowerpot Task (cols 27..32, rows 12..20) ---
    for (let c = 27; c <= 32; c++) {
      this.add.image(c * 64 + 32, 19 * 64 + 40, 'tiles-home', 44).setDepth(1260);
    }
    this.add.image(28 * 64 + 32, 15 * 64 + 32, 'tiles-home', 43).setDepth(990);
    const pot = this.add.sprite(30 * 64 + 32, 16 * 64 + 32, 'tiles-home', gameState.isDone('clear_saucer') ? 22 : 21).setDepth(1050);
    this.registerTask('clear_saucer', pot.x, pot.y, '🪴 按 A 進入「倒積水滅孑孓挑戰」', pot, 22);
  }

  // ==========================================================================
  // Expanded Hong Kong Street, Alley & Park (38x22 = 2432x1408 scrolling world!)
  // ==========================================================================
  private buildExpandedStreet(cols: number, rows: number): void {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = c * 64 + 32, y = r * 64 + 32;
        if (c <= 9) {
          const isPath = (c === 5 && r >= 3 && r <= 18) || (r === 10 && c >= 3 && c <= 9);
          this.add.image(x, y, 'tiles-street', isPath ? 7 : ((r + c) % 3 === 0 ? 1 : 0));
        } else if ((c === 10 || c === 11) && r <= 9) {
          this.add.image(x, y, 'tiles-street', 4); // Dark back-alley cobblestone
        } else if (r <= 1 && c >= 12) {
          this.add.image(x, y, 'tiles-home', 8);
        } else if (r === 2 && c >= 12) {
          let bf = 8;
          if (c === 16) bf = gameState.isDone('spray_mosquito') ? 10 : 9; // Dripping AC
          else if (c === 19 || c === 20) bf = 11; // Burger Shop Sign
          else if (c === 25 || c === 26) bf = 27; // HK Cha Chaan Teng Sign (冰室)
          else if (c === 31 || c === 32) bf = 28; // HK Pharmacy Sign (藥房)
          this.add.image(x, y, 'tiles-street', bf);
        } else if (r === 3 && c >= 12) {
          let sf = 15;
          if (c === 13 || c === 14) sf = 13; // Mansion Gate back to Home
          else if (c === 19 || c === 20 || c === 25 || c === 26 || c === 31 || c === 32) sf = 12;
          else if (c === 22) sf = gameState.isDone('seal_rathole') ? 15 : 14; // Rat Hole!
          this.add.image(x, y, 'tiles-street', sf);
        } else if (r <= 12) {
          this.add.image(x, y, 'tiles-street', 2); // HK Pink-Brick Sidewalk
        } else if (r === 13 && c >= 10) {
          this.add.image(x, y, 'tiles-street', 3); // Yellow Tactile Curb
        } else {
          const isZebra = (c >= 17 && c <= 19) || (c >= 29 && c <= 31);
          const isDrain = r === 14 && (c === 15 || c === 27);
          this.add.image(x, y, 'tiles-street', isDrain ? 29 : (isZebra ? 6 : 5));
        }
      }
    }

    this.addWallBlock(12 * 64, 0, (cols - 12) * 64, 256);
    this.addWallBlock(10 * 64, 14 * 64, (cols - 10) * 64, 8 * 64);

    // Park HGSS Layered Trees, Benches & Falling Leaves
    const addTree = (tc: number, tr: number) => {
      const d = (tr + 1) * 64 + 32;
      this.add.image(tc * 64 + 32, tr * 64 + 32, 'tiles-street', 24).setDepth(d);
      this.add.image((tc + 1) * 64 + 32, tr * 64 + 32, 'tiles-street', 25).setDepth(d);
      this.add.image(tc * 64 + 32, (tr + 1) * 64 + 32, 'tiles-street', 32).setDepth(d);
      this.add.image((tc + 1) * 64 + 32, (tr + 1) * 64 + 32, 'tiles-street', 33).setDepth(d);
      this.addWallBlock(tc * 64 + 18, (tr + 1) * 64 + 10, 92, 46);
    };
    addTree(1, 1); addTree(7, 1); addTree(1, 7); addTree(1, 14); addTree(7, 15);

    this.add.image(3 * 64 + 32, 11 * 64 + 32, 'tiles-street', 37).setDepth(740);
    this.add.image(4 * 64 + 32, 11 * 64 + 32, 'tiles-street', 38).setDepth(740);

    // Streetlamps, Guardrails & 3-Color Recycling Station
    [12, 23, 34].forEach(lc => {
      this.add.image(lc * 64 + 32, 11 * 64 + 32, 'tiles-street', 26).setDepth(800);
      this.add.image(lc * 64 + 32, 12 * 64 + 32, 'tiles-street', 34).setDepth(800);
    });
    for (let rc = 11; rc <= 36; rc++) {
      if (rc >= 17 && rc <= 19) continue;
      if (rc >= 29 && rc <= 31) continue;
      this.add.image(rc * 64 + 32, 13 * 64 + 18, 'tiles-street', 23).setDepth(860);
    }
    this.add.image(33 * 64 + 32, 5 * 64 + 32, 'tiles-street', 19).setDepth(350);
    this.add.image(34 * 64 + 32, 5 * 64 + 32, 'tiles-street', 20).setDepth(350);

    // Mansion Gate back to Home
    this.hotspots.push({ id: 'go_home', x: 13 * 64 + 64, y: 4 * 64 + 24, radius: 86, label: '🏠 按 A 返回「六大房間溫馨家居」' });

    // Patrolling Pedestrian NPC
    const man = this.add.sprite(20 * 64, 9 * 64, 'npcs', 8).setDepth(590).play('npc-man-walk');
    this.tweens.add({ targets: man, x: 28 * 64, duration: 4800, yoyo: true, repeat: -1 });

    // Task 6: Recycle Plastic Bottles in Park & Tidy Overflowing Orange Bin
    const recDone = gameState.isDone('recycle_bottles');
    const bottles = this.add.sprite(6 * 64 + 32, 9 * 64 + 32, 'tiles-street', recDone ? 19 : 21).setDepth(600);
    this.add.sprite(24 * 64 + 32, 11 * 64 + 32, 'tiles-street', recDone ? 17 : 16).setDepth(730);
    this.registerTask('recycle_bottles', bottles.x, bottles.y, '♻️ 按 A 進入「香港三色回收快手」', bottles, 19);

    // Task 7: Dripping AC Animated Droplets + Mosquito Bushes
    const mosDone = gameState.isDone('spray_mosquito');
    this.add.image(6 * 64 + 32, 5 * 64 + 32, 'tiles-street', 35).setDepth(350);
    const puddle = this.add.sprite(16 * 64 + 32, 4 * 64 + 28, 'tiles-street', mosDone ? 2 : 22).setDepth(265);
    if (!mosDone) {
      this.add.sprite(6 * 64 + 32, 4 * 64 + 40, 'npcs', 20).setDepth(420).play('mosquito-fly');
      this.add.sprite(16 * 64 + 32, 3 * 64 + 52, 'npcs', 20).setDepth(420).play('mosquito-fly');
      this.time.addEvent({
        delay: 650, loop: true,
        callback: () => {
          if (gameState.currentMap !== 'street' || gameState.isDone('spray_mosquito')) return;
          const drop = this.add.rectangle(16 * 64 + 32, 2 * 64 + 48, 6, 10, 0x38bdf8).setDepth(410);
          this.tweens.add({ targets: drop, y: 4 * 64 + 28, alpha: 0.2, duration: 500, onComplete: () => drop.destroy() });
        }
      });
    }
    this.registerTask('spray_mosquito', puddle.x, puddle.y, '🦟 按 A 進入「冷氣止漏 ＋ DEET 驅蚊射擊」', puddle, 2);

    // Task 8: Alley Garbage & Burger Shop Rat Hole
    const ratDone = gameState.isDone('seal_rathole');
    const rHole = this.add.sprite(22 * 64 + 32, 3 * 64 + 32, 'tiles-street', ratDone ? 15 : 14).setDepth(210);
    if (!ratDone) {
      this.add.image(10 * 64 + 48, 5 * 64 + 32, 'tiles-street', 18).setDepth(350);
      const rat = this.add.sprite(10 * 64 + 32, 7 * 64 + 16, 'npcs', 24).setDepth(470).play('rat-scurry');
      this.tweens.add({ targets: rat, x: 11 * 64 + 32, duration: 950, yoyo: true, repeat: -1 });
    }
    this.registerTask('seal_rathole', 22 * 64 + 32, 4 * 64 + 20, '🕳️ 按 A 進入「防鼠三部曲：封堵鼠洞」', rHole, 15);

    // Task 9: FEHD Officer Assessment
    const fehd = this.add.sprite(31 * 64 + 32, 7 * 64 + 32, 'npcs', 0).setDepth(480).play('npc-fehd-walk');
    const fEmote = this.add.sprite(fehd.x, fehd.y - 48, 'npcs', 29).setDepth(2500);
    this.tweens.add({ targets: fEmote, y: fEmote.y - 7, duration: 600, yoyo: true, repeat: -1 });
    this.hotspots.push({ id: 'fehd_quiz', x: fehd.x, y: fehd.y, radius: 95, label: '👮 按 A 接受「食環署主任常識總考核」', emote: fEmote });
  }

  private registerTask(id: string, x: number, y: number, label: string, sprite: Phaser.GameObjects.Sprite, cleanFrame: number): void {
    const done = gameState.isDone(id);
    const emote = this.add.sprite(x, y - 48, 'npcs', done ? 30 : 28).setDepth(2600);
    this.tweens.add({ targets: emote, y: emote.y - 7, duration: 580, yoyo: true, repeat: -1 });
    this.hotspots.push({ id, x, y, radius: 92, label, sprite, cleanFrame, emote });
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
        ? `屋企仲有 ${rem} 項衛生任務未做完呀！記得去齊【浴室】、【小明睡房】、【飯廳】同【陽光露台】看看！`
        : '全屋六個區域都乾乾淨淨！快啲由右下【玄關走廊】大門去香港社區街道幫食環署主任啦！');
      return;
    }
    if (h.id === 'go_street') {
      if (gameState.completedCount('home') < 5) {
        sound.wrong();
        this.openDialogue('出門提示', `請先完成屋企全部 5 項衛生任務（目前已完成 ${gameState.completedCount('home')} / 5 項），再出門前往社區街道吧！`);
      } else {
        sound.pop();
        this.buildWorld('street');
        this.openDialogue('食環署主任廣播', '歡迎來到彩雲社區街道與公園！請幫忙到左邊公園做三色回收、到街上修好滴水冷氣與滅蚊、封好快餐店鼠洞，最後找我考核！');
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
      if (h.id === 'spray_mosquito' || h.id === 'seal_rathole' || h.id === 'recycle_bottles') {
        this.buildWorld(gameState.currentMap);
      } else {
        if (h.sprite && h.cleanFrame !== undefined) h.sprite.setFrame(h.cleanFrame);
        if (h.emote) h.emote.setFrame(30);
      }
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
    const cx = this.hero.x / 64, cy = this.hero.y / 64;
    if (gameState.currentMap === 'home') {
      if (cx <= 9 && cy <= 10) return '溫馨家居 · 🛁 浴室';
      if (cx <= 9 && cy > 10) return '溫馨家居 · 🛏️ 小明睡房';
      if (cx >= 22 && cy <= 11) return '溫馨家居 · 🍳 廚房與飯廳';
      if (cx >= 27 && cy > 11) return '溫馨家居 · 🌿 陽光露台';
      if (cx >= 22 && cy > 11) return '溫馨家居 · 🚪 玄關走廊';
      return '溫馨家居 · 🛋️ 客廳';
    }
    if (cx <= 9) return '香港社區 · 🌳 彩雲公園';
    if (cx <= 11 && cy <= 9) return '香港社區 · ⚠️ 大廈後巷';
    return '香港社區 · 🏙️ 商舖行人路';
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
    const speed = mv.sprint ? 320 : 215;
    this.hero.setVelocity(mv.x * speed, mv.y * speed);

    if (Math.hypot(mv.x, mv.y) > 0.08) {
      this.facing = Math.abs(mv.x) > Math.abs(mv.y) ? (mv.x < 0 ? 'left' : 'right') : (mv.y < 0 ? 'up' : 'down');
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 16) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 4).setDepth(pt.y);
      }

      this.stepTimer += delta;
      if (this.stepTimer > (mv.sprint ? 195 : 285)) {
        this.stepTimer = 0;
        sound.step();
      }

      // Sprint dust puffs animation behind shoes!
      if (mv.sprint) {
        this.dustTimer += delta;
        if (this.dustTimer > 95) {
          this.dustTimer = 0;
          const dust = this.add.rectangle(this.hero.x + (Math.random() - 0.5) * 14, this.hero.y + 24, 7, 7, 0xe2e8f0, 0.8).setDepth(this.hero.y);
          this.tweens.add({ targets: dust, y: dust.y - 10, alpha: 0, scale: 0.3, duration: 280, onComplete: () => dust.destroy() });
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
      this.promptTag.setText(nearest.label).setPosition(nearest.x, nearest.y - 74).setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
