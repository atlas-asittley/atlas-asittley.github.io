// ── Building Inspector & Demolition ──
import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel, renderInventory } from './panels.js';

var inspectedBuilding = null;

export function openInspector(building) {
  if (!building) return;
  inspectedBuilding = building;
  renderInspector();
  document.getElementById('inspector-overlay').classList.add('active');
}

export function closeInspector() {
  inspectedBuilding = null;
  document.getElementById('inspector-overlay').classList.remove('active');
}

function renderInspector() {
  var b = inspectedBuilding;
  if (!b) return;

  var bt = state.buildingTypes[b.building_type_key];
  if (!bt) return;

  var mine = b.player_id === state.currentUser.id;
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');

  // Title
  var name = bt.name;
  if (bt.category === 'housing') {
    var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
    var tierCfg = state.housingTierConfig[tier];
    if (tierCfg) name = tierCfg.name + ' (Tier ' + tier + ')';
  }
  titleEl.textContent = name;

  // Body
  var html = '';

  // Type/category row
  var catLabel = bt.category.charAt(0).toUpperCase() + bt.category.slice(1);
  html += '<div class="insp-row"><span class="insp-label">Type</span><span class="insp-value">' + catLabel + '</span></div>';

  // Owner
  if (!mine && b.player_profiles) {
    html += '<div class="insp-row"><span class="insp-label">Owner</span><span class="insp-value">' + b.player_profiles.display_name + '</span></div>';
  }

  // Position
  html += '<div class="insp-row"><span class="insp-label">Position</span><span class="insp-value">(' + b.x + ', ' + b.y + ')</span></div>';

  // Status indicators (only for own buildings)
  if (mine && bt.category !== 'road') {
    // Road connectivity
    if (bt.category === 'processor') {
      var hasRoad = !!state.roadAccessIds[b.id];
      var roadClass = hasRoad ? 'insp-good' : 'insp-bad';
      var roadText = hasRoad ? 'Connected' : 'No road access';
      html += '<div class="insp-row"><span class="insp-label">Road</span><span class="insp-value ' + roadClass + '">' + roadText + '</span></div>';
    } else if (bt.category === 'housing') {
      var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var tierCfg = state.housingTierConfig[tier];
      if (tierCfg && tierCfg.needs_road) {
        var hasRoad = !!state.roadAccessIds[b.id];
        var roadClass = hasRoad ? 'insp-good' : 'insp-bad';
        var roadText = hasRoad ? 'Connected' : 'No road access';
        html += '<div class="insp-row"><span class="insp-label">Road</span><span class="insp-value ' + roadClass + '">' + roadText + '</span></div>';
      }
    }

    // Staffing (production buildings only)
    if (bt.category === 'extractor' || bt.category === 'processor') {
      var isStaffed = !!state.laborInfo.staffedIds[b.id];
      var staffClass = isStaffed ? 'insp-good' : 'insp-bad';
      var staffText = isStaffed ? 'Staffed (' + bt.worker_cost + ' worker' + (bt.worker_cost > 1 ? 's' : '') + ')' : 'Unstaffed (needs ' + bt.worker_cost + ')';
      html += '<div class="insp-row"><span class="insp-label">Workers</span><span class="insp-value ' + staffClass + '">' + staffText + '</span></div>';
    }

    // Production status
    if (bt.category === 'extractor' || bt.category === 'processor') {
      var isDisconnected = bt.category === 'processor' && state.noRoadAccessIds[b.id];
      var isUnstaffed = !!state.laborInfo.unstaffedIds[b.id];
      var statusText, statusClass;
      if (isDisconnected) {
        statusText = 'Blocked (no road)';
        statusClass = 'insp-bad';
      } else if (isUnstaffed) {
        statusText = 'Idle (no workers)';
        statusClass = 'insp-warn';
      } else {
        statusText = 'Producing';
        statusClass = 'insp-good';
      }
      html += '<div class="insp-row"><span class="insp-label">Status</span><span class="insp-value ' + statusClass + '">' + statusText + '</span></div>';
    }

    // Housing: workers provided
    if (bt.category === 'housing') {
      var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var tierCfg = state.housingTierConfig[tier];
      var workers = tierCfg ? tierCfg.workers : (bt.workers_provided || 0);
      var providing = true;
      if (tierCfg && tierCfg.needs_road && !state.roadAccessIds[b.id]) {
        providing = false;
      }
      var wClass = providing ? 'insp-good' : 'insp-bad';
      var wText = providing ? '+' + workers + ' workers' : '+0 (needs road)';
      html += '<div class="insp-row"><span class="insp-label">Provides</span><span class="insp-value ' + wClass + '">' + wText + '</span></div>';
    }

    // Production I/O
    if (bt.category === 'extractor' && bt.output_resource_key) {
      var resName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
      html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + resName + '/min</span></div>';
    } else if (bt.category === 'processor') {
      if (bt.input_resource_key) {
        var inName = state.resources[bt.input_resource_key] ? state.resources[bt.input_resource_key].name : bt.input_resource_key;
        html += '<div class="insp-row"><span class="insp-label">Input</span><span class="insp-value">' + bt.input_rate + ' ' + inName + '/min</span></div>';
      }
      if (bt.output_resource_key) {
        var outName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
        html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + outName + '/min</span></div>';
      }
    }
  }

  bodyEl.innerHTML = html;

  // Actions (only for own buildings)
  if (mine) {
    actionsEl.innerHTML = '<button class="btn-demolish" id="btn-demolish">Demolish</button>';
    document.getElementById('btn-demolish').addEventListener('click', function () {
      confirmDemolish(b);
    });
  } else {
    actionsEl.innerHTML = '';
  }
}

function confirmDemolish(building) {
  var bt = state.buildingTypes[building.building_type_key];
  var name = bt ? bt.name : 'building';
  var btn = document.getElementById('btn-demolish');

  // Two-tap confirm: first tap changes text, second tap executes
  if (btn.dataset.confirmed === '1') {
    executeDemolish(building);
    return;
  }

  btn.textContent = 'Tap again to confirm';
  btn.classList.add('confirm');
  btn.dataset.confirmed = '1';

  // Reset after 3 seconds if not confirmed
  setTimeout(function () {
    if (btn && btn.dataset.confirmed === '1') {
      btn.textContent = 'Demolish';
      btn.classList.remove('confirm');
      btn.dataset.confirmed = '0';
    }
  }, 3000);
}

function executeDemolish(building) {
  var btn = document.getElementById('btn-demolish');
  if (btn) {
    btn.disabled = true;
    btn.textContent = 'Demolishing...';
  }

  sb.from('buildings')
    .delete()
    .eq('id', building.id)
    .eq('player_id', state.currentUser.id)
    .then(function (r) {
      if (r.error) {
        showToast('Demolish failed: ' + r.error.message, 'error');
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Demolish';
          btn.dataset.confirmed = '0';
          btn.classList.remove('confirm');
        }
        return;
      }

      // Update tile to unoccupied
      var tile = state.tileMap[building.x + ',' + building.y];
      if (tile) tile.occupied_building_id = null;

      // Remove from allBuildings
      state.allBuildings = state.allBuildings.filter(function (b) {
        return b.id !== building.id;
      });

      // Refund partial cost
      var bt = state.buildingTypes[building.building_type_key];
      var refund = bt ? Math.floor(bt.build_cost * 0.5) : 0;
      if (refund > 0) {
        state.profile.money += refund;
      }

      computeLaborAllocation();
      updateMoney();
      updateWorkers();

      renderMap();
      renderBuildPanel();
      renderInventory();
      closeInspector();

      var name = bt ? bt.name : 'Building';
      var msg = name + ' demolished';
      if (refund > 0) msg += ' (+$' + refund + ' refund)';
      showToast(msg, 'success');

      // Persist refund to server (fire-and-forget with error logging)
      if (refund > 0) {
        sb.from('player_profiles')
          .update({ money: state.profile.money })
          .eq('id', state.currentUser.id)
          .then(function (r) {
            if (r.error) console.warn('Refund persist failed:', r.error.message);
          })
          .catch(function (err) {
            console.warn('Refund persist error:', err);
          });
      }
    })
    .catch(function (err) {
      showToast(err.message || 'Demolish failed', 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Demolish';
        btn.dataset.confirmed = '0';
        btn.classList.remove('confirm');
      }
    });
}

export function initInspector() {
  document.getElementById('inspector-close').addEventListener('click', closeInspector);
  document.getElementById('inspector-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeInspector();
  });
}
