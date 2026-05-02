// ── Constants ──
export var CITY_CENTER_X = 7;
export var CITY_CENTER_Y = 7;

// ── Shared mutable game state ──
export var state = {
  currentUser: null,
  profile: null,
  tiles: [],
  tileMap: {},           // "x,y" -> tile object
  allBuildings: [],      // all players' buildings
  inventory: {},         // resource_key -> quantity
  buildingTypes: {},     // key -> building_type row
  resources: {},         // key -> resource row
  selectedBuildType: null,
  prodTimer: null,
  channel: null,
  // Black Market state
  blackMarketAmounts: {},  // 'buy-timber' or 'sell-timber' -> quantity
  // Phase 2B trade partner state
  traders: {},           // trader_key -> trader row
  allTraderPrices: {},   // trader_key -> { resource_key -> { buy_price, sell_price } }
  traderPrices: {},      // resource_key -> { buy_price, sell_price } (selected trader, for policy display)
  selectedTrader: null,  // currently selected trader key for detail view
  tradePolicies: {},     // resource_key -> { mode, reserve_target }
  lastVisits: {},        // trader_key -> most recent trader_visits row
  nextVisitAts: {},      // trader_key -> Date of next visit
  visitChecked: false,   // whether we've checked for visits this session
  // Phase 2C: partner unlock state (computed from progression)
  unlockedTraders: {},   // trader_key -> { unlocked: bool, hint: string }
  // Housing & Labor state (computed client-side for UI, authoritative values from server)
  laborInfo: {
    workerSupply: 5,
    workersNeeded: 0,
    workersUsed: 0,
    workersIdle: 5,
    laborShortage: false,
    staffedIds: {},
    unstaffedIds: {}
  },
  // Roads state (computed client-side for UI)
  roadAccessIds: {},     // building id -> true if has road access
  noRoadAccessIds: {},   // building id -> true if requires road but lacks access
  // Housing evolution tier config (loaded from DB)
  housingTierConfig: {},  // tier -> { name, label, workers, needs_road }
  // Client-side map zoom state
  mapZoom: 1,
  // Dynamic grid bounds (computed from tiles)
  gridMinX: 0,
  gridMinY: 0,
  gridMaxX: 14,
  gridMaxY: 14,
  gridCols: 15,
  gridRows: 15
};

// ── Grid bounds: compute dynamic grid size from tiles ──
export function computeGridBounds() {
  var minX = 0, minY = 0, maxX = 14, maxY = 14;
  state.tiles.forEach(function (t) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
  });
  state.gridMinX = minX;
  state.gridMinY = minY;
  state.gridMaxX = maxX;
  state.gridMaxY = maxY;
  state.gridCols = maxX - minX + 1;
  state.gridRows = maxY - minY + 1;
}

// ── Roads: compute which buildings have road access ──
// A building has road access if any orthogonal neighbor has a road building.
// Uses allBuildings (all players' roads count).
export function computeRoadAccess() {
  if (!state.currentUser) return;

  // Build a set of all road tile coordinates
  var roadTiles = {};
  state.allBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'road' && b.status === 'active') {
      roadTiles[b.x + ',' + b.y] = true;
    }
  });

  var myBuildings = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id;
  });

  var roadAccessIds = {};
  var noRoadAccessIds = {};

  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt) return;

    // Roads themselves and extractors don't need road access
    if (bt.category === 'road' || bt.category === 'extractor') return;

    // Processors always require road access.
    // Housing requires road access only if tier config says so (tier 0 shanties don't).
    if (bt.category === 'processor' || bt.category === 'housing') {
      // Check if this housing tier actually needs road
      if (bt.category === 'housing') {
        var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
        var tierCfg = state.housingTierConfig[tier];
        if (tierCfg && !tierCfg.needs_road) {
          // This tier doesn't need road; still track road access (for upgrade checks)
          var hasAccess = roadTiles[(b.x - 1) + ',' + b.y]
            || roadTiles[(b.x + 1) + ',' + b.y]
            || roadTiles[b.x + ',' + (b.y - 1)]
            || roadTiles[b.x + ',' + (b.y + 1)];
          if (hasAccess) roadAccessIds[b.id] = true;
          // Don't add to noRoadAccessIds — this tier is fine without roads
          return;
        }
      }

      var hasAccess = roadTiles[(b.x - 1) + ',' + b.y]
        || roadTiles[(b.x + 1) + ',' + b.y]
        || roadTiles[b.x + ',' + (b.y - 1)]
        || roadTiles[b.x + ',' + (b.y + 1)];
      if (hasAccess) {
        roadAccessIds[b.id] = true;
      } else {
        noRoadAccessIds[b.id] = true;
      }
    }
  });

  state.roadAccessIds = roadAccessIds;
  state.noRoadAccessIds = noRoadAccessIds;
}

// ── Housing & Labor: compute which buildings are staffed (mirrors server rule) ──
// Oldest-built production buildings get workers first. Housing provides workers.
// Housing only provides workers if it has road access.
// Processors only participate in labor if they have road access.
// This is used for map rendering (unstaffed visual) and UI display.
export function computeLaborAllocation() {
  if (!state.currentUser) return;

  // Recompute road access first
  computeRoadAccess();

  var myBuildings = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id;
  });

  // Count workers from housing using tier-aware config
  // Tier 0 (shanty): provides workers without road access
  // Tier 1 (mud hut): provides workers only with road access
  var housingWorkers = 0;
  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'housing' && b.status === 'active') {
      var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var tierCfg = state.housingTierConfig[tier];
      if (tierCfg) {
        if (!tierCfg.needs_road || state.roadAccessIds[b.id]) {
          housingWorkers += tierCfg.workers;
        }
      } else {
        // Fallback: use building_types.workers_provided with road requirement
        if (state.roadAccessIds[b.id]) {
          housingWorkers += (bt.workers_provided || 0);
        }
      }
    }
  });

  var workerSupply = 5 + housingWorkers; // base 5 + housing

  // Get production buildings sorted by creation date (oldest first)
  // Extractors always eligible; processors only with road access
  var prodBuildings = myBuildings.filter(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || b.status !== 'active') return false;
    if (bt.category === 'extractor') return true;
    if (bt.category === 'processor') return !!state.roadAccessIds[b.id];
    return false;
  }).sort(function (a, b) {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  var workersRemaining = workerSupply;
  var workersNeeded = 0;
  var staffedIds = {};
  var unstaffedIds = {};

  prodBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    var cost = bt ? bt.worker_cost : 1;
    workersNeeded += cost;
    if (workersRemaining >= cost) {
      workersRemaining -= cost;
      staffedIds[b.id] = true;
    } else {
      unstaffedIds[b.id] = true;
    }
  });

  state.laborInfo = {
    workerSupply: workerSupply,
    workersNeeded: workersNeeded,
    workersUsed: Math.min(workerSupply, workersNeeded),
    workersIdle: Math.max(0, workerSupply - workersNeeded),
    laborShortage: workersNeeded > workerSupply,
    staffedIds: staffedIds,
    unstaffedIds: unstaffedIds
  };
}

// ── Phase 2C: compute which traders are unlocked based on player progression ──
// Unlock state is computed from existing game state (buildings, etc.) rather than
// persisted in a separate DB table. This avoids a schema migration while remaining
// deterministic. If server-side persistence is needed later, add a
// player_trader_unlocks table and seed it from these same conditions.
export function computeTraderUnlocks() {
  var myBuildings = state.allBuildings.filter(function (b) { return b.player_id === state.currentUser.id; });
  var hasProcessor = myBuildings.some(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'processor';
  });
  var totalBuildings = myBuildings.length;

  state.unlockedTraders = {};
  Object.keys(state.traders).forEach(function (tk) {
    if (tk === 'river_traders') {
      state.unlockedTraders[tk] = { unlocked: true, hint: '' };
    } else if (tk === 'desert_caravan') {
      state.unlockedTraders[tk] = {
        unlocked: hasProcessor,
        hint: hasProcessor ? '' : 'Build a processor (Sawmill or Mason Workshop) to attract refined-goods traders.'
      };
    } else if (tk === 'mountain_folk') {
      state.unlockedTraders[tk] = {
        unlocked: totalBuildings >= 3,
        hint: totalBuildings >= 3 ? '' : 'Expand to 3+ buildings to draw the attention of bulk traders. (' + totalBuildings + '/3)'
      };
    } else {
      // Future partners default to locked
      state.unlockedTraders[tk] = { unlocked: false, hint: 'Not yet available.' };
    }
  });

  // Ensure selected trader is unlocked; fall back to first unlocked
  if (state.selectedTrader && state.unlockedTraders[state.selectedTrader] && !state.unlockedTraders[state.selectedTrader].unlocked) {
    var unlocked = Object.keys(state.traders).filter(function (tk) {
      return state.unlockedTraders[tk] && state.unlockedTraders[tk].unlocked;
    });
    state.selectedTrader = unlocked.length > 0 ? unlocked[0] : null;
  }
}
