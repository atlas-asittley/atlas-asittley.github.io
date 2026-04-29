import {
  TILE_SIZE, MAP_W, MAP_H,
  TERRAIN, COLORS, BUILDINGS, HOUSING_LEVELS,
} from './config.js';
import { getTile } from './grid.js';
import { renderMessages } from './messages.js';

// ── Walker visual config ───────────────────────────────────
const WALKER_COLORS = {
  food:      COLORS.walkerFood,
  water:     COLORS.walkerWater,
  religion:  COLORS.walkerReligion,
  tax:       COLORS.walkerTax,
  architect: COLORS.walkerArchitect,
  fire:      COLORS.walkerFire,
};
const WALKER_ICONS = { food: 'F', water: 'W', religion: 'R', tax: 'T', architect: 'A', fire: '!' };

// ── Deterministic per-tile hash (0..1) ─────────────────────
function tileHash(x, y, seed = 0) {
  let h = (x * 374761393 + y * 668265263 + seed) | 0;
  h = (h ^ (h >> 13)) * 1274126177;
  h = h ^ (h >> 16);
  return (h & 0x7fffffff) / 0x7fffffff;
}

// ── Color utilities ────────────────────────────────────────
function darken(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const f = 1 - amount;
  return `rgb(${Math.floor(r * f)},${Math.floor(g * f)},${Math.floor(b * f)})`;
}

function lighten(hex, amount) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgb(${Math.min(255, Math.floor(r + (255 - r) * amount))},${Math.min(255, Math.floor(g + (255 - g) * amount))},${Math.min(255, Math.floor(b + (255 - b) * amount))})`;
}

// ── Viewport culling helper ────────────────────────────────
function viewportBounds(camera, cw, ch) {
  return {
    startX: Math.max(0, Math.floor(camera.x / TILE_SIZE)),
    startY: Math.max(0, Math.floor(camera.y / TILE_SIZE)),
    endX: Math.min(MAP_W, Math.ceil((camera.x + cw) / TILE_SIZE)),
    endY: Math.min(MAP_H, Math.ceil((camera.y + ch) / TILE_SIZE)),
  };
}

// ── Main render call ────────────────────────────────────────
export function render(ctx, state) {
  const { camera } = state;
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  ctx.save();
  ctx.translate(-camera.x, -camera.y);

  drawTerrain(ctx, state, cw, ch);
  drawTerrainDetails(ctx, state, cw, ch);
  drawBuildings(ctx, state, cw, ch);
  drawHazardIndicators(ctx, state, cw, ch);
  drawWalkers(ctx, state, cw, ch);
  if (state.overlay === 'desirability') {
    drawDesirabilityOverlay(ctx, state, cw, ch);
  } else if (state.overlay === 'fire') {
    drawRiskOverlay(ctx, state, cw, ch, 'fireRisk', 'rgba(255,80,0,');
  } else if (state.overlay === 'collapse') {
    drawRiskOverlay(ctx, state, cw, ch, 'collapseRisk', 'rgba(140,100,60,');
  }
  drawGrid(ctx, state, cw, ch);
  drawPlacementPreview(ctx, state);
  drawSelection(ctx, state);

  ctx.restore();

  drawMinimap(ctx, state, cw, ch);
  renderMessages(ctx, state, cw);

  if (state.screen === 'won' && state.scenario && state.scenario.won) {
    drawWinBanner(ctx, cw, ch);
  }
}

// ── Terrain ─────────────────────────────────────────────────
function drawTerrain(ctx, state, cw, ch) {
  const { startX, startY, endX, endY } = viewportBounds(state.camera, cw, ch);
  const S = TILE_SIZE;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = getTile(state.grid, x, y);
      if (!tile) continue;
      const px = x * S;
      const py = y * S;
      const h = tileHash(x, y, 0);
      const checker = (x + y) % 2 === 0;

      switch (tile.terrain) {
        case TERRAIN.DESERT: {
          // Base sand with subtle per-tile variation
          const r = 212 + Math.floor(h * 12 - 6);
          const g = 165 + Math.floor(h * 10 - 5);
          const b = 116 + Math.floor(h * 8 - 4);
          const dim = checker ? 0 : -8;
          ctx.fillStyle = `rgb(${r + dim},${g + dim},${b + dim})`;
          ctx.fillRect(px, py, S, S);

          // Subtle wind ripple pattern
          if (tileHash(x, y, 7) > 0.7) {
            ctx.strokeStyle = `rgba(255,235,200,${0.08 + h * 0.04})`;
            ctx.lineWidth = 0.5;
            const ry = py + S * (0.3 + h * 0.4);
            ctx.beginPath();
            ctx.moveTo(px + 2, ry);
            ctx.quadraticCurveTo(px + S / 2, ry - 2 + h * 4, px + S - 2, ry + 1);
            ctx.stroke();
          }
          break;
        }
        case TERRAIN.FLOODPLAIN: {
          // Rich fertile green with variation
          const r = 120 + Math.floor(h * 20 - 10);
          const g = 165 + Math.floor(h * 16 - 8);
          const b = 100 + Math.floor(h * 16 - 8);
          const dim = checker ? 0 : -10;
          ctx.fillStyle = `rgb(${r + dim},${g + dim},${b + dim})`;
          ctx.fillRect(px, py, S, S);

          // Crop row hints
          if (tileHash(x, y, 3) > 0.4) {
            ctx.strokeStyle = `rgba(60,100,40,${0.15 + h * 0.08})`;
            ctx.lineWidth = 0.5;
            for (let i = 0; i < 3; i++) {
              const ly = py + 6 + i * 9;
              ctx.beginPath();
              ctx.moveTo(px + 3, ly);
              ctx.lineTo(px + S - 3, ly);
              ctx.stroke();
            }
          }
          break;
        }
        case TERRAIN.WATER: {
          // Deep Nile blue
          const phase = state.tick * 0.15 + x * 0.8 + y * 0.5;
          const wave = Math.sin(phase) * 0.08;
          const r = 50 + Math.floor(h * 10);
          const g = 120 + Math.floor(Math.sin(phase * 0.7) * 8);
          const b = 170 + Math.floor(h * 12);
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(px, py, S, S);

          // Layered shimmer / ripple
          ctx.fillStyle = `rgba(180,220,255,${0.06 + wave})`;
          ctx.fillRect(px, py, S, S);

          // Specular highlight streaks
          const sx = px + S * (0.2 + Math.sin(phase * 1.3) * 0.15);
          const sy = py + S * 0.4;
          ctx.fillStyle = `rgba(255,255,255,${0.08 + Math.sin(phase * 2) * 0.04})`;
          ctx.fillRect(sx, sy, S * 0.3, 1.5);
          break;
        }
        case TERRAIN.ROCK: {
          // Rough stone with cracks
          const r = 140 + Math.floor(h * 20 - 10);
          const g = 125 + Math.floor(h * 16 - 8);
          const b = 110 + Math.floor(h * 14 - 7);
          const dim = checker ? 0 : -6;
          ctx.fillStyle = `rgb(${r + dim},${g + dim},${b + dim})`;
          ctx.fillRect(px, py, S, S);

          // Crack lines
          ctx.strokeStyle = `rgba(80,65,50,${0.15 + h * 0.1})`;
          ctx.lineWidth = 0.5;
          ctx.beginPath();
          const cx = px + S * h;
          const cy = py + S * tileHash(x, y, 1);
          ctx.moveTo(cx, py);
          ctx.lineTo(cx + (h - 0.5) * 8, cy);
          ctx.lineTo(cx + (h - 0.5) * 4, py + S);
          ctx.stroke();
          break;
        }
      }
    }
  }
}

// ── Terrain decorative details (reeds, sand pebbles) ───────
function drawTerrainDetails(ctx, state, cw, ch) {
  const { startX, startY, endX, endY } = viewportBounds(state.camera, cw, ch);
  const S = TILE_SIZE;

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = getTile(state.grid, x, y);
      if (!tile || tile.building) continue;

      // Reeds at water edges (floodplain tiles adjacent to water)
      if (tile.terrain === TERRAIN.FLOODPLAIN) {
        let nearWater = false;
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const adj = getTile(state.grid, x + dx, y + dy);
          if (adj && adj.terrain === TERRAIN.WATER) { nearWater = true; break; }
        }
        if (nearWater && tileHash(x, y, 5) > 0.45) {
          const px = x * S;
          const py = y * S;
          const sway = Math.sin(state.tick * 0.2 + x * 1.1 + y * 0.7) * 1.5;
          const count = 2 + Math.floor(tileHash(x, y, 6) * 3);
          for (let i = 0; i < count; i++) {
            const rx = px + 4 + tileHash(x, y, 10 + i) * (S - 8);
            const ry = py + S;
            const rh = 8 + tileHash(x, y, 20 + i) * 10;
            ctx.strokeStyle = `rgba(80,130,50,${0.5 + tileHash(x, y, 30 + i) * 0.3})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(rx, ry);
            ctx.quadraticCurveTo(rx + sway, ry - rh * 0.6, rx + sway * 0.8, ry - rh);
            ctx.stroke();
          }
        }
      }

      // Scattered pebbles on desert
      if (tile.terrain === TERRAIN.DESERT && tileHash(x, y, 8) > 0.85) {
        const px = x * S;
        const py = y * S;
        const count = 1 + Math.floor(tileHash(x, y, 9) * 2);
        for (let i = 0; i < count; i++) {
          const rx = px + 4 + tileHash(x, y, 40 + i) * (S - 8);
          const ry = py + 4 + tileHash(x, y, 50 + i) * (S - 8);
          ctx.fillStyle = `rgba(160,135,100,${0.3 + tileHash(x, y, 60 + i) * 0.2})`;
          ctx.beginPath();
          ctx.arc(rx, ry, 1 + tileHash(x, y, 70 + i), 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  }
}

// ── Buildings ───────────────────────────────────────────────
function drawBuildings(ctx, state, cw, ch) {
  for (const b of state.buildings) {
    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.width * TILE_SIZE;
    const ph = b.height * TILE_SIZE;

    if (px + pw < state.camera.x || px > state.camera.x + cw) continue;
    if (py + ph < state.camera.y || py > state.camera.y + ch) continue;

    const def = BUILDINGS[b.type];

    if (b.type === 'road') {
      drawRoad(ctx, state, b);
    } else if (b.type === 'housing') {
      drawHousing(ctx, state, b);
    } else if (b.type === 'garden') {
      drawGarden(ctx, state, b);
    } else {
      drawGenericBuilding(ctx, state, b, def);
    }

    // Fire overlay on burning buildings
    if (b.onFire) {
      const flicker = Math.sin(state.tick * 2 + b.id * 3) * 0.15;
      ctx.fillStyle = `rgba(255,${60 + Math.floor(flicker * 100)},0,${0.45 + flicker})`;
      ctx.fillRect(px, py, pw, ph);
      // Animated flame glow
      const glow = 0.2 + Math.sin(state.tick * 3 + b.id) * 0.1;
      ctx.fillStyle = `rgba(255,200,50,${glow})`;
      ctx.fillRect(px + 2, py + 2, pw - 4, ph - 4);
      ctx.fillStyle = '#ff3300';
      ctx.font = `bold ${Math.min(pw, ph) * 0.55}px serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('\u2632', px + pw / 2, py + ph / 2);
    }

    // Staffing indicator
    if (b.workersNeeded > 0 && b.type !== 'road') {
      const ratio = b.currentWorkers / b.workersNeeded;
      if (ratio < 1) {
        ctx.fillStyle = ratio < 0.5 ? 'rgba(220,40,40,0.7)' : 'rgba(240,180,30,0.6)';
        ctx.beginPath();
        ctx.arc(px + pw - 5, py + 5, 3.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.4)';
        ctx.lineWidth = 0.5;
        ctx.stroke();
      }
    }
  }
}

// ── Generic building (farm, granary, bazaar, well, etc.) ────
function drawGenericBuilding(ctx, state, b, def) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.width * TILE_SIZE;
  const ph = b.height * TILE_SIZE;
  const colorKey = COLORS[b.type] || '#888';

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  ctx.fillRect(px + 3, py + 3, pw - 2, ph - 2);

  // Main body
  ctx.fillStyle = colorKey;
  ctx.fillRect(px + 1, py + 1, pw - 2, ph - 2);

  // Top highlight edge
  ctx.fillStyle = lighten(colorKey, 0.2);
  ctx.fillRect(px + 1, py + 1, pw - 2, 3);

  // Bottom shadow edge
  ctx.fillStyle = darken(colorKey, 0.2);
  ctx.fillRect(px + 1, py + ph - 3, pw - 2, 2);

  // Border
  ctx.strokeStyle = darken(colorKey, 0.35);
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, pw - 2, ph - 2);

  // Symbol with slight shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.font = `bold ${Math.min(pw, ph) * 0.45}px serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(def.symbol, px + pw / 2 + 1, py + ph / 2 + 1);
  ctx.fillStyle = '#fff';
  ctx.fillText(def.symbol, px + pw / 2, py + ph / 2);
}

// ── Road drawing with connectivity ──────────────────────────
function drawRoad(ctx, state, b) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const S = TILE_SIZE;
  const mid = S / 2;
  const roadW = S * 0.55; // wider road

  // Road base shadow
  ctx.fillStyle = 'rgba(0,0,0,0.1)';
  ctx.fillRect(px + mid - roadW / 2 + 1, py + mid - roadW / 2 + 1, roadW, roadW);

  // Paved surface color
  ctx.fillStyle = '#c4a66e';
  // Center square
  ctx.fillRect(px + mid - roadW / 2, py + mid - roadW / 2, roadW, roadW);

  // Connect to neighboring roads/buildings-on-road
  const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]]; // N E S W
  for (const [dx, dy] of dirs) {
    const tile = getTile(state.grid, b.x + dx, b.y + dy);
    if (tile && tile.building && tile.building.type === 'road') {
      if (dx === -1) ctx.fillRect(px, py + mid - roadW / 2, mid, roadW);
      if (dx === 1)  ctx.fillRect(px + mid, py + mid - roadW / 2, mid, roadW);
      if (dy === -1) ctx.fillRect(px + mid - roadW / 2, py, roadW, mid);
      if (dy === 1)  ctx.fillRect(px + mid - roadW / 2, py + mid, roadW, mid);
    }
  }

  // Stone block pattern (subtle grid)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  ctx.lineWidth = 0.5;
  const half = roadW / 2;
  // Horizontal lines
  for (let i = -1; i <= 1; i++) {
    const ly = py + mid + i * (roadW / 3);
    ctx.beginPath();
    ctx.moveTo(px + mid - half, ly);
    ctx.lineTo(px + mid + half, ly);
    ctx.stroke();
  }
  // Vertical lines
  for (let i = -1; i <= 1; i++) {
    const lx = px + mid + i * (roadW / 3);
    ctx.beginPath();
    ctx.moveTo(lx, py + mid - half);
    ctx.lineTo(lx, py + mid + half);
    ctx.stroke();
  }

  // Edge curb lines
  ctx.strokeStyle = 'rgba(80,60,30,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + mid - roadW / 2, py + mid - roadW / 2, roadW, roadW);
}

// ── Housing with evolution visuals ──────────────────────────
function drawHousing(ctx, state, b) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const S = TILE_SIZE;

  if (b.level === 0) {
    // Empty plot - staked ground
    ctx.fillStyle = 'rgba(200,180,140,0.4)';
    ctx.fillRect(px + 2, py + 2, S - 4, S - 4);
    ctx.strokeStyle = 'rgba(160,130,90,0.35)';
    ctx.setLineDash([3, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(px + 2, py + 2, S - 4, S - 4);
    ctx.setLineDash([]);
    // Corner stakes
    ctx.fillStyle = 'rgba(120,90,50,0.5)';
    for (const [cx, cy] of [[px + 4, py + 4], [px + S - 4, py + 4], [px + 4, py + S - 4], [px + S - 4, py + S - 4]]) {
      ctx.fillRect(cx - 1, cy - 1, 2, 2);
    }
    return;
  }

  const colorIdx = Math.min(b.level - 1, COLORS.housing.length - 1);
  const baseColor = COLORS.housing[colorIdx];

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.15)';
  ctx.fillRect(px + 3, py + 3, S - 3, S - 3);

  // Main wall
  ctx.fillStyle = baseColor;
  ctx.fillRect(px + 1, py + 1, S - 2, S - 2);

  // Roof (triangle) - bigger with level, with ridge detail
  const roofH = 5 + b.level * 2;
  const roofColor = darken(baseColor, 0.2);
  ctx.fillStyle = roofColor;
  ctx.beginPath();
  ctx.moveTo(px + 1, py + roofH + 1);
  ctx.lineTo(px + S / 2, py + 1);
  ctx.lineTo(px + S - 1, py + roofH + 1);
  ctx.closePath();
  ctx.fill();
  // Roof ridge highlight
  ctx.strokeStyle = lighten(baseColor, 0.15);
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.moveTo(px + S / 2, py + 2);
  ctx.lineTo(px + S - 2, py + roofH);
  ctx.stroke();

  // Windows (appear at level 2+)
  if (b.level >= 2) {
    const winCount = Math.min(b.level - 1, 3);
    const winW = 3;
    const winH = 4;
    const winY = py + roofH + 4;
    ctx.fillStyle = 'rgba(60,50,30,0.5)';
    for (let i = 0; i < winCount; i++) {
      const winX = px + 4 + i * (S - 8) / Math.max(winCount, 1);
      ctx.fillRect(winX, winY, winW, winH);
    }
  }

  // Door (level 1+)
  ctx.fillStyle = darken(baseColor, 0.35);
  const doorW = 4;
  const doorH = 6;
  ctx.fillRect(px + S / 2 - doorW / 2, py + S - doorH - 1, doorW, doorH);

  // Border
  ctx.strokeStyle = darken(baseColor, 0.3);
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);

  // Population count
  if (b.currentResidents > 0) {
    // Text shadow
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(b.currentResidents.toString(), px + S / 2 + 0.5, py + S - 0.5);
    ctx.fillStyle = '#fff';
    ctx.fillText(b.currentResidents.toString(), px + S / 2, py + S - 1);
  }
}

// ── Garden drawing ──────────────────────────────────────────
function drawGarden(ctx, state, b) {
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const S = TILE_SIZE;

  // Lush green base
  ctx.fillStyle = '#2a8548';
  ctx.fillRect(px + 1, py + 1, S - 2, S - 2);

  // Foliage pattern with sway
  const sway = Math.sin(state.tick * 0.3 + b.x * 0.7 + b.y * 0.4);
  const r = S * 0.14;
  const cx = px + S / 2;
  const cy = py + S / 2;

  // Tree/bush circles
  ctx.fillStyle = '#30a855';
  for (const [ox, oy] of [[-1, -1], [1, -1], [-1, 1], [1, 1], [0, 0]]) {
    ctx.beginPath();
    ctx.arc(cx + ox * r * 1.6 + sway * 0.5, cy + oy * r * 1.6, r * 1.1, 0, Math.PI * 2);
    ctx.fill();
  }

  // Highlight foliage
  ctx.fillStyle = 'rgba(120,230,120,0.25)';
  ctx.beginPath();
  ctx.arc(cx + sway, cy - 2, r * 0.8, 0, Math.PI * 2);
  ctx.fill();

  // Flower accents
  const flowerPhase = (state.tick * 0.1 + b.x + b.y) % 6;
  if (flowerPhase < 3) {
    const fx = px + 6 + tileHash(b.x, b.y, 0) * (S - 12);
    const fy = py + 6 + tileHash(b.x, b.y, 1) * (S - 12);
    ctx.fillStyle = tileHash(b.x, b.y, 2) > 0.5 ? 'rgba(240,200,80,0.7)' : 'rgba(220,120,140,0.7)';
    ctx.beginPath();
    ctx.arc(fx, fy, 1.5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.2)';
  ctx.lineWidth = 1;
  ctx.strokeRect(px + 1, py + 1, S - 2, S - 2);
}

// ── Walkers (service + civilian) ────────────────────────────
function drawWalkers(ctx, state, cw, ch) {
  const progress = state.walkerProgress || 0;
  const bob = Math.sin(performance.now() * 0.008) * 1.2;

  for (const w of state.walkers) {
    // Interpolate position
    const px = (w.fromX + (w.x - w.fromX) * progress) * TILE_SIZE + TILE_SIZE / 2;
    const py = (w.fromY + (w.y - w.fromY) * progress) * TILE_SIZE + TILE_SIZE / 2;

    // Cull off-screen
    if (px < state.camera.x - TILE_SIZE || px > state.camera.x + cw + TILE_SIZE) continue;
    if (py < state.camera.y - TILE_SIZE || py > state.camera.y + ch + TILE_SIZE) continue;

    if (w.type === 'civilian') {
      drawCivilian(ctx, w, px, py, bob, state);
    } else {
      drawServiceWalker(ctx, w, px, py, bob);
    }
  }
}

// ── Service walker (larger humanoid with icon) ──────────────
function drawServiceWalker(ctx, w, px, py, bob) {
  const color = WALKER_COLORS[w.type] || '#fff';
  const walkerBob = bob * (1 + (w.id % 3) * 0.2);

  // Drop shadow
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  ctx.beginPath();
  ctx.ellipse(px, py + 8, 5, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body (rounded rectangle shape)
  const bodyY = py - 2 + walkerBob;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(px, bodyY + 2, 5, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(px, bodyY - 5, 3.5, 0, Math.PI * 2);
  ctx.fill();

  // Body outline
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(px, bodyY + 2, 5, 6, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, bodyY - 5, 3.5, 0, Math.PI * 2);
  ctx.stroke();

  // Service letter on body
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 8px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(WALKER_ICONS[w.type] || '?', px, bodyY + 2);
}

// ── Civilian walker (smaller, earth-tone, no icon) ──────────
function drawCivilian(ctx, w, px, py, bob, state) {
  const color = COLORS.civilians[w.colorIdx % COLORS.civilians.length];
  const walkerBob = bob * (0.8 + (w.id % 5) * 0.15);

  // Shadow
  ctx.fillStyle = 'rgba(0,0,0,0.2)';
  ctx.beginPath();
  ctx.ellipse(px, py + 6, 3.5, 1.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body
  const bodyY = py - 1 + walkerBob;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(px, bodyY + 1, 3.5, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Head
  ctx.beginPath();
  ctx.arc(px, bodyY - 4, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // Outline
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.ellipse(px, bodyY + 1, 3.5, 4.5, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(px, bodyY - 4, 2.5, 0, Math.PI * 2);
  ctx.stroke();
}

// ── Desirability overlay ────────────────────────────────────
function drawDesirabilityOverlay(ctx, state, cw, ch) {
  const { startX, startY, endX, endY } = viewportBounds(state.camera, cw, ch);

  for (let y = startY; y < endY; y++) {
    for (let x = startX; x < endX; x++) {
      const tile = getTile(state.grid, x, y);
      if (!tile) continue;
      const d = tile.desirability;
      if (d === 0) continue;

      if (d > 0) {
        const alpha = Math.min(0.5, d * 0.06);
        ctx.fillStyle = `rgba(50,200,50,${alpha})`;
      } else {
        const alpha = Math.min(0.5, Math.abs(d) * 0.06);
        ctx.fillStyle = `rgba(200,50,50,${alpha})`;
      }
      ctx.fillRect(x * TILE_SIZE, y * TILE_SIZE, TILE_SIZE, TILE_SIZE);

      if (Math.abs(d) >= 1) {
        ctx.fillStyle = d > 0 ? 'rgba(200,255,200,0.8)' : 'rgba(255,200,200,0.8)';
        ctx.font = '8px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(Math.round(d).toString(), x * TILE_SIZE + TILE_SIZE / 2, y * TILE_SIZE + TILE_SIZE / 2);
      }
    }
  }
}

// ── Risk overlay (fire or collapse) ─────────────────────────
function drawRiskOverlay(ctx, state, cw, ch, riskKey, colorBase) {
  for (const b of state.buildings) {
    const risk = b[riskKey] || 0;
    if (risk <= 0) continue;

    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.width * TILE_SIZE;
    const ph = b.height * TILE_SIZE;

    if (px + pw < state.camera.x || px > state.camera.x + cw) continue;
    if (py + ph < state.camera.y || py > state.camera.y + ch) continue;

    const alpha = Math.min(0.5, risk * 0.01);
    ctx.fillStyle = `${colorBase}${alpha})`;
    ctx.fillRect(px, py, pw, ph);

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(risk.toString(), px + pw / 2, py + ph / 2);
  }
}

// ── Hazard warning indicators on buildings ──────────────────
function drawHazardIndicators(ctx, state, cw, ch) {
  for (const b of state.buildings) {
    if (b.type === 'road' || b.type === 'garden') continue;

    const px = b.x * TILE_SIZE;
    const py = b.y * TILE_SIZE;
    const pw = b.width * TILE_SIZE;
    const ph = b.height * TILE_SIZE;

    if (px + pw < state.camera.x || px > state.camera.x + cw) continue;
    if (py + ph < state.camera.y || py > state.camera.y + ch) continue;

    const fireWarn = b.fireRisk > 36;
    const collapseWarn = b.collapseRisk > 36;

    if (fireWarn && !b.onFire) {
      const pulse = (Math.sin(state.tick * 0.8) + 1) * 0.3;
      ctx.fillStyle = `rgba(255,100,0,${0.3 + pulse})`;
      ctx.beginPath();
      ctx.arc(px + 6, py + ph - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
    if (collapseWarn) {
      const pulse = (Math.sin(state.tick * 0.8 + 1) + 1) * 0.3;
      ctx.fillStyle = `rgba(180,140,60,${0.3 + pulse})`;
      ctx.beginPath();
      ctx.arc(px + pw - 6, py + ph - 6, 4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ── Grid overlay ────────────────────────────────────────────
function drawGrid(ctx, state, cw, ch) {
  if (!state.showGrid) return;
  const { startX, startY, endX, endY } = viewportBounds(state.camera, cw, ch);

  ctx.strokeStyle = 'rgba(0,0,0,0.06)';
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
  ctx.fillStyle = valid ? 'rgba(255,255,100,0.25)' : 'rgba(255,50,50,0.35)';
  ctx.fillRect(gx * TILE_SIZE, gy * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE);
  ctx.strokeStyle = valid ? 'rgba(255,255,100,0.6)' : 'rgba(255,50,50,0.6)';
  ctx.lineWidth = 2;
  ctx.strokeRect(gx * TILE_SIZE, gy * TILE_SIZE, w * TILE_SIZE, h * TILE_SIZE);

  // Name label with background
  const label = def.name;
  ctx.font = '11px sans-serif';
  const tw = ctx.measureText(label).width;
  const lx = (gx + w / 2) * TILE_SIZE;
  const ly = gy * TILE_SIZE - 6;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(lx - tw / 2 - 4, ly - 8, tw + 8, 14);
  ctx.fillStyle = valid ? '#fff' : '#f88';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, lx, ly - 1);
}

// ── Selection highlight ─────────────────────────────────────
function drawSelection(ctx, state) {
  if (!state.selectedBuilding) return;
  const b = state.selectedBuilding;
  const px = b.x * TILE_SIZE;
  const py = b.y * TILE_SIZE;
  const pw = b.width * TILE_SIZE;
  const ph = b.height * TILE_SIZE;

  // Animated dashed selection
  const dashOffset = (performance.now() * 0.02) % 8;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.lineDashOffset = dashOffset;
  ctx.strokeRect(px - 1, py - 1, pw + 2, ph + 2);
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;

  // Range indicator for service buildings
  const def = BUILDINGS[b.type];
  if (def && def.range) {
    ctx.fillStyle = 'rgba(100,200,255,0.06)';
    ctx.strokeStyle = 'rgba(100,200,255,0.25)';
    ctx.lineWidth = 1;
    const range = def.range * TILE_SIZE;
    const cx = px + pw / 2;
    const cy = py + ph / 2;
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

  // Background with border
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.strokeStyle = 'rgba(212,160,74,0.3)';
  ctx.lineWidth = 1;
  ctx.fillRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);
  ctx.strokeRect(mmX - 2, mmY - 2, mmW + 4, mmH + 4);

  // Terrain (simplified)
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      const tile = getTile(state.grid, x, y);
      switch (tile.terrain) {
        case TERRAIN.WATER:      ctx.fillStyle = '#3a80a8'; break;
        case TERRAIN.FLOODPLAIN: ctx.fillStyle = '#7da570'; break;
        case TERRAIN.ROCK:       ctx.fillStyle = '#8a7a6a'; break;
        default:                 ctx.fillStyle = '#c4a070';
      }
      if (tile.building) {
        if (tile.building.onFire) {
          ctx.fillStyle = '#ff3300';
        } else {
          switch (tile.building.type) {
            case 'road':    ctx.fillStyle = '#b89a6a'; break;
            case 'housing': ctx.fillStyle = '#c0a060'; break;
            case 'farm':    ctx.fillStyle = '#6aaa50'; break;
            case 'granary': ctx.fillStyle = '#8b6530'; break;
            case 'garden':  ctx.fillStyle = '#27ae60'; break;
            default:        ctx.fillStyle = '#aaa';
          }
        }
      }
      ctx.fillRect(mmX + x * scaleX, mmY + y * scaleY, Math.ceil(scaleX), Math.ceil(scaleY));
    }
  }

  // Walker dots on minimap
  for (const w of state.walkers) {
    if (w.type === 'civilian') continue;
    const wx = mmX + w.x * scaleX;
    const wy = mmY + w.y * scaleY;
    ctx.fillStyle = WALKER_COLORS[w.type] || '#fff';
    ctx.fillRect(wx, wy, 2, 2);
  }

  // Camera viewport
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 1;
  ctx.strokeRect(
    mmX + (state.camera.x / TILE_SIZE) * scaleX,
    mmY + (state.camera.y / TILE_SIZE) * scaleY,
    (cw / TILE_SIZE) * scaleX,
    (ch / TILE_SIZE) * scaleY,
  );
}

// ── Win banner overlay ──────────────────────────────────────
function drawWinBanner(ctx, cw, ch) {
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(0, ch * 0.33, cw, ch * 0.18);

  // Gold border lines
  ctx.strokeStyle = 'rgba(212,160,74,0.6)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cw * 0.15, ch * 0.34);
  ctx.lineTo(cw * 0.85, ch * 0.34);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cw * 0.15, ch * 0.50);
  ctx.lineTo(cw * 0.85, ch * 0.50);
  ctx.stroke();

  ctx.fillStyle = '#d4a04a';
  ctx.font = 'bold 36px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pharaoh is Pleased!', cw / 2, ch * 0.40);

  ctx.fillStyle = '#e8dcc8';
  ctx.font = '14px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('All objectives complete. You may continue building or return to menu.', cw / 2, ch * 0.46);
}
