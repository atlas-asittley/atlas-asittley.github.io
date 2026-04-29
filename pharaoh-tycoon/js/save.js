import { BUILDINGS, MAP_W, MAP_H } from './config.js';
import { createGrid, getTile } from './grid.js';

const SAVE_KEY = 'pharaoh-tycoon-save';

// ── Serialize game state to a plain JSON-safe object ───────
export function serializeState(state) {
  return {
    version: 1,
    buildings: state.buildings.map(b => ({
      type: b.type,
      x: b.x,
      y: b.y,
      width: b.width,
      height: b.height,
      id: b.id,
      level: b.level,
      currentResidents: b.currentResidents,
      currentWorkers: b.currentWorkers,
      workersNeeded: b.workersNeeded,
      production: b.production,
      storage: b.storage,
      active: b.active,
      fireRisk: b.fireRisk,
      collapseRisk: b.collapseRisk,
      onFire: b.onFire,
      fireTicks: b.fireTicks,
      walkerCooldown: b.walkerCooldown || 0,
    })),
    nextBuildingId: state.nextBuildingId,
    population: { ...state.population },
    treasury: { ...state.treasury },
    food: { ...state.food },
    camera: { ...state.camera },
    speed: state.speed,
    tick: state.tick,
    time: { ...state.time },
    scenario: state.scenario ? { ...state.scenario } : null,
  };
}

// ── Restore state from a save object ───────────────────────
// Mutates `state` in-place so the game loop's reference stays valid.
export function deserializeState(state, save) {
  if (!save || save.version !== 1) return false;

  // Regenerate a fresh grid (terrain is deterministic)
  state.grid = createGrid();

  // Rebuild buildings and stamp them onto tiles
  state.buildings = [];
  state.nextBuildingId = save.nextBuildingId;

  for (const sb of save.buildings) {
    const building = {
      type: sb.type,
      x: sb.x,
      y: sb.y,
      width: sb.width,
      height: sb.height,
      id: sb.id,
      level: sb.level,
      currentResidents: sb.currentResidents,
      currentWorkers: sb.currentWorkers,
      workersNeeded: sb.workersNeeded,
      production: sb.production,
      storage: sb.storage,
      active: sb.active,
      fireRisk: sb.fireRisk,
      collapseRisk: sb.collapseRisk,
      onFire: sb.onFire,
      fireTicks: sb.fireTicks,
      walkerCooldown: sb.walkerCooldown || 0,
    };
    state.buildings.push(building);

    // Stamp building reference onto grid tiles
    for (let dy = 0; dy < building.height; dy++) {
      for (let dx = 0; dx < building.width; dx++) {
        const tile = getTile(state.grid, building.x + dx, building.y + dy);
        if (tile) tile.building = building;
      }
    }
  }

  // Restore scalar state
  state.population = { ...save.population };
  state.treasury = { ...save.treasury };
  state.food = { ...save.food };
  state.camera = { ...save.camera };
  state.speed = save.speed;
  state.tick = save.tick;
  state.time = { ...save.time };

  // Walkers are transient — clear them and let spawning rebuild
  state.walkers = [];
  state.walkerProgress = 0;

  // Clear UI selection state
  state.selectedBuildType = null;
  state.selectedBuilding = null;

  // Restore scenario if present
  if (save.scenario) {
    state.scenario = { ...save.scenario };
  }

  // Coverage values on tiles start at 0 — walkers will rebuild coverage
  // Road access and desirability will be recomputed on the next tick

  return true;
}

// ── localStorage wrappers ──────────────────────────────────
export function saveGame(state) {
  try {
    const data = serializeState(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.error('Save failed:', e);
    return false;
  }
}

export function loadGame(state) {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    return deserializeState(state, data);
  } catch (e) {
    console.error('Load failed:', e);
    return false;
  }
}

export function hasSave() {
  return localStorage.getItem(SAVE_KEY) !== null;
}

export function deleteSave() {
  localStorage.removeItem(SAVE_KEY);
}
