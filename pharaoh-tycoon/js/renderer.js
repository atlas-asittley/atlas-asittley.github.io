import {
  TILE_SIZE, MAP_W, MAP_H,
  TERRAIN, COLORS, BUILDINGS, HOUSING_LEVELS,
} from './config.js';
import { getTile } from './grid.js';

// ── Main render call ────────────────────────────────────────
export function render(ctx, state) {
  const { camera } = state;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawTerrain(ctx, state, cw, ch);
  drawBuildings(ctx, state, cw, ch);
  drawGrid(ctx, state, cw, ch);
  drawPlacementPreview(ctx, state);
  drawSelection(ctx, state);

  ctx.restore();

  drawMinimap(ctx, state, cw, ch);
}

// ── Terrain ─────────────────────────────────────────────────
function drawTerrain(ctx, state, cw, ch) {
  const { camera } = state;
  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endX = Math.min(MAP_W, Math.ceil((camera.x + cw) / TILE_SIZE));
  const endY = Math.min(MAP_H, Math.ceil((camera.y + ch) / TILE_SIZE));

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = getTile(state.grid, x, y);
      if (!tile) continue;
      const checker = (x + y) % 2 === 0;
      let color;
      switch (tile.terrain) {
        case TERRAIN.DESERT:     color = checker ? COLORS.desert1 : COLORS.desert2; break;
        case TERRAIN.FLOODPLAIN: color = checker ? COLORS.floodplain1 : COLORS.floodplain2; break;
        case TERRAIN.WATER:      color = checker ? COLORS.water1 : COLORS.water2; break;
        case TERRAIN.ROCK:       color = checker ? COLORS.rock1 : COLORS.rock2; break;
      }
      ctx.fillStyle = color;
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      // Water shimmer
      if (tile.terrain === TERRAIN.WATER) {
        const shimmer = Math.sin(x * 1.5 + y * 0.8 + state.tick * 0.3) * 0.1;
        ctx.fillStyle = `rgba(255,255,255,${0.05 + shimmer})`;
        ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      }
    }
  }
}

// ── Buildings ───────────────────────────────────────────────
function drawBuildings(ctx, state, cw, ch) {
  const drawn = new Set();
  for (const b of state.buildings) {
    if (drawn.has(b.id)) continue;
    drawn.add(b.id);

    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.width * TILE_SIZE;
    const ph = b.height * TILE_SIZE;

    // Skip if off screen
    if (px + pw < state.camera.x || px > state.camera.x + cw) continue;
    if (py + ph < state.camera.y || py > state.camera.y + ch) continue;

    const def = BUILDINGS[b.type];

    if (b.type === 'road') {
      drawRoad(ctx, state, b);
    } else if (b.type === 'housing') {
      drawHousing(ctx, b);
    } else {
      // Generic building
      const colorKey = COLORS[b.type] || '#888';
      ctx.fillStyle = colorKey;
      ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);
      // Border
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.lineWidth = 1;
      ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);
      // Symbol
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.min(pw, ph) * 0.5}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(def.symbol, px + pw / 2, py + ph / 2);
    }

    // Staffing indicator
    if (b.workersNeeded > 0 && b.type !== 'road') {
      const ratio = b.currentWorkers / b.workersNeeded;
      if (ratio < 0.5) {
        ctx.fillStyle = 'rgba(255,0,0,0.5)';
        ctx.beginPath();
        ctx.arc(px + pw - 6, py + 6, 4, 0, Math.PI * 2);
        ctx.fill();
      } else if (ratio < 1) {
        ctx.fillStyle = 'rgba(255,200,0,0.5)';
        ctx.beginPath();
        ctx.arc(px + pw - 6, py + 6, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}

// ── Road drawing with connectivity ──────────────────────────
function drawRoad(ctx, state, b) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const s = TILE_SIZE;
  const mid = s / 2;
  const roadW = s * 0.4;

  ctx.fillStyle = COLORS.road;
  // Center square
  ctx.fillRect(px + mid - roadW/2, py + mid - roadW/2, roadW, roadW);

  // Connect to neighboring roads
  const dirs = [[0,-1],[1,0],[0,1],[-1,0]]; // N E S W
  for (const [dx, dy] of dirs) {
    const tile = getTile(state.grid, b.x + dx, b.y + dy);
    if (tile && tile.building && tile.building.type === 'road') {
      if (dx === -1) ctx.fillRect(px, py + mid - roadW/2, mid, roadW);
      if (dx === 1)  ctx.fillRect(px + mid, py + mid - roadW/2, mid, roadW);
      if (dy === -1) ctx.fillRect(px + mid - roadW/2, py, roadW, mid);
      if (dy === 1)  ctx.fillRect(px + mid - roadW/2, py + mid, roadW, mid);
    }
  }

  // Road detail lines
  ctx.strokeStyle = 'rgba(0,0,0,0.15)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + mid - roadW/2, py + mid - roadW/2, roadW, roadW);
}

// ── Housing with evolution visuals ──────────────────────────
function drawHousing(ctx, b) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const s = TILE_SIZE;

  if (b.level === 0) {
    // Empty plot - just a marker
    ctx.fillStyle = 'rgba(200,180,140,0.5)';
    ctx.fillRect(px + 2, py + 2, s - 4, s - 4);
    ctx.strokeStyle = 'rgba(0,0,0,0.2)';
    ctx.setLineDash([2, 2]);
    ctx.strokeRect(px + 2, py + 2, s - 4, s - 4);
    ctx.setLineDash([]);
    return;
  }

  // Housing color by level
  const colorIdx = Math.min(b.level - 1, COLORS.housing.length - 1);
  ctx.fillStyle = COLORS.housing[colorIdx];
  ctx.fillRect(px + 1, py + 1, s - 2, s - 2);

  // Roof (triangle) - bigger with level
  const roofH = 4 + b.level * 2;
  ctx.fillStyle = darken(COLORS.housing[colorIdx], 0.2);
  ctx.beginPath();
  ctx.moveTo(px + 1, py + roofH);
  ctx.lineTo(px + s / 2, py + 1);
  ctx.lineTo(px + s - 1, py + roofH);
  ctx.closePath();
  ctx.fill();

  // Border
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, s - 2, s - 2);

  // Population count
  if (b.currentResidents > 0) {
    ctx.fillStyle = '#fff';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(b.currentResidents.toString(), px + s / 2, py + s - 1);
  }
}

// ── Grid overlay ────────────────────────────────────────────
function drawGrid(ctx, state, cw, ch) {
  if (!state.showGrid) return;
  const { camera } = state;
  const startX = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const startY = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const endX = Math.min(MAP_W, Math.ceil((camera.x + cw) / TILE_SIZE));
  const endY = Math.min(MAP_H, Math.ceil((camera.y + ch) / TILE_SIZE));

  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  for (let x = startX; x <= endX; x++) {
    ctx.beginPath();
    ctx.moveTo(x * TILE_SIZE, startY * TILE_SIZE);
    ctx.lineTo(x * TILE_SIZE, endY * TILE_SIZE);
    ctx.stroke();
  }
  for (let y = startY; y <= endY; y++) {
    ctx.beginPath();
    ctx.moveTo(startX * TILE_SIZE, y * TILE_SIZE);
    ctx.lineTo(endX * TILE_SIZE, y * TILE_SIZE);
    ctx.stroke();
  }
}

// ── Placement preview ───────────────────────────────────────
export function drawPlacementPreview(ctx, state) {
  if (!state.selectedBuildType || state.mouseGrid.x < 0) return;
  const def = BUILDINGS[state.selectedBuildType];
  if (!def) return;
  const [w, h] = def.size;
  const gx = state.mouseGrid.x;
  const gy = state.mouseGrid.y;

  const valid = state.canPlacePreview;
  ctx.fillStyle = valid ? COLORS.highlight : COLORS.invalid;
  ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE);
  ctx.strokeStyle = valid ? 'rgba(255,255,100,0.6)' : 'rgba(255,50,50,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx * TILE_SIZE, gy * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE);

  // Name label
  ctx.fillStyle = valid ? '#fff' : '#f88';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(def.name, (gx + w / 2) * TILE_SIZE, gy * TILE_SIZE - 4);
}

// ── Selection highlight ─────────────────────────────────────
function drawSelection(ctx, state) {
  if (!state.selectedBuilding) return;
  const b = state.selectedBuilding;
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.width * TILE_SIZE;
  const ph = b.height * TILE_SIZE;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.setLineDash([]);

  // Range indicator for service buildings
  const def = BUILDINGS[b.type];
  if (def && def.range) {
    ctx.fillStyle = 'rgba(100,200,255,0.08)';
    ctx.strokeStyle = 'rgba(100,200,255,0.3)';
    ctx.lineWidth = 1;
    const range = def.range * TILE_SIZE;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
    // Diamond shape for Manhattan distance
    ctx.beginPath();
    ctx.moveTo(cx, cy - range);
    ctx.lineTo(cx + range, cy);
    ctx.lineTo(cx, cy + range);
    ctx.lineTo(cx - range, cy);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }
}

// ── Minimap ─────────────────────────────────────────────────
function drawMinimap(ctx, state, cw, ch) {
  const mmW = 150;
  const mmH = 100;
  const mmX = cw - mmW - 10;
  const mmY = ch - mmH - 10;
  const scaleX = mmW / MAP_W;
  const scaleY = mmH / MAP_H;

  // Background
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

  // Terrain (simplified)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = getTile(state.grid, x, y);
      switch (tile.terrain) {
        case TERRAIN.WATER: ctx.fillStyle = COLORS.water1; break;
        case TERRAIN.FLOODPLAIN: ctx.fillStyle = COLORS.floodplain1; break;
        case TERRAIN.ROCK: ctx.fillStyle = COLORS.rock1; break;
        default: ctx.fillStyle = COLORS.desert1;
      }
      if (tile.building) {
        switch (tile.building.type) {
          case 'road': ctx.fillStyle = COLORS.road; break;
          case 'housing': ctx.fillStyle = '#c0a060'; break;
          case 'farm': ctx.fillStyle = COLORS.farm; break;
          case 'granary': ctx.fillStyle = COLORS.granary; break;
          default: ctx.fillStyle = '#aaa';
        }
      }
      ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
    }
  }

  // Camera viewport
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mmX + (state.camera.x / TILE_SIZE) * scaleX,
    mmY + (state.camera.y / TILE_SIZE) * scaleY,
    (cw / TILE_SIZE) * scaleX,
    (ch / TILE_SIZE) * scaleY,
  );
}

// ── Utility ─────────────────────────────────────────────────
function darken(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.floor(r*f)},${Math.floor(g*f)},${Math.floor(b*f)})`;
}
