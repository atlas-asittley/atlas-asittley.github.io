import { BUILDINGS, TERRAIN } from './config.js';
import { getTile, inBounds } from './grid.js';

// ── Check if a building can be placed ───────────────────────
export function canPlace(state, typeKey, gx, gy) {
  const def = BUILDINGS[typeKey];
  if (!def) return false;
  const [w, h] = def.size;
  if (state.treasury.gold < def.cost) return false;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = gx + dx, ty = gy + dy;
      if (!inBounds(tx, ty)) return false;
      const tile = getTile(state.grid, tx, ty);
      if (!tile) return false;
      if (tile.building) return false;
      if (!def.terrain.includes(tile.terrain)) return false;
    }
  }
  return true;
}

// ── Place a building on the grid ────────────────────────────
export function placeBuilding(state, typeKey, gx, gy) {
  if (!canPlace(state, typeKey, gx, gy)) return null;
  const def = BUILDINGS[typeKey];
  const [w, h] = def.size;

  const building = {
    type: typeKey,
    x: gx,
    y: gy,
    width: w,
    height: h,
    level: 0,          // housing evolution level
    currentResidents: 0,
    currentWorkers: 0,
    workersNeeded: def.workers,
    production: 0,     // accumulated production
    storage: 0,        // granary stored grain
    active: true,
    id: state.nextBuildingId++,
    fireRisk: 0,       // accumulates without fire walker coverage
    collapseRisk: 0,   // accumulates without architect walker coverage
    onFire: false,     // true when building has caught fire
    fireTicks: 0,      // ticks remaining while on fire before destruction
  };

  // Mark tiles
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      getTile(state.grid, gx + dx, gy + dy).building = building;
    }
  }

  state.buildings.push(building);
  state.treasury.gold -= def.cost;
  return building;
}

// ── Remove a building ───────────────────────────────────────
export function removeBuilding(state, building, { refund = true } = {}) {
  const [w, h] = BUILDINGS[building.type].size;
  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tile = getTile(state.grid, building.x + dx, building.y + dy);
      if (tile) tile.building = null;
    }
  }
  const idx = state.buildings.indexOf(building);
  if (idx >= 0) state.buildings.splice(idx, 1);
  // Remove any walkers spawned by this building
  if (state.walkers) {
    state.walkers = state.walkers.filter(w => w.buildingId !== building.id);
  }
  // Refund half (unless destroyed by hazard)
  if (refund) {
    state.treasury.gold += Math.floor(BUILDINGS[building.type].cost / 2);
  }
  // Deselect if selected
  if (state.selectedBuilding === building) state.selectedBuilding = null;
}

// ── Get building at grid pos ────────────────────────────────
export function getBuildingAt(state, gx, gy) {
  const tile = getTile(state.grid, gx, gy);
  return tile ? tile.building : null;
}

// ── All buildings of a type ─────────────────────────────────
export function buildingsOfType(state, typeKey) {
  return state.buildings.filter(b => b.type === typeKey);
}

// ── Staffing check (shared by simulation + walkers) ────────
export function isStaffed(building) {
  if (building.workersNeeded === 0) return true;
  return building.currentWorkers >= Math.ceil(building.workersNeeded * 0.5);
}
