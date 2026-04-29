import { getTile, neighbors4 } from './grid.js';
import { buildingsOfType, isStaffed } from './buildings.js';
import {
  BUILDINGS, WALKER_MAX_STEPS, WALKER_SPAWN_INTERVAL, COVERAGE_DURATION,
  CIVILIAN_MAX, CIVILIAN_STEPS_MIN, CIVILIAN_STEPS_MAX, CIVILIAN_SPAWN_PER_TICK, COLORS,
} from './config.js';

// ── Walker service definitions ─────────────────────────────
const WALKER_SERVICES = [
  { building: 'bazaar',       service: 'food',      coverageKey: 'foodCoverage' },
  { building: 'well',         service: 'water',     coverageKey: 'waterCoverage' },
  { building: 'temple',       service: 'religion',  coverageKey: 'religionCoverage' },
  { building: 'taxCollector', service: 'tax',       coverageKey: 'taxCoverage' },
  { building: 'architect',    service: 'architect', coverageKey: 'architectCoverage' },
  { building: 'firehouse',    service: 'fire',      coverageKey: 'fireCoverage' },
];

let nextWalkerId = 1;

// ── Spawn walkers from staffed service buildings ───────────
export function spawnWalkers(state) {
  for (const svc of WALKER_SERVICES) {
    for (const b of buildingsOfType(state, svc.building)) {
      if (!isStaffed(b)) continue;
      // Bazaar must have food to send a walker
      if (svc.building === 'bazaar' && b.storage <= 0) continue;

      if (b.walkerCooldown === undefined) b.walkerCooldown = 1;
      b.walkerCooldown--;

      if (b.walkerCooldown <= 0) {
        const spawnTile = findAdjacentRoad(state, b);
        if (spawnTile) {
          state.walkers.push({
            id: nextWalkerId++,
            type: svc.service,
            buildingId: b.id,
            x: spawnTile[0],
            y: spawnTile[1],
            prevX: -1,
            prevY: -1,
            fromX: spawnTile[0],
            fromY: spawnTile[1],
            stepsRemaining: WALKER_MAX_STEPS,
          });
        }
        b.walkerCooldown = WALKER_SPAWN_INTERVAL;
      }
    }
  }
}

// ── Move every walker one road tile ────────────────────────
export function stepWalkers(state) {
  const toRemove = [];

  for (const w of state.walkers) {
    // Remove walker if its road was demolished
    const currentTile = getTile(state.grid, w.x, w.y);
    if (!currentTile || !currentTile.building || currentTile.building.type !== 'road') {
      toRemove.push(w.id);
      continue;
    }

    // Apply service coverage at current position
    applyService(state, w);

    if (w.stepsRemaining <= 0) {
      toRemove.push(w.id);
      continue;
    }

    // Pick next road tile
    const next = pickNextRoad(state, w);
    if (!next) {
      toRemove.push(w.id);
      continue;
    }

    w.fromX = w.x;
    w.fromY = w.y;
    w.prevX = w.x;
    w.prevY = w.y;
    w.x = next[0];
    w.y = next[1];
    w.stepsRemaining--;
  }

  if (toRemove.length) {
    const removeSet = new Set(toRemove);
    state.walkers = state.walkers.filter(w => !removeSet.has(w.id));
  }
}

// ── Decay coverage counters and derive boolean flags ───────
export function decayCoverage(state) {
  for (const row of state.grid) {
    for (const tile of row) {
      if (tile.waterCoverage > 0) tile.waterCoverage--;
      if (tile.foodCoverage > 0) tile.foodCoverage--;
      if (tile.religionCoverage > 0) tile.religionCoverage--;
      if (tile.taxCoverage > 0) tile.taxCoverage--;
      if (tile.architectCoverage > 0) tile.architectCoverage--;
      if (tile.fireCoverage > 0) tile.fireCoverage--;

      tile.waterAccess = tile.waterCoverage > 0;
      tile.foodAccess = tile.foodCoverage > 0;
      tile.religionAccess = tile.religionCoverage > 0;
      tile.taxed = tile.taxCoverage > 0;
    }
  }
}

// ── Apply coverage to buildings adjacent to walker ─────────
function applyService(state, walker) {
  const positions = [[walker.x, walker.y], ...neighbors4(walker.x, walker.y)];
  const svc = WALKER_SERVICES.find(s => s.service === walker.type);
  if (!svc) return;

  const hazardService = walker.type === 'architect' || walker.type === 'fire';

  for (const [nx, ny] of positions) {
    const tile = getTile(state.grid, nx, ny);
    if (!tile) continue;
    if (!tile.building) continue;
    // Hazard walkers cover all buildings; other walkers only cover housing
    if (hazardService || tile.building.type === 'housing') {
      tile[svc.coverageKey] = COVERAGE_DURATION;
    }
  }
}

// ── Random-walk: pick next road tile, avoid backtracking ───
function pickNextRoad(state, walker) {
  const adj = neighbors4(walker.x, walker.y);
  const roads = [];

  for (const [nx, ny] of adj) {
    const tile = getTile(state.grid, nx, ny);
    if (tile && tile.building && tile.building.type === 'road') {
      roads.push([nx, ny]);
    }
  }

  if (roads.length === 0) return null;

  // Prefer not backtracking
  if (roads.length > 1) {
    const forward = roads.filter(([rx, ry]) => rx !== walker.prevX || ry !== walker.prevY);
    if (forward.length > 0) {
      return forward[Math.floor(Math.random() * forward.length)];
    }
  }

  return roads[Math.floor(Math.random() * roads.length)];
}

// ── Spawn ambient civilian walkers from populated housing ──
export function spawnCivilians(state) {
  const currentCivs = state.walkers.filter(w => w.type === 'civilian').length;
  if (currentCivs >= CIVILIAN_MAX) return;

  // Collect housing with residents and adjacent roads
  const candidates = [];
  for (const b of state.buildings) {
    if (b.type !== 'housing' || b.currentResidents <= 0) continue;
    const road = findAdjacentRoad(state, b);
    if (road) candidates.push({ building: b, road });
  }
  if (candidates.length === 0) return;

  const toSpawn = Math.min(CIVILIAN_SPAWN_PER_TICK, CIVILIAN_MAX - currentCivs);
  for (let i = 0; i < toSpawn; i++) {
    const pick = candidates[Math.floor(Math.random() * candidates.length)];
    const steps = CIVILIAN_STEPS_MIN + Math.floor(Math.random() * (CIVILIAN_STEPS_MAX - CIVILIAN_STEPS_MIN));
    const colorIdx = Math.floor(Math.random() * COLORS.civilians.length);
    state.walkers.push({
      id: nextWalkerId++,
      type: 'civilian',
      buildingId: pick.building.id,
      x: pick.road[0],
      y: pick.road[1],
      prevX: -1,
      prevY: -1,
      fromX: pick.road[0],
      fromY: pick.road[1],
      stepsRemaining: steps,
      colorIdx,
    });
  }
}

// ── Find an adjacent road tile around a building perimeter ─
function findAdjacentRoad(state, building) {
  const def = BUILDINGS[building.type];
  const [w, h] = def.size;
  const candidates = [];

  // Scan perimeter (one tile outside the building footprint)
  for (let dx = -1; dx <= w; dx++) {
    for (let dy = -1; dy <= h; dy++) {
      if (dx >= 0 && dx < w && dy >= 0 && dy < h) continue; // skip interior
      const tx = building.x + dx;
      const ty = building.y + dy;
      const tile = getTile(state.grid, tx, ty);
      if (tile && tile.building && tile.building.type === 'road') {
        candidates.push([tx, ty]);
      }
    }
  }

  if (candidates.length === 0) return null;
  return candidates[Math.floor(Math.random() * candidates.length)];
}

