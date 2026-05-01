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
  traderPrices: {},      // resource_key -> { buy_price, sell_price }
  selectedBuildType: null,
  prodTimer: null,
  channel: null,
  tradeAmounts: {},
  // Phase 2A trade policy state
  tradePolicies: {},     // resource_key -> { mode, reserve_target }
  lastVisit: null,       // most recent trader_visits row
  nextVisitAt: null,     // when the next visit is due
  visitChecked: false    // whether we've checked for a visit this session
};
