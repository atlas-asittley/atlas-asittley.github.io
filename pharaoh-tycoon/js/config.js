// ── Game Constants ──────────────────────────────────────────
export const TILE_SIZE = 32;
export const MAP_W = 60;
export const MAP_H = 40;

// Visible on-screen build tag so deployed versions are easy to verify.
export const BUILD_VERSION = 'gfx-pass 7a467b7 / site-sync 6fe9b5f';

export const SIM_INTERVAL_MS = 2000; // base tick interval at 1x speed

// ── Walker constants ───────────────────────────────────────
export const WALKER_STEP_MS = 400;        // ms between walker steps at 1x
export const WALKER_MAX_STEPS = 40;       // tiles a walker travels before despawning
export const WALKER_SPAWN_INTERVAL = 8;   // sim ticks between walker spawns per building
export const COVERAGE_DURATION = 25;      // sim ticks that walker coverage persists

// ── Civilian / ambient walker constants ───────────────────
export const CIVILIAN_MAX = 30;           // max civilians on map at once
export const CIVILIAN_STEPS_MIN = 12;     // min steps before despawn
export const CIVILIAN_STEPS_MAX = 25;     // max steps before despawn
export const CIVILIAN_SPAWN_PER_TICK = 3; // civilians to try spawning per sim tick

// ── Hazard constants ──────────────────────────────────────
export const FIRE_THRESHOLD = 60;         // ticks without fire coverage before fire event
export const COLLAPSE_THRESHOLD = 60;     // ticks without architect coverage before collapse
export const HAZARD_SPREAD_CHANCE = 0.3;  // chance fire spreads to adjacent building

// ── Terrain types ───────────────────────────────────────────
export const TERRAIN = {
  DESERT:     'desert',
  FLOODPLAIN: 'floodplain',
  WATER:      'water',
  ROCK:       'rock',
};

// ── Colors ──────────────────────────────────────────────────
export const COLORS = {
  // terrain
  desert1:     '#d4a574',
  desert2:     '#c99b6a',
  floodplain1: '#8db580',
  floodplain2: '#7da570',
  water1:      '#4a90b8',
  water2:      '#3a80a8',
  rock1:       '#9a8a7a',
  rock2:       '#8a7a6a',
  // buildings
  road:        '#b89a6a',
  housing:     ['#c8b090','#c0a880','#b8a070','#a89060','#987850'],
  farm:        '#6aaa50',
  granary:     '#8b4513',
  bazaar:      '#9b59b6',
  well:        '#3498db',
  taxCollector:'#f1c40f',
  temple:      '#e8d5b7',
  // UI
  bgDark:      '#1a1410',
  bgPanel:     '#2a2218',
  gold:        '#d4a04a',
  textLight:   '#e8dcc8',
  textDim:     '#8a7a6a',
  highlight:   'rgba(255,255,100,0.3)',
  invalid:     'rgba(255,50,50,0.4)',
  // new buildings
  architect:   '#7f8c8d',
  firehouse:   '#e74c3c',
  garden:      '#27ae60',
  // walkers
  walkerFood:      '#9b59b6',
  walkerWater:     '#3498db',
  walkerReligion:  '#dcc8a0',
  walkerTax:       '#f1c40f',
  walkerArchitect: '#7f8c8d',
  walkerFire:      '#e74c3c',
  // civilian walker palette (randomized per walker)
  civilians: ['#c4a67a','#a88b5e','#8b7355','#b39670','#d4b896','#9a8060'],
};

// ── Building Definitions ────────────────────────────────────
export const BUILDINGS = {
  road: {
    name: 'Road',
    key: 'road',
    category: 'infrastructure',
    cost: 4,
    maintenance: 0,
    size: [1, 1],
    workers: 0,
    description: 'Connects buildings. Housing needs road access to grow.',
    terrain: [TERRAIN.DESERT, TERRAIN.FLOODPLAIN],
    symbol: '=',
  },
  housing: {
    name: 'Housing Plot',
    key: 'housing',
    category: 'housing',
    cost: 10,
    maintenance: 0,
    size: [1, 1],
    workers: 0,
    description: 'Citizens settle here. Evolves with services.',
    terrain: [TERRAIN.DESERT],
    symbol: 'H',
  },
  farm: {
    name: 'Farm',
    key: 'farm',
    category: 'food',
    cost: 50,
    maintenance: 4,
    size: [3, 3],
    workers: 10,
    description: 'Grows grain on floodplain tiles. Needs workers.',
    terrain: [TERRAIN.FLOODPLAIN],
    symbol: 'F',
    production: 8, // grain per tick when fully staffed
  },
  granary: {
    name: 'Granary',
    key: 'granary',
    category: 'food',
    cost: 100,
    maintenance: 3,
    size: [2, 2],
    workers: 4,
    capacity: 200,
    description: 'Stores grain from farms.',
    terrain: [TERRAIN.DESERT, TERRAIN.FLOODPLAIN],
    symbol: 'G',
  },
  bazaar: {
    name: 'Bazaar',
    key: 'bazaar',
    category: 'food',
    cost: 80,
    maintenance: 3,
    size: [2, 2],
    workers: 6,
    range: 8,
    description: 'Sends food walkers along roads to deliver food to housing.',
    terrain: [TERRAIN.DESERT],
    symbol: 'B',
  },
  well: {
    name: 'Well',
    key: 'well',
    category: 'services',
    cost: 30,
    maintenance: 1,
    size: [1, 1],
    workers: 1,
    range: 4,
    description: 'Sends water carriers along roads to provide water access.',
    terrain: [TERRAIN.DESERT, TERRAIN.FLOODPLAIN],
    symbol: 'W',
  },
  taxCollector: {
    name: 'Tax Office',
    key: 'taxCollector',
    category: 'services',
    cost: 50,
    maintenance: 2,
    size: [1, 1],
    workers: 2,
    range: 6,
    description: 'Sends tax collectors along roads to collect taxes from housing.',
    terrain: [TERRAIN.DESERT],
    symbol: 'T',
  },
  temple: {
    name: 'Temple',
    key: 'temple',
    category: 'services',
    cost: 150,
    maintenance: 5,
    size: [2, 2],
    workers: 4,
    range: 8,
    description: 'Sends priests along roads to provide religion access.',
    terrain: [TERRAIN.DESERT],
    symbol: 'R',
  },
  architect: {
    name: "Architect's Post",
    key: 'architect',
    category: 'safety',
    cost: 60,
    maintenance: 2,
    size: [1, 1],
    workers: 2,
    range: 6,
    description: 'Sends architects along roads to prevent building collapse.',
    terrain: [TERRAIN.DESERT],
    symbol: 'A',
  },
  firehouse: {
    name: 'Firehouse',
    key: 'firehouse',
    category: 'safety',
    cost: 60,
    maintenance: 2,
    size: [1, 1],
    workers: 2,
    range: 6,
    description: 'Sends firefighters along roads to prevent fires.',
    terrain: [TERRAIN.DESERT],
    symbol: '!',
  },
  garden: {
    name: 'Garden',
    key: 'garden',
    category: 'beautification',
    cost: 20,
    maintenance: 1,
    size: [1, 1],
    workers: 0,
    description: 'Increases desirability of nearby housing. Place near homes for better evolution.',
    terrain: [TERRAIN.DESERT],
    symbol: '*',
  },
};

// ── Desirability Emitters ───────────────────────────────────
// Each building type: [value emitted per tile, range in Manhattan distance]
// Positive = attractive, negative = repulsive
export const DESIRABILITY = {
  garden:      { value: 4,  range: 4,  stepDecay: 1 },  // +4 at center, -1 per tile distance
  temple:      { value: 3,  range: 3,  stepDecay: 1 },
  well:        { value: 1,  range: 2,  stepDecay: 0.5 },
  farm:        { value: -3, range: 4,  stepDecay: 0.75 },
  granary:     { value: -2, range: 3,  stepDecay: 0.66 },
  bazaar:      { value: -1, range: 2,  stepDecay: 0.5 },
  firehouse:   { value: -1, range: 2,  stepDecay: 0.5 },
  architect:   { value: -1, range: 2,  stepDecay: 0.5 },
  taxCollector:{ value: -1, range: 2,  stepDecay: 0.5 },
  water:       { value: 3,  range: 3,  stepDecay: 1 },  // water terrain bonus
};

// ── Housing Evolution ───────────────────────────────────────
// Each level: [name, maxResidents, requirements]
// desirability is a minimum tile desirability score (checked separately)
export const HOUSING_LEVELS = [
  { name: 'Empty Plot',         residents: 0,  requires: {},                                                                                     desirability: 0 },
  { name: 'Crude Hut',          residents: 3,  requires: { roadAccess: true },                                                                   desirability: 0 },
  { name: 'Sturdy Hut',         residents: 5,  requires: { roadAccess: true, waterAccess: true },                                                desirability: 0 },
  { name: 'Modest Dwelling',    residents: 8,  requires: { roadAccess: true, waterAccess: true, foodAccess: true },                              desirability: 0 },
  { name: 'Spacious Dwelling',  residents: 12, requires: { roadAccess: true, waterAccess: true, foodAccess: true, religionAccess: true },        desirability: 4 },
  { name: 'Elegant Residence',  residents: 18, requires: { roadAccess: true, waterAccess: true, foodAccess: true, religionAccess: true, taxed: true }, desirability: 8 },
];
