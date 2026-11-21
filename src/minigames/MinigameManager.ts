import { sound } from '../audio/RetroSound';
import { gameState } from '../state/gameState';

export class MinigameManager {
  private modal = document.getElementById('minigame-modal')!;
  private titleEl = document.getElementById('mg-title')!;
  private badgeEl = document.getElementById('mg-badge')!;
  private bodyEl = document.getElementById('mg-body')!;
  public isOpen = false;

  open(taskId: string, onSuccess: () => void): void {
    this.isOpen = true;
    this.modal.classList.remove('hidden');
    this.bodyEl.innerHTML = '';

    switch (taskId) {
      case 'wash_hands':
        this.runWashHands(onSuccess);
        break;
      case 'brush_teeth':
        this.runBrushTeeth(onSuccess);
        break;
      case 'trim_nails':
        this.runTrimNails(onSuccess);
        break;
      case 'cover_food':
        this.runCoverFood(onSuccess);
        break;
      case 'clear_saucer':
        this.runClearSaucer(onSuccess);
        break;
      case 'recycle_bottles':
        this.runRecycleBottles(onSuccess);
        break;
      case 'spray_mosquito':
        this.runSprayMosquito(onSuccess);
        break;
      case 'seal_rathole':
        this.runSealRatHole(onSuccess);
        break;
      case 'fehd_quiz':
        this.runFehdFinalQuiz(onSuccess);
        break;
    }
  }

  close(): void {
    this.isOpen = false;
    this.modal.classList.add('hidden');
    this.bodyEl.innerHTML = '';
  }

  private runWashHands(done: () => void): void {
    this.titleEl.textContent = '🧼 回家洗手大作戰（20秒潔手挑戰）';
    this.badgeEl.textContent = '個人衛生';
    this.bodyEl.innerHTML = `
      <div class="mg-tip">常識知識：外出回家、進食前和如廁後，要用梘液和清水搓洗雙手最少 20 秒！請輕觸消滅全部 <strong>8 隻手部病菌怪</strong>！</div>
      <div class="mg-stage" id="germ-stage"></div>
      <div>已沖走病菌：<strong id="germ-cnt">0</strong> / 8</div>
    `;
    const stage = document.getElementById('germ-stage')!;
    let cleared = 0;
    for (let i = 0; i < 8; i++) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.style.cssText = `position:absolute;left:${8 + (i % 4) * 23}%;top:${18 + Math.floor(i / 4) * 44}%;width:64px;height:64px;border-radius:50%;border:2px solid #93c5fd;background:rgba(56,189,248,0.25);font-size:30px;cursor:pointer;`;
      btn.textContent = '🦠';
      btn.addEventListener('pointerdown', () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = '🫧';
        btn.style.opacity = '0.35';
        sound.pop();
        cleared++;
        document.getElementById('germ-cnt')!.textContent = String(cleared);
        if (cleared >= 8) {
          sound.success();
          window.setTimeout(() => { this.close(); done(); }, 350);
        }
      });
      stage.appendChild(btn);
    }
  }

  private runBrushTeeth(done: () => void): void {
    this.titleEl.textContent = '🪥 早晚刷牙：清除黃色牙菌膜';
    this.badgeEl.textContent = '個人衛生';
    this.bodyEl.innerHTML = `
      <div class="mg-tip">常識知識：每天早晚刷牙，可清除牙菌膜、預防蛀牙及牙周病！請用手指或滑鼠<strong>來回擦拭全部 8 顆黃色牙齒</strong>令它們回復潔白！</div>
      <div id="teeth-row" style="display:grid;grid-template-columns:repeat(4,72px);gap:12px;margin:18px 0;"></div>
      <div>潔白牙齒：<strong id="tooth-cnt">0</strong> / 8</div>
    `;
    const row = document.getElementById('teeth-row')!;
    let clean = 0;
    for (let i = 0; i < 8; i++) {
      const t = document.createElement('div');
      t.style.cssText = 'width:72px;height:64px;background:#fde047;border:4px solid #cbd5e1;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:26px;cursor:pointer;';
      t.textContent = '🦷';
      const scrub = () => {
        if (t.dataset.clean === '1') return;
        t.dataset.clean = '1';
        t.style.background = '#ffffff';
        t.style.borderColor = '#38bdf8';
        t.textContent = '✨';
        sound.pop();
        clean++;
        document.getElementById('tooth-cnt')!.textContent = String(clean);
        if (clean >= 8) {
          sound.success();
          window.setTimeout(() => { this.close(); done(); }, 350);
        }
      };
      t.addEventListener('pointerdown', scrub);
      t.addEventListener('pointerenter', (e) => { if (e.buttons > 0) scrub(); });
      row.appendChild(t);
    }
  }

  private runTrimNails(done: () => void): void {
    this.titleEl.textContent = '💅 定時修剪指甲：防止細菌藏匿';
    this.badgeEl.textContent = '個人衛生';
    this.bodyEl.innerHTML = `
      <div class="mg-tip">常識知識：指甲過長容易藏匿污垢和細菌！當紅色指針移入中央<strong>綠色安全區</strong>時按下「修剪指甲」（完成 3 次）！</div>
      <div style="width:85%;max-width:520px;height:38px;background:#1e293b;border:3px solid #cbd5e1;border-radius:999px;position:relative;overflow:hidden;margin:18px 0;">
        <div style="position:absolute;left:38%;width:24%;top:0;bottom:0;background:#10b981;"></div>
        <div id="nail-bar" style="position:absolute;left:0%;width:12px;top:0;bottom:0;background:#ef4444;"></div>
      </div>
      <button id="btn-clip-now" type="button" class="primary-cta" style="max-width:240px;">✂️ 修剪指甲（0 / 3）</button>
    `;
    const bar = document.getElementById('nail-bar')!;
    const btn = document.getElementById('btn-clip-now')!;
    let pos = 10, dir = 2.1, hits = 0;
    const step = () => {
      if (!this.isOpen) return;
      pos += dir;
      if (pos >= 96 || pos <= 2) dir = -dir;
      bar.style.left = `${pos}%`;
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
    btn.addEventListener('pointerdown', () => {
      if (pos >= 36 && pos <= 62) {
        hits++;
        sound.pop();
        btn.textContent = `✂️ 修剪指甲（${hits} / 3）`;
        dir = dir > 0 ? dir + 0.5 : dir - 0.5;
        if (hits >= 3) {
          sound.success();
          window.setTimeout(() => { this.close(); done(); }, 300);
        }
      } else {
        sound.wrong();
      }
    });
  }

  private runCoverFood(done: () => void): void {
    this.runQuizCard(
      '🍲 家居防鼠：妥善處理餐桌食物',
      '防鼠',
      '餐桌上放着未吃完的餸菜，如果沒有妥善處理，會引來老鼠偷食甚至傳播「鼠疫」！我們應該怎樣做？',
      [
        { label: 'A. 用防塵食物罩妥善加蓋食物，並把廚餘丟入有蓋垃圾桶', ok: true },
        { label: 'B. 打開窗戶讓氣味吹散，食物直接放在桌上過夜', ok: false },
        { label: 'C. 把吃剩的骨頭放在廚房地上餵小動物', ok: false }
      ],
      done
    );
  }

  private runClearSaucer(done: () => void): void {
    this.runQuizCard(
      '🪴 家居防蚊：清理露台花盆底盤積水',
      '防蚊',
      '露台花盆底盤積了一層清水！在香港，哪一種蚊子最喜歡在清潔的靜止積水中產卵，並會傳播「登革熱」？',
      [
        { label: 'A. 雌性白紋伊蚊（身體及腳部有明顯黑白斑紋）', ok: true },
        { label: 'B. 只吸食花蜜的雄性蚊子', ok: false },
        { label: 'C. 蜜蜂與蝴蝶', ok: false }
      ],
      done
    );
  }

  private runRecycleBottles(done: () => void): void {
    this.runQuizCard(
      '♻️ 社區清潔：清理積水膠樽與分類回收',
      '防蚊與環境衛生',
      '公園草地和滿瀉垃圾桶旁有棄置的塑膠水樽，樽內積水極易孳生蚊蟲！清空積水後，塑膠樽應放入哪種顏色的香港分類回收箱？',
      [
        { label: 'A. 藍色回收箱（廢紙）', ok: false },
        { label: 'B. 黃色回收箱（金屬鋁罐）', ok: false },
        { label: 'C. 啡色回收箱（塑膠樽 —「藍廢紙、黃鋁罐、啡膠樽」）', ok: true }
      ],
      done
    );
  }

  private runSprayMosquito(done: () => void): void {
    this.titleEl.textContent = '🦟 戶外滅蚊防蚊行動（DEET 驅蚊劑防護）';
    this.badgeEl.textContent = '防蚊';
    this.bodyEl.innerHTML = `
      <div class="mg-tip">常識知識：避免在叢林陰暗處逗留，外露皮膚應塗上含<strong>避蚊胺（DEET）</strong>的驅蚊劑，並維修滴水冷氣機！請點擊消滅 <strong>6 隻飛舞的白紋伊蚊</strong>！</div>
      <div class="mg-stage" id="mos-stage" style="background:#064e3b;"></div>
      <div>已消滅白紋伊蚊：<strong id="mos-cnt">0</strong> / 6</div>
    `;
    const stage = document.getElementById('mos-stage')!;
    let kills = 0;
    const spawnOne = () => {
      if (!this.isOpen || kills >= 6) return;
      const m = document.createElement('button');
      m.type = 'button';
      m.style.cssText = `position:absolute;left:${10 + Math.random() * 75}%;top:${12 + Math.random() * 64}%;width:62px;height:62px;border-radius:50%;border:2px solid #6ee7b7;background:rgba(15,23,42,0.75);font-size:28px;cursor:pointer;`;
      m.textContent = '🦟';
      m.addEventListener('pointerdown', () => {
        if (m.disabled) return;
        m.disabled = true;
        m.remove();
        sound.pop();
        kills++;
        document.getElementById('mos-cnt')!.textContent = String(kills);
        if (kills >= 6) {
          sound.success();
          window.setTimeout(() => { this.close(); done(); }, 300);
        } else {
          spawnOne();
        }
      });
      stage.appendChild(m);
    };
    for (let i = 0; i < 3; i++) spawnOne();
  }

  private runSealRatHole(done: () => void): void {
    this.runQuizCard(
      '🕳️ 社區防鼠：封堵店舖外牆破損鼠洞',
      '防鼠',
      '漢堡快餐店牆腳出現破損鼠洞，後巷亦堆積垃圾！老鼠門齒終生生長、非常堅硬，我們應用甚麼物料封堵鼠洞最有效？',
      [
        { label: 'A. 塞入舊報紙和膠紙封口', ok: false },
        { label: 'B. 用紙皮箱和布碎遮擋洞口', ok: false },
        { label: 'C. 用水泥修補裂縫並加裝堅固金屬鐵絲網，同時清理後巷垃圾', ok: true }
      ],
      done
    );
  }

  private runFehdFinalQuiz(done: () => void): void {
    const qs = [
      {
        q: '第 1 / 3 題：在香港，負責保持社區環境清潔、防治蚊患鼠患及管理街道垃圾桶的主要政府部門是？',
        opts: [
          { label: 'A. 食物環境衞生署（食環署 FEHD）', ok: true },
          { label: 'B. 香港天文台', ok: false },
          { label: 'C. 運輸署', ok: false }
        ]
      },
      {
        q: '第 2 / 3 題：保持良好個人衛生及家居、社區環境整潔，對我們健康最重要的幫助是？',
        opts: [
          { label: 'A. 只為了令街道拍照更好看', ok: false },
          { label: 'B. 杜絕病菌與蚊鼠傳播媒介，大幅減低患上登革熱、鼠疫等傳染病的機會', ok: true },
          { label: 'C. 可以不用做運動', ok: false }
        ]
      },
      {
        q: '第 3 / 3 題：作為小學四年級學生，以下哪一項是維持社區衛生的正確公民行為？',
        opts: [
          { label: 'A. 把飲完的紙包飲品隨手放在街燈旁', ok: false },
          { label: 'B. 不亂拋垃圾、妥善包好垃圾放入有蓋垃圾桶，並積極參與三色回收', ok: true },
          { label: 'C. 看見花盆積水不用理會', ok: false }
        ]
      }
    ];
    let idx = 0;
    const nextQ = () => {
      if (idx >= qs.length) {
        gameState.score += 200;
        gameState.fehdQuizPassed = true;
        sound.success();
        this.close();
        done();
        return;
      }
      const cur = qs[idx];
      this.runQuizCard('👮 食環署主任終極常識考核', `考核 ${idx + 1}/3`, cur.q, cur.opts, () => {
        idx++;
        nextQ();
      }, false);
    };
    nextQ();
  }

  private runQuizCard(
    title: string,
    badge: string,
    question: string,
    options: { label: string; ok: boolean }[],
    onPass: () => void,
    autoClose = true
  ): void {
    this.titleEl.textContent = title;
    this.badgeEl.textContent = badge;
    this.bodyEl.innerHTML = `
      <div class="mg-tip" style="font-size:17px;font-weight:700;color:#ffffff;">${question}</div>
      <div class="mg-choice-list" id="mg-opts"></div>
      <div id="mg-feedback" style="margin-top:12px;font-weight:800;min-height:24px;color:#fca5a5;"></div>
    `;
    const list = document.getElementById('mg-opts')!;
    const fb = document.getElementById('mg-feedback')!;
    options.forEach((opt) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mg-choice-btn';
      b.textContent = opt.label;
      b.addEventListener('pointerdown', () => {
        if (opt.ok) {
          sound.pop();
          if (autoClose) {
            sound.success();
            this.close();
          }
          onPass();
        } else {
          sound.wrong();
          fb.textContent = '⚠️ 再想一想！請根據課堂常識選出最正確的衛生做法。';
        }
      });
      list.appendChild(b);
    });
  }
}
