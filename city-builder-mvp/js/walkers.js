// ── Walker system: client-side visual walkers on roads ──
// Civilian walkers spawn from road-adjacent housing and walk along roads.
// Purely visual — no gameplay effect. No server interaction needed.
import { state } from './state.js';

// ── Walker config ──
var WALKER_MOVE_MS = 1400;        // tile-to-tile travel time (also CSS transition duration)
var WALKER_SPAWN_TICK_MS = 1400;  // spawn-logic tick interval
var WALKER_MAX_STEPS = 18;        // despawn after this many steps
var WALKER_MAX_COUNT = 12;        // global cap (mobile-safe)
var WALKER_SPAWN_CHANCE = 0.12;   // per eligible housing per tick
var WALKER_SPAWN_COOLDOWN = 8;    // min ticks between spawns from same building

// ── Job type mapping: building_type_key -> walker visual category ──
var WALKER_JOB_MAP = {
  'timber_camp': 'timber',
  'sawmill': 'sawmill',
  'woodcarver': 'sawmill',
  'stone_quarry': 'stone',
  'mason_workshop': 'stone',
  'sculptor': 'stone',
  'grain_farm': 'grain',
  'mill': 'grain',
  'bakery': 'grain',
  'clay_pit': 'stone',
  'pottery_kiln': 'stone'
};

function getWalkerJob(building) {
  var bt = state.buildingTypes[building.building_type_key];
  if (bt && bt.category === 'housing') return 'citizen';
  return WALKER_JOB_MAP[building.building_type_key] || 'citizen';
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
    // Housing spawns citizen walkers
    if (bt.category === 'housing') {
      return roadNeighbors(b.x, b.y).length > 0;
    }
    // Production buildings spawn job walkers when staffed
    if (WALKER_JOB_MAP[b.building_type_key]) {
      if (state.laborInfo.unstaffedIds[b.id]) return false;
      return roadNeighbors(b.x, b.y).length > 0;
    }
    return false;
  });
}

// ── Pick a starting road tile adjacent to the building ──
function pickSpawnTile(building) {
  var neighbors = roadNeighbors(building.x, building.y);
  if (neighbors.length === 0) return null;
  var pick = neighbors[Math.floor(Math.random() * neighbors.length)];
  return pick;
}

// ── Spawn a walker ──
function spawnWalker(building) {
  var start = pickSpawnTile(building);
  if (!start) return;
  var w = {
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

// ── Schedule one step ──
function scheduleWalkerMove(w, delay) {
  if (delay === undefined) delay = WALKER_MOVE_MS;
  w.moveTimer = setTimeout(function () { walkerStep(w); }, delay);
}

// ── Take one step along a road ──
function walkerStep(w) {
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
  el.className = 'walker-dot walker-' + (w.sourceType || 'citizen');
  el.style.pointerEvents = 'auto';
  // Random negative animation delays put bob/waddle at a random phase so
  // walkers don't bob in unison.
  el.style.setProperty('--wk-bob-delay', '-' + (Math.random() * 0.7).toFixed(2) + 's');
  el.style.setProperty('--wk-waddle-delay', '-' + (Math.random() * 0.55).toFixed(2) + 's');
  // Per-element click handler captures `w` directly (no index lookup needed,
  // immune to splicing the walkers array on despawn).
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
// Movement happens on per-walker timers, so this tick only handles spawning
// and cooldown bookkeeping.
function spawnTick() {
  Object.keys(spawnCooldowns).forEach(function (id) {
    spawnCooldowns[id]--;
    if (spawnCooldowns[id] <= 0) delete spawnCooldowns[id];
  });

  if (walkers.length < WALKER_MAX_COUNT) {
    var spawners = getSpawnBuildings();
    for (var i = 0; i < spawners.length && walkers.length < WALKER_MAX_COUNT; i++) {
      var b = spawners[i];
      if (spawnCooldowns[b.id]) continue;
      if (Math.random() < WALKER_SPAWN_CHANCE) {
        spawnWalker(b);
        spawnCooldowns[b.id] = WALKER_SPAWN_COOLDOWN;
      }
    }
  }
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

  var target = Math.min(
    Math.max(3, Math.ceil(spawners.length * 1.5)),
    Math.floor(WALKER_MAX_COUNT * 0.75)
  );

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
