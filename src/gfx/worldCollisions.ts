/**
 * World Collisions & Lightweight 2D Grid BFS Pathfinder
 * - Blocks all Home exterior & interior partition walls (keeping room doorways passable)
 * - Blocks HK Street river/canal (except the Stone Arch Bridge walkway) and all buildings/props
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

/**
 * Registers all Home exterior walls, balcony railings, and 8-room interior partition walls.
 * Input helper `hx` / `hy` map 1902x1380 Home coordinates to compact world coordinates.
 */
export function buildHomeWallColliders(
  hx: (x1902: number) => number,
  hy: (y1380: number) => number,
  addCollider: AddFootColliderFn
): WorldRect[] {
  const out: WorldRect[] = [];
  const add1902 = (x1: number, y1: number, x2: number, y2: number): void => {
    emitWorldRect({ x1: hx(x1), y1: hy(y1), x2: hx(x2), y2: hy(y2) }, addCollider, out);
  };

  // 1. Exterior perimeter walls & T-shaped balcony cutouts
  add1902(0, 0, 1902, 138);        // Top exterior wall
  add1902(0, 0, 88, 1380);         // Left exterior wall
  add1902(1814, 0, 1902, 1380);    // Right exterior wall
  add1902(0, 988, 748, 1380);      // Bottom-left living room wall & outer void
  add1902(1172, 988, 1902, 1380);  // Bottom-right bathroom/bedroom wall & outer void
  add1902(720, 988, 768, 1380);    // Balcony left wall/railing
  add1902(1152, 988, 1200, 1380);  // Balcony right wall/railing
  add1902(720, 1272, 1200, 1380);  // Balcony bottom railing

  // 2. Interior partition walls between the 8 rooms (with wide passable doorways)
  // Foyer | Kitchen & Dining (doorway open y: 350..472)
  add1902(418, 120, 448, 350);

  // Foyer/Dining | Living Room TV wall (left foyer entry x: 88..275, right corridor x: 688..926)
  add1902(275, 472, 688, 524);

  // Living Room | Central Corridor (central doorway open y: 620..760)
  add1902(664, 472, 694, 620);
  add1902(664, 760, 694, 995);

  // Kitchen & Dining | Upper Restroom (solid wall)
  add1902(926, 120, 956, 476);

  // Upper Restroom | Central Hallway (doorway open x: 1038..1168)
  add1902(926, 450, 1038, 484);
  add1902(1168, 450, 1346, 484);

  // Upper Restroom | Master Bedroom (solid wall)
  add1902(1318, 120, 1348, 500);

  // Master Bedroom | Xiaoming Bedroom (vestibule doorway open x: 1348..1475)
  add1902(1475, 498, 1820, 544);

  // Lower Bathroom walls (hallway doorway open at top x: 1095..1215)
  add1902(928, 646, 1095, 692);
  add1902(1215, 646, 1362, 692);
  add1902(928, 646, 958, 995);
  add1902(1336, 646, 1366, 995);

  return out;
}

/**
 * Registers all HK Street river channels, bridge parapets, buildings, and street prop bases.
 * Coordinates are defined in 1408x768 HK street reference space and scaled by `streetScale`.
 */
export function buildStreetWorldColliders(
  streetScale: number,
  addCollider: AddFootColliderFn
): WorldRect[] {
  const out: WorldRect[] = [];
  const s = (v: number): number => Math.round(v * streetScale);
  const add1408 = (x1: number, y1: number, x2: number, y2: number): void => {
    emitWorldRect({ x1: s(x1), y1: s(y1), x2: s(x2), y2: s(y2) }, addCollider, out);
  };

  // 1. River / Canal (protagonist CANNOT step onto or cross river; only Stone Arch Bridge y:348..394 is walkable)
  add1408(1138, 0, 1322, 344);     // North river channel above stone bridge
  add1408(1138, 396, 1322, 768);   // South river channel below stone bridge
  add1408(1134, 330, 1326, 348);   // Stone arch bridge north stone parapet
  add1408(1134, 394, 1326, 412);   // Stone arch bridge south stone parapet

  // 2. Buildings & Major Architectural Structures (protagonist CANNOT pass through or step onto buildings)
  add1408(824, 0, 1138, 294);      // Cha Chaan Teng & upper shopfront tenement block
  add1408(782, 436, 1138, 510);    // Dai Pai Dong & mid-lower building block
  add1408(0, 445, 385, 768);       // Lower-left street market building block
  add1408(0, 0, 580, 152);         // North park rear wall & dense tree boundary
  add1408(580, 0, 824, 182);       // Upper boundary behind footbridge (leaves go_home gate open below)
  add1408(580, 145, 632, 268);     // Footbridge west stair tower
  add1408(776, 145, 826, 268);     // Footbridge east stair tower

  // 3. Map Outer Borders
  add1408(0, 0, 46, 768);          // West border
  add1408(1376, 0, 1408, 768);     // East border beyond river promenade
  add1408(0, 738, 1408, 768);      // South border

  // 4. Solid Foreground Prop Footprints
  add1408(142, 232, 174, 262);     // Park tree trunk
  add1408(270, 212, 352, 262);     // Park slide structure
  add1408(398, 198, 486, 232);     // Park swing frame
  add1408(238, 298, 350, 334);     // 4-color recycle bins
  add1408(438, 330, 546, 352);     // Left street railing
  add1408(862, 330, 971, 352);     // Right street railing
  add1408(1008, 635, 1086, 698);   // Outdoor dining table set

  return out;
}

/**
 * Lightweight 2D Grid BFS pathfinder for tap-to-move navigation around walls, buildings, and the river.
 * Returns waypoints in FOOT coordinates `(fx, fy)`.
 */
export function findWalkablePath(
  startFx: number,
  startFy: number,
  goalFx: number,
  goalFy: number,
  worldW: number,
  worldH: number,
  obstacles: readonly WorldRect[],
  cellSize = 20,
  padX = 12,
  padY = 8
): Array<{ x: number; y: number }> {
  const cols = Math.max(8, Math.ceil(worldW / cellSize));
  const rows = Math.max(8, Math.ceil(worldH / cellSize));
  const blocked = new Uint8Array(cols * rows);

  for (let r = 0; r < rows; r++) {
    const cy = (r + 0.5) * cellSize;
    if (cy < 20 || cy > worldH - 16) {
      for (let c = 0; c < cols; c++) blocked[r * cols + c] = 1;
      continue;
    }
    for (let c = 0; c < cols; c++) {
      const cx = (c + 0.5) * cellSize;
      if (cx < 20 || cx > worldW - 20) {
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
      // Prevent diagonal corner cutting across wall corners
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

  // Line-of-sight string-pulling to keep waypoints smooth & minimal
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
