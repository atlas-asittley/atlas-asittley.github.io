import { BUILDINGS, HOUSING_LEVELS } from './config.js';
import { getTile, tilesInRange, neighbors4 } from './grid.js';
import { buildingsOfType } from './buildings.js';

// ── Main simulation tick ────────────────────────────────────
export function tick(state) {
  state.tick++;
  state.time.month++;
  if (state.time.month > 12) {
    state.time.month = 1;
    state.time.year++;
  }

  updateServiceCoverage(state);
  updateEmployment(state);
  updateFarmProduction(state);
  updateGranaries(state);
  updateBazaars(state);
  updateHousingEvolution(state);
  updateImmigration(state);
  updateTreasury(state);
  updatePopulationStats(state);
}

// ── Service coverage (road, water, food, religion, tax) ─────
function updateServiceCoverage(state) {
  const { grid } = state;
  // Reset all coverage flags
  for (const row of grid) {
    for (const tile of row) {
      tile.roadAccess = false;
      tile.waterAccess = false;
      tile.foodAccess = false;
      tile.religionAccess = false;
      tile.taxed = false;
    }
  }

  // Road access: housing adjacent to a road (or within 2 tiles via roads)
  const roads = buildingsOfType(state, 'road');
  const roadSet = new Set();
  for (const r of roads) roadSet.add(`${r.x},${r.y}`);

  for (const b of state.buildings) {
    if (b.type !== 'housing') continue;
    // Check if any neighbor tile has a road
    for (const [nx, ny] of neighbors4(b.x, b.y)) {
      if (roadSet.has(`${nx},${ny}`)) {
        getTile(grid, b.x, b.y).roadAccess = true;
        break;
      }
    }
  }

  // Well → water access
  for (const b of buildingsOfType(state, 'well')) {
    if (!isStaffed(b)) continue;
    const range = BUILDINGS.well.range;
    for (const [tx, ty] of tilesInRange(b.x, b.y, range)) {
      getTile(grid, tx, ty).waterAccess = true;
    }
  }

  // Bazaar → food access (handled separately, but mark tiles)
  for (const b of buildingsOfType(state, 'bazaar')) {
    if (!isStaffed(b)) continue;
    if (b.storage <= 0) continue; // needs food to distribute
    const range = BUILDINGS.bazaar.range;
    for (const [tx, ty] of tilesInRange(b.x, b.y, range)) {
      getTile(grid, tx, ty).foodAccess = true;
    }
  }

  // Temple → religion access
  for (const b of buildingsOfType(state, 'temple')) {
    if (!isStaffed(b)) continue;
    const range = BUILDINGS.temple.range;
    for (const [tx, ty] of tilesInRange(b.x, b.y, range)) {
      getTile(grid, tx, ty).religionAccess = true;
    }
  }

  // Tax collector → taxed
  for (const b of buildingsOfType(state, 'taxCollector')) {
    if (!isStaffed(b)) continue;
    const range = BUILDINGS.taxCollector.range;
    for (const [tx, ty] of tilesInRange(b.x, b.y, range)) {
      getTile(grid, tx, ty).taxed = true;
    }
  }
}

// ── Employment ──────────────────────────────────────────────
function updateEmployment(state) {
  // Count total population
  let totalPop = 0;
  for (const b of state.buildings) {
    if (b.type === 'housing') totalPop += b.currentResidents;
  }

  // Assign workers to buildings that need them
  let availableWorkers = totalPop;
  for (const b of state.buildings) {
    if (b.workersNeeded > 0) {
      const assigned = Math.min(b.workersNeeded, availableWorkers);
      b.currentWorkers = assigned;
      availableWorkers -= assigned;
    }
  }

  state.population.total = totalPop;
  state.population.employed = totalPop - availableWorkers;
  state.population.unemployed = availableWorkers;
}

// ── Farm production ─────────────────────────────────────────
function updateFarmProduction(state) {
  for (const b of buildingsOfType(state, 'farm')) {
    if (!isStaffed(b)) continue;
    const staffRatio = b.currentWorkers / b.workersNeeded;
    const output = Math.floor(BUILDINGS.farm.production * staffRatio);
    b.production += output;
  }
}

// ── Granaries collect from farms ────────────────────────────
function updateGranaries(state) {
  const granaries = buildingsOfType(state, 'granary');
  const farms = buildingsOfType(state, 'farm');

  for (const farm of farms) {
    if (farm.production <= 0) continue;
    // Find nearest granary with space
    let nearest = null;
    let nearDist = Infinity;
    for (const g of granaries) {
      if (g.storage >= BUILDINGS.granary.capacity) continue;
      const d = Math.abs(g.x - farm.x) + Math.abs(g.y - farm.y);
      if (d < nearDist) { nearDist = d; nearest = g; }
    }
    if (nearest) {
      const space = BUILDINGS.granary.capacity - nearest.storage;
      const transfer = Math.min(farm.production, space);
      nearest.storage += transfer;
      farm.production -= transfer;
    }
  }

  // Update total food stored
  state.food.stored = granaries.reduce((s, g) => s + g.storage, 0);
  state.food.capacity = granaries.length * BUILDINGS.granary.capacity;
}

// ── Bazaars pull from granaries and distribute ──────────────
function updateBazaars(state) {
  const bazaars = buildingsOfType(state, 'bazaar');
  const granaries = buildingsOfType(state, 'granary');

  for (const baz of bazaars) {
    if (!isStaffed(baz)) continue;
    // Restock from nearest granary
    if (baz.storage < 20) {
      let nearest = null;
      let nearDist = Infinity;
      for (const g of granaries) {
        if (g.storage <= 0) continue;
        const d = Math.abs(g.x - baz.x) + Math.abs(g.y - baz.y);
        if (d < nearDist) { nearDist = d; nearest = g; }
      }
      if (nearest) {
        const take = Math.min(20, nearest.storage);
        nearest.storage -= take;
        baz.storage += take;
      }
    }

    // Consume food for nearby housing
    const range = BUILDINGS.bazaar.range;
    const nearby = tilesInRange(baz.x, baz.y, range);
    for (const [tx, ty] of nearby) {
      const tile = getTile(state.grid, tx, ty);
      if (tile && tile.building && tile.building.type === 'housing' && tile.building.currentResidents > 0) {
        const consumed = Math.ceil(tile.building.currentResidents * 0.2);
        if (baz.storage >= consumed) {
          baz.storage -= consumed;
        }
      }
    }
  }
}

// ── Housing evolution ───────────────────────────────────────
function updateHousingEvolution(state) {
  for (const b of state.buildings) {
    if (b.type !== 'housing') continue;
    const tile = getTile(state.grid, b.x, b.y);
    if (!tile) continue;

    // Check if can evolve up
    const nextLevel = b.level + 1;
    if (nextLevel < HOUSING_LEVELS.length) {
      const req = HOUSING_LEVELS[nextLevel].requires;
      let canEvolve = true;
      for (const [key, val] of Object.entries(req)) {
        if (tile[key] !== val) { canEvolve = false; break; }
      }
      if (canEvolve) {
        b.level = nextLevel;
      }
    }

    // Check if should devolve (lost a service)
    if (b.level > 0) {
      const req = HOUSING_LEVELS[b.level].requires;
      let meetsReqs = true;
      for (const [key, val] of Object.entries(req)) {
        if (tile[key] !== val) { meetsReqs = false; break; }
      }
      if (!meetsReqs) {
        b.level = Math.max(0, b.level - 1);
        // Cap residents to new max
        const maxRes = HOUSING_LEVELS[b.level].residents;
        if (b.currentResidents > maxRes) b.currentResidents = maxRes;
      }
    }
  }
}

// ── Immigration ─────────────────────────────────────────────
function updateImmigration(state) {
  // People arrive if there's housing space and the city is attractive
  const houses = buildingsOfType(state, 'housing');
  for (const h of houses) {
    if (h.level === 0) {
      // Empty plot: if it has road access, first person settles
      const tile = getTile(state.grid, h.x, h.y);
      if (tile && tile.roadAccess) {
        h.level = 1;
        h.currentResidents = 1;
      }
      continue;
    }
    const maxRes = HOUSING_LEVELS[h.level].residents;
    if (h.currentResidents < maxRes) {
      // 1-2 immigrants per tick if space available
      const immigrants = Math.min(2, maxRes - h.currentResidents);
      h.currentResidents += immigrants;
    }
  }
}

// ── Treasury ────────────────────────────────────────────────
function updateTreasury(state) {
  let income = 0;
  let expenses = 0;

  // Maintenance costs
  for (const b of state.buildings) {
    const def = BUILDINGS[b.type];
    if (def && def.maintenance) {
      expenses += def.maintenance;
    }
  }

  // Tax income from taxed housing
  for (const b of state.buildings) {
    if (b.type !== 'housing') continue;
    const tile = getTile(state.grid, b.x, b.y);
    if (tile && tile.taxed && b.currentResidents > 0) {
      income += b.currentResidents * (b.level + 1);
    }
  }

  state.treasury.income = income;
  state.treasury.expenses = expenses;
  state.treasury.gold += income - expenses;
  if (state.treasury.gold < 0) state.treasury.gold = 0;
}

// ── Population stats ────────────────────────────────────────
function updatePopulationStats(state) {
  let total = 0;
  let capacity = 0;
  for (const b of state.buildings) {
    if (b.type === 'housing') {
      total += b.currentResidents;
      capacity += HOUSING_LEVELS[b.level].residents;
    }
  }
  state.population.total = total;
  state.population.capacity = capacity;
}

// ── Helper ──────────────────────────────────────────────────
function isStaffed(building) {
  if (building.workersNeeded === 0) return true;
  return building.currentWorkers >= Math.ceil(building.workersNeeded * 0.5);
}
