export type MapId = 'home' | 'street';

export interface HygieneTask {
  id: string;
  map: MapId;
  title: string;
  category: '個人衛生' | '防蚊' | '防鼠';
  points: number;
  done: boolean;
  summary: string;
}

export const INITIAL_TASKS: HygieneTask[] = [
  {
    id: 'wash_hands',
    map: 'home',
    title: '回家用梘液洗手 20 秒',
    category: '個人衛生',
    points: 120,
    done: false,
    summary: '外出回家、進食前及如廁後用梘液和清水搓洗雙手至少 20 秒，能有效沖走病菌，減低患上傳染病的機會！'
  },
  {
    id: 'brush_teeth',
    map: 'home',
    title: '早晚刷牙清除牙菌膜',
    category: '個人衛生',
    points: 120,
    done: false,
    summary: '每天早晚刷牙能清除牙齒表面的牙菌膜，預防蛀牙與牙周病，保持口腔清潔健康！'
  },
  {
    id: 'trim_nails',
    map: 'home',
    title: '定時修剪過長指甲',
    category: '個人衛生',
    points: 120,
    done: false,
    summary: '過長的指甲容易藏污納垢及匿藏細菌，定時修剪指甲可避免病菌隨食物進入身體！'
  },
  {
    id: 'cover_food',
    map: 'home',
    title: '妥善加蓋餐桌食物與廚餘',
    category: '防鼠',
    points: 140,
    done: false,
    summary: '妥善貯存和加蓋食物，並把垃圾放入有蓋垃圾桶，就能斷絕老鼠的食物來源（斷絕「食」路）！'
  },
  {
    id: 'clear_saucer',
    map: 'home',
    title: '清理露台花盆底盤積水',
    category: '防蚊',
    points: 150,
    done: false,
    summary: '雌性白紋伊蚊喜歡在細小、清潔的靜止積水中產卵並傳播登革熱。每星期清理花盆底盤積水可杜絕蚊蟲滋生！'
  },
  {
    id: 'recycle_bottles',
    map: 'street',
    title: '清理積水膠樽與滿瀉垃圾',
    category: '防蚊',
    points: 150,
    done: false,
    summary: '棄置空樽和飯盒容易積水滋生白紋伊蚊，亂拋垃圾亦會引來老鼠。膠樽清空後應投入啡色塑膠回收箱！'
  },
  {
    id: 'spray_mosquito',
    map: 'street',
    title: '處理滴水冷氣與戶外防蚊作戰',
    category: '防蚊',
    points: 160,
    done: false,
    summary: '維修滴水冷氣機可消除街頭積水；到樹木茂密處避免逗留，並在外露皮膚塗上含避蚊胺（DEET）的驅蚊劑！'
  },
  {
    id: 'seal_rathole',
    map: 'street',
    title: '封堵快餐店外牆破損鼠洞',
    category: '防鼠',
    points: 160,
    done: false,
    summary: '老鼠攀爬力強且門齒堅硬，更會傳播鼠疫。用水泥及金屬鐵絲網封堵牆腳裂縫，能徹底斷絕老鼠通道！'
  }
];

export class GameState {
  studentName = '陳小明';
  studentClass = '4A';
  score = 0;
  currentMap: MapId = 'home';
  fehdQuizPassed = false;
  tasks: HygieneTask[] = INITIAL_TASKS.map((t) => ({ ...t }));

  reset(): void {
    this.score = 0;
    this.currentMap = 'home';
    this.fehdQuizPassed = false;
    this.tasks = INITIAL_TASKS.map((t) => ({ ...t }));
  }

  isDone(id: string): boolean {
    return this.tasks.find((t) => t.id === id)?.done ?? false;
  }

  completeTask(id: string): HygieneTask | undefined {
    const task = this.tasks.find((t) => t.id === id);
    if (task && !task.done) {
      task.done = true;
      this.score += task.points;
    }
    return task;
  }

  completedCount(map?: MapId): number {
    return this.tasks.filter((t) => (map ? t.map === map : true) && t.done).length;
  }

  allTasksDone(): boolean {
    return this.tasks.every((t) => t.done);
  }
}

export const gameState = new GameState();
