// ── Map rendering and placement logic ──
import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast } from './ui.js';
import { renderBuildPanel } from './panels.js';

export var BLDG_LABELS = {
  timber_camp: 'TC', sawmill: 'SM',
  stone_quarry: 'SQ', mason_workshop: 'MW',
  grain_farm: 'GF', mill: 'ML',
  house: 'H', road: 'R'
};

// Housing tier label overrides (keyed by tier number)
var HOUSING_TIER_LABELS = { 0: 'S', 1: 'H' };
var MAP_BASE_SIZE = 520;
var MAP_MIN_ZOOM = 0.5;
var MAP_MAX_ZOOM = 3;
var MAP_ZOOM_STEP = 0.25;
var pinchStartDistance = null;
var pinchStartZoom = 1;
var pinchSuppressClickUntil = 0;

export function isPlacementValid(btKey, tile) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return false;
  if (!tile.buildable) return false;
  if (tile.occupied_building_id) return false;

  if (bt.category === 'extractor') {
    return tile.resource_node_key === bt.output_resource_key;
  }
  return true;
}

function isRoadBuilding(building) {
  if (!building) return false;
  var bt = state.buildingTypes[building.building_type_key];
  return !!(bt && bt.category === 'road');
}

function roadNeighborClasses(x, y, buildingAt) {
  var classes = [];
  if (isRoadBuilding(buildingAt[x + ',' + (y - 1)])) classes.push('north');
  if (isRoadBuilding(buildingAt[x + ',' + (y + 1)])) classes.push('south');
  if (isRoadBuilding(buildingAt[(x + 1) + ',' + y])) classes.push('east');
  if (isRoadBuilding(buildingAt[(x - 1) + ',' + y])) classes.push('west');
  return classes;
}

export function applyMapZoom() {
  var grid = document.getElementById('map-grid');
  var label = document.getElementById('zoom-label');
  if (!grid) return;
  grid.style.width = Math.round(MAP_BASE_SIZE * state.mapZoom) + 'px';
  if (label) label.textContent = Math.round(state.mapZoom * 100) + '%';
}

function setMapZoom(nextZoom) {
  var clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom));
  state.mapZoom = Math.round(clamped * 100) / 100;
  applyMapZoom();
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function renderMap() {
  var grid = document.getElementById('map-grid');
  var buildingAt = {};
  state.allBuildings.forEach(function (b) { buildingAt[b.x + ',' + b.y] = b; });

  var html = '';
  for (var y = 0; y < 15; y++) {
    for (var x = 0; x < 15; x++) {
      var tile = state.tileMap[x + ',' + y];
      var building = buildingAt[x + ',' + y];
      var classes = ['cell'];

      if (!tile) {
        html += '<div class="cell" data-x="' + x + '" data-y="' + y + '"></div>';
        continue;
      }

      if (x === 7 && y === 7) {
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

        // Roads render as a flat surface, not a building box
        if (buildingBt && buildingBt.category === 'road') {
          var roadDirs = roadNeighborClasses(x, y, buildingAt);
          var roadClasses = 'road-surface' + (mine ? ' mine' : '');
          if (roadDirs.length) roadClasses += ' road-' + roadDirs.join(' road-');
          html += '<div class="' + roadClasses + '">';
          html += '<span class="road-center"></span>';
          html += '<span class="road-conn north"></span>';
          html += '<span class="road-conn south"></span>';
          html += '<span class="road-conn east"></span>';
          html += '<span class="road-conn west"></span>';
          html += '</div>';
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
          if (isDisconnected) titleText += ' (no road)';
          else if (isUnstaffed) titleText += ' (unstaffed)';
          var bldgClasses = 'bldg ' + btk + housingTierClass + (mine ? ' mine' : '') + (isUnstaffed ? ' unstaffed' : '') + (isDisconnected ? ' disconnected' : '');
          html += '<div class="' + bldgClasses + '" title="' + titleText + '">' + label + '</div>';
        }
      } else if (x === 7 && y === 7) {
        html += '<span class="hq-label">HQ</span>';
      } else if (tile.resource_node_key) {
        html += '<div class="res-dot"></div>';
      }

      html += '</div>';
    }
  }
  grid.innerHTML = html;
  applyMapZoom();
}

export function cancelPlacement() {
  state.selectedBuildType = null;
  document.getElementById('placement-bar').classList.remove('active');
  renderMap();
  renderBuildPanel();
}

function updateMoney() {
  document.getElementById('g-money').textContent = '$' + state.profile.money;
}

function updateWorkers() {
  var li = state.laborInfo;
  var el = document.getElementById('g-workers');
  el.textContent = li.workersUsed + '/' + li.workerSupply;
  el.className = 'v ' + (li.laborShortage ? 'shortage' : 'workers');
  var badge = document.getElementById('g-labor-badge');
  if (badge) badge.style.display = li.laborShortage ? 'inline' : 'none';
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

      // Update labor info from placement response
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

      Promise.all([
        sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
        sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true })
      ]).then(function (results) {
        state.allBuildings = results[0].data || [];
        state.tiles = results[1].data || [];
        state.tileMap = {};
        state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });
        computeLaborAllocation();
        renderMap();
        renderBuildPanel();
      });
    })
    .catch(function (err) {
      showToast(err.message || 'Placement failed', 'error');
    });
}

export function initMapEvents() {
  document.getElementById('map-grid').addEventListener('click', function (e) {
    if (Date.now() < pinchSuppressClickUntil) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;
    if (!state.selectedBuildType) return;

    var tileId = cell.dataset.tileId;
    if (!tileId) return;
    var tile = state.tileMap[cell.dataset.x + ',' + cell.dataset.y];
    if (!tile || !isPlacementValid(state.selectedBuildType, tile)) {
      showToast('Cannot place here', 'error');
      return;
    }
    placeBuilding(tileId, state.selectedBuildType);
  });

  document.getElementById('placement-cancel').addEventListener('click', cancelPlacement);
  document.getElementById('zoom-in').addEventListener('click', function () {
    setMapZoom(state.mapZoom + MAP_ZOOM_STEP);
  });
  document.getElementById('zoom-out').addEventListener('click', function () {
    setMapZoom(state.mapZoom - MAP_ZOOM_STEP);
  });

  var viewport = document.getElementById('map-viewport');
  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinchStartDistance = touchDistance(e.touches);
      pinchStartZoom = state.mapZoom;
      pinchSuppressClickUntil = Date.now() + 400;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2 || !pinchStartDistance) return;
    var nextDistance = touchDistance(e.touches);
    if (!nextDistance) return;
    e.preventDefault();
    setMapZoom(pinchStartZoom * (nextDistance / pinchStartDistance));
    pinchSuppressClickUntil = Date.now() + 400;
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      pinchStartDistance = null;
      pinchStartZoom = state.mapZoom;
    }
    pinchSuppressClickUntil = Date.now() + 250;
  });
}
