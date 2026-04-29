import { BUILDINGS, HOUSING_LEVELS, DESIRABILITY, MAP_W, MAP_H, TERRAIN } from './config.js';
import { getTile, neighbors4, tilesInRange } from './grid.js';
import { buildingsOfType, isStaffed } from './buildings.js';
import { spawnWalkers, decayCoverage, spawnCivilians } from './walkers.js';
import { updateHazards } from './hazards.js';

// ── Main simulation tick ────────────────────────────────────
export function tick(state) {
  state.tick++;
  state.time.month++;
  if (state.time.month > 12) {
    state.time.month = 1;
    state.time.year++;
  }

  updateRoadAccess(state);
  decayCoverage(state);
  spawnWalkers(state);
  spawnCivilians(state);
  updateDesirability(state);
  updateHazards(state);
  updateEmployment(state);
  updateFarmProduction(state);
  updateGranaries(state);
  updateBazaars(state);
  updateHousingEvolution(state);
  updateImmigration(state);
  updateTreasury(state);
  updatePopulationStats(state);
}

// ── Road access (adjacency check — walkers handle other services) ──
function updateRoadAccess(state) {
  const { grid } = state;
  const roads = buildingsOfType(state, 'road');
  const roadSet = new Set();
  for (const r of roads) roadSet.add(`${r.x},${r.y}`);

  for (const b of state.buildings) {
    if (b.type !== 'housing') continue;
    const tile = getTile(grid, b.x, b.y);
    tile.roadAccess = false;
    for (const [nx, ny] of neighbors4(b.x, b.y)) {
      if (roadSet.has(`${nx},${ny}`)) {
        tile.roadAccess = true;
        break;
      }
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
  }

  // Consume food across all housing with walker-delivered food coverage
  // Split consumption evenly across active bazaars that have stock
  let totalConsumption = 0;
  for (const b of state.buildings) {
    if (b.type !== 'housing' || b.currentResidents === 0) continue;
    const tile = getTile(state.grid, b.x, b.y);
    if (tile && tile.foodAccess) {
      totalConsumption += Math.ceil(b.currentResidents * 0.2);
    }
  }

  const activeBazaars = bazaars.filter(b => isStaffed(b) && b.storage > 0);
  if (activeBazaars.length > 0 && totalConsumption > 0) {
    const perBazaar = Math.ceil(totalConsumption / activeBazaars.length);
    for (const baz of activeBazaars) {
      baz.storage = Math.max(0, baz.storage - perBazaar);
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
      const nextDef = HOUSING_LEVELS[nextLevel];
      const req = nextDef.requires;
      let canEvolve = true;
      for (const [key, val] of Object.entries(req)) {
        if (tile[key] !== val) { canEvolve = false; break; }
      }
      // Check desirability requirement
      if (canEvolve && nextDef.desirability > 0 && tile.desirability < nextDef.desirability) {
        canEvolve = false;
      }
      if (canEvolve) {
        b.level = nextLevel;
      }
    }

    // Check if should devolve (lost a service or desirability dropped)
    if (b.level > 0) {
      const curDef = HOUSING_LEVELS[b.level];
      const req = curDef.requires;
      let meetsReqs = true;
      for (const [key, val] of Object.entries(req)) {
        if (tile[key] !== val) { meetsReqs = false; break; }
      }
      if (meetsReqs && curDef.desirability > 0 && tile.desirability < curDef.desirability) {
        meetsReqs = false;
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

// ── Desirability ────────────────────────────────────────────
function updateDesirability(state) {
  const { grid } = state;

  // Clear all desirability
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      grid[y][x].desirability = 0;
    }
  }

  // Apply water terrain bonus
  for (let y = 0; y < MAP_H; y++) {
    for (let x = 0; x < MAP_W; x++) {
      if (grid[y][x].terrain === TERRAIN.WATER) {
        const wd = DESIRABILITY.water;
        for (const [nx, ny] of tilesInRange(x, y, wd.range)) {
          const dist = Math.abs(nx - x) + Math.abs(ny - y);
          if (dist === 0) continue; // skip water tile itself
          const bonus = Math.max(0, wd.value - dist * wd.stepDecay);
          grid[ny][nx].desirability += bonus;
        }
      }
    }
  }

  // Apply building desirability emissions
  for (const b of state.buildings) {
    const d = DESIRABILITY[b.type];
    if (!d) continue;

    // Use building center for emission
    const cx = b.x + Math.floor(b.width / 2);
    const cy = b.y + Math.floor(b.height / 2);

    for (const [nx, ny] of tilesInRange(cx, cy, d.range)) {
      // Don't apply to own tiles
      const tile = grid[ny][nx];
      if (tile.building === b) continue;
      const dist = Math.abs(nx - cx) + Math.abs(ny - cy);
      const effect = d.value > 0
        ? Math.max(0, d.value - dist * d.stepDecay)
        : Math.min(0, d.value + dist * d.stepDecay);
      tile.desirability += effect;
    }
  }
}


