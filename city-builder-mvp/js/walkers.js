// ── Walker system: client-side visual walkers on roads ──
// Civilian walkers spawn from road-adjacent housing and walk along roads.
// Purely visual — no gameplay effect. No server interaction needed.
import { state } from './state.js';

// ── Walker config ──
var WALKER_TICK_MS = 1400;      // movement interval
var WALKER_MAX_STEPS = 18;      // despawn after this many steps
var WALKER_MAX_COUNT = 12;      // global cap (mobile-safe)
var WALKER_SPAWN_CHANCE = 0.12; // per eligible housing per tick
var WALKER_SPAWN_COOLDOWN = 8;  // min ticks between spawns from same building

// ── Walker state ──
var walkers = [];                // active walker objects
var walkerTickTimer = null;
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
// Housing with road access that belongs to the current player
function getSpawnBuildings() {
  if (!state.currentUser) return [];
  return state.allBuildings.filter(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category !== 'housing') return false;
    if (b.player_id !== state.currentUser.id) return false;
    if (b.status !== 'active') return false;
    // Must have an adjacent road tile to spawn onto
    return roadNeighbors(b.x, b.y).length > 0;
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
  walkers.push({
    x: start.x,
    y: start.y,
    prevDir: start.dir,   // direction we moved to get here (from building)
    steps: 0,
    sourceId: building.id,
    sourceTier: building.housing_tier !== undefined ? building.housing_tier : 1
  });
}

// ── Move a walker one step ──
function moveWalker(w) {
  var neighbors = roadNeighbors(w.x, w.y);
  if (neighbors.length === 0) {
    w.steps = WALKER_MAX_STEPS; // dead end, despawn
    return;
  }

  // Filter out backtracking (going back the way we came)
  var back = oppositeDir(w.prevDir);
  var forward = neighbors.filter(function (n) {
    return !dirsEqual(n.dir, back);
  });

  // If the only option is backtrack, allow it
  var choices = forward.length > 0 ? forward : neighbors;
  var pick = choices[Math.floor(Math.random() * choices.length)];

  w.x = pick.x;
  w.y = pick.y;
  w.prevDir = pick.dir;
  w.steps++;
}

// ── Main tick ──
function walkerTick() {
  // Decrement spawn cooldowns
  Object.keys(spawnCooldowns).forEach(function (id) {
    spawnCooldowns[id]--;
    if (spawnCooldowns[id] <= 0) delete spawnCooldowns[id];
  });

  // Spawn new walkers from eligible housing
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

  // Move existing walkers
  for (var j = 0; j < walkers.length; j++) {
    moveWalker(walkers[j]);
  }

  // Remove expired walkers (iterate backwards to keep indices stable)
  for (var k = walkers.length - 1; k >= 0; k--) {
    if (walkers[k].steps >= WALKER_MAX_STEPS) {
      walkers.splice(k, 1);
      var el = walkerEls.splice(k, 1)[0];
      if (el && el.parentNode) el.parentNode.removeChild(el);
    }
  }

  // Render
  renderWalkers();
}

// ── Rendering ──
// Walkers are rendered as absolutely-positioned sprite elements in a
// walker-layer div that overlays the map grid. DOM elements are reused so
// CSS transitions animate movement smoothly between ticks.
var walkerEls = [];  // parallel to walkers array; holds DOM elements

export function renderWalkers() {
  var layer = document.getElementById('walker-layer');
  var grid = document.getElementById('map-grid');
  if (!layer || !grid) return;

  // Get actual cell size from the grid (dynamic column count)
  var cols = state.gridCols || 15;
  var gridW = grid.offsetWidth;
  if (gridW === 0) return; // not laid out yet
  var cellSize = (gridW - (cols - 1)) / cols;
  var gap = 1;

  // Remove excess DOM elements
  while (walkerEls.length > walkers.length) {
    var old = walkerEls.pop();
    if (old && old.parentNode) old.parentNode.removeChild(old);
  }

  for (var i = 0; i < walkers.length; i++) {
    var w = walkers[i];
    var el = walkerEls[i];

    // Create new DOM element if needed
    if (!el) {
      el = document.createElement('div');
      el.className = 'walker-dot';
      layer.appendChild(el);
      walkerEls[i] = el;
    }

    // Calculate pixel position within the grid (offset by grid origin)
    var gx = w.x - (state.gridMinX || 0);
    var gy = w.y - (state.gridMinY || 0);
    var left = gx * (cellSize + gap) + cellSize * 0.5;
    var top = gy * (cellSize + gap) + cellSize * 0.5;
    // Fade out as walker nears end of life
    var lifeRatio = 1 - (w.steps / WALKER_MAX_STEPS);
    var opacity = Math.min(1, lifeRatio * 2);

    el.className = 'walker-dot walker-tier-' + (w.sourceTier || 1);
    el.style.left = left.toFixed(1) + 'px';
    el.style.top = top.toFixed(1) + 'px';
    el.style.opacity = opacity.toFixed(2);
    el.style.setProperty('--wk-scale', (state.mapZoom || 1).toFixed(3));
  }
}

// ── Zoom sync: snap walkers to new grid scale without transition ──
export function snapWalkersToZoom() {
  var layer = document.getElementById('walker-layer');
  if (!layer) return;
  layer.classList.add('no-transition');
  renderWalkers();
  // Force reflow so positions apply before transitions are restored
  void layer.offsetHeight;
  layer.classList.remove('no-transition');
}

// ── Pre-seed walkers so streets feel alive on first frame ──
// Places walkers mid-walk along roads, distributed by housing with road access.
// Each walker starts with a random number of steps already taken so they fade
// naturally instead of all disappearing at the same time.
function preseedWalkers() {
  var spawners = getSpawnBuildings();
  if (spawners.length === 0) return;

  // Collect all road tile keys for random mid-road placement
  var roadKeys = Object.keys(roadSet);
  if (roadKeys.length === 0) return;

  // Target: fill to ~60-75% of cap, scaled by available housing
  var target = Math.min(
    Math.max(3, Math.ceil(spawners.length * 1.5)),
    Math.floor(WALKER_MAX_COUNT * 0.75)
  );

  // Build a map of road tiles adjacent to housing for weighted spawning.
  // We prefer placing walkers near housing but also scatter some further out.
  var housingRoads = [];
  for (var s = 0; s < spawners.length; s++) {
    var adj = roadNeighbors(spawners[s].x, spawners[s].y);
    for (var a = 0; a < adj.length; a++) {
      housingRoads.push({ tile: adj[a], building: spawners[s] });
    }
  }

  for (var i = 0; i < target; i++) {
    // 60% chance to start near housing, 40% chance at a random road tile
    var startX, startY, dir, tier;
    if (housingRoads.length > 0 && Math.random() < 0.6) {
      var pick = housingRoads[Math.floor(Math.random() * housingRoads.length)];
      startX = pick.tile.x;
      startY = pick.tile.y;
      dir = pick.tile.dir;
      tier = pick.building.housing_tier !== undefined ? pick.building.housing_tier : 1;
    } else {
      var key = roadKeys[Math.floor(Math.random() * roadKeys.length)];
      var parts = key.split(',');
      startX = parseInt(parts[0], 10);
      startY = parseInt(parts[1], 10);
      dir = DIRS[Math.floor(Math.random() * DIRS.length)];
      // Pick tier from a random spawner
      var rb = spawners[Math.floor(Math.random() * spawners.length)];
      tier = rb.housing_tier !== undefined ? rb.housing_tier : 1;
    }

    // Walk the walker a few random steps along roads so it's mid-journey
    var walkSteps = Math.floor(Math.random() * Math.floor(WALKER_MAX_STEPS * 0.6));
    var cx = startX, cy = startY, cd = dir;
    for (var step = 0; step < walkSteps; step++) {
      var neighbors = roadNeighbors(cx, cy);
      if (neighbors.length === 0) break;
      var back = oppositeDir(cd);
      var forward = neighbors.filter(function (n) {
        return !dirsEqual(n.dir, back);
      });
      var choices = forward.length > 0 ? forward : neighbors;
      var next = choices[Math.floor(Math.random() * choices.length)];
      cx = next.x;
      cy = next.y;
      cd = next.dir;
    }

    walkers.push({
      x: cx,
      y: cy,
      prevDir: cd,
      steps: walkSteps,
      sourceId: null,
      sourceTier: tier
    });
  }

  renderWalkers();
}

// ── Lifecycle ──
export function startWalkers() {
  rebuildRoadSet();
  stopWalkers();
  preseedWalkers();
  walkerTickTimer = setInterval(walkerTick, WALKER_TICK_MS);
}

export function stopWalkers() {
  if (walkerTickTimer) {
    clearInterval(walkerTickTimer);
    walkerTickTimer = null;
  }
  walkers = [];
  walkerEls = [];
  spawnCooldowns = {};
  var layer = document.getElementById('walker-layer');
  if (layer) layer.innerHTML = '';
}

export function getWalkerCount() {
  return walkers.length;
}
