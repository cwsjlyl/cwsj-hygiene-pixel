# 彩雲衛生小先鋒 (`cwsj-hygiene-pixel`)

專為**彩雲聖若瑟小學（Choi Wan St. Joseph's Primary School）小學四年級常識科**設計的 **720p (`1280×720`) 單畫面像素風 RPG 教育網頁遊戲**，對齊 `qing-shengshi-pixel` 的 **Vite + TypeScript + Phaser 3** 模組化架構與 NDS《寶可夢 金心／銀魂》2.5D 像素視覺體驗。

## ✨ 核心特色

- **學校專屬品牌與角色還原**：
  - 左上角常駐高清彩雲聖若瑟小學校徽（`public/assets/ui/cwsj-logo.svg`）。
  - 主角精靈圖（`public/assets/sprites/char-student-boy.png`）依據「男學生 pose 03」繪製：微翹瀏海、開領白校服配彩雲胸袋校章、藍色校服短褲、白襪黑皮鞋及待機雙手叉腰姿勢，並配備寶可夢式跟隨「潔淨水滴精靈」。
- **iPad 觸控與王者榮耀式雙環虛擬搖桿**：
  - 左下角配備 360° 雙環虛擬拉杆，右下角設寬大 `A 互動` 與 `B 衝刺` 按鈕（同時支援電腦鍵盤 `WASD`／方向鍵與空白鍵）。
- **雲端全自動無損像素圖集產出**：
  - 內建零外部依賴 Node.js PNG 圖集產生器 `scripts/generate-pixel-assets.mjs`，執行 `npm run dev` 或 `npm run build` 時自動產出全部透明背景 `.png` 角色精靈圖與雙場景 2.5D 地磚圖集至 `public/assets/`。
- **雙地圖場景 ＋ 8 個常識小遊戲 ＋ 食環署終極考核**：
  1. **溫馨家居**：回家用梘液洗手 20 秒、早晚刷牙除牙菌膜、定時修剪指甲、妥善加蓋食物防鼠、清理露台花盆底盤積水防白紋伊蚊。
  2. **香港社區街道與公園**：收拾棄置積水膠樽投入啡色塑膠回收箱、維修滴水冷氣與塗抹 DEET 驅蚊劑滅蚊、以水泥及金屬鐵絲網封堵快餐店外牆鼠洞，最後完成**食物環境衞生署（FEHD）**主任常識考核並獲發專屬嘉許證書。

## 🚀 本地開發與 GitHub Pages 部署

```bash
npm install
npm run dev     # 自動生成 public/assets/*.png 並啟動開發伺服器
npm run build   # 自動生成圖集、TypeScript 嚴格檢查並輸出 dist/
```

合併 PR 至 `main` 後，於 GitHub 倉庫 **Settings → Pages → Build and deployment** 將 Source 設為 **GitHub Actions** 即可自動發佈。
