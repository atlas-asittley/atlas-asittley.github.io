import { FIRE_THRESHOLD, COLLAPSE_THRESHOLD, HAZARD_SPREAD_CHANCE } from './config.js';
import { getTile, neighbors4 } from './grid.js';
import { removeBuilding } from './buildings.js';

const HAZARD_IMMUNE = new Set(['road', 'garden']);

// ── Hazards (fire & collapse) ──────────────────────────────
export function updateHazards(state) {
  const toDestroy = [];

  for (const b of state.buildings) {
    if (HAZARD_IMMUNE.has(b.type)) continue;

    const tile = getTile(state.grid, b.x, b.y);
    if (!tile) continue;

    // Handle buildings currently on fire
    if (b.onFire) {
      b.fireTicks--;
      if (b.fireTicks <= 0) {
        toDestroy.push(b);
      }
      continue;
    }

    // Accumulate fire risk if not covered by fire walkers
    if (tile.fireCoverage > 0) {
      b.fireRisk = 0;
    } else {
      b.fireRisk++;
    }

    // Accumulate collapse risk if not covered by architect walkers
    if (tile.architectCoverage > 0) {
      b.collapseRisk = 0;
    } else {
      b.collapseRisk++;
    }

    // Fire event
    if (b.fireRisk >= FIRE_THRESHOLD) {
      b.onFire = true;
      b.fireTicks = 8; // burns for 8 ticks before destruction
      b.fireRisk = 0;
      // Chance to spread — check full building perimeter, not just top-left
      const spread = new Set();
      for (let dy = 0; dy < b.height; dy++) {
        for (let dx = 0; dx < b.width; dx++) {
          for (const [nx, ny] of neighbors4(b.x + dx, b.y + dy)) {
            const adj = getTile(state.grid, nx, ny);
            if (adj && adj.building && adj.building !== b && !adj.building.onFire && !HAZARD_IMMUNE.has(adj.building.type)) {
              if (!spread.has(adj.building.id) && Math.random() < HAZARD_SPREAD_CHANCE) {
                spread.add(adj.building.id);
                adj.building.onFire = true;
                adj.building.fireTicks = 8;
                adj.building.fireRisk = 0;
              }
            }
          }
        }
      }
    }

    // Collapse event — instant destruction
    if (b.collapseRisk >= COLLAPSE_THRESHOLD) {
      toDestroy.push(b);
    }
  }

  // Destroy buildings (iterate copy to avoid mutation issues)
  for (const b of toDestroy) {
    removeBuilding(state, b, { refund: false });
  }
}
