// ── Game Constants ──────────────────────────────────────────
export const TILE_SIZE = 32;
export const MAP_W = 60;
export const MAP_H = 40;

export const SIM_INTERVAL_MS = 2000; // base tick interval at 1x speed

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
    description: 'Distributes food to nearby housing.',
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
    workers: 0,
    range: 4,
    description: 'Provides water access to nearby housing.',
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
    description: 'Collects taxes from nearby housing.',
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
    description: 'Provides religion to nearby housing. Enables higher evolution.',
    terrain: [TERRAIN.DESERT],
    symbol: 'R',
  },
};

// ── Housing Evolution ───────────────────────────────────────
// Each level: [name, maxResidents, requirements]
export const HOUSING_LEVELS = [
  { name: 'Empty Plot',         residents: 0,  requires: {} },
  { name: 'Crude Hut',          residents: 3,  requires: { roadAccess: true } },
  { name: 'Sturdy Hut',         residents: 5,  requires: { roadAccess: true, waterAccess: true } },
  { name: 'Modest Dwelling',    residents: 8,  requires: { roadAccess: true, waterAccess: true, foodAccess: true } },
  { name: 'Spacious Dwelling',  residents: 12, requires: { roadAccess: true, waterAccess: true, foodAccess: true, religionAccess: true } },
  { name: 'Elegant Residence',  residents: 18, requires: { roadAccess: true, waterAccess: true, foodAccess: true, religionAccess: true, taxed: true } },
];
