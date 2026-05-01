// ── Map rendering and placement logic ──
import { sb } from './config.js';
import { state } from './state.js';
import { showToast } from './ui.js';
import { renderBuildPanel } from './panels.js';

export var BLDG_LABELS = {
  timber_camp: 'TC', sawmill: 'SM',
  stone_quarry: 'SQ', mason_workshop: 'MW'
};

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

      if (state.selectedBuildType && !building && isPlacementValid(state.selectedBuildType, tile)) {
        classes.push('valid-placement');
      }

      html += '<div class="' + classes.join(' ') + '" data-x="' + x + '" data-y="' + y + '" data-tile-id="' + tile.id + '">';

      if (building) {
        var mine = building.player_id === state.currentUser.id;
        var btk = building.building_type_key;
        var label = BLDG_LABELS[btk] || '?';
        var btInfo = state.buildingTypes[btk];
        var titleText = (btInfo ? btInfo.name : btk);
        if (!mine && building.player_profiles) {
          titleText += ' (' + building.player_profiles.display_name + ')';
        }
        html += '<div class="bldg ' + btk + (mine ? ' mine' : '') + '" title="' + titleText + '">' + label + '</div>';
      } else if (x === 7 && y === 7) {
        html += '<span class="hq-label">HQ</span>';
      } else if (tile.resource_node_key) {
        html += '<div class="res-dot"></div>';
      }

      html += '</div>';
    }
  }
  grid.innerHTML = html;
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
  document.getElementById('g-workers').textContent = state.profile.workers_used + '/' + state.profile.worker_capacity;
}

function placeBuilding(tileId, btKey) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return;
  if (state.profile.money < bt.build_cost) {
    showToast('Not enough money (need $' + bt.build_cost + ')', 'error');
    return;
  }
  if (state.profile.workers_used + bt.worker_cost > state.profile.worker_capacity) {
    showToast('Not enough workers', 'error');
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
      updateMoney();
      updateWorkers();
      showToast(bt.name + ' placed!', 'success');
      cancelPlacement();

      Promise.all([
        sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
        sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true })
      ]).then(function (results) {
        state.allBuildings = results[0].data || [];
        state.tiles = results[1].data || [];
        state.tileMap = {};
        state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });
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
}
