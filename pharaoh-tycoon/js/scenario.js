import { BUILDINGS, HOUSING_LEVELS } from './config.js';
import { buildingsOfType } from './buildings.js';

// ── Scenario Definitions ───────────────────────────────────
// Each scenario has a name, description, and a list of goals.
// Goals: { type, target, label }
//   type: 'population' | 'gold' | 'housing_level' | 'building_count'
//   target: number threshold
//   param: extra param (e.g. building type, housing level)

export const SCENARIOS = {
  sandbox: {
    name: 'Sandbox',
    description: 'Free play — no objectives. Build at your own pace.',
    goals: [],
  },
  village: {
    name: 'Village of the Nile',
    description: 'Establish a thriving village along the Nile. Achieve all objectives to win.',
    goals: [
      { type: 'population', target: 50, label: 'Reach 50 population' },
      { type: 'gold', target: 2000, label: 'Accumulate 2,000 gold' },
      { type: 'housing_level', target: 3, param: 5, label: 'Evolve 5 houses to Modest Dwelling (level 3+)' },
    ],
  },
  prosperity: {
    name: 'Prosperity of Pharaoh',
    description: 'Build a prosperous city worthy of Pharaoh\'s attention.',
    goals: [
      { type: 'population', target: 150, label: 'Reach 150 population' },
      { type: 'gold', target: 5000, label: 'Accumulate 5,000 gold' },
      { type: 'building_count', target: 2, param: 'temple', label: 'Build 2 temples' },
      { type: 'housing_level', target: 4, param: 3, label: 'Evolve 3 houses to Spacious Dwelling (level 4+)' },
      { type: 'building_count', target: 1, param: 'garden', label: 'Build a garden' },
    ],
  },
};

// ── Initialize scenario state on game state ────────────────
export function initScenario(state, scenarioKey) {
  const def = SCENARIOS[scenarioKey];
  if (!def) return;
  state.scenario = {
    key: scenarioKey,
    name: def.name,
    description: def.description,
    goals: def.goals.map(g => ({ ...g, current: 0, completed: false })),
    won: false,
    wonAtTick: 0,
  };
}

// ── Evaluate goal progress (called each sim tick) ──────────
export function updateScenario(state) {
  const sc = state.scenario;
  if (!sc || sc.key === 'sandbox' || sc.won) return;

  for (const goal of sc.goals) {
    if (goal.completed) continue;

    let current = 0;
    switch (goal.type) {
      case 'population':
        current = state.population.total;
        break;
      case 'gold':
        current = state.treasury.gold;
        break;
      case 'housing_level': {
        // Count houses at or above target level
        current = 0;
        for (const b of state.buildings) {
          if (b.type === 'housing' && b.level >= goal.target) current++;
        }
        break;
      }
      case 'building_count':
        current = buildingsOfType(state, goal.param).length;
        break;
    }

    goal.current = current;

    if (goal.type === 'housing_level') {
      // current = count of houses at level >= target, need param of them
      goal.completed = current >= goal.param;
    } else {
      goal.completed = current >= goal.target;
    }
  }

  // Check win
  if (sc.goals.length > 0 && sc.goals.every(g => g.completed)) {
    sc.won = true;
    sc.wonAtTick = state.tick;
  }
}

// ── Get display-ready progress for a goal ──────────────────
export function goalProgress(goal) {
  switch (goal.type) {
    case 'population':
    case 'gold':
      return { current: goal.current, target: goal.target };
    case 'housing_level':
      return { current: goal.current, target: goal.param };
    case 'building_count':
      return { current: goal.current, target: goal.target };
    default:
      return { current: 0, target: 1 };
  }
}
