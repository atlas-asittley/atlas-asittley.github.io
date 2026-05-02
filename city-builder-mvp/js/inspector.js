// ── Building Inspector & Demolition ──
import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast } from './ui.js';
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

// ── Helper: get staffing priority position for a building ──
function getStaffingPosition(building) {
  var myBuildings = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id;
  });
  var prodBuildings = myBuildings.filter(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || b.status !== 'active') return false;
    if (bt.category === 'extractor') return true;
    if (bt.category === 'processor') return !!state.roadAccessIds[b.id];
    return false;
  }).sort(function (a, b) {
    return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
  });

  var pos = -1;
  for (var i = 0; i < prodBuildings.length; i++) {
    if (prodBuildings[i].id === building.id) { pos = i + 1; break; }
  }
  return { position: pos, total: prodBuildings.length };
}

// ── Helper: count buildings that would lose road access if a road is demolished ──
function countDependentBuildings(building) {
  var bt = state.buildingTypes[building.building_type_key];
  if (!bt || bt.category !== 'road') return 0;

  var key = building.x + ',' + building.y;
  var count = 0;
  state.allBuildings.forEach(function (b) {
    if (b.player_id !== state.currentUser.id) return;
    var bbt = state.buildingTypes[b.building_type_key];
    if (!bbt) return;
    if (bbt.category === 'road' || bbt.category === 'extractor') return;
    // Check if this building is adjacent to the road being demolished
    if (Math.abs(b.x - building.x) + Math.abs(b.y - building.y) === 1) {
      // Check if this is its ONLY road connection
      var otherRoads = state.allBuildings.filter(function (r) {
        var rbt = state.buildingTypes[r.building_type_key];
        return rbt && rbt.category === 'road' && r.id !== building.id
          && Math.abs(r.x - b.x) + Math.abs(r.y - b.y) === 1;
      });
      if (otherRoads.length === 0) count++;
    }
  });
  return count;
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
      if (!hasRoad) {
        html += '<div class="insp-hint">Place a road next to this building to enable production and trade.</div>';
      }
    } else if (bt.category === 'housing') {
      var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var tierCfg = state.housingTierConfig[tier];
      if (tierCfg && tierCfg.needs_road) {
        var hasRoad = !!state.roadAccessIds[b.id];
        var roadClass = hasRoad ? 'insp-good' : 'insp-bad';
        var roadText = hasRoad ? 'Connected' : 'No road access';
        html += '<div class="insp-row"><span class="insp-label">Road</span><span class="insp-value ' + roadClass + '">' + roadText + '</span></div>';
        if (!hasRoad) {
          html += '<div class="insp-hint">Connect a road to provide workers. Currently contributing 0 workers.</div>';
        }
      }
    }

    // Staffing (production buildings only)
    if (bt.category === 'extractor' || bt.category === 'processor') {
      var isStaffed = !!state.laborInfo.staffedIds[b.id];
      var staffClass = isStaffed ? 'insp-good' : 'insp-bad';
      var staffText = isStaffed ? 'Staffed (' + bt.worker_cost + ' worker' + (bt.worker_cost > 1 ? 's' : '') + ')' : 'Unstaffed (needs ' + bt.worker_cost + ')';
      html += '<div class="insp-row"><span class="insp-label">Workers</span><span class="insp-value ' + staffClass + '">' + staffText + '</span></div>';

      // Staffing priority explanation
      var staffPos = getStaffingPosition(b);
      if (staffPos.position > 0) {
        var priorityNote = 'Priority #' + staffPos.position + ' of ' + staffPos.total;
        if (!isStaffed) {
          var workersAvail = state.laborInfo.workerSupply;
          var workersNeededBefore = 0;
          var myBuildings = state.allBuildings.filter(function (bb) { return bb.player_id === state.currentUser.id; });
          var prodBuildings = myBuildings.filter(function (bb) {
            var bbt = state.buildingTypes[bb.building_type_key];
            if (!bbt || bb.status !== 'active') return false;
            if (bbt.category === 'extractor') return true;
            if (bbt.category === 'processor') return !!state.roadAccessIds[bb.id];
            return false;
          }).sort(function (a, c) {
            return new Date(a.created_at).getTime() - new Date(c.created_at).getTime();
          });
          for (var i = 0; i < prodBuildings.length; i++) {
            if (prodBuildings[i].id === b.id) break;
            workersNeededBefore += (state.buildingTypes[prodBuildings[i].building_type_key].worker_cost || 1);
          }
          var shortfall = (workersNeededBefore + bt.worker_cost) - workersAvail;
          priorityNote += ' — need ' + shortfall + ' more worker' + (shortfall > 1 ? 's' : '');
          html += '<div class="insp-hint">' + priorityNote + '. Oldest buildings are staffed first. Build housing to add workers.</div>';
        } else {
          html += '<div class="insp-hint insp-hint-muted">' + priorityNote + ' — oldest first</div>';
        }
      }
    }

    // Production status with explanation
    if (bt.category === 'extractor' || bt.category === 'processor') {
      var isDisconnected = bt.category === 'processor' && state.noRoadAccessIds[b.id];
      var isUnstaffed = !!state.laborInfo.unstaffedIds[b.id];
      var statusText, statusClass;
      if (isDisconnected) {
        statusText = 'Blocked';
        statusClass = 'insp-bad';
      } else if (isUnstaffed) {
        statusText = 'Idle';
        statusClass = 'insp-warn';
      } else {
        statusText = 'Producing';
        statusClass = 'insp-good';
      }
      html += '<div class="insp-row"><span class="insp-label">Status</span><span class="insp-value ' + statusClass + '">' + statusText + '</span></div>';

      if (isDisconnected) {
        html += '<div class="insp-hint">Cannot produce without road access. Goods can\'t reach the trade network.</div>';
      } else if (isUnstaffed) {
        html += '<div class="insp-hint">No workers assigned. This building is idle and not producing.</div>';
      }
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

      // Labor context
      var li = state.laborInfo;
      if (providing && li.laborShortage) {
        html += '<div class="insp-hint insp-hint-muted">Labor shortage: ' + li.workersNeeded + ' needed, ' + li.workerSupply + ' available. Build more housing.</div>';
      } else if (providing && !li.laborShortage && li.workersIdle > 0) {
        html += '<div class="insp-hint insp-hint-muted">' + li.workersIdle + ' idle worker' + (li.workersIdle > 1 ? 's' : '') + ' — build production buildings to employ them.</div>';
      }
    }

    // Production I/O
    if (bt.category === 'extractor' && bt.output_resource_key) {
      var resName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
      html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + resName + '/min</span></div>';
    } else if (bt.category === 'processor') {
      if (bt.input_resource_key) {
        var inName = state.resources[bt.input_resource_key] ? state.resources[bt.input_resource_key].name : bt.input_resource_key;
        var inStock = state.inventory[bt.input_resource_key] || 0;
        html += '<div class="insp-row"><span class="insp-label">Input</span><span class="insp-value">' + bt.input_rate + ' ' + inName + '/min</span></div>';
        if (inStock === 0 && !state.laborInfo.unstaffedIds[b.id] && !state.noRoadAccessIds[b.id]) {
          html += '<div class="insp-hint insp-hint-muted">No ' + inName + ' in stock — production will stall when supply runs out.</div>';
        }
      }
      if (bt.output_resource_key) {
        var outName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
        html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + outName + '/min</span></div>';
      }
    }
  }

  // Road-specific info for own roads
  if (mine && bt.category === 'road') {
    var depCount = countDependentBuildings(b);
    if (depCount > 0) {
      html += '<div class="insp-row"><span class="insp-label">Connects</span><span class="insp-value">' + depCount + ' building' + (depCount > 1 ? 's' : '') + '</span></div>';
      html += '<div class="insp-hint">Removing this road will disconnect ' + depCount + ' building' + (depCount > 1 ? 's' : '') + '.</div>';
    }
  }

  bodyEl.innerHTML = html;

  // Actions (only for own buildings)
  if (mine) {
    var refund = bt ? Math.floor(bt.build_cost * 0.5) : 0;
    var depCount = bt.category === 'road' ? countDependentBuildings(b) : 0;
    var actHtml = '';

    // Demolish info line
    actHtml += '<div class="demolish-info">';
    actHtml += '<span class="demolish-refund">Refund: $' + refund + '</span>';
    if (depCount > 0) {
      actHtml += '<span class="demolish-warning">Will disconnect ' + depCount + ' building' + (depCount > 1 ? 's' : '') + '</span>';
    }
    actHtml += '</div>';

    actHtml += '<button class="btn-demolish' + (depCount > 0 ? ' btn-demolish-caution' : '') + '" id="btn-demolish">Demolish</button>';
    actionsEl.innerHTML = actHtml;

    document.getElementById('btn-demolish').addEventListener('click', function () {
      confirmDemolish(b);
    });
  } else {
    actionsEl.innerHTML = '';
  }
}

function confirmDemolish(building) {
  var bt = state.buildingTypes[building.building_type_key];
  var btn = document.getElementById('btn-demolish');

  // Two-tap confirm: first tap changes text, second tap executes
  if (btn.dataset.confirmed === '1') {
    executeDemolish(building);
    return;
  }

  var depCount = bt && bt.category === 'road' ? countDependentBuildings(building) : 0;
  var confirmText = depCount > 0
    ? 'Confirm — disconnects ' + depCount + ' building' + (depCount > 1 ? 's' : '')
    : 'Tap again to confirm';

  btn.textContent = confirmText;
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
        document.getElementById('g-money').textContent = '$' + state.profile.money;
      }

      computeLaborAllocation();
      // Update worker display
      var li = state.laborInfo;
      var wEl = document.getElementById('g-workers');
      wEl.textContent = li.workersUsed + '/' + li.workerSupply;
      wEl.className = 'v ' + (li.laborShortage ? 'shortage' : 'workers');
      var badge = document.getElementById('g-labor-badge');
      if (badge) badge.style.display = li.laborShortage ? 'inline' : 'none';

      renderMap();
      renderBuildPanel();
      renderInventory();
      closeInspector();

      var name = bt ? bt.name : 'Building';
      var msg = name + ' demolished';
      if (refund > 0) msg += ' (+$' + refund + ' refund)';
      showToast(msg, 'success');

      // Persist refund to server
      if (refund > 0) {
        sb.from('player_profiles')
          .update({ money: state.profile.money })
          .eq('id', state.currentUser.id)
          .then(function () {})
          .catch(function () {});
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
