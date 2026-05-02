// ── Map rendering, placement logic, drag-to-paint roads, and map expansion ──
import { sb } from './config.js';
import { state, CITY_CENTER_X, CITY_CENTER_Y, computeLaborAllocation, computeGridBounds } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderBuildPanel } from './panels.js';
import { rebuildRoadSet, renderWalkers, snapWalkersToZoom } from './walkers.js';
import { openInspector } from './inspector.js';

export var BLDG_LABELS = {
  timber_camp: 'TC', sawmill: 'SM',
  stone_quarry: 'SQ', mason_workshop: 'MW',
  grain_farm: 'GF', mill: 'ML',
  clay_pit: 'CP', pottery_kiln: 'PK',
  bakery: 'BK', woodcarver: 'WC', sculptor: 'SC',
  house: 'H', road: 'R'
};

// Housing tier label overrides (keyed by tier number)
var HOUSING_TIER_LABELS = { 0: 'S', 1: 'H' };
var CELL_BASE_SIZE = 520 / 15;  // px per cell at 1x zoom (original 520px / 15 cols)
var MAP_MIN_ZOOM = 0.5;
var MAP_MAX_ZOOM = 3;
var MAP_ZOOM_STEP = 0.25;
var EXPAND_THRESHOLD = 2;  // tiles from edge to trigger expansion
var EXPAND_AMOUNT = 5;     // tiles added per expansion direction

// Pinch zoom state
var pinchStartDistance = null;
var pinchStartZoom = 1;
var pinchStartCenter = null;
var pinchSuppressClickUntil = 0;

// Drag-to-paint state (roads only)
var dragState = {
  active: false,
  planned: [],      // [{x, y, tileId}, ...]
  plannedSet: {},   // "x,y" -> true
  suppressClick: 0  // timestamp: suppress click events until this time
};

// Drag cost counter element reference
var dragCostEl = null;

// ── Placement validation ──

export function isPlacementValid(btKey, tile) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return false;
  if (!tile.buildable) return false;
  if (tile.occupied_building_id) return false;

  if (bt.category === 'extractor') {
    return tile.resource_node_key === bt.output_resource_key;
  }
  if (bt.category === 'road') {
    return isRoadPlacementConnected(tile, null);
  }
  return true;
}

function isRoadBuilding(building) {
  if (!building) return false;
  var bt = state.buildingTypes[building.building_type_key];
  return !!(bt && bt.category === 'road');
}

function isRoadOrCenter(x, y, buildingAt) {
  if (x === CITY_CENTER_X && y === CITY_CENTER_Y) return true;
  return isRoadBuilding(buildingAt[x + ',' + y]);
}

function roadNeighborFlags(x, y, buildingAt) {
  return {
    n: isRoadOrCenter(x, y - 1, buildingAt),
    s: isRoadOrCenter(x, y + 1, buildingAt),
    e: isRoadOrCenter(x + 1, y, buildingAt),
    w: isRoadOrCenter(x - 1, y, buildingAt)
  };
}

// Pre-computed road clip-path polygons for all 16 neighbor combos.
// Road lane covers 15%-85% of tile; corners filled where two adjacent arms meet.
var ROAD_CLIPS = (function() {
  var L = 15, R = 85, clips = [];
  clips[0]  = [[L,L],[R,L],[R,R],[L,R]];
  clips[1]  = [[0,L],[R,L],[R,R],[0,R]];
  clips[2]  = [[L,L],[100,L],[100,R],[L,R]];
  clips[3]  = [[0,L],[100,L],[100,R],[0,R]];
  clips[4]  = [[L,L],[R,L],[R,100],[L,100]];
  clips[5]  = [[0,L],[R,L],[R,100],[0,100]];
  clips[6]  = [[L,L],[100,L],[100,100],[L,100]];
  clips[7]  = [[0,L],[100,L],[100,100],[0,100]];
  clips[8]  = [[L,0],[R,0],[R,R],[L,R]];
  clips[9]  = [[0,0],[R,0],[R,R],[0,R]];
  clips[10] = [[L,0],[100,0],[100,R],[L,R]];
  clips[11] = [[0,0],[100,0],[100,R],[0,R]];
  clips[12] = [[L,0],[R,0],[R,100],[L,100]];
  clips[13] = [[0,0],[R,0],[R,100],[0,100]];
  clips[14] = [[L,0],[100,0],[100,100],[L,100]];
  clips[15] = [[0,0],[100,0],[100,100],[0,100]];
  return clips;
})();

function buildRoadClipPath(n, s, e, w) {
  var key = (n?8:0) | (s?4:0) | (e?2:0) | (w?1:0);
  var pts = ROAD_CLIPS[key];
  return 'polygon(' + pts.map(function(p) { return p[0]+'% '+p[1]+'%'; }).join(',') + ')';
}

// Cached road tile set for O(1) connectivity lookups during placement/drag
var roadTileSet = {};

function rebuildPlacementRoadSet() {
  roadTileSet = {};
  state.allBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'road' && b.status === 'active') {
      roadTileSet[b.x + ',' + b.y] = true;
    }
  });
}

function isRoadPlacementConnected(tile, pendingSet) {
  if (!tile) return false;
  var x = tile.x, y = tile.y;
  // Adjacent to city center
  if ((Math.abs(x - CITY_CENTER_X) + Math.abs(y - CITY_CENTER_Y)) === 1) return true;
  // Adjacent to existing road (O(1) set lookup)
  if (roadTileSet[(x - 1) + ',' + y] || roadTileSet[(x + 1) + ',' + y]
    || roadTileSet[x + ',' + (y - 1)] || roadTileSet[x + ',' + (y + 1)]) {
    return true;
  }
  // Adjacent to pending drag road
  if (pendingSet) {
    return !!(pendingSet[(x - 1) + ',' + y]
      || pendingSet[(x + 1) + ',' + y]
      || pendingSet[x + ',' + (y - 1)]
      || pendingSet[x + ',' + (y + 1)]);
  }
  return false;
}

// ── Zoom ──

export function applyMapZoom() {
  var grid = document.getElementById('map-grid');
  var label = document.getElementById('zoom-label');
  if (!grid) return;
  var mapWidth = Math.round(CELL_BASE_SIZE * state.gridCols * state.mapZoom);
  grid.style.width = mapWidth + 'px';
  if (label) label.textContent = Math.round(state.mapZoom * 100) + '%';
  snapWalkersToZoom();
}

function setMapZoom(nextZoom) {
  var clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom));
  state.mapZoom = Math.round(clamped * 100) / 100;
  applyMapZoom();
}

function setMapZoomAtPoint(nextZoom, clientX, clientY) {
  var viewport = document.getElementById('map-viewport');
  var grid = document.getElementById('map-grid');
  if (!viewport || !grid) {
    setMapZoom(nextZoom);
    return;
  }

  var oldZoom = state.mapZoom;
  var clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom));
  var newZoom = Math.round(clamped * 100) / 100;
  if (newZoom === oldZoom) return;

  var rect = viewport.getBoundingClientRect();
  var localX = clientX - rect.left + viewport.scrollLeft;
  var localY = clientY - rect.top + viewport.scrollTop;
  var worldX = localX / oldZoom;
  var worldY = localY / oldZoom;

  state.mapZoom = newZoom;
  applyMapZoom();

  viewport.scrollLeft = Math.max(0, worldX * newZoom - (clientX - rect.left));
  viewport.scrollTop = Math.max(0, worldY * newZoom - (clientY - rect.top));
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchCenter(touches) {
  if (!touches || touches.length < 2) return null;
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

// ── Map rendering ──

export function renderMap() {
  var grid = document.getElementById('map-grid');
  rebuildPlacementRoadSet();
  var buildingAt = {};
  state.allBuildings.forEach(function (b) { buildingAt[b.x + ',' + b.y] = b; });

  // Dynamic grid columns based on current bounds
  grid.style.gridTemplateColumns = 'repeat(' + state.gridCols + ', 1fr)';

  var html = '';
  for (var y = state.gridMinY; y <= state.gridMaxY; y++) {
    for (var x = state.gridMinX; x <= state.gridMaxX; x++) {
      var tile = state.tileMap[x + ',' + y];
      var building = buildingAt[x + ',' + y];
      var classes = ['cell'];

      if (!tile) {
        html += '<div class="cell empty-cell" data-x="' + x + '" data-y="' + y + '"></div>';
        continue;
      }

      if (x === CITY_CENTER_X && y === CITY_CENTER_Y) {
        classes.push('city-center');
      } else if (tile.resource_node_key) {
        classes.push('res-' + tile.resource_node_key);
      }

      // Add road-tile class to cell if building is a road
      var buildingBt = building ? state.buildingTypes[building.building_type_key] : null;
      if (building && buildingBt && buildingBt.category === 'road') {
        classes.push('road-tile');
      }

      if (state.selectedBuildType && !building && isPlacementValid(state.selectedBuildType, tile)) {
        classes.push('valid-placement');
      }

      html += '<div class="' + classes.join(' ') + '" data-x="' + x + '" data-y="' + y + '" data-tile-id="' + tile.id + '">';

      if (building) {
        var mine = building.player_id === state.currentUser.id;
        var btk = building.building_type_key;

        // Roads render as clipped surface — shape computed from neighbor connections
        if (buildingBt && buildingBt.category === 'road') {
          var rf = roadNeighborFlags(x, y, buildingAt);
          var clip = buildRoadClipPath(rf.n, rf.s, rf.e, rf.w);
          var roadClasses = 'road-surface' + (mine ? ' mine' : '');
          html += '<div class="' + roadClasses + '" style="clip-path:' + clip + '"></div>';
        } else {
          var label = BLDG_LABELS[btk] || '?';
          var titleText = (buildingBt ? buildingBt.name : btk);

          // Housing tier display
          var housingTierClass = '';
          if (buildingBt && buildingBt.category === 'housing') {
            var hTier = building.housing_tier !== undefined ? building.housing_tier : 1;
            var tierCfg = state.housingTierConfig[hTier];
            if (tierCfg) {
              label = tierCfg.label || HOUSING_TIER_LABELS[hTier] || label;
              titleText = tierCfg.name + ' (Tier ' + hTier + ')';
            } else {
              label = HOUSING_TIER_LABELS[hTier] || label;
            }
            housingTierClass = ' house-t' + hTier;
          }

          if (!mine && building.player_profiles) {
            titleText += ' (' + building.player_profiles.display_name + ')';
          }
          var isUnstaffed = mine && state.laborInfo.unstaffedIds[building.id];
          var isDisconnected = mine && state.noRoadAccessIds[building.id];
          var isProducing = !isUnstaffed && !isDisconnected && buildingBt.category !== 'housing' && buildingBt.category !== 'road';
          if (isDisconnected) titleText += ' (no road)';
          else if (isUnstaffed) titleText += ' (unstaffed)';
          var bldgClasses = 'bldg ' + btk + housingTierClass + (mine ? ' mine' : '') + (isUnstaffed ? ' unstaffed' : '') + (isDisconnected ? ' disconnected' : '') + (isProducing ? ' producing' : '');
          html += '<div class="' + bldgClasses + '" title="' + titleText + '">' + label + '</div>';
        }
      } else if (x === CITY_CENTER_X && y === CITY_CENTER_Y) {
        // Show road surface from city center toward adjacent roads
        var hqN = isRoadBuilding(buildingAt[CITY_CENTER_X + ',' + (CITY_CENTER_Y - 1)]);
        var hqS = isRoadBuilding(buildingAt[CITY_CENTER_X + ',' + (CITY_CENTER_Y + 1)]);
        var hqE = isRoadBuilding(buildingAt[(CITY_CENTER_X + 1) + ',' + CITY_CENTER_Y]);
        var hqW = isRoadBuilding(buildingAt[(CITY_CENTER_X - 1) + ',' + CITY_CENTER_Y]);
        if (hqN || hqS || hqE || hqW) {
          var hqClip = buildRoadClipPath(hqN, hqS, hqE, hqW);
          html += '<div class="road-surface hq-road" style="clip-path:' + hqClip + '"></div>';
        }
        html += '<span class="hq-label">HQ</span>';
      } else if (tile.resource_node_key) {
        html += '<div class="res-dot"></div>';
      }

      html += '</div>';
    }
  }
  grid.innerHTML = html;
  applyMapZoom();
  // Sync walker system with new road layout
  rebuildRoadSet();
  renderWalkers();
}

// ── Placement ──

export function cancelPlacement() {
  state.selectedBuildType = null;
  clearDragState();
  document.getElementById('placement-bar').classList.remove('active');
  renderMap();
  renderBuildPanel();
}


function reloadMapData() {
  return Promise.all([
    sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
    sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true })
  ]).then(function (results) {
    state.allBuildings = results[0].data || [];
    state.tiles = results[1].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });
    computeGridBounds();
    computeLaborAllocation();
    renderMap();
    renderBuildPanel();
  });
}

function placeBuilding(tileId, btKey) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return;
  if (state.profile.money < bt.build_cost) {
    showToast('Not enough money (need $' + bt.build_cost + ')', 'error');
    return;
  }

  showToast('Placing...', '');
  sb.rpc('place_building', { p_tile_id: tileId, p_building_type_key: btKey })
    .then(function (r) {
      if (r.error) {
        showToast(r.error.message, 'error');
        return;
      }
      var data = r.data;
      state.profile.money = data.money;
      state.profile.workers_used = data.workers_used;
      state.profile.worker_capacity = data.worker_capacity;

      if (data.workers_needed !== undefined) {
        state.laborInfo.workerSupply = data.worker_capacity;
        state.laborInfo.workersNeeded = data.workers_needed;
        state.laborInfo.workersUsed = data.workers_used;
        state.laborInfo.workersIdle = Math.max(0, data.worker_capacity - data.workers_needed);
        state.laborInfo.laborShortage = !!data.labor_shortage;
      }

      updateMoney();
      updateWorkers();

      var msg = bt.name + ' placed!';
      if (data.labor_shortage) msg += ' (labor shortage — build housing!)';
      showToast(msg, data.labor_shortage ? 'info' : 'success');
      cancelPlacement();

      reloadMapData().then(function () {
        expandMapIfNeeded();
      });
    })
    .catch(function (err) {
      showToast(err.message || 'Placement failed', 'error');
    });
}

// ── Drag-to-paint roads ──

function clearDragState() {
  document.querySelectorAll('.drag-preview').forEach(function (el) {
    el.classList.remove('drag-preview');
  });
  dragState.active = false;
  dragState.planned = [];
  dragState.plannedSet = {};
  hideDragCost();
}

function showDragCost() {
  if (!dragCostEl) {
    dragCostEl = document.getElementById('drag-cost-counter');
  }
  if (!dragCostEl) return;
  var bt = state.buildingTypes[state.selectedBuildType];
  if (!bt) return;
  var count = dragState.planned.length;
  var cost = count * bt.build_cost;
  var affordable = Math.floor(state.profile.money / bt.build_cost);
  var overBudget = count > affordable;
  dragCostEl.textContent = count + ' road' + (count !== 1 ? 's' : '') + ' — $' + cost;
  dragCostEl.className = 'drag-cost-counter active' + (overBudget ? ' over-budget' : '');
}

function hideDragCost() {
  if (!dragCostEl) {
    dragCostEl = document.getElementById('drag-cost-counter');
  }
  if (dragCostEl) {
    dragCostEl.classList.remove('active');
  }
}

function getCellFromPoint(clientX, clientY) {
  var el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  return el.closest('.cell');
}

function isSelectedBuildRoad() {
  if (!state.selectedBuildType) return false;
  var bt = state.buildingTypes[state.selectedBuildType];
  return bt && bt.category === 'road';
}

function tryAddDragTile(cell) {
  if (!cell) return false;
  var x = parseInt(cell.dataset.x);
  var y = parseInt(cell.dataset.y);
  var key = x + ',' + y;

  // Backtracking: if cursor moves to the second-to-last tile, remove the last one
  if (dragState.planned.length >= 2) {
    var prev = dragState.planned[dragState.planned.length - 2];
    if (prev.x === x && prev.y === y) {
      var removed = dragState.planned.pop();
      delete dragState.plannedSet[removed.x + ',' + removed.y];
      var removedCell = document.querySelector('.cell[data-x="' + removed.x + '"][data-y="' + removed.y + '"]');
      if (removedCell) removedCell.classList.remove('drag-preview');
      showDragCost();
      return true;
    }
  }

  // Already planned
  if (dragState.plannedSet[key]) return false;

  var tile = state.tileMap[key];
  if (!tile || !tile.buildable || tile.occupied_building_id) return false;

  // Must connect to road network (including pending tiles)
  if (!isRoadPlacementConnected(tile, dragState.plannedSet)) return false;

  // Must be adjacent to last planned tile (continuous path), or be the first tile
  if (dragState.planned.length > 0) {
    var last = dragState.planned[dragState.planned.length - 1];
    if (Math.abs(last.x - x) + Math.abs(last.y - y) !== 1) return false;
  }

  dragState.planned.push({ x: x, y: y, tileId: tile.id });
  dragState.plannedSet[key] = true;
  cell.classList.add('drag-preview');
  showDragCost();
  return true;
}

function executeDragPlacements() {
  var tiles = dragState.planned.slice();
  clearDragState();

  if (tiles.length === 0) return;

  // Single tile: use normal placement flow (cancels placement mode)
  if (tiles.length === 1) {
    placeBuilding(tiles[0].tileId, state.selectedBuildType);
    return;
  }

  var btKey = state.selectedBuildType;
  var bt = state.buildingTypes[btKey];
  if (!bt) return;

  // Check affordability
  var affordable = Math.floor(state.profile.money / bt.build_cost);
  if (affordable === 0) {
    showToast('Not enough money', 'error');
    return;
  }
  if (affordable < tiles.length) {
    tiles = tiles.slice(0, affordable);
    showToast('Can only afford ' + affordable + ' road' + (affordable > 1 ? 's' : ''), 'info');
  }

  showToast('Placing ' + tiles.length + ' roads...', '');

  // Chain placement RPCs sequentially
  var chain = Promise.resolve();
  var placed = 0;
  tiles.forEach(function (t) {
    chain = chain.then(function () {
      return sb.rpc('place_building', { p_tile_id: t.tileId, p_building_type_key: btKey })
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          placed++;
          var data = r.data;
          state.profile.money = data.money;
          state.profile.workers_used = data.workers_used;
          state.profile.worker_capacity = data.worker_capacity;
          if (data.workers_needed !== undefined) {
            state.laborInfo.workerSupply = data.worker_capacity;
            state.laborInfo.workersNeeded = data.workers_needed;
            state.laborInfo.workersUsed = data.workers_used;
            state.laborInfo.workersIdle = Math.max(0, data.worker_capacity - data.workers_needed);
            state.laborInfo.laborShortage = !!data.labor_shortage;
          }
        });
    });
  });

  chain.then(function () {
    updateMoney();
    updateWorkers();
    if (placed > 0) {
      showToast(placed + ' road' + (placed > 1 ? 's' : '') + ' placed!', 'success');
    }
    // Reload data but keep placement mode active for continued painting
    return reloadMapData();
  }).then(function () {
    expandMapIfNeeded();
  }).catch(function (err) {
    showToast(err.message || 'Some placements failed', 'error');
    reloadMapData();
  });
}

// ── Map expansion ──

// Guard: prevent concurrent expansion calls from racing
var expandInProgress = false;

export function expandMapIfNeeded() {
  if (expandInProgress) return;

  var expandLeft = false, expandRight = false, expandUp = false, expandDown = false;

  state.allBuildings.forEach(function (b) {
    if (b.x <= state.gridMinX + EXPAND_THRESHOLD) expandLeft = true;
    if (b.x >= state.gridMaxX - EXPAND_THRESHOLD) expandRight = true;
    if (b.y <= state.gridMinY + EXPAND_THRESHOLD) expandUp = true;
    if (b.y >= state.gridMaxY - EXPAND_THRESHOLD) expandDown = true;
  });

  if (!expandLeft && !expandRight && !expandUp && !expandDown) return;

  var newMinX = expandLeft ? state.gridMinX - EXPAND_AMOUNT : state.gridMinX;
  var newMaxX = expandRight ? state.gridMaxX + EXPAND_AMOUNT : state.gridMaxX;
  var newMinY = expandUp ? state.gridMinY - EXPAND_AMOUNT : state.gridMinY;
  var newMaxY = expandDown ? state.gridMaxY + EXPAND_AMOUNT : state.gridMaxY;

  var newTiles = [];
  for (var y = newMinY; y <= newMaxY; y++) {
    for (var x = newMinX; x <= newMaxX; x++) {
      if (state.tileMap[x + ',' + y]) continue;
      newTiles.push({
        x: x, y: y,
        terrain_type: 'ground',
        resource_node_key: null,
        buildable: true,
        occupied_building_id: null
      });
    }
  }

  if (newTiles.length === 0) return;

  expandInProgress = true;

  function addLocalFallbackTiles() {
    newTiles.forEach(function (t) {
      // Skip if tile was already added (e.g. by another player's expansion)
      if (state.tileMap[t.x + ',' + t.y]) return;
      t.id = 'local-' + t.x + '-' + t.y;
      // Mark local-only tiles as unbuildable — they have no server-side ID for RPC
      t.buildable = false;
      state.tiles.push(t);
      state.tileMap[t.x + ',' + t.y] = t;
    });
    computeGridBounds();
    renderMap();
  }

  sb.from('map_tiles').insert(newTiles).select('*').then(function (r) {
    expandInProgress = false;
    if (r.error) {
      console.warn('Map expansion DB insert failed:', r.error.message);
      addLocalFallbackTiles();
      return;
    }
    if (r.data) {
      r.data.forEach(function (t) {
        // Deduplicate: skip if already present (race with another client)
        if (state.tileMap[t.x + ',' + t.y]) return;
        state.tiles.push(t);
        state.tileMap[t.x + ',' + t.y] = t;
      });
    }
    computeGridBounds();
    renderMap();
    showToast('New land discovered!', 'info');
  }).catch(function (err) {
    expandInProgress = false;
    console.warn('Map expansion error:', err);
    addLocalFallbackTiles();
  });
}

// ── Events ──

export function initMapEvents() {
  var grid = document.getElementById('map-grid');
  var viewport = document.getElementById('map-viewport');

  // Single-click placement for non-road buildings
  grid.addEventListener('click', function (e) {
    if (Date.now() < pinchSuppressClickUntil) return;
    if (Date.now() < dragState.suppressClick) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;
    // Roads use drag system exclusively; other build types still support tap/click placement.
    if (state.selectedBuildType && isSelectedBuildRoad()) return;

    var x = parseInt(cell.dataset.x);
    var y = parseInt(cell.dataset.y);

    // Placement mode: try to place building
    if (state.selectedBuildType) {
      var tileId = cell.dataset.tileId;
      if (!tileId) return;
      var tile = state.tileMap[x + ',' + y];
      if (!tile || !isPlacementValid(state.selectedBuildType, tile)) {
        showToast('Cannot place here', 'error');
        return;
      }
      placeBuilding(tileId, state.selectedBuildType);
      return;
    }

    // Inspection mode: open inspector if a building is here
    var building = state.allBuildings.find(function (b) {
      return b.x === x && b.y === y;
    });
    if (building) {
      openInspector(building);
    }
  });

  // ── Drag-to-paint: mouse events ──

  grid.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (!isSelectedBuildRoad()) return;
    e.preventDefault();
    clearDragState();
    dragState.active = true;
    var cell = e.target.closest('.cell');
    if (cell) tryAddDragTile(cell);
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragState.active) return;
    var cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell) tryAddDragTile(cell);
  });

  document.addEventListener('mouseup', function () {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.suppressClick = Date.now() + 200;
    executeDragPlacements();
  });

  // ── Drag-to-paint: touch events (single finger) ──

  grid.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) {
      // Multi-touch: cancel any drag, let pinch zoom handle it
      if (dragState.active) clearDragState();
      return;
    }
    if (!isSelectedBuildRoad()) return;
    clearDragState();
    dragState.active = true;
    var touch = e.touches[0];
    var cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell) tryAddDragTile(cell);
  }, { passive: true });

  grid.addEventListener('touchmove', function (e) {
    if (!dragState.active) return;
    if (e.touches.length !== 1) {
      clearDragState();
      return;
    }
    var touch = e.touches[0];
    var cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell) {
      tryAddDragTile(cell);
      // Prevent viewport scroll while drag-painting
      if (dragState.planned.length > 0) e.preventDefault();
    }
  }, { passive: false });

  grid.addEventListener('touchend', function () {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.suppressClick = Date.now() + 300;
    pinchSuppressClickUntil = Date.now() + 300;
    executeDragPlacements();
  });

  // ── Cancel button ──
  document.getElementById('placement-cancel').addEventListener('click', cancelPlacement);

  // ── Zoom controls ──
  document.getElementById('zoom-in').addEventListener('click', function () {
    var rect = viewport.getBoundingClientRect();
    setMapZoomAtPoint(state.mapZoom + MAP_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    var rect = viewport.getBoundingClientRect();
    setMapZoomAtPoint(state.mapZoom - MAP_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });
  document.getElementById('zoom-reset').addEventListener('click', function () {
    var rect = viewport.getBoundingClientRect();
    setMapZoomAtPoint(1, rect.left + rect.width / 2, rect.top + rect.height / 2);
  });

  // ── Pinch zoom ──
  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      if (dragState.active) clearDragState();
      pinchStartDistance = touchDistance(e.touches);
      pinchStartZoom = state.mapZoom;
      pinchStartCenter = touchCenter(e.touches);
      pinchSuppressClickUntil = Date.now() + 400;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2 || !pinchStartDistance) return;
    var nextDistance = touchDistance(e.touches);
    var center = touchCenter(e.touches) || pinchStartCenter;
    if (!nextDistance || !center) return;
    e.preventDefault();
    setMapZoomAtPoint(pinchStartZoom * (nextDistance / pinchStartDistance), center.x, center.y);
    pinchSuppressClickUntil = Date.now() + 400;
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      pinchStartDistance = null;
      pinchStartZoom = state.mapZoom;
      pinchStartCenter = null;
    }
    pinchSuppressClickUntil = Date.now() + 250;
  });
}
