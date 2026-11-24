/**
 * World Collisions & Lightweight 2D Grid BFS Pathfinder
 * - Blocks all Home exterior & interior partition walls (keeping room doorways passable)
 * - Blocks HK Street river/canal (except the Stone Arch Bridge walkway) and all buildings/props
 * - Supports compact 1280x720 single-screen iPad Street scaling (sx, sy)
 */
export interface WorldRect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export type AddFootColliderFn = (cx: number, cy: number, w: number, h: number) => void;

function emitWorldRect(rect: WorldRect, addCollider: AddFootColliderFn, out: WorldRect[]): void {
  const w = Math.max(4, Math.round(rect.x2 - rect.x1));
  const h = Math.max(4, Math.round(rect.y2 - rect.y1));
  const cx = Math.round(rect.x1 + w / 2);
  const cy = Math.round(rect.y1 + h / 2);
  addCollider(cx, cy, w, h);
  out.push({ x1: cx - w / 2, y1: cy - h / 2, x2: cx + w / 2, y2: cy + h / 2 });
}

export function buildHomeWallColliders(
  hx: (x1902: number) => number,
  hy: (y1380: number) => number,
  addCollider: AddFootColliderFn
): WorldRect[] {
  const out: WorldRect[] = [];
  const add1902 = (x1: number, y1: number, x2: number, y2: number): void => {
    emitWorldRect({ x1: hx(x1), y1: hy(y1), x2: hx(x2), y2: hy(y2) }, addCollider, out);
  };

  add1902(0, 0, 1902, 138);
  add1902(0, 0, 88, 1380);
  add1902(1814, 0, 1902, 1380);
  add1902(0, 988, 748, 1380);
  add1902(1172, 988, 1902, 1380);
  add1902(720, 988, 768, 1380);
  add1902(1152, 988, 1200, 1380);
  add1902(720, 1272, 1200, 1380);

  add1902(418, 120, 448, 350);
  add1902(275, 472, 688, 524);
  add1902(664, 472, 694, 620);
  add1902(664, 760, 694, 995);
  add1902(926, 120, 956, 476);
  add1902(926, 450, 1038, 484);
  add1902(1168, 450, 1346, 484);
  add1902(1318, 120, 1348, 500);
  add1902(1475, 498, 1820, 544);
  add1902(928, 646, 1095, 692);
  add1902(1215, 646, 1362, 692);
  add1902(928, 646, 958, 995);
  add1902(1336, 646, 1366, 995);

  return out;
}

export function buildStreetWorldColliders(
  sx: (x1408: number) => number,
  sy: (y768: number) => number,
  addCollider: AddFootColliderFn
): WorldRect[] {
  const out: WorldRect[] = [];
  const add1408 = (x1: number, y1: number, x2: number, y2: number): void => {
    emitWorldRect({ x1: sx(x1), y1: sy(y1), x2: sx(x2), y2: sy(y2) }, addCollider, out);
  };

  // 1. River / Canal (only Stone Arch Bridge walkway y:346..396 is passable)
  add1408(1138, 0, 1322, 342);
  add1408(1138, 398, 1322, 768);
  add1408(1134, 328, 1326, 344);
  add1408(1134, 396, 1326, 412);

  // 2. Buildings & Major Architectural Structures
  add1408(824, 0, 1138, 294);
  add1408(782, 436, 1138, 510);
  add1408(0, 445, 385, 768);
  add1408(0, 0, 580, 152);
  add1408(580, 0, 824, 182);
  add1408(580, 145, 632, 268);
  add1408(776, 145, 826, 268);

  // 3. Map Outer Borders
  add1408(0, 0, 42, 768);
  add1408(1382, 0, 1408, 768);
  add1408(0, 742, 1408, 768);

  // 4. Solid Foreground Prop Footprints
  add1408(142, 232, 174, 262);
  add1408(270, 212, 352, 262);
  add1408(398, 198, 486, 232);
  add1408(238, 298, 350, 334);
  add1408(438, 330, 546, 350);
  add1408(862, 330, 971, 350);
  add1408(1008, 635, 1086, 698);

  return out;
}

export function findWalkablePath(
  startFx: number,
  startFy: number,
  goalFx: number,
  goalFy: number,
  worldW: number,
  worldH: number,
  obstacles: readonly WorldRect[],
  cellSize = 16,
  padX = 10,
  padY = 7
): Array<{ x: number; y: number }> {
  const cols = Math.max(8, Math.ceil(worldW / cellSize));
  const rows = Math.max(8, Math.ceil(worldH / cellSize));
  const blocked = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const cy = (r + 0.5) * cellSize;
    if (cy < 16 || cy > worldH - 14) {
      for (let c = 0; c < cols; c++) blocked[r * cols + c] = 1;
      continue;
    }
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cellSize;
      if (cx < 16 || cx > worldW - 16) {
        blocked[r * cols + c] = 1;
        continue;
      }
      for (let i = 0; i < obstacles.length; i++) {
        const ob = obstacles[i];
        if (cx + padX > ob.x1 && cx - padX < ob.x2 && cy + padY > ob.y1 && cy - padY < ob.y2) {
          blocked[r * cols + c] = 1;
          break;
        }
      }
    }
  }

  const clampCell = (x: number, y: number): [number, number] => [
    Math.max(0, Math.min(cols - 1, Math.floor(x / cellSize))),
    Math.max(0, Math.min(rows - 1, Math.floor(y / cellSize)))
  ];

  const findNearestFree = (sc: number, sr: number): [number, number] | null => {
    if (!blocked[sr * cols + sc]) return [sc, sr];
    for (let rad = 1; rad <= 12; rad++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dr = -rad; dr <= rad; dr++) {
        for (let dc = -rad; dc <= rad; dc++) {
          const nc = sc + dc;
          const nr = sr + dr;
          if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
          if (!blocked[nr * cols + nc]) {
            const d = dc * dc + dr * dr;
            if (d < bestD) {
              bestD = d;
              best = [nc, nr];
            }
          }
        }
      }
      if (best) return best;
    }
    return null;
  };

  const [sc0, sr0] = clampCell(startFx, startFy);
  const [gc0, gr0] = clampCell(goalFx, goalFy);
  const startCell = findNearestFree(sc0, sr0);
  const goalCell = findNearestFree(gc0, gr0);
  if (!startCell || !goalCell) return [{ x: goalFx, y: goalFy }];

  const [sc, sr] = startCell;
  const [gc, gr] = goalCell;
  if (sc === gc && sr === gr) {
    return [{ x: (gc + 0.5) * cellSize, y: (gr + 0.5) * cellSize }];
  }

  const prev = new Int32Array(cols * rows).fill(-1);
  const visited = new Uint8Array(cols * rows);
  const queue = new Int32Array(cols * rows);
  let head = 0;
  let tail = 0;

  const startIdx = sr * cols + sc;
  const goalIdx = gr * cols + gc;
  visited[startIdx] = 1;
  queue[tail++] = startIdx;

  const dirs = [
    [1, 0], [-1, 0], [0, 1], [0, -1],
    [1, 1], [1, -1], [-1, 1], [-1, -1]
  ];

  let found = false;
  while (head < tail) {
    const cur = queue[head++];
    if (cur === goalIdx) {
      found = true;
      break;
    }
    const cr = Math.floor(cur / cols);
    const cc = cur - cr * cols;
    for (let d = 0; d < 8; d++) {
      const dc = dirs[d][0];
      const dr = dirs[d][1];
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nIdx = nr * cols + nc;
      if (visited[nIdx] || blocked[nIdx]) continue;
      if (dc !== 0 && dr !== 0) {
        if (blocked[cr * cols + nc] || blocked[nr * cols + cc]) continue;
      }
      visited[nIdx] = 1;
      prev[nIdx] = cur;
      queue[tail++] = nIdx;
    }
  }

  if (!found) return [];

  const rawCells: Array<[number, number]> = [];
  let trace = goalIdx;
  while (trace !== -1 && trace !== startIdx) {
    const tr = Math.floor(trace / cols);
    const tc = trace - tr * cols;
    rawCells.push([tc, tr]);
    trace = prev[trace];
  }
  rawCells.reverse();

  const hasLineOfSight = (c1: number, r1: number, c2: number, r2: number): boolean => {
    const steps = Math.max(Math.abs(c2 - c1), Math.abs(r2 - r1)) * 2;
    if (steps <= 1) return true;
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const mc = Math.round(c1 + (c2 - c1) * t);
      const mr = Math.round(r1 + (r2 - r1) * t);
      if (blocked[mr * cols + mc]) return false;
    }
    return true;
  };

  const smooth: Array<{ x: number; y: number }> = [];
  let anchor: [number, number] = [sc, sr];
  let idx = 0;
  while (idx < rawCells.length) {
    let furthest = idx;
    for (let j = rawCells.length - 1; j > idx; j--) {
      if (hasLineOfSight(anchor[0], anchor[1], rawCells[j][0], rawCells[j][1])) {
        furthest = j;
        break;
      }
    }
    const chosen = rawCells[furthest];
    smooth.push({ x: (chosen[0] + 0.5) * cellSize, y: (chosen[1] + 0.5) * cellSize });
    anchor = chosen;
    idx = furthest + 1;
  }

  return smooth;
}
