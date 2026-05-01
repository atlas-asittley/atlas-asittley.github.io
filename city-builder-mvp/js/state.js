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
  unlockedTraders: {}    // trader_key -> { unlocked: bool, hint: string }
};

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
