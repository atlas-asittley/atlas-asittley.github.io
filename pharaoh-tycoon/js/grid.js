import { MAP_W, MAP_H, TERRAIN } from './config.js';

// ── Tile factory ────────────────────────────────────────────
function makeTile(terrain) {
  return {
    terrain,
    building: null,      // reference to building object occupying this tile (or null)
    roadAccess: false,
    waterAccess: false,
    foodAccess: false,
    religionAccess: false,
    taxed: false,
    desirability: 0,
  };
}

// ── Nile river path (sinuous curve) ─────────────────────────
function nileX(row) {
  // River center column oscillates around column 30
  const base = 30;
  return base + Math.round(Math.sin(row * 0.15) * 3 + Math.cos(row * 0.08) * 2);
}

// ── Generate the map ────────────────────────────────────────
export function createGrid() {
  const grid = [];
  for (let y = 0; y < MAP_H; y++) {
    const row = [];
    const riverCenter = nileX(y);
    for (let x = 0; x < MAP_W; x++) {
      const dist = Math.abs(x - riverCenter);
      let terrain;
      if (dist <= 1) {
        terrain = TERRAIN.WATER;
      } else if (dist <= 4) {
        terrain = TERRAIN.FLOODPLAIN;
      } else if (
        // scatter some rocks
        (x < 5 || x > MAP_W - 6) &&
        Math.sin(x * 7.3 + y * 4.1) > 0.7
      ) {
        terrain = TERRAIN.ROCK;
      } else {
        terrain = TERRAIN.DESERT;
      }
      row.push(makeTile(terrain));
    }
    grid.push(row);
  }
  return grid;
}

export function getTile(grid, x, y) {
  if (x < 0 || y < 0 || x >= MAP_W || y >= MAP_H) return null;
  return grid[y][x];
}

export function inBounds(x, y) {
  return x >= 0 && y >= 0 && x < MAP_W && y < MAP_H;
}

// ── Neighbors (4-directional) ───────────────────────────────
export function neighbors4(x, y) {
  return [
    [x - 1, y], [x + 1, y],
    [x, y - 1], [x, y + 1],
  ].filter(([nx, ny]) => inBounds(nx, ny));
}

// ── Tiles within Manhattan distance ─────────────────────────
export function tilesInRange(cx, cy, range) {
  const result = [];
  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (Math.abs(dx) + Math.abs(dy) <= range) {
        const nx = cx + dx, ny = cy + dy;
        if (inBounds(nx, ny)) result.push([nx, ny]);
      }
    }
  }
  return result;
}
