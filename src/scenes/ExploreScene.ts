import Phaser from 'phaser';
import { sound } from '../audio/RetroSound';
import { VirtualJoystick } from '../input/VirtualJoystick';
import { MinigameManager } from '../minigames/MinigameManager';
import { gameState, MapId } from '../state/gameState';

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
  private pestGroup: Phaser.GameObjects.Sprite[] = [];

  private joystick!: VirtualJoystick;
  private minigames!: MinigameManager;
  private dialogueOpen = false;
  private onDialogueNext: (() => void) | null = null;

  constructor() {
    super('ExploreScene');
  }

  create(): void {
    this.input.addPointer(3);
    this.minigames = new MinigameManager();
    this.joystick = new VirtualJoystick(() => this.handleActionButton());

    document.getElementById('rpg-dialogue')!.addEventListener('pointerdown', () => {
      if (this.dialogueOpen) this.closeDialogue();
    });

    window.addEventListener('cwsj-restart-game', () => {
      this.buildMap('home');
      this.refreshHud();
    });

    this.buildMap(gameState.currentMap);
    this.refreshHud();

    this.openDialogue(
      '媽媽',
      `${gameState.studentName}，放學回家啦！記得先到浴室洗手、刷牙同剪指甲，再幫媽媽蓋好餐桌食物同清理露台花盆積水，完成後就可以出門去街上幫食環署主任啦！`
    );
  }

  private buildMap(mapId: MapId): void {
    gameState.currentMap = mapId;
    this.children.removeAll(true);
    this.hotspots = [];
    this.pestGroup = [];
    this.trail = [];

    if (this.colliders) this.colliders.clear(true, true);
    this.colliders = this.physics.add.staticGroup();

    if (mapId === 'home') {
      this.buildHomeInterior();
    } else {
      this.buildHkStreet();
    }

    const spawn = mapId === 'home' ? { x: 640, y: 430 } : { x: 544, y: 350 };
    this.companion = this.add.sprite(spawn.x - 44, spawn.y + 8, 'npcs', 16).setDepth(spawn.y);
    this.companion.play('companion-float');

    this.hero = this.physics.add.sprite(spawn.x, spawn.y, 'hero', 0);
    this.hero.setCollideWorldBounds(true);
    const body = this.hero.body as Phaser.Physics.Arcade.Body;
    body.setSize(34, 24);
    body.setOffset(15, 36);

    this.physics.add.collider(this.hero, this.colliders);

    this.promptTag = this.add.text(0, 0, '', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#0f172a',
      backgroundColor: '#fde047',
      padding: { x: 10, y: 5 }
    }).setOrigin(0.5, 1).setDepth(2000).setVisible(false);

    this.refreshHud();
  }

  private addSolidBlock(x: number, y: number, w: number, h: number): void {
    const zone = this.add.rectangle(x + w / 2, y + h / 2, w, h, 0x000000, 0);
    this.physics.add.existing(zone, true);
    this.colliders.add(zone);
  }

  private buildHomeInterior(): void {
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 20; c++) {
        const x = c * 64 + 32;
        const y = r * 64 + 32;
        if (r === 0) {
          this.add.image(x, y, 'tiles-home', 8);
        } else if (r === 1) {
          let wallFrame = 9;
          if (c === 2 || c === 3) wallFrame = 10;
          else if (c === 7 || c === 13) wallFrame = 11;
          else if (c === 10) wallFrame = 13;
          else if (c === 18) wallFrame = 12;
          this.add.image(x, y, 'tiles-home', wallFrame);
        } else {
          let floorFrame = (r + c) % 2 === 0 ? 0 : 1;
          if (c <= 4 && r <= 6) floorFrame = (c === 2 && r === 5) ? 3 : 2;
          else if (c >= 12 && c <= 16 && r <= 5) floorFrame = 4;
          else if (c >= 17 && r >= 6) floorFrame = 5;
          else if ((c === 8 || c === 9) && (r === 6 || r === 7)) floorFrame = c === 8 ? 6 : 7;
          this.add.image(x, y, 'tiles-home', floorFrame);
        }
      }
    }

    this.addSolidBlock(0, 0, 1280, 128);

    this.add.image(5 * 64 + 32, 2 * 64 + 32, 'tiles-home', 24).setDepth(180);
    this.add.image(5 * 64 + 32, 3 * 64 + 32, 'tiles-home', 32).setDepth(210);
    this.addSolidBlock(5 * 64 + 6, 2 * 64 + 12, 52, 108);

    this.add.image(6 * 64 + 32, 2 * 64 + 32, 'tiles-home', 30).setDepth(180);
    this.add.image(6 * 64 + 32, 3 * 64 + 32, 'tiles-home', 38).setDepth(200);
    this.addSolidBlock(6 * 64 + 4, 2 * 64 + 12, 56, 104);

    this.add.image(8 * 64 + 32, 4 * 64 + 32, 'tiles-home', 25).setDepth(288);
    this.add.image(9 * 64 + 32, 4 * 64 + 32, 'tiles-home', 26).setDepth(288);
    this.addSolidBlock(8 * 64 + 6, 4 * 64 + 10, 116, 48);

    this.add.image(12 * 64 + 32, 2 * 64 + 32, 'tiles-home', 27).setDepth(170);
    this.add.image(13 * 64 + 32, 2 * 64 + 32, 'tiles-home', 28).setDepth(170);
    this.add.image(14 * 64 + 32, 2 * 64 + 32, 'tiles-home', 29).setDepth(180);
    this.add.image(14 * 64 + 32, 3 * 64 + 32, 'tiles-home', 37).setDepth(210);
    this.addSolidBlock(12 * 64, 2 * 64, 192, 92);

    this.add.image(1 * 64 + 32, 2 * 64 + 32, 'tiles-home', 31).setDepth(170);
    this.addSolidBlock(1 * 64 + 8, 2 * 64 + 8, 48, 48);

    this.add.image(15 * 64 + 32, 3 * 64 + 32, 'tiles-home', 23).setDepth(220);
    this.add.image(18 * 64 + 32, 2 * 64 + 24, 'tiles-home', 14).setDepth(130);

    const mom = this.add.sprite(10 * 64 + 32, 4 * 64 + 32, 'npcs', 4).setDepth(290);
    this.registerHotspot({
      id: 'talk_mom',
      x: mom.x,
      y: mom.y,
      radius: 82,
      label: '👩 按 A 與媽媽對話'
    });

    const washDone = gameState.isDone('wash_hands');
    const sink1 = this.add.sprite(2 * 64 + 32, 2 * 64 + 36, 'tiles-home', washDone ? 17 : 16).setDepth(175);
    this.registerTaskHotspot('wash_hands', sink1.x, sink1.y + 24, '🧼 按 A「回家洗手 20 秒」', sink1, 17);

    const teethDone = gameState.isDone('brush_teeth');
    const sink2 = this.add.sprite(3 * 64 + 32, 2 * 64 + 36, 'tiles-home', teethDone ? 17 : 16).setDepth(175);
    this.registerTaskHotspot('brush_teeth', sink2.x, sink2.y + 24, '🪥 按 A「早晚刷牙護齒」', sink2, 17);

    const nailDesk = this.add.sprite(6 * 64 + 32, 8 * 64 + 16, 'tiles-home', 18).setDepth(530);
    this.addSolidBlock(6 * 64 + 8, 8 * 64 - 4, 48, 42);
    this.registerTaskHotspot('trim_nails', nailDesk.x, nailDesk.y, '💅 按 A「定時修剪指甲」', nailDesk, 18);

    const foodDone = gameState.isDone('cover_food');
    const table = this.add.sprite(13 * 64 + 32, 6 * 64 + 24, 'tiles-home', foodDone ? 20 : 19).setDepth(410);
    this.addSolidBlock(13 * 64 + 6, 6 * 64 + 4, 52, 42);
    this.registerTaskHotspot('cover_food', table.x, table.y, '🍲 按 A「妥善加蓋食物防鼠」', table, 20);

    const potDone = gameState.isDone('clear_saucer');
    const pot = this.add.sprite(18 * 64 + 16, 8 * 64 + 16, 'tiles-home', potDone ? 22 : 21).setDepth(530);
    this.registerTaskHotspot('clear_saucer', pot.x, pot.y, '🪴 按 A「清理花盆底盤積水」', pot, 22);

    const exitEmote = this.add.sprite(18 * 64 + 32, 1 * 64 + 36, 'npcs', 29).setDepth(900);
    this.tweens.add({ targets: exitEmote, y: exitEmote.y - 6, duration: 700, yoyo: true, repeat: -1 });
    this.registerHotspot({
      id: 'go_street',
      x: 18 * 64 + 32,
      y: 2 * 64 + 30,
      radius: 78,
      label: '🚪 按 A 出門前往「香港社區街道」',
      emote: exitEmote
    });
  }

  private buildHkStreet(): void {
    for (let r = 0; r < 12; r++) {
      for (let c = 0; c < 20; c++) {
        const x = c * 64 + 32;
        const y = r * 64 + 32;
        if (c < 5) {
          this.add.image(x, y, 'tiles-street', (r + c) % 3 === 0 ? 1 : 0);
        } else if ((c === 5 || c === 6) && r <= 5) {
          this.add.image(x, y, 'tiles-street', 4);
        } else if (r === 0 && c >= 7) {
          this.add.image(x, y, 'tiles-home', 8);
        } else if (r === 1 && c >= 7) {
          if (c === 10) {
            this.add.image(x, y, 'tiles-street', gameState.isDone('spray_mosquito') ? 10 : 9);
          } else if (c === 12 || c === 13) {
            this.add.image(x, y, 'tiles-street', 11);
          } else {
            this.add.image(x, y, 'tiles-street', 8);
          }
        } else if (r === 2 && c >= 7) {
          if (c === 8 || c === 9) this.add.image(x, y, 'tiles-street', 13);
          else if (c === 12 || c === 13) this.add.image(x, y, 'tiles-street', 12);
          else if (c === 15) this.add.image(x, y, 'tiles-street', gameState.isDone('seal_rathole') ? 15 : 14);
          else this.add.image(x, y, 'tiles-street', 15);
        } else if (r <= 6) {
          this.add.image(x, y, 'tiles-street', 2);
        } else if (r === 7 && c >= 5) {
          this.add.image(x, y, 'tiles-street', 3);
        } else if (r >= 8 && c >= 5) {
          this.add.image(x, y, 'tiles-street', c === 10 || c === 11 ? 6 : 5);
        }
      }
    }

    this.addSolidBlock(7 * 64, 0, 13 * 64, 192);
    this.addSolidBlock(5 * 64, 8 * 64 + 12, 15 * 64, 240);

    const placeTree = (tc: number, tr: number) => {
      const d = (tr + 1) * 64;
      this.add.image(tc * 64 + 32, tr * 64 + 32, 'tiles-street', 24).setDepth(d);
      this.add.image((tc + 1) * 64 + 32, tr * 64 + 32, 'tiles-street', 25).setDepth(d);
      this.add.image(tc * 64 + 32, (tr + 1) * 64 + 32, 'tiles-street', 32).setDepth(d);
      this.add.image((tc + 1) * 64 + 32, (tr + 1) * 64 + 32, 'tiles-street', 33).setDepth(d);
      this.addSolidBlock(tc * 64 + 20, (tr + 1) * 64 + 12, 88, 44);
    };
    placeTree(0, 1);
    placeTree(0, 7);

    this.add.image(7 * 64 + 32, 5 * 64 + 32, 'tiles-street', 26).setDepth(420);
    this.add.image(7 * 64 + 32, 6 * 64 + 32, 'tiles-street', 34).setDepth(420);
    this.add.image(17 * 64 + 32, 3 * 64 + 32, 'tiles-street', 19).setDepth(230);
    this.add.image(18 * 64 + 32, 3 * 64 + 32, 'tiles-street', 20).setDepth(230);
    [6, 8, 9, 13, 14, 16, 17].forEach((rc) => {
      this.add.image(rc * 64 + 32, 7 * 64 + 20, 'tiles-street', 23).setDepth(470);
    });

    this.registerHotspot({
      id: 'go_home',
      x: 8 * 64 + 64,
      y: 3 * 64 + 24,
      radius: 75,
      label: '🏠 按 A 返回「溫馨家居」'
    });

    const recDone = gameState.isDone('recycle_bottles');
    const bottles = this.add.sprite(3 * 64 + 32, 5 * 64 + 24, 'tiles-street', recDone ? 17 : 21).setDepth(350);
    this.add.sprite(13 * 64 + 32, 6 * 64 + 12, 'tiles-street', recDone ? 17 : 16).setDepth(400);
    this.registerTaskHotspot('recycle_bottles', bottles.x, bottles.y, '🧴 按 A「收拾積水膠樽並分類回收」', bottles, 17);

    const mosDone = gameState.isDone('spray_mosquito');
    this.add.image(3 * 64 + 32, 3 * 64 + 16, 'tiles-street', 35).setDepth(215);
    const puddle = this.add.sprite(10 * 64 + 32, 3 * 64 + 28, 'tiles-street', mosDone ? 2 : 22).setDepth(195);
    if (!mosDone) {
      const m1 = this.add.sprite(3 * 64 + 32, 2 * 64 + 48, 'npcs', 20).setDepth(320).play('mosquito-fly');
      const m2 = this.add.sprite(10 * 64 + 32, 3 * 64 + 8, 'npcs', 20).setDepth(320).play('mosquito-fly');
      this.pestGroup.push(m1, m2);
    }
    this.registerTaskHotspot('spray_mosquito', 10 * 64 + 32, 3 * 64 + 28, '🦟 按 A「維修滴水冷氣與 DEET 滅蚊行動」', puddle, 2);

    const ratDone = gameState.isDone('seal_rathole');
    const wallHole = this.add.sprite(15 * 64 + 32, 2 * 64 + 32, 'tiles-street', ratDone ? 15 : 14).setDepth(170);
    if (!ratDone) {
      this.add.image(5 * 64 + 44, 3 * 64 + 32, 'tiles-street', 18).setDepth(230);
      const rat = this.add.sprite(6 * 64 + 16, 4 * 64 + 16, 'npcs', 24).setDepth(280).play('rat-scurry');
      this.tweens.add({ targets: rat, x: rat.x + 42, duration: 900, yoyo: true, repeat: -1 });
      this.pestGroup.push(rat);
    }
    this.registerTaskHotspot('seal_rathole', 15 * 64 + 32, 3 * 64 + 24, '🕳️ 按 A「用水泥及鐵絲網封堵鼠洞」', wallHole, 15);

    const fehd = this.add.sprite(17 * 64 + 32, 5 * 64 + 24, 'npcs', 0).setDepth(360);
    const fehdEmote = this.add.sprite(fehd.x, fehd.y - 48, 'npcs', 29).setDepth(900);
    this.tweens.add({ targets: fehdEmote, y: fehdEmote.y - 6, duration: 650, yoyo: true, repeat: -1 });
    this.registerHotspot({
      id: 'fehd_quiz',
      x: fehd.x,
      y: fehd.y,
      radius: 88,
      label: '👮 按 A 接受「食環署主任常識總考核」',
      emote: fehdEmote
    });
  }

  private registerHotspot(h: MapHotspot): void {
    this.hotspots.push(h);
  }

  private registerTaskHotspot(
    id: string,
    x: number,
    y: number,
    label: string,
    sprite: Phaser.GameObjects.Sprite,
    cleanFrame: number
  ): void {
    const done = gameState.isDone(id);
    const emote = this.add.sprite(x, y - 48, 'npcs', done ? 30 : 28).setDepth(950);
    this.tweens.add({ targets: emote, y: emote.y - 6, duration: 600, yoyo: true, repeat: -1 });
    this.hotspots.push({ id, x, y, radius: 84, label, sprite, cleanFrame, emote });
  }

  private handleActionButton(): void {
    if (this.minigames.isOpen) return;
    if (this.dialogueOpen) {
      this.closeDialogue();
      return;
    }
    if (!this.activeHotspot) return;

    const h = this.activeHotspot;
    if (h.id === 'talk_mom') {
      const rem = 5 - gameState.completedCount('home');
      this.openDialogue(
        '媽媽',
        rem > 0
          ? `加油呀 ${gameState.studentName}！家中仲有 ${rem} 項衛生任務未完成，做齊就可以由右上角大門出街啦！`
          : '屋企已經乾乾淨淨、防蚊又防鼠！快啲由右上角大門去社區街道幫食環署主任啦！'
      );
      return;
    }

    if (h.id === 'go_street') {
      if (gameState.completedCount('home') < 5) {
        sound.wrong();
        this.openDialogue('出門提示', '請先完成家中全部 5 項個人衛生、食物加蓋與清理花盆積水任務，再出門到街上冒險吧！');
      } else {
        sound.pop();
        this.buildMap('street');
        this.openDialogue('食環署廣播', '歡迎來到香港社區街道！請幫忙收拾積水膠樽、處理滴水冷氣與白紋伊蚊、封堵快餐店牆腳鼠洞，最後找食環署主任完成考核！');
      }
      return;
    }

    if (h.id === 'go_home') {
      sound.pop();
      this.buildMap('home');
      return;
    }

    if (h.id === 'fehd_quiz') {
      if (!gameState.allTasksDone()) {
        sound.wrong();
        this.openDialogue('食環署主任', `同學你好！請先完成街上同家中全部 8 項衛生清潔行動（目前已完成 ${gameState.completedCount()} / 8 項），再來找我進行最終常識認證吧！`);
        return;
      }
      this.minigames.open('fehd_quiz', () => {
        this.refreshHud();
        this.openDialogue(
          '食環署主任',
          `太出色了，${gameState.studentClass} 班 ${gameState.studentName} 同學！你已掌握個人衛生、防蚊及防鼠的所有知識，現在為你頒發彩雲聖若瑟小學「衛生防護小先鋒」榮譽證書！`,
          () => this.showCertificate()
        );
      });
      return;
    }

    if (gameState.isDone(h.id)) return;
    this.minigames.open(h.id, () => {
      const completed = gameState.completeTask(h.id);
      if (h.sprite && h.cleanFrame !== undefined) {
        h.sprite.setFrame(h.cleanFrame);
      }
      if (h.emote) {
        h.emote.setFrame(30);
      }
      if (h.id === 'spray_mosquito' || h.id === 'seal_rathole') {
        this.buildMap(gameState.currentMap);
      }
      this.refreshHud();
      if (completed) {
        this.openDialogue(`✅ 完成：${completed.title}`, completed.summary);
      }
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

  private refreshHud(): void {
    document.getElementById('hud-score')!.textContent = String(gameState.score);
    document.getElementById('hud-progress')!.textContent = `${gameState.completedCount()} / 8`;
    document.getElementById('hud-location-tag')!.textContent =
      gameState.currentMap === 'home'
        ? '📍 地點：溫馨家居（個人衛生、食物加蓋與花盆積水）'
        : '📍 地點：香港社區街道與公園（防蚊滅蚊、封堵鼠洞與食環署考核）';

    const listEl = document.getElementById('quest-list')!;
    listEl.innerHTML = '';
    gameState.tasks
      .filter((t) => t.map === gameState.currentMap)
      .forEach((t) => {
        const row = document.createElement('div');
        row.className = `q-item ${t.done ? 'done' : ''}`;
        row.textContent = `${t.done ? '✅' : '⬜'} [${t.category}] ${t.title}`;
        listEl.appendChild(row);
      });
  }

  private showCertificate(): void {
    document.getElementById('cert-student')!.textContent = `${gameState.studentClass} 班 ${gameState.studentName}`;
    document.getElementById('cert-final-score')!.textContent = String(gameState.score);
    document.getElementById('cert-rank')!.textContent =
      gameState.score >= 1200 ? '🌟 特級社區衛生防護大使' : '🏅 優異衛生小先鋒';
    const d = new Date();
    document.getElementById('cert-date')!.textContent = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
    document.getElementById('cert-overlay')!.classList.remove('hidden');
  }

  update(_time: number, delta: number): void {
    if (!this.hero || this.dialogueOpen || this.minigames.isOpen) {
      if (this.hero) {
        this.hero.setVelocity(0, 0);
        this.hero.play(`hero-idle-${this.facing}`, true);
      }
      return;
    }

    const mv = this.joystick.getMovementVector();
    const speed = mv.sprint ? 290 : 195;
    this.hero.setVelocity(mv.x * speed, mv.y * speed);

    if (Math.hypot(mv.x, mv.y) > 0.08) {
      if (Math.abs(mv.x) > Math.abs(mv.y)) {
        this.facing = mv.x < 0 ? 'left' : 'right';
      } else {
        this.facing = mv.y < 0 ? 'up' : 'down';
      }
      this.hero.play(`hero-walk-${this.facing}`, true);

      this.trail.push({ x: this.hero.x, y: this.hero.y });
      if (this.trail.length > 18) {
        const pt = this.trail.shift()!;
        this.companion.setPosition(pt.x, pt.y + 4);
        this.companion.setDepth(this.companion.y);
      }

      this.stepTimer += delta;
      if (this.stepTimer > (mv.sprint ? 210 : 300)) {
        this.stepTimer = 0;
        sound.step();
      }
    } else {
      this.hero.play(`hero-idle-${this.facing}`, true);
    }

    this.hero.setDepth(this.hero.y + 24);

    let nearest: MapHotspot | null = null;
    let bestDist = Infinity;
    for (const h of this.hotspots) {
      if (gameState.isDone(h.id)) continue;
      const dist = Phaser.Math.Distance.Between(this.hero.x, this.hero.y, h.x, h.y);
      if (dist <= h.radius && dist < bestDist) {
        bestDist = dist;
        nearest = h;
      }
    }

    this.activeHotspot = nearest;
    if (nearest) {
      this.promptTag.setText(nearest.label);
      this.promptTag.setPosition(nearest.x, nearest.y - 72);
      this.promptTag.setVisible(true);
    } else {
      this.promptTag.setVisible(false);
    }
  }
}
