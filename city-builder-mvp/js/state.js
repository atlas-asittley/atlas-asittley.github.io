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
  traderQuotas: {},      // trader_key -> resource_key -> {buy_cap, buy_used, sell_cap, sell_used}
  housingLifestyleDemands: {},  // tier -> [{resource_key, qty_per_minute}]
  buildingResourceCosts: {},    // building_type_key -> [{resource_key, quantity}]
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
//
// We start undefined (rather than 0/0/14/14) and fall back to that 15x15
// default only when there's NO data to anchor on — otherwise the
// defaults act as a floor and produce dark-green "empty-cell" zones
// outside the actual city. Specifically: when another player resets and
// their old chunks vanish from the top of the map, the bounds used to
// stay anchored at y=0 even though no tiles exist up there. The grid
// then iterated y=0..59 painting a dark-green strip above the surviving
// districts. With dynamic bounds the grid only covers actual content.
export function computeGridBounds() {
  var minX, minY, maxX, maxY;
  function widen(x, y) {
    if (minX === undefined || x < minX) minX = x;
    if (minY === undefined || y < minY) minY = y;
    if (maxX === undefined || x > maxX) maxX = x;
    if (maxY === undefined || y > maxY) maxY = y;
  }
  state.tiles.forEach(function (t) { widen(t.x, t.y); });
  state.expansionCandidates.forEach(function (c) {
    widen(c.chunk_x * 15, c.chunk_y * 15);
    widen(c.chunk_x * 15 + 14, c.chunk_y * 15 + 14);
  });
  if (minX === undefined) { minX = 0; minY = 0; maxX = 14; maxY = 14; }
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
    // processor, service, tax, booster, police — now needs road access
    // to operate. Housing keeps its tier-config gate (tier 0 shanties
    // don't need roads). Police was missing here, which matched a
    // mirror bug in computeLaborAllocation that under-counted workers
    // needed by the city's police footprint.
    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'housing'
        || bt.category === 'service'  || bt.category === 'tax'
        || bt.category === 'booster'  || bt.category === 'police'
        || bt.category === 'transport_hub' || bt.category === 'transport_connector') {
      // Perimeter check: any road tile orthogonal to ANY tile of the
      // building's footprint counts. The anchor-only check missed roads
      // adjacent to the right/bottom edges of multi-tile buildings.
      var fw = bt.footprint_w || 1;
      var fh = bt.footprint_h || 1;
      var hasAccess = false;
      for (var dx = 0; dx < fw && !hasAccess; dx++) {
        if (roadTiles[(b.x + dx) + ',' + (b.y - 1)]) hasAccess = true;
        if (roadTiles[(b.x + dx) + ',' + (b.y + fh)]) hasAccess = true;
      }
      for (var dy = 0; dy < fh && !hasAccess; dy++) {
        if (roadTiles[(b.x - 1) + ',' + (b.y + dy)]) hasAccess = true;
        if (roadTiles[(b.x + fw) + ',' + (b.y + dy)]) hasAccess = true;
      }

      if (bt.category === 'housing') {
        var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
        var tierCfg = state.housingTierConfig[tier];
        if (tierCfg && !tierCfg.needs_road) {
          if (hasAccess) roadAccessIds[b.id] = true;
          return;
        }
      }

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

  // Worker supply is server-authoritative. Trust state.profile.worker_capacity
  // (= floor(population) + tavern_bonus on the server). Computing
  // 5 + sum(housing_tier_config.workers) client-side gave the *target*,
  // which made every panel optimistically claim the city was fully
  // staffed long before the population had actually arrived.
  var workerSupply = (state.profile && state.profile.worker_capacity) || 5;

  // Total housing capacity = population floor + housing supply. The
  // floor (post-tutorial 15, in-tutorial 0) is the baseline of
  // citizens that exist regardless of housing — without including it
  // here, the top bar shows pop=95 / capacity=80 when in fact
  // server target = floor + supply = 15 + 80 = 95 and pop is exactly
  // at target. Including the floor keeps pop ≤ capacity always.
  var housingSupply = 0;
  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category !== 'housing' || b.status !== 'active') return;
    var tier = b.housing_tier !== undefined ? b.housing_tier : 0;
    var tierCfg = state.housingTierConfig[tier];
    if (!tierCfg) return;
    var hasRoad = !tierCfg.needs_road || state.roadAccessIds[b.id];
    if (!hasRoad) return;
    housingSupply += tierCfg.workers || 0;
  });
  var inTutorial = state.profile && state.profile.tutorial_step != null
    && state.profile.tutorial_step < 4;
  var popFloor = inTutorial ? 0 : 15;
  var housingCapacity = popFloor + housingSupply;

  // Get worker-consuming buildings sorted by priority DESC, then
  // created_at ASC. Mirrors the server's _pp_workers_needed staffing
  // query, which lists categories: extractor, food_extractor, booster,
  // processor, tax, service, police. Police was missing here — without
  // it, every police building's worker_cost was a phantom "idle
  // worker" in the inspector (Jill saw 15 idle even though she was
  // staffed at full capacity).
  // Mirror server _pp_staff_buildings: same category list (NO transport
  // — transport_hub / transport_connector aren't actually staffed,
  // they're infrastructure with no per-tick effect that depends on
  // workers), and same ordering — service/police get a category-tier
  // bonus so they're staffed before production when supply is tight,
  // then per-building staffing_priority DESC, then created_at ASC.
  var prodBuildings = myBuildings.filter(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || b.status !== 'active') return false;
    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'service'
        || bt.category === 'tax' || bt.category === 'booster'
        || bt.category === 'police') {
      return !!state.roadAccessIds[b.id];
    }
    return false;
  }).sort(function (a, b) {
    var bta = state.buildingTypes[a.building_type_key];
    var btb = state.buildingTypes[b.building_type_key];
    var ta = (bta && (bta.category === 'service' || bta.category === 'police')) ? 2 : 1;
    var tb = (btb && (btb.category === 'service' || btb.category === 'police')) ? 2 : 1;
    if (ta !== tb) return tb - ta;  // service/police first
    var pa = a.staffing_priority !== undefined ? a.staffing_priority : 1;
    var pb = b.staffing_priority !== undefined ? b.staffing_priority : 1;
    if (pa !== pb) return pb - pa;
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
    housingCapacity: housingCapacity,
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
  var cityBuildings = state.allBuildings;  // every player's buildings in the shared city
  var hasProcessor = myBuildings.some(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'processor';
  });
  var totalBuildings = myBuildings.length;

  // ── Transport network access (mirrors the server's
  // _player_has_transport_access) ──
  // Per-mode: city has hubs, player owns hub OR truck-depot.
  function modeHubKey(mode) {
    return mode === 'airport' ? 'airport'
         : mode === 'seaport' ? 'seaport'
         : mode === 'train'   ? 'train_depot' : null;
  }
  function isHub(b, mode) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'transport_hub'
        && b.status === 'active'
        && b.building_type_key === modeHubKey(mode)
        && state.roadAccessIds[b.id];
  }
  function isTruckDepot(b) {
    return b.building_type_key === 'truck_depot' && b.status === 'active' && state.roadAccessIds[b.id];
  }
  function cityTiersForMode(mode) {
    var t = 0;
    if (mode === 'truck') {
      cityBuildings.forEach(function (b) {
        if (isTruckDepot(b)) t += 1 + (b.expansion_level || 0);
      });
      return t;
    }
    cityBuildings.forEach(function (b) {
      if (isHub(b, mode)) t += 1 + (b.expansion_level || 0);
    });
    return t;
  }
  function playerHasAccess(mode) {
    if (mode === 'truck') {
      return myBuildings.some(isTruckDepot);
    }
    // Owns a hub of mode (road-connected)?
    if (myBuildings.some(function (b) { return isHub(b, mode); })) return true;
    // Owns a road-connected truck depot AND city has any road-connected hub?
    var hasTruck = myBuildings.some(isTruckDepot);
    if (!hasTruck) return false;
    return cityBuildings.some(function (b) { return isHub(b, mode); });
  }

  state.unlockedTraders = {};
  Object.keys(state.traders).forEach(function (tk) {
    var t = state.traders[tk];
    if (tk === 'river_traders') {
      // Renamed to "Neighboring City" 2026-05-08 — always-on starter
      // trader providing modest income until transport hubs unlock
      // bigger routes.
      state.unlockedTraders[tk] = { unlocked: true, hint: '' };
    } else if (tk === 'desert_caravan' || tk === 'mountain_folk') {
      // Collapsed into Neighboring City; their is_active flag is false
      // server-side so they don't visit. Locked here too.
      state.unlockedTraders[tk] = { unlocked: false, hint: 'Retired — collapsed into Neighboring City.' };
    } else if (t && t.transport_mode) {
      // Transport-mode trader: gated on city-tier + per-player access.
      var cityTiers = cityTiersForMode(t.transport_mode);
      var hasAccess = playerHasAccess(t.transport_mode);
      var unlocked = (t.tier <= cityTiers) && hasAccess;
      var hint = '';
      if (!unlocked) {
        var hubName = (t.transport_mode === 'airport') ? 'Airport'
                    : (t.transport_mode === 'seaport') ? 'Seaport'
                    : (t.transport_mode === 'train')   ? 'Train Depot'
                    : 'Truck Depot';
        if (t.tier > cityTiers) {
          hint = 'Build ' + (t.tier === 1 ? 'a' : 'another') + ' '
               + hubName + ' (or expand an existing one) in the city.';
        } else if (!hasAccess) {
          hint = (t.transport_mode === 'truck')
            ? 'Build a Truck Depot to unlock this trader.'
            : 'Build a Truck Depot to plug into the city\'s ' + t.transport_mode + ' network.';
        }
      }
      state.unlockedTraders[tk] = { unlocked: unlocked, hint: hint };
    } else {
      state.unlockedTraders[tk] = { unlocked: false, hint: 'Not yet available.' };
    }
  });

  if (state.selectedTrader && state.unlockedTraders[state.selectedTrader] && !state.unlockedTraders[state.selectedTrader].unlocked) {
    var unlocked2 = Object.keys(state.traders).filter(function (tk) {
      return state.unlockedTraders[tk] && state.unlockedTraders[tk].unlocked;
    });
    state.selectedTrader = unlocked2.length > 0 ? unlocked2[0] : null;
  }
}
