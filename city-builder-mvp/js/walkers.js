// ── Walker system: client-side visual walkers on roads ──
// Civilian walkers spawn from road-adjacent housing and walk along roads.
// Purely visual — no gameplay effect. No server interaction needed.
import { state } from './state.js';

// ── Walker config ──
// Per-building roster model: every spawn-eligible building has a target
// walker count via getWalkerTarget(). The spawn tick tops each one up.
// No global cap — total population scales naturally with city size.
var WALKER_MOVE_MS = 1400;        // tile-to-tile travel time (also CSS transition duration)
var WALKER_SPAWN_TICK_MS = 1400;  // spawn-logic tick interval
var WALKER_MAX_STEPS = 14;        // ambient walker lifetime in steps (~20s)
// Cooldown between respawns from the same building. Tier-8 housing has
// a target of 9 walkers and the lifetime is ~20s, so we need cooldown ≤
// 20/9 ≈ 2.2s. 1 tick × 1.4s = 1.4s — keeps up comfortably.
var WALKER_SPAWN_COOLDOWN = 1;
// M2: collector walker pause at the resource end
var COLLECTOR_PAUSE_MS = 1500;

// Per-building target count.
//   non-housing buildings: 1 walker each (lumberjack from the camp,
//     baker from the bakery, clerk from the tax office, etc.).
//   housing: scales by tier so a Palace street is busier than a shanty
//     row. tier 0..8 → 1, 2, 3, 4, 5, 6, 7, 8, 9.
function getWalkerTarget(b) {
  var bt = state.buildingTypes[b.building_type_key];
  if (!bt) return 0;
  if (bt.category === 'road') return 0;
  if (bt.category === 'housing') {
    var tier = b.housing_tier !== undefined ? b.housing_tier : 0;
    var TARGET_BY_TIER = [1, 2, 3, 4, 5, 6, 7, 8, 9];
    return TARGET_BY_TIER[Math.min(tier, TARGET_BY_TIER.length - 1)];
  }
  // extractor / food_extractor / processor / service / tax / booster
  return 1;
}

// ── Persona system: visual variants picked at spawn time ──
// Personas only apply to citizen (housing-spawned) walkers — the
// job-specific walkers (timber/stone/grain/etc.) keep their fixed look.
// Each persona has a sprite variant (or null for the citizen base),
// an optional overlay class, a flavor name, and a `minTier` that gates
// it to a minimum housing tier.
//
// Variety ramps with housing tier:
//   tier 0: 1 type   (just Citizen)
//   tier 1: 3 types  (+ Townsperson, Child)
//   tier 2: 6 types  (+ Elder, Peddler, Dog Walker)
//   tier 3: 8 types  (+ Schoolchild, Well-Fed Citizen)
//   tier 4: 9 types  (+ Happy Couple)
//   tier 5: 10 types (+ Stroller)
//   tier 6: 11 types (+ Fancy Citizen)
// Weights sum to ~100 (when all are unlocked); pickPersona renormalizes
// within the eligible subset.
var PERSONAS = [
  { weight: 30, variant: null,             overlay: null,           name: 'Citizen',          minTier: 0 },
  { weight: 12, variant: null,             overlay: 'has-hat',      name: 'Townsperson',      minTier: 1 },
  { weight: 12, variant: 'walker-child',   overlay: null,           name: 'Child',            minTier: 1 },
  { weight: 8,  variant: 'walker-elder',   overlay: 'has-cane',     name: 'Elder',            minTier: 2 },
  { weight: 5,  variant: null,             overlay: 'has-pack',     name: 'Peddler',          minTier: 2 },
  { weight: 6,  variant: null,             overlay: 'has-pet',      name: 'Dog Walker',       minTier: 2 },
  { weight: 4,  variant: 'walker-child',   overlay: 'has-hat',      name: 'Schoolchild',      minTier: 3 },
  { weight: 8,  variant: 'walker-fat',     overlay: null,           name: 'Well-Fed Citizen', minTier: 3 },
  { weight: 9,  variant: 'walker-couple',  overlay: null,           name: 'Happy Couple',     minTier: 4 },
  { weight: 3,  variant: null,             overlay: 'has-umbrella', name: 'Stroller',         minTier: 5 },
  { weight: 4,  variant: null,             overlay: 'has-cape',     name: 'Fancy Citizen',    minTier: 6 }
];

function pickPersona(tier) {
  if (tier === undefined || tier === null) tier = 0;
  var eligible = [];
  var total = 0;
  for (var i = 0; i < PERSONAS.length; i++) {
    if (PERSONAS[i].minTier <= tier) {
      eligible.push(PERSONAS[i]);
      total += PERSONAS[i].weight;
    }
  }
  if (eligible.length === 0) return PERSONAS[0];
  var r = Math.random() * total;
  var acc = 0;
  for (var j = 0; j < eligible.length; j++) {
    acc += eligible[j].weight;
    if (r < acc) return eligible[j];
  }
  return eligible[0];
}

// ── Walker visual category ──
// Per-building overrides for sprites that differ from the industry
// default — e.g., the sawmill's worker carries a plank, the orchard's
// worker carries a basket. Anything not listed here falls through to
// the industry sprite (walker-timber / walker-stone / walker-clay /
// walker-iron) for industry-locked buildings, or 'citizen' otherwise.
var WALKER_JOB_OVERRIDES = {
  'sawmill':       'sawmill',
  'mill':          'grain',
  'bakery':        'grain',
  'grain_farm':    'grain',
  'orchard':       'orchard',
  'fishing_pier':  'fish',
  'garden':        'garden',
  'well':          'citizen',
  'tavern':        'tavern',
  'bathhouse':     'bathhouse',
  'school':        'school',
  'temple':        'temple',
  'tax_man':       'civic'
};

function getWalkerJob(building) {
  var bt = state.buildingTypes[building.building_type_key];
  if (!bt) return 'citizen';
  if (bt.category === 'housing') return 'citizen';
  var override = WALKER_JOB_OVERRIDES[building.building_type_key];
  if (override) return override;
  // Industry-locked buildings (extractors / processors / boosters / food
  // extractors) inherit their industry's walker sprite.
  if (bt.industry_key === 'timber') return 'timber';
  if (bt.industry_key === 'stone')  return 'stone';
  if (bt.industry_key === 'clay')   return 'clay';
  if (bt.industry_key === 'iron')   return 'iron';
  return 'citizen';
}

// ── Walker state ──
// Each walker owns its own movement timer (`moveTimer`) and DOM element (`el`).
// Movement happens on per-walker setTimeout chains, NOT a global tick — that's
// what desyncs walkers so they don't all reach tile centers in unison.
var walkers = [];                // active walker objects
var spawnTickTimer = null;
var spawnCooldowns = {};         // building_id -> ticks remaining

// ── Road tile lookup (rebuilt on each map change) ──
var roadSet = {};                // "x,y" -> true

export function rebuildRoadSet() {
  roadSet = {};
  state.allBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'road' && b.status === 'active') {
      roadSet[b.x + ',' + b.y] = true;
    }
  });
}

// ── Helpers ──
var DIRS = [
  { dx: 0, dy: -1 }, // north
  { dx: 0, dy: 1 },  // south
  { dx: 1, dy: 0 },  // east
  { dx: -1, dy: 0 }  // west
];

function oppositeDir(dir) {
  return { dx: -dir.dx, dy: -dir.dy };
}

function dirsEqual(a, b) {
  return a.dx === b.dx && a.dy === b.dy;
}

function roadNeighbors(x, y) {
  var result = [];
  for (var i = 0; i < DIRS.length; i++) {
    var nx = x + DIRS[i].dx;
    var ny = y + DIRS[i].dy;
    if (roadSet[nx + ',' + ny]) {
      result.push({ x: nx, y: ny, dir: DIRS[i] });
    }
  }
  return result;
}

// ── Find eligible spawn buildings ──
// Housing and staffed production buildings with road access
function getSpawnBuildings() {
  if (!state.currentUser) return [];
  return state.allBuildings.filter(function (b) {
    if (b.player_id !== state.currentUser.id) return false;
    if (b.status !== 'active') return false;
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt) return false;
    if (bt.category === 'road') return false;
    if (roadNeighbors(b.x, b.y).length === 0) return false;
    // Housing spawns citizens unconditionally; production buildings
    // (extractor/processor/service/tax/booster/food_extractor) only
    // spawn while staffed.
    if (bt.category === 'housing') return true;
    if (state.laborInfo && state.laborInfo.unstaffedIds && state.laborInfo.unstaffedIds[b.id]) {
      return false;
    }
    return true;
  });
}

// ── Pick a starting road tile adjacent to the building ──
function pickSpawnTile(building) {
  var neighbors = roadNeighbors(building.x, building.y);
  if (neighbors.length === 0) return null;
  var pick = neighbors[Math.floor(Math.random() * neighbors.length)];
  return pick;
}

// ── Spawn an ambient walker (housing / staffed processor) ──
function spawnWalker(building) {
  var start = pickSpawnTile(building);
  if (!start) return;
  var w = {
    mode: 'ambient',
    x: start.x,
    y: start.y,
    prevDir: start.dir,
    steps: 0,
    sourceId: building.id,
    sourceTier: building.housing_tier !== undefined ? building.housing_tier : 1,
    sourceType: getWalkerJob(building),
    el: null,
    moveTimer: null
  };
  walkers.push(w);
  ensureWalkerEl(w);
  applyWalkerPosition(w, true);
  // Random initial phase 0..WALKER_MOVE_MS desyncs this walker from existing ones
  scheduleWalkerMove(w, Math.random() * WALKER_MOVE_MS);
}

// ── M2: Spawn a collector walker tied to an extractor with a target ──
// `tour` is the array of {x,y} positions the walker visits in order:
//   [path[0], path[1], ..., path[N-1], target]
// The walker steps through the tour forward, pauses at the resource end,
// then steps back, pauses at the extractor side, and loops indefinitely.
function spawnCollectorWalker(extractor, tour) {
  if (!tour || tour.length < 2) return;
  var w = {
    mode: 'collector',
    x: tour[0].x,
    y: tour[0].y,
    sourceId: extractor.id,
    sourceTier: 1,
    sourceType: getWalkerJob(extractor),
    tour: tour,
    tourIdx: 0,
    direction: 1,         // 1 = outbound, -1 = returning
    el: null,
    moveTimer: null
  };
  walkers.push(w);
  ensureWalkerEl(w);
  applyWalkerPosition(w, true);
  // Random initial phase so collectors from different extractors aren't synced
  scheduleWalkerMove(w, Math.random() * WALKER_MOVE_MS);
}

// ── Schedule one step ──
function scheduleWalkerMove(w, delay) {
  if (delay === undefined) delay = WALKER_MOVE_MS;
  w.moveTimer = setTimeout(function () { walkerStep(w); }, delay);
}

// ── Take one step ──
function walkerStep(w) {
  if (w.mode === 'collector') {
    return collectorStep(w);
  }
  // Ambient walker: random walk on roads
  var neighbors = roadNeighbors(w.x, w.y);
  if (neighbors.length === 0) {
    despawnWalker(w);
    return;
  }
  var back = oppositeDir(w.prevDir);
  var forward = neighbors.filter(function (n) { return !dirsEqual(n.dir, back); });
  var choices = forward.length > 0 ? forward : neighbors;
  var pick = choices[Math.floor(Math.random() * choices.length)];

  w.x = pick.x;
  w.y = pick.y;
  w.prevDir = pick.dir;
  w.steps++;

  applyWalkerPosition(w);

  if (w.steps >= WALKER_MAX_STEPS) {
    // Let the final transition complete, then despawn
    w.moveTimer = setTimeout(function () { despawnWalker(w); }, WALKER_MOVE_MS);
  } else {
    scheduleWalkerMove(w);
  }
}

// ── Collector step: follow the tour forward, pause at end, reverse, loop ──
function collectorStep(w) {
  var lastIdx = w.tour.length - 1;
  var nextIdx = w.tourIdx + w.direction;

  // Boundary handling — flip direction with a pause
  if (nextIdx < 0) {
    // At extractor end: brief pause, then start a new outbound trip
    w.direction = 1;
    w.moveTimer = setTimeout(function () { collectorStep(w); }, COLLECTOR_PAUSE_MS);
    return;
  }
  if (nextIdx > lastIdx) {
    // At resource end: pause with the work animation, then turn back
    w.direction = -1;
    w.moveTimer = setTimeout(function () { collectorStep(w); }, COLLECTOR_PAUSE_MS);
    return;
  }

  w.tourIdx = nextIdx;
  var pos = w.tour[w.tourIdx];
  w.x = pos.x;
  w.y = pos.y;
  applyWalkerPosition(w);
  scheduleWalkerMove(w);
}

// ── Tear down a walker ──
function despawnWalker(w) {
  if (w.moveTimer) {
    clearTimeout(w.moveTimer);
    w.moveTimer = null;
  }
  var idx = walkers.indexOf(w);
  if (idx >= 0) walkers.splice(idx, 1);
  if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
  w.el = null;
}

// ── DOM element creation ──
function ensureWalkerEl(w) {
  if (w.el) return;
  var layer = document.getElementById('walker-layer');
  if (!layer) return;
  var el = document.createElement('div');
  // Per-walker visual jitter ─────────────────────────────────────
  // Mostly cheap CSS-var noise so individuals read as distinct without
  // authoring 2-3 sprite variants per type. Picks are decided once at
  // spawn and then preserved with the walker.
  //
  // Citizen walkers (from housing) also pick a persona — child / elder
  // / couple / merchant / pet-owner / etc. — so a busy city's road
  // network reads as a population, not just identical bodies.
  if (w.scale === undefined) {
    w.scale = (0.85 + Math.random() * 0.30).toFixed(2);   // 0.85..1.15
    w.hue   = Math.floor(Math.random() * 36 - 18);        // ±18°
    w.bobMs = (600 + Math.random() * 240).toFixed(0);     // 0.6..0.84s bob period
    w.wadMs = (480 + Math.random() * 200).toFixed(0);     // 0.48..0.68s waddle period
    w.persona = (w.mode === 'ambient' && w.sourceType === 'citizen')
      ? pickPersona(w.sourceTier) : null;
    if (w.persona && w.persona.variant === 'walker-child') {
      w.scale = (parseFloat(w.scale) * 0.65).toFixed(2);   // children are smaller
      w.bobMs = (parseInt(w.bobMs, 10) * 0.85).toFixed(0); // and bouncier
    }
    if (w.persona && w.persona.variant === 'walker-elder') {
      w.bobMs = (parseInt(w.bobMs, 10) * 1.4).toFixed(0);  // elders move slower
      w.wadMs = (parseInt(w.wadMs, 10) * 1.35).toFixed(0);
    }
    if (w.persona && w.persona.variant === 'walker-fat') {
      w.scale = (parseFloat(w.scale) * 1.05).toFixed(2);   // a touch larger overall
      w.wadMs = (parseInt(w.wadMs, 10) * 1.25).toFixed(0); // wider waddle
    }
  }
  var classes = ['walker-dot', 'walker-' + (w.sourceType || 'citizen')];
  if (w.persona && w.persona.variant) classes.push(w.persona.variant);
  if (w.persona && w.persona.overlay) classes.push(w.persona.overlay);
  el.className = classes.join(' ');
  el.style.pointerEvents = 'auto';
  el.style.setProperty('--wk-scale', w.scale);
  el.style.setProperty('--wk-hue', w.hue + 'deg');
  el.style.setProperty('--wk-bob-ms', w.bobMs + 'ms');
  el.style.setProperty('--wk-waddle-ms', w.wadMs + 'ms');
  el.style.setProperty('--wk-bob-delay', '-' + (Math.random() * 0.7).toFixed(2) + 's');
  el.style.setProperty('--wk-waddle-delay', '-' + (Math.random() * 0.55).toFixed(2) + 's');
  el.addEventListener('click', function () {
    if (onWalkerClick) onWalkerClick(buildWalkerInfo(w));
  });
  layer.appendChild(el);
  w.el = el;
}

// ── Position a walker's element ──
// `immediate` skips the CSS transition (used for spawn placement and zoom snap).
function applyWalkerPosition(w, immediate) {
  if (!w.el) return;
  var grid = document.getElementById('map-grid');
  if (!grid) return;
  var cols = state.gridCols || 15;
  var gridW = grid.offsetWidth;
  if (gridW === 0) return;
  var cellSize = (gridW - (cols - 1)) / cols;
  var gap = 1;
  var gx = w.x - (state.gridMinX || 0);
  var gy = w.y - (state.gridMinY || 0);
  var left = gx * (cellSize + gap) + cellSize * 0.5;
  var top = gy * (cellSize + gap) + cellSize * 0.5;
  if (immediate) {
    var prev = w.el.style.transition;
    w.el.style.transition = 'none';
    w.el.style.left = left.toFixed(1) + 'px';
    w.el.style.top = top.toFixed(1) + 'px';
    void w.el.offsetHeight; // force reflow so the no-transition style applies
    w.el.style.transition = prev;
  } else {
    w.el.style.left = left.toFixed(1) + 'px';
    w.el.style.top = top.toFixed(1) + 'px';
  }
  w.el.style.opacity = '1';
  w.el.style.setProperty('--wk-scale', (state.mapZoom || 1).toFixed(3));
}

// ── Spawn-only tick ──
// Per-building roster: each spawn-eligible building has a target
// walker count from getWalkerTarget(). Each tick we (1) decrement
// cooldowns, (2) prune walkers whose source building was demolished
// or paused, (3) for each spawner below its target and not on cooldown,
// spawn one walker. No global cap. Movement happens on per-walker
// timers; this tick is purely spawn/despawn bookkeeping.
function spawnTick() {
  Object.keys(spawnCooldowns).forEach(function (id) {
    spawnCooldowns[id]--;
    if (spawnCooldowns[id] <= 0) delete spawnCooldowns[id];
  });

  syncCollectorWalkers();

  var spawners = getSpawnBuildings();

  // Index every active building (not just spawn-eligible) so we can tell
  // "demolished/paused" (truly gone) apart from "transiently unstaffed"
  // (still alive — its walkers should drain naturally, not be culled).
  var allActiveById = {};
  if (state.currentUser) {
    state.allBuildings.forEach(function (b) {
      if (b.player_id === state.currentUser.id && b.status === 'active') {
        allActiveById[b.id] = true;
      }
    });
  }
  for (var i = walkers.length - 1; i >= 0; i--) {
    var w = walkers[i];
    if (w.mode !== 'ambient') continue;
    if (!allActiveById[w.sourceId]) {
      despawnWalker(w);
    }
  }

  // Count current walkers per source so we can top each building up.
  var perSource = {};
  for (var k = 0; k < walkers.length; k++) {
    if (walkers[k].mode !== 'ambient') continue;
    perSource[walkers[k].sourceId] = (perSource[walkers[k].sourceId] || 0) + 1;
  }

  // Spawn at most one walker per building per tick — staggers respawns
  // so a building's cohort doesn't all vanish and reappear in unison.
  for (var s = 0; s < spawners.length; s++) {
    var b = spawners[s];
    if (spawnCooldowns[b.id]) continue;
    var target = getWalkerTarget(b);
    var current = perSource[b.id] || 0;
    if (current < target) {
      spawnWalker(b);
      spawnCooldowns[b.id] = WALKER_SPAWN_COOLDOWN;
    }
  }
}

// ── M2: sync collector walkers with current extractor state ──
// For each of the player's active extractors with a target tile, ensure
// exactly one collector walker exists. For extractors without a target
// (idle), or for collector walkers whose extractor has been demolished,
// despawn the walker.
export function syncCollectorWalkers() {
  if (!state.currentUser) return;
  var existing = {};
  for (var i = walkers.length - 1; i >= 0; i--) {
    var w = walkers[i];
    if (w.mode !== 'collector') continue;
    existing[w.sourceId] = w;
  }

  var myExtractors = state.allBuildings.filter(function (b) {
    if (b.player_id !== state.currentUser.id) return false;
    if (b.status !== 'active') return false;
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'extractor';
  });

  var keepIds = {};
  myExtractors.forEach(function (ext) {
    if (ext.target_x === null || ext.target_x === undefined) return; // idle
    keepIds[ext.id] = true;
    if (existing[ext.id]) return; // already has a walker
    var tour = computeCollectorTour(ext);
    if (tour) spawnCollectorWalker(ext, tour);
  });

  // Despawn stale collector walkers
  Object.keys(existing).forEach(function (id) {
    if (!keepIds[id]) {
      despawnWalker(existing[id]);
    }
  });
}

// ── M2: client-side BFS to compute the visualization tour for a collector
// Returns [{x,y}, {x,y}, ...] starting at the road tile next to the extractor
// and ending at the resource tile (target_x, target_y). Returns null if no
// reachable path exists at the moment (server may still have a stale claim).
function computeCollectorTour(ext) {
  var tx = ext.target_x;
  var ty = ext.target_y;
  if (tx === null || tx === undefined) return null;

  // Weighted Dijkstra over walkable tiles.
  //   road tile = cost 1 (preferred)
  //   off-road owned tile = cost 3 (fallback)
  // Mirrors the server's find_nearest_unclaimed_resource. Used purely for
  // visualization; server still owns the authoritative path_length.
  var ROAD_COST = 1;
  var OFFROAD_COST = 3;

  function walkable(x, y) {
    var k = x + ',' + y;
    if (roadSet[k]) return ROAD_COST;
    var tile = state.tileMap[k];
    if (!tile) return 0;
    if (!state.currentUser || tile.owner_player_id !== state.currentUser.id) return 0;
    if (tile.occupied_building_id) {
      // The target tile must be reachable even if the BFS sees it as
      // "occupied" by some claim status. Allow if it's our destination.
      if (x === tx && y === ty) return OFFROAD_COST;
      return 0;
    }
    return OFFROAD_COST;
  }

  var startKey = ext.x + ',' + ext.y;
  var dist = {};
  var prev = {};
  var visited = {};
  dist[startKey] = 0;

  while (true) {
    // Pop min-distance unvisited
    var bestKey = null;
    var bestDist = Infinity;
    for (var k in dist) {
      if (visited[k]) continue;
      if (dist[k] < bestDist) { bestDist = dist[k]; bestKey = k; }
    }
    if (bestKey === null) break;
    visited[bestKey] = true;

    var parts = bestKey.split(',');
    var cx = parseInt(parts[0], 10);
    var cy = parseInt(parts[1], 10);
    if (cx === tx && cy === ty) {
      // Reconstruct path from target back to start
      var path = [];
      var cursor = bestKey;
      while (cursor) {
        var p = cursor.split(',');
        path.unshift({ x: parseInt(p[0], 10), y: parseInt(p[1], 10) });
        cursor = prev[cursor] || null;
      }
      // Keep the extractor's tile as tour[0] — the collector walker
      // returns all the way back to the building, not the road tile
      // outside it.
      return path;
    }

    var dirs = [[-1,0],[1,0],[0,-1],[0,1]];
    for (var d = 0; d < 4; d++) {
      var nx = cx + dirs[d][0];
      var ny = cy + dirs[d][1];
      var w = walkable(nx, ny);
      if (!w) continue;
      var nk = nx + ',' + ny;
      var nd = bestDist + w;
      if (dist[nk] === undefined || nd < dist[nk]) {
        dist[nk] = nd;
        prev[nk] = bestKey;
      }
    }
  }
  return null;
}

// ── Re-render all walkers ──
// Called on map/road rebuilds. Re-applies current position to each walker's
// element (new cell size, etc.). Movement timers keep running independently.
export function renderWalkers() {
  for (var i = 0; i < walkers.length; i++) {
    ensureWalkerEl(walkers[i]);
    applyWalkerPosition(walkers[i]);
  }
}

// ── Zoom sync: snap walkers to new grid scale without transition ──
export function snapWalkersToZoom() {
  var layer = document.getElementById('walker-layer');
  if (!layer) return;
  layer.classList.add('no-transition');
  for (var i = 0; i < walkers.length; i++) {
    applyWalkerPosition(walkers[i], true);
  }
  void layer.offsetHeight;
  layer.classList.remove('no-transition');
}

// ── Pre-seed walkers so streets feel alive on first frame ──
// Places walkers mid-walk along roads, distributed by housing with road access.
function preseedWalkers() {
  var spawners = getSpawnBuildings();
  if (spawners.length === 0) return;
  var roadKeys = Object.keys(roadSet);
  if (roadKeys.length === 0) return;

  // Preseed roughly the steady-state population (sum of per-building
  // targets) minus a bit so the spawn tick still has work to do.
  var rosterTotal = 0;
  for (var rs = 0; rs < spawners.length; rs++) {
    rosterTotal += getWalkerTarget(spawners[rs]);
  }
  var target = Math.max(3, Math.floor(rosterTotal * 0.7));

  var housingRoads = [];
  for (var s = 0; s < spawners.length; s++) {
    var adj = roadNeighbors(spawners[s].x, spawners[s].y);
    for (var a = 0; a < adj.length; a++) {
      housingRoads.push({ tile: adj[a], building: spawners[s] });
    }
  }

  for (var i = 0; i < target; i++) {
    var startX, startY, dir, tier, job, sourceId;
    if (housingRoads.length > 0 && Math.random() < 0.6) {
      var pick = housingRoads[Math.floor(Math.random() * housingRoads.length)];
      startX = pick.tile.x;
      startY = pick.tile.y;
      dir = pick.tile.dir;
      tier = pick.building.housing_tier !== undefined ? pick.building.housing_tier : 1;
      job = getWalkerJob(pick.building);
      sourceId = pick.building.id;
    } else {
      var key = roadKeys[Math.floor(Math.random() * roadKeys.length)];
      var parts = key.split(',');
      startX = parseInt(parts[0], 10);
      startY = parseInt(parts[1], 10);
      dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      var rb = spawners[Math.floor(Math.random() * spawners.length)];
      tier = rb.housing_tier !== undefined ? rb.housing_tier : 1;
      job = getWalkerJob(rb);
      sourceId = rb.id;
    }

    // Walk a few random steps along roads so it's mid-journey
    var walkSteps = Math.floor(Math.random() * Math.floor(WALKER_MAX_STEPS * 0.6));
    var cx = startX, cy = startY, cd = dir;
    for (var step = 0; step < walkSteps; step++) {
      var neighbors = roadNeighbors(cx, cy);
      if (neighbors.length === 0) break;
      var back = oppositeDir(cd);
      var forward = neighbors.filter(function (n) { return !dirsEqual(n.dir, back); });
      var choices = forward.length > 0 ? forward : neighbors;
      var next = choices[Math.floor(Math.random() * choices.length)];
      cx = next.x;
      cy = next.y;
      cd = next.dir;
    }

    var w = {
      mode: 'ambient',
      x: cx,
      y: cy,
      prevDir: cd,
      steps: walkSteps,
      sourceId: sourceId,
      sourceTier: tier,
      sourceType: job,
      el: null,
      moveTimer: null
    };
    walkers.push(w);
    ensureWalkerEl(w);
    applyWalkerPosition(w, true);
    scheduleWalkerMove(w, Math.random() * WALKER_MOVE_MS);
  }
}

// ── Lifecycle ──
// Callback set by external code (inspector) to handle walker clicks
var onWalkerClick = null;
export function setWalkerClickHandler(fn) { onWalkerClick = fn; }

export function startWalkers() {
  rebuildRoadSet();
  stopWalkers();
  preseedWalkers();
  spawnTickTimer = setInterval(spawnTick, WALKER_SPAWN_TICK_MS);
}

export function stopWalkers() {
  if (spawnTickTimer) {
    clearInterval(spawnTickTimer);
    spawnTickTimer = null;
  }
  // Cancel each walker's movement timer and remove its element
  for (var i = walkers.length - 1; i >= 0; i--) {
    var w = walkers[i];
    if (w.moveTimer) clearTimeout(w.moveTimer);
    if (w.el && w.el.parentNode) w.el.parentNode.removeChild(w.el);
  }
  walkers = [];
  spawnCooldowns = {};
  var layer = document.getElementById('walker-layer');
  if (layer) layer.innerHTML = '';
}

export function getWalkerCount() {
  return walkers.length;
}

// ── Build walker info object for the inspector ──
function buildWalkerInfo(w) {
  var source = state.allBuildings.find(function (b) { return b.id === w.sourceId; });
  var sourceBt = source ? state.buildingTypes[source.building_type_key] : null;
  var tierCfg = source ? state.housingTierConfig[w.sourceTier !== undefined ? w.sourceTier : 1] : null;
  return {
    x: w.x,
    y: w.y,
    steps: w.steps,
    maxSteps: WALKER_MAX_STEPS,
    sourceTier: w.sourceTier,
    sourceType: w.sourceType || 'citizen',
    personaName: w.persona ? w.persona.name : null,
    sourceName: tierCfg ? tierCfg.name : (sourceBt ? sourceBt.name : 'Housing'),
    sourceX: source ? source.x : null,
    sourceY: source ? source.y : null
  };
}

// Return walker data at a given index (kept for backward compat)
export function getWalkerAt(index) {
  if (index < 0 || index >= walkers.length) return null;
  return buildWalkerInfo(walkers[index]);
}
