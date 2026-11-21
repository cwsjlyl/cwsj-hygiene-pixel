export type MapId = 'home' | 'street';
export type MedalRank = 'none' | 'bronze' | 'silver' | 'gold';

export interface HygieneTask {
  id: string;
  map: MapId;
  room: string;
  title: string;
  category: '個人衛生' | '防蚊' | '防鼠';
  points: number;
  done: boolean;
  medal: MedalRank;
  summary: string;
}

export const INITIAL_TASKS: HygieneTask[] = [
  {
    id: 'wash_hands', map: 'home', room: '浴室',
    title: '泡泡滅菌：梘液洗手 20 秒', category: '個人衛生', points: 150, done: false, medal: 'none',
    summary: '外出回家、進食前及如廁後用梘液搓洗雙手最少 20 秒，能沖走手部病毒與細菌，減低患上傳染病機會！'
  },
  {
    id: 'brush_teeth', map: 'home', room: '浴室',
    title: '護齒大掃除：清除黃色牙菌膜', category: '個人衛生', points: 150, done: false, medal: 'none',
    summary: '每天早晚使用含氟牙膏刷牙，徹底刷走牙齒表面的牙菌膜與蛀牙菌，預防蛀牙及牙周病！'
  },
  {
    id: 'trim_nails', map: 'home', room: '小明睡房',
    title: '節奏剪甲王：修剪藏垢長指甲', category: '個人衛生', points: 150, done: false, medal: 'none',
    summary: '過長指甲極易藏匿污垢和細菌，定時修剪指甲可避免病菌隨食物進入人體！'
  },
  {
    id: 'cover_food', map: 'home', room: '飯廳與廚房',
    title: '餐桌保衛戰：蓋好食物防老鼠', category: '防鼠', points: 160, done: false, medal: 'none',
    summary: '妥善貯存並用食物罩蓋好食物、把廚餘放入有蓋垃圾桶，可斷絕老鼠「食」路，預防鼠疫傳播！'
  },
  {
    id: 'clear_saucer', map: 'home', room: '陽光露台',
    title: '倒積水滅孑孓：清理花盆底盤', category: '防蚊', points: 160, done: false, medal: 'none',
    summary: '雌性白紋伊蚊喜愛在清潔靜止的積水產卵並傳播登革熱。每星期清理花盆底盤積水可杜絕孑孓羽化！'
  },
  {
    id: 'recycle_bottles', map: 'street', room: '彩雲公園',
    title: '三色回收快手：清走積水膠樽', category: '防蚊', points: 170, done: false, medal: 'none',
    summary: '棄置水樽容易積水孳生蚊蟲，亂拋垃圾亦會引來老鼠。謹記「藍廢紙、黃鋁罐、啡膠樽」，妥善分類回收！'
  },
  {
    id: 'spray_mosquito', map: 'street', room: '街道與公園叢林',
    title: '冷氣止漏 ＋ DEET 驅蚊射擊', category: '防蚊', points: 180, done: false, medal: 'none',
    summary: '維修滴水冷氣機可消除街頭積水；在戶外避免於叢林陰暗處逗留，外露皮膚應塗上含避蚊胺（DEET）的驅蚊劑！'
  },
  {
    id: 'seal_rathole', map: 'street', room: '快餐店與後巷',
    title: '防鼠三部曲：水泥鐵網封鼠洞', category: '防鼠', points: 180, done: false, medal: 'none',
    summary: '老鼠門齒堅硬且攀爬力強。先清理後巷垃圾，再用水泥及堅固金屬鐵絲網封堵牆腳鼠洞，才能徹底杜絕鼠患！'
  }
];

export class GameState {
  studentName = '陳小明';
  studentClass = '4A';
  score = 0;
  currentMap: MapId = 'home';
  currentRoom = '溫馨客廳';
  fehdQuizPassed = false;
  tasks: HygieneTask[] = INITIAL_TASKS.map((t) => ({ ...t }));

  reset(): void {
    this.score = 0;
    this.currentMap = 'home';
    this.currentRoom = '溫馨客廳';
    this.fehdQuizPassed = false;
    this.tasks = INITIAL_TASKS.map((t) => ({ ...t }));
  }

  isDone(id: string): boolean {
    return this.tasks.find((t) => t.id === id)?.done ?? false;
  }

  completeTask(id: string, medal: MedalRank = 'gold', bonus = 0): HygieneTask | undefined {
    const task = this.tasks.find((t) => t.id === id);
    if (task && !task.done) {
      task.done = true;
      task.medal = medal;
      this.score += task.points + bonus;
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
