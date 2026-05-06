// ── Constants ──
// Legacy default city center used as a fallback when the player's profile
// hasn't been loaded yet (or pre-M1 schemas). After M1, the authoritative
// home coords are state.profile.home_x / home_y, set when the player's
// first chunk is allocated.
export var CITY_CENTER_X = 7;
export var CITY_CENTER_Y = 7;

// Currently-inspected building (set by inspector.js). renderMap consults it
// to highlight the inspected extractor's target resource tile.
export var inspectedBuildingHolder = { value: null };

// Player's home (city-center) coordinates. Falls back to legacy (7,7) if the
// profile hasn't been loaded yet.
export function getHomeX() {
  return (state.profile && state.profile.home_x !== null && state.profile.home_x !== undefined)
    ? state.profile.home_x : CITY_CENTER_X;
}
export function getHomeY() {
  return (state.profile && state.profile.home_y !== null && state.profile.home_y !== undefined)
    ? state.profile.home_y : CITY_CENTER_Y;
}

// Tile ownership predicates. Useful for UI gating before the server check.
export function isMyTile(tile) {
  if (!tile || !state.currentUser) return false;
  return tile.owner_player_id === state.currentUser.id;
}
export function isWildernessTile(tile) {
  return !!tile && (tile.owner_player_id === null || tile.owner_player_id === undefined);
}

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
  gridRows: 15,
  // District expansion picker — set when the player taps "+ Expand" and
  // the server returns the candidate chunks they can claim. Each entry
  // is { chunk_x, chunk_y }. While non-empty, the map renders these
  // chunks as buyable territory; tapping one allocates it.
  expansionCandidates: [],
  expansionCost: 0
};

// ── Grid bounds: compute dynamic grid size from tiles ──
// Also widens to include any expansion-candidate chunks so the picker can
// render unallocated territory as empty cells the player can tap.
export function computeGridBounds() {
  var minX = 0, minY = 0, maxX = 14, maxY = 14;
  state.tiles.forEach(function (t) {
    if (t.x < minX) minX = t.x;
    if (t.y < minY) minY = t.y;
    if (t.x > maxX) maxX = t.x;
    if (t.y > maxY) maxY = t.y;
  });
  state.expansionCandidates.forEach(function (c) {
    var cMinX = c.chunk_x * 15;
    var cMaxX = c.chunk_x * 15 + 14;
    var cMinY = c.chunk_y * 15;
    var cMaxY = c.chunk_y * 15 + 14;
    if (cMinX < minX) minX = cMinX;
    if (cMaxX > maxX) maxX = cMaxX;
    if (cMinY < minY) minY = cMinY;
    if (cMaxY > maxY) maxY = cMaxY;
  });
  state.gridMinX = minX;
  state.gridMinY = minY;
  state.gridMaxX = maxX;
  state.gridMaxY = maxY;
  state.gridCols = maxX - minX + 1;
  state.gridRows = maxY - minY + 1;
}

// ── Roads: compute which buildings have road access ──
// A building has road access if any orthogonal neighbor is a road building.
// Pre-placed "highway" roads are just regular road buildings with the
// system as the implicit placer, so this check naturally covers them.
export function computeRoadAccess() {
  if (!state.currentUser) return;

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

    // Roads themselves don't need road access (they ARE the roads).
    if (bt.category === 'road') return;

    // Every other production category — extractor, food_extractor,
    // processor, service, tax, booster — now needs road access to
    // operate. Housing keeps its tier-config gate (tier 0 shanties
    // don't need roads).
    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'housing'
        || bt.category === 'service'  || bt.category === 'tax'
        || bt.category === 'booster') {
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

  // Worker supply is server-authoritative. The server uses
  //   worker_capacity = floor(population) + tavern_bonus
  // where housing_tier_config.workers determines the *target* population
  // a city grows toward, NOT the current worker pool. Population grows
  // toward the target as conditions permit (food, happiness, etc.) — so
  // a brand-new tier-1 hut doesn't immediately hand you 6 workers.
  //
  // We previously computed `5 + sum(housing_tier_config.workers)` here,
  // which gave the *target* and made every panel optimistically claim
  // the city was fully staffed long before the population had actually
  // arrived. Trust the server's worker_capacity (refreshed each 30s
  // production tick) so the top bar, inspector, and unstaffedIds all
  // reflect the actual current workforce.
  var workerSupply = (state.profile && state.profile.worker_capacity) || 5;

  // Get worker-consuming buildings sorted by priority DESC, then created_at ASC.
  // Mirrors the server's staffing loop in process_production: every
  // production category requires road access now (extractors, food
  // extractors, boosters included — previously they were unconditional).
  var prodBuildings = myBuildings.filter(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || b.status !== 'active') return false;
    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'service'
        || bt.category === 'tax' || bt.category === 'booster') {
      return !!state.roadAccessIds[b.id];
    }
    return false;
  }).sort(function (a, b) {
    var pa = a.staffing_priority !== undefined ? a.staffing_priority : 1;
    var pb = b.staffing_priority !== undefined ? b.staffing_priority : 1;
    if (pa !== pb) return pb - pa;  // higher priority first
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
