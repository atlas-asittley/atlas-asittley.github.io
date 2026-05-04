// ── Building Inspector, Walker Inspector & Demolition ──
import { sb } from './config.js';
import { state, computeLaborAllocation, inspectedBuildingHolder } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel, renderInventory } from './panels.js';
import { setWalkerClickHandler } from './walkers.js';

var inspectedBuilding = null;

// Helper: show trade value per minute for a given output resource/rate
function buildTradeValueRow(resourceKey, rate) {
  // Find the best sell price across all traders the player has unlocked
  var bestPrice = 0;
  Object.keys(state.allTraderPrices || {}).forEach(function (tk) {
    var unlocked = state.unlockedTraders[tk];
    if (!unlocked || !unlocked.unlocked) return;
    var prices = state.allTraderPrices[tk][resourceKey];
    if (prices && prices.buy_price > bestPrice) bestPrice = prices.buy_price;
  });
  if (bestPrice <= 0) return '';
  var valuePerMin = bestPrice * rate;
  return '<div class="insp-row"><span class="insp-label">Trade value</span><span class="insp-value" style="color:#e6c65a;">$' + valuePerMin + '/min</span></div>';
}

export function openInspector(building) {
  if (!building) return;
  inspectedBuilding = building;
  inspectedBuildingHolder.value = building;
  renderInspector();
  document.getElementById('inspector-overlay').classList.add('active');
  // Add scroll-room below the map so a building at the bottom can be pushed
  // up into view above the inspector. CSS handles the padding via this class.
  document.body.classList.add('inspector-open');
  renderMap();  // re-render so map can highlight the inspected extractor's target
  ensureInspectionVisible(building);
}

// Scroll the map so BOTH the inspected building AND, if present, its target
// resource tile are visible in the space above the inspector panel. If they
// can't both fit, prioritize the building itself (the thing the player just
// tapped). No-op when neither is on the map.
function ensureInspectionVisible(building) {
  // Wait for the inspector's slide-up animation (~200ms) before measuring.
  setTimeout(function () {
    var bldgCell = document.querySelector(
      '.cell[data-x="' + building.x + '"][data-y="' + building.y + '"]'
    );
    var targetCell = (building.target_x !== null && building.target_x !== undefined)
      ? document.querySelector(
          '.cell[data-x="' + building.target_x + '"][data-y="' + building.target_y + '"]'
        )
      : null;
    var viewport = document.getElementById('map-viewport');
    var panel = document.getElementById('inspector-panel');
    if (!bldgCell || !viewport || !panel) return;

    var bRect = bldgCell.getBoundingClientRect();
    var tRect = targetCell ? targetCell.getBoundingClientRect() : null;
    var panelRect = panel.getBoundingClientRect();
    var vpRect = viewport.getBoundingClientRect();

    var visibleTop = vpRect.top;
    var visibleBottom = Math.min(vpRect.bottom, panelRect.top);
    var visibleHeight = visibleBottom - visibleTop;
    if (visibleHeight < 60) return;

    // Bounding box that covers both the building and its target
    var bboxTop = bRect.top, bboxBottom = bRect.bottom;
    var bboxLeft = bRect.left, bboxRight = bRect.right;
    if (tRect) {
      bboxTop = Math.min(bboxTop, tRect.top);
      bboxBottom = Math.max(bboxBottom, tRect.bottom);
      bboxLeft = Math.min(bboxLeft, tRect.left);
      bboxRight = Math.max(bboxRight, tRect.right);
    }
    var bboxHeight = bboxBottom - bboxTop;

    // If both fit comfortably in the visible area, center the bbox.
    // If they don't, center on the building (priority: thing the player tapped).
    var anchorCenterY, anchorCenterX;
    if (bboxHeight + 30 <= visibleHeight) {
      anchorCenterY = (bboxTop + bboxBottom) / 2;
      anchorCenterX = (bboxLeft + bboxRight) / 2;
    } else {
      anchorCenterY = bRect.top + bRect.height / 2;
      anchorCenterX = bRect.left + bRect.width / 2;
    }

    var visibleCenterY = visibleTop + visibleHeight / 2;
    var visibleCenterX = vpRect.left + vpRect.width / 2;
    var deltaY = anchorCenterY - visibleCenterY;
    var deltaX = anchorCenterX - visibleCenterX;

    // Skip the scroll if everything's already in a comfortable place
    if (Math.abs(deltaY) < 8 && Math.abs(deltaX) < 8) return;
    viewport.scrollBy({ top: deltaY, left: deltaX, behavior: 'smooth' });
  }, 220);
}

export function closeInspector() {
  inspectedBuilding = null;
  inspectedBuildingHolder.value = null;
  document.getElementById('inspector-overlay').classList.remove('active');
  document.body.classList.remove('inspector-open');
  renderMap();  // re-render to clear the target highlight
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
      // M2: extractor with no path = idle (different from unstaffed)
      var isExtractorWithoutPath = bt.category === 'extractor'
        && (b.path_length === null || b.path_length === undefined);
      var isDisconnected = bt.category === 'processor' && state.noRoadAccessIds[b.id];
      var isUnstaffed = !!state.laborInfo.unstaffedIds[b.id];
      var statusText, statusClass;
      if (isDisconnected) {
        statusText = 'Blocked';
        statusClass = 'insp-bad';
      } else if (isUnstaffed) {
        statusText = 'Idle (no workers)';
        statusClass = 'insp-warn';
      } else if (isExtractorWithoutPath) {
        statusText = 'Idle (no path)';
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
      } else if (isExtractorWithoutPath) {
        html += '<div class="insp-hint">No reachable resource tile. Build roads toward an unclaimed ' + (bt.output_resource_key || 'resource') + ' tile to start collecting.</div>';
      }
    }

    // M2: extractor target + path + effective rate
    if (bt.category === 'extractor' && b.target_x !== null && b.target_x !== undefined) {
      var canonical = 4;
      var pathLen = b.path_length || 1;
      var pathFactor = Math.min(1, canonical / Math.max(pathLen, 1));
      var effectiveRate = (bt.output_rate * pathFactor).toFixed(2);
      var resName = (state.resources[bt.output_resource_key] && state.resources[bt.output_resource_key].name) || bt.output_resource_key;
      html += '<div class="insp-row"><span class="insp-label">Target</span><span class="insp-value">(' + b.target_x + ', ' + b.target_y + ')</span></div>';
      html += '<div class="insp-row"><span class="insp-label">Path</span><span class="insp-value">' + pathLen + ' tile' + (pathLen === 1 ? '' : 's') + '</span></div>';
      html += '<div class="insp-row"><span class="insp-label">Rate</span><span class="insp-value">' + effectiveRate + ' ' + resName.toLowerCase() + '/min</span></div>';
      if (pathLen > canonical) {
        html += '<div class="insp-hint insp-hint-muted">Shorter paths produce faster. ' + canonical + '-tile path = full rate.</div>';
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

      // Housing evolution / progression feedback
      var nextTierCfg = state.housingTierConfig[tier + 1];
      var hasRoad = !!state.roadAccessIds[b.id];
      if (nextTierCfg) {
        var canUpgrade = !nextTierCfg.needs_road || hasRoad;
        var evolving = canUpgrade && b.evolution_eligible_at;
        if (evolving) {
          var elapsed = Math.floor((Date.now() - new Date(b.evolution_eligible_at).getTime()) / 1000);
          var needed = tierCfg ? tierCfg.upgrade_secs : 30;
          var remaining = Math.max(0, needed - elapsed);
          var progressPct = Math.min(100, Math.round((elapsed / needed) * 100));
          var progressText = remaining > 0 ? 'Upgrading (' + remaining + 's)' : 'Upgrading soon';
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value insp-good">' + nextTierCfg.name + ' — ' + progressText + '</span></div>';
          html += '<div class="insp-evolution-bar"><div class="insp-evolution-fill" style="width:' + progressPct + '%"></div></div>';
        } else if (canUpgrade) {
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value">' + nextTierCfg.name + ' (+' + nextTierCfg.workers + ' wkrs)</span></div>';
          html += '<div class="insp-hint insp-hint-muted">Conditions met — will begin upgrading at next production tick.</div>';
        } else {
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value insp-warn">' + nextTierCfg.name + ' — needs road</span></div>';
          html += '<div class="insp-hint">Connect a road to this house to enable upgrades and full worker output.</div>';
        }
      } else {
        html += '<div class="insp-row"><span class="insp-label">Tier</span><span class="insp-value insp-good">Max tier reached</span></div>';
      }

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
      html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
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
        html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
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

// ── Walker Inspector ──
export function openWalkerInspector(walkerInfo) {
  inspectedBuilding = null; // clear building inspection
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');

  var jobTitles = { citizen: 'Citizen', timber: 'Timber Worker', sawmill: 'Sawmill Worker', stone: 'Stone Worker', grain: 'Grain Worker' };
  var jobType = walkerInfo.sourceType || 'citizen';
  titleEl.textContent = jobTitles[jobType] || 'Citizen';

  var typeLabel;
  if (jobType === 'citizen') {
    var walkerTierLabels = { 0: 'Shanty dweller', 1: 'Villager', 2: 'Cottage resident', 3: 'Townhouse resident', 4: 'Villa resident', 5: 'Manor estate resident' };
    typeLabel = walkerTierLabels[walkerInfo.sourceTier] || 'Citizen';
  } else {
    typeLabel = jobTitles[jobType] || 'Worker';
  }
  var stepsLeft = walkerInfo.maxSteps - walkerInfo.steps;
  var jobActivities = {
    citizen: stepsLeft > 4 ? 'Strolling' : 'Heading home',
    timber: stepsLeft > 4 ? 'Hauling timber' : 'Returning to camp',
    sawmill: stepsLeft > 4 ? 'Carrying planks' : 'Returning to mill',
    stone: stepsLeft > 4 ? 'Hauling stone' : 'Returning to quarry',
    grain: stepsLeft > 4 ? 'Delivering grain' : 'Returning to farm'
  };
  var activity = jobActivities[jobType] || (stepsLeft > 4 ? 'Working' : 'Heading back');

  var html = '';
  html += '<div class="insp-row"><span class="insp-label">Type</span><span class="insp-value">' + typeLabel + '</span></div>';
  html += '<div class="insp-row"><span class="insp-label">Activity</span><span class="insp-value">' + activity + '</span></div>';
  var originLabel = jobType === 'citizen' ? 'Home' : 'Workplace';
  html += '<div class="insp-row"><span class="insp-label">' + originLabel + '</span><span class="insp-value">' + walkerInfo.sourceName + '</span></div>';
  if (walkerInfo.sourceX !== null) {
    html += '<div class="insp-row"><span class="insp-label">' + originLabel + ' location</span><span class="insp-value">(' + walkerInfo.sourceX + ', ' + walkerInfo.sourceY + ')</span></div>';
  }
  html += '<div class="insp-row"><span class="insp-label">Position</span><span class="insp-value">(' + walkerInfo.x + ', ' + walkerInfo.y + ')</span></div>';
  html += '<div class="insp-row"><span class="insp-label">Steps</span><span class="insp-value">' + walkerInfo.steps + ' / ' + walkerInfo.maxSteps + '</span></div>';
  html += '<div class="insp-hint">Walkers wander along roads from their buildings. They are purely cosmetic and don\'t affect production.</div>';

  bodyEl.innerHTML = html;
  actionsEl.innerHTML = '';
  document.getElementById('inspector-overlay').classList.add('active');
}

export function initInspector() {
  document.getElementById('inspector-close').addEventListener('click', closeInspector);
  document.getElementById('inspector-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeInspector();
  });
  // Wire up walker click -> inspector
  setWalkerClickHandler(function (walkerInfo) {
    openWalkerInspector(walkerInfo);
  });
}
