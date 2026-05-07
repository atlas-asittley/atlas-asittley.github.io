// ── Building Inspector, Walker Inspector & Demolition ──
import { sb } from './config.js';
import { state, computeLaborAllocation, inspectedBuildingHolder } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel, refreshActiveDataPanel } from './panels.js';
import { setWalkerClickHandler } from './walkers.js';

var inspectedBuilding = null;
var inspectedTile = null;       // resource-tile inspector mode

// Lookups for the resource role rows in the tile inspector.
function findExtractorFor(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.category === 'extractor' && bt.output_resource_key === resourceKey) match = bt;
  });
  return match;
}
function findBuilderRequiringTile(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.placement_resource_node_key === resourceKey) match = bt;
  });
  return match;
}
function isTerrainResource(resourceKey) {
  return !!(state.resources && state.resources[resourceKey] && state.resources[resourceKey].kind === 'terrain');
}
function findProcessorConsuming(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.category === 'processor' && bt.input_resource_key === resourceKey) match = bt;
  });
  return match;
}
function resName(key) {
  if (state.resources && state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

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
  inspectedTile = null;
  inspectedBuildingHolder.value = null;
  document.getElementById('inspector-overlay').classList.remove('active');
  document.body.classList.remove('inspector-open');
  renderMap();  // re-render to clear the target highlight
}

// ── Resource Tile Inspector ──
// Opens the same inspector panel chrome but with resource-role text and
// a Demolish button that clears the tile (calls clear_resource_tile).
export function openResourceInspector(tile) {
  if (!tile || !tile.resource_node_key) return;
  // Close any building inspection first so the two modes don't co-exist.
  inspectedBuilding = null;
  inspectedBuildingHolder.value = null;
  inspectedTile = tile;
  renderResourceInspector();
  document.getElementById('inspector-overlay').classList.add('active');
  document.body.classList.add('inspector-open');
  renderMap();
}

function renderResourceInspector() {
  if (!inspectedTile) return;
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');
  var rkey = inspectedTile.resource_node_key;
  var rName = resName(rkey);
  var isTerrain = isTerrainResource(rkey);
  var ext = findExtractorFor(rkey);
  var proc = findProcessorConsuming(rkey);
  var builder = findBuilderRequiringTile(rkey);

  titleEl.textContent = isTerrain ? rName : rName + ' deposit';

  var rows = '';
  rows += '<div class="insp-row"><span class="insp-label">' + (isTerrain ? 'Terrain' : 'Resource') + '</span><span class="insp-value">' + rName + '</span></div>';
  if (builder) {
    rows += '<div class="insp-row"><span class="insp-label">Build here</span><span class="insp-value">' + builder.name + ' → ' + resName(builder.output_resource_key) + '</span></div>';
  }
  if (ext) {
    rows += '<div class="insp-row"><span class="insp-label">Harvested by</span><span class="insp-value">' + ext.name + '</span></div>';
  }
  if (proc) {
    rows += '<div class="insp-row"><span class="insp-label">Processed by</span><span class="insp-value">' + proc.name + ' → ' + resName(proc.output_resource_key) + '</span></div>';
    // Show one more downstream step if there is one.
    var proc2 = findProcessorConsuming(proc.output_resource_key);
    if (proc2) {
      rows += '<div class="insp-row"><span class="insp-label">Then</span><span class="insp-value">' + proc2.name + ' → ' + resName(proc2.output_resource_key) + '</span></div>';
    }
  }
  bodyEl.innerHTML = rows;

  // Block demolition while an extractor still claims this tile —
  // matches the server-side rule in clear_resource_tile.
  var claimed = !!inspectedTile.claimed_by_building_id;
  var actHtml = '<div class="demolish-info">';
  if (claimed) {
    actHtml += '<span class="demolish-warning">An extractor is targeting this tile — demolish that first.</span>';
  } else {
    actHtml += '<span class="demolish-refund">' + (isTerrain ? 'Removes the terrain so you can build anything here.' : 'Removes the deposit so you can build here.') + '</span>';
  }
  actHtml += '</div>';
  actHtml += '<button class="btn-demolish' + (claimed ? ' btn-demolish-disabled' : '') + '" id="btn-demolish-tile"' + (claimed ? ' disabled' : '') + '>Demolish</button>';
  actionsEl.innerHTML = actHtml;

  if (!claimed) {
    document.getElementById('btn-demolish-tile').addEventListener('click', demolishInspectedTile);
  }
}

function demolishInspectedTile() {
  if (!inspectedTile) return;
  var btn = document.getElementById('btn-demolish-tile');
  if (btn) { btn.disabled = true; btn.textContent = 'Demolishing…'; }
  var label = resName(inspectedTile.resource_node_key);
  sb.rpc('clear_resource_tile', { p_tile_id: inspectedTile.id }).then(function (r) {
    if (r.error) {
      showToast('Cannot clear: ' + r.error.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Demolish'; }
      return;
    }
    showToast(label + ' cleared', 'success');
    closeInspector();
    return reloadAfterTileChange();
  }).catch(function (err) {
    showToast('Clear failed: ' + (err.message || err), 'error');
    if (btn) { btn.disabled = false; btn.textContent = 'Demolish'; }
  });
}

// Reload tiles + buildings after a tile-level change. Keeping it small
// and local so the inspector module doesn't pull in map.js's whole
// reloadMapData export.
function reloadAfterTileChange() {
  return Promise.all([
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

// ── Housing upgrade gating: mirror process_production's checks ──
// Returns the labels of any prerequisite that's blocking the next-tier
// upgrade (subset of: 'road', 'well', 'school', 'temple'). Empty array
// means all conditions are met.
//
// Server reference (process_production):
//   needs_road   → has_road_access (any road tile orthogonal, status='active')
//   needs_well   → well within Manhattan dist 4, status='active' (no staff/feed required)
//   needs_school → school within 5, in v_operating_services (staffed AND both inputs available)
//   needs_temple → temple within 6, in v_operating_services
function getHousingUpgradeBlockers(building, nextTierCfg) {
  if (!nextTierCfg) return [];
  var blockers = [];

  if (nextTierCfg.needs_road && !state.roadAccessIds[building.id]) {
    blockers.push('road');
  }

  // Food: any resource flagged is_food in inventory > 0 satisfies the gate.
  if (nextTierCfg.needs_food) {
    var hasFood = false;
    Object.keys(state.resources).forEach(function (k) {
      if (state.resources[k].is_food && (state.inventory[k] || 0) > 0) hasFood = true;
    });
    if (!hasFood) blockers.push('food');
  }

  function hasNearbyService(serviceKey, range, requiresFeeding) {
    return state.allBuildings.some(function (s) {
      if (s.player_id !== state.currentUser.id) return false;
      if (s.status !== 'active') return false;
      if (s.building_type_key !== serviceKey) return false;
      var dist = Math.abs(s.x - building.x) + Math.abs(s.y - building.y);
      if (dist > range) return false;
      if (!requiresFeeding) return true;
      // Approximation of v_operating_services: staffed AND every input is in stock
      if (state.laborInfo.unstaffedIds[s.id]) return false;
      var sbt = state.buildingTypes[serviceKey];
      if (!sbt) return false;
      if (sbt.input_resource_key && sbt.input_rate > 0
          && (state.inventory[sbt.input_resource_key] || 0) <= 0) return false;
      if (sbt.input_resource_key_2 && sbt.input_rate_2 > 0
          && (state.inventory[sbt.input_resource_key_2] || 0) <= 0) return false;
      return true;
    });
  }

  if (nextTierCfg.needs_well && !hasNearbyService('well', 4, false)) {
    blockers.push('well');
  }
  if (nextTierCfg.needs_school && !hasNearbyService('school', 5, true)) {
    blockers.push('school');
  }
  if (nextTierCfg.needs_temple && !hasNearbyService('temple', 6, true)) {
    blockers.push('temple');
  }

  // Tier 6+: any luxury food (spirits/caviar/spices/ale) in inventory
  if (nextTierCfg.needs_luxury_food) {
    var hasLuxFood = Object.keys(state.resources).some(function (k) {
      return state.resources[k].is_luxury_food && (state.inventory[k] || 0) > 0;
    });
    if (!hasLuxFood) blockers.push('luxury_food');
  }

  // Tier 7+: any industrial luxury (cabinets/monuments/mosaics/machinery)
  if (nextTierCfg.needs_industrial_luxury) {
    var hasIndLux = Object.keys(state.resources).some(function (k) {
      return state.resources[k].is_industrial_luxury && (state.inventory[k] || 0) > 0;
    });
    if (!hasIndLux) blockers.push('industrial_luxury');
  }

  // Tier 8: ALL industrial luxuries simultaneously in stock
  if (nextTierCfg.needs_all_industrial_luxuries) {
    var allIndLux = Object.keys(state.resources)
      .filter(function (k) { return state.resources[k].is_industrial_luxury; })
      .every(function (k) { return (state.inventory[k] || 0) > 0; });
    if (!allIndLux) blockers.push('all_industrial_luxuries');
  }

  // Lifestyle demands per tier — pottery for Cottages, bread for
  // Townhouses, furniture for Villas, statuary for Manors. The
  // resource has to be in stock (>0) for upgrade AND continuously
  // (it's drained each tick). One blocker entry per missing demand.
  var demands = state.housingLifestyleDemands && state.housingLifestyleDemands[nextTierCfg.tier];
  if (demands) {
    demands.forEach(function (d) {
      if ((state.inventory[d.resource_key] || 0) <= 0) {
        blockers.push('lifestyle:' + d.resource_key);
      }
    });
  }

  return blockers;
}

// Devolve risk: same tier-requirement logic, but checked against the
// CURRENT tier (the requirements that have to keep being met to stay
// at this tier). The SQL devolve gate triggers when any current-tier
// requirement is missing AND no bathhouse is suppressing devolve, after
// the per-tier grace window (housing_tier_config.devolve_secs, 60-300s
// depending on tier). We surface this in the inspector so the player
// sees the full list of supply problems before the house devolves —
// not just the next-upgrade list, which can hide an in-progress
// shortage.
//
// Returns { blockers, hasBathhouseCover, willDevolve }.
function getHousingDevolveRisks(building, currentTierCfg) {
  if (!currentTierCfg) return { blockers: [], hasBathhouseCover: false, willDevolve: false };
  var blockers = getHousingUpgradeBlockers(building, currentTierCfg);
  if (blockers.length === 0) {
    return { blockers: [], hasBathhouseCover: false, willDevolve: false };
  }
  var bbt = state.buildingTypes['bathhouse'];
  var hasBathhouseCover = state.allBuildings.some(function (s) {
    if (s.player_id !== state.currentUser.id) return false;
    if (s.building_type_key !== 'bathhouse') return false;
    if (s.status !== 'active') return false;
    if (state.laborInfo.unstaffedIds[s.id]) return false;
    if (bbt && bbt.input_resource_key && bbt.input_rate > 0
        && (state.inventory[bbt.input_resource_key] || 0) <= 0) return false;
    if (bbt && bbt.input_resource_key_2 && bbt.input_rate_2 > 0
        && (state.inventory[bbt.input_resource_key_2] || 0) <= 0) return false;
    var dist = Math.abs(s.x - building.x) + Math.abs(s.y - building.y);
    return dist <= 4;
  });
  return {
    blockers: blockers,
    hasBathhouseCover: hasBathhouseCover,
    willDevolve: !hasBathhouseCover
  };
}

function describeUpgradeBlocker(key) {
  if (key === 'road') return 'a road touching this house';
  if (key === 'well') return 'a well within 4 tiles';
  if (key === 'food') return 'food in stock (any food: grain, flour, bread, berries, fish, vegetables, or any luxury food)';
  if (key === 'school') return 'an operating school within 5 tiles';
  if (key === 'temple') return 'an operating temple within 6 tiles';
  if (key === 'luxury_food') return 'a luxury food in stock (spirits, caviar, spices, or ale)';
  if (key === 'industrial_luxury') return 'an industrial luxury in stock (cabinets, monuments, mosaics, or machinery)';
  if (key === 'all_industrial_luxuries') return 'ALL FOUR industrial luxuries in stock simultaneously (cabinets + monuments + mosaics + machinery)';
  if (key.indexOf('lifestyle:') === 0) {
    var rk = key.slice('lifestyle:'.length);
    var name = (state.resources && state.resources[rk] && state.resources[rk].name) || rk;
    return name + ' in stock (this tier consumes it ongoingly)';
  }
  return key;
}

// ── Issues: consolidated list of reasons this building isn't operational ──
// Returns an array of { label, hint, severity } where severity is 'bad'
// (blocks operation entirely) or 'warn' (idle but recoverable). Empty
// array means the building is fully operational.
function computeBuildingIssues(b, bt) {
  if (b.player_id !== state.currentUser.id) return [];
  if (bt.category === 'road') return [];
  // Paused is intentional; nothing operational to report. Status row
  // will show "Paused" and the controls section gives the resume button.
  if (b.status === 'paused') return [];
  var issues = [];

  // Road access — must match the staffing rule in computeLaborAllocation
  // (state.js): every worker-consuming production category requires a road
  // for staffing, including extractor / food_extractor / booster which
  // previously didn't. Without this, a road-less garden was excluded from
  // the labor accounting entirely, neither flagged as "Not staffed" nor
  // "No road access", so its inspector status read as "Operational" while
  // the server (correctly) marked it is_staffed=false.
  var needsRoad = false;
  if (bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
      || bt.category === 'extractor' || bt.category === 'food_extractor'
      || bt.category === 'booster') {
    needsRoad = true;
  } else if (bt.category === 'housing') {
    var tier0 = b.housing_tier !== undefined ? b.housing_tier : 1;
    var tierCfg0 = state.housingTierConfig[tier0];
    if (tierCfg0 && tierCfg0.needs_road) needsRoad = true;
  }
  if (needsRoad && !state.roadAccessIds[b.id]) {
    if (bt.category === 'housing') {
      issues.push({
        severity: 'bad',
        label: 'No road access',
        hint: 'This house contributes 0 workers and won\'t evolve until a road touches it.'
      });
    } else {
      issues.push({
        severity: 'bad',
        label: 'No road access',
        hint: 'Place a road on a tile orthogonally adjacent to this building.'
      });
    }
  }

  // Worker staffing — only flag if the building consumes workers AND is
  // unstaffed (computeLaborAllocation already accounts for road access).
  var consumesWorkers = bt.category === 'extractor' || bt.category === 'food_extractor'
    || bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
    || bt.category === 'booster' || bt.category === 'police';
  if (consumesWorkers && state.laborInfo.unstaffedIds[b.id]) {
    var li = state.laborInfo;
    var hint = 'Needs ' + bt.worker_cost + ' worker' + (bt.worker_cost > 1 ? 's' : '')
      + '. Pool is ' + li.workerSupply + ', used ' + li.workersUsed + '. '
      + 'Older buildings staff first — build or upgrade housing to add capacity.';
    issues.push({ severity: 'bad', label: 'Not staffed', hint: hint });
  }

  // Extractor path
  if (bt.category === 'extractor'
      && (b.path_length === null || b.path_length === undefined)) {
    var resKey = bt.output_resource_key || 'resource';
    var resName = state.resources[resKey] ? state.resources[resKey].name.toLowerCase() : resKey;
    issues.push({
      severity: 'warn',
      label: 'No reachable resource',
      hint: 'No unclaimed ' + resName + ' tile is reachable. Clear obstructions or place roads toward one.'
    });
  }

  // Input stock — only relevant if otherwise operational (staffed + on
  // road). An unstaffed building is already "broken"; missing inputs
  // would be the next thing to fix.
  if (!state.laborInfo.unstaffedIds[b.id] && (bt.category === 'extractor' ? false : !needsRoad || state.roadAccessIds[b.id])) {
    var inputs = [];
    // Processors and services can have a 2nd input (cross-converter
    // recipes like cabinets needing furniture + lime). Both inputs must
    // be in stock for production to actually advance — flag either.
    if (bt.category === 'processor' || bt.category === 'service') {
      if (bt.input_resource_key && bt.input_rate > 0) inputs.push(bt.input_resource_key);
      if (bt.input_resource_key_2 && bt.input_rate_2 > 0) inputs.push(bt.input_resource_key_2);
    }
    inputs.forEach(function (key) {
      var stock = state.inventory[key] || 0;
      if (stock <= 0) {
        var nm = state.resources[key] ? state.resources[key].name : key;
        var idleHint = bt.category === 'service'
          ? 'Service is idle until ' + nm.toLowerCase() + ' is restocked.'
          : 'Production has stalled until ' + nm.toLowerCase() + ' is restocked.';
        issues.push({
          severity: 'warn',
          label: 'No ' + nm.toLowerCase() + ' in stock',
          hint: idleHint + ' Produce it locally or trade for it.'
        });
      }
    });
  }

  return issues;
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

  // Status + Issues (only for own buildings, not roads)
  if (mine && bt.category !== 'road') {
    var issues = computeBuildingIssues(b, bt);
    var statusClass, statusText;
    if (b.status === 'paused') {
      statusClass = 'insp-warn';
      statusText = 'Paused';
    } else if (issues.length === 0) {
      statusClass = 'insp-good';
      statusText = bt.category === 'housing' ? 'Producing workers' : 'Operational';
    } else {
      var anyBad = issues.some(function (i) { return i.severity === 'bad'; });
      statusClass = anyBad ? 'insp-bad' : 'insp-warn';
      statusText = issues.length === 1 ? '1 issue' : (issues.length + ' issues');
    }
    html += '<div class="insp-row"><span class="insp-label">Status</span><span class="insp-value ' + statusClass + '">' + statusText + '</span></div>';

    if (issues.length > 0) {
      html += '<div class="insp-section">Issues</div><div class="insp-issues">';
      issues.forEach(function (iss) {
        var cls = iss.severity === 'warn' ? 'insp-issue insp-issue-warn' : 'insp-issue';
        html += '<div class="' + cls + '">';
        html += '<span class="insp-issue-bullet">●</span>';
        html += '<div class="insp-issue-body"><div class="insp-issue-label">' + iss.label + '</div>';
        if (iss.hint) html += '<div class="insp-issue-hint">' + iss.hint + '</div>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    // Factual worker cost (extractor / food_extractor / processor / service / tax / booster)
    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
        || bt.category === 'booster') {
      if (bt.worker_cost > 0) {
        html += '<div class="insp-row"><span class="insp-label">Workers</span><span class="insp-value">' + bt.worker_cost + ' required</span></div>';
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
      var providing = !(tierCfg && tierCfg.needs_road && !state.roadAccessIds[b.id]);
      // Houses raise the *target* population the city grows toward;
      // they don't directly drop a fixed worker count into the pool.
      // Wording reflects that — "houses up to N people" rather than
      // "provides N workers" — so a fresh hut doesn't read as instant
      // capacity that hasn't actually arrived yet.
      var capacityLabel = providing
        ? 'Houses up to ' + workers + ' people'
        : 'Houses up to ' + workers + ' people (none yet — needs road access)';
      html += '<div class="insp-row"><span class="insp-label">Capacity</span><span class="insp-value">' + capacityLabel + '</span></div>';

      // Housing evolution / progression feedback
      var nextTierCfg = state.housingTierConfig[tier + 1];
      if (nextTierCfg) {
        var blockers = getHousingUpgradeBlockers(b, nextTierCfg);
        var canUpgrade = blockers.length === 0;
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
          var blockerLabels = blockers.join(' + ');
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value insp-warn">' + nextTierCfg.name + ' — needs ' + blockerLabels + '</span></div>';
          var missingDesc = blockers.map(describeUpgradeBlocker).join(', plus ');
          var hint = 'Missing: ' + missingDesc + '.';
          if (blockers.indexOf('school') >= 0 || blockers.indexOf('temple') >= 0) {
            hint += ' "Operating" means staffed AND has both inputs in stock.';
          }
          html += '<div class="insp-hint">' + hint + '</div>';
        }
      } else {
        html += '<div class="insp-row"><span class="insp-label">Tier</span><span class="insp-value insp-good">Max tier reached</span></div>';
      }

      // Devolve risk: show ALL current-tier requirements that are
      // currently failing. The grace window (devolve_secs) gives the
      // player time to react — the warning surfaces during that window
      // so they see WHY before the house actually drops.
      var risks = getHousingDevolveRisks(b, tierCfg);
      if (risks.blockers.length > 0) {
        var prevTier = state.housingTierConfig[tier - 1];
        var prevTierName = (prevTier && prevTier.name) || 'lower tier';
        var graceSecs = (tierCfg && tierCfg.devolve_secs) || 60;
        var risksDesc = risks.blockers.map(describeUpgradeBlocker).join(', plus ');
        if (risks.willDevolve) {
          html += '<div class="insp-row"><span class="insp-label">Devolve risk</span><span class="insp-value insp-warn">Will drop to ' + prevTierName + ' within ~' + graceSecs + 's</span></div>';
          html += '<div class="insp-hint insp-warn">Missing: ' + risksDesc + '. Restock before the grace window expires or the house tier will drop.</div>';
        } else {
          html += '<div class="insp-row"><span class="insp-label">Devolve risk</span><span class="insp-value insp-hint-muted">Bathhouse coverage is holding the tier — for now</span></div>';
          html += '<div class="insp-hint insp-hint-muted">Conditions are slipping (missing: ' + risksDesc + '). The bathhouse blocks the actual devolve, but if its inputs run out OR it goes unstaffed, the house will drop.</div>';
        }
      }

      // Labor context
      var li = state.laborInfo;
      if (providing && li.laborShortage) {
        html += '<div class="insp-hint insp-hint-muted">Labor shortage: ' + li.workersNeeded + ' needed, ' + li.workerSupply + ' available. Build more housing.</div>';
      } else if (providing && !li.laborShortage && li.workersIdle > 0) {
        html += '<div class="insp-hint insp-hint-muted">' + li.workersIdle + ' idle worker' + (li.workersIdle > 1 ? 's' : '') + ' — build production buildings to employ them.</div>';
      }
    }

    // Pollution + desirability on the building's anchor tile.
    var btile = state.tileMap[b.x + ',' + b.y];
    if (btile && btile.pollution && btile.pollution > 0) {
      var pollLabel = btile.pollution < 30 ? 'light' : btile.pollution < 60 ? 'heavy' : 'toxic';
      var pollClass = btile.pollution < 30 ? '' : 'insp-warn';
      html += '<div class="insp-row"><span class="insp-label">Pollution</span><span class="insp-value ' + pollClass + '">' + Math.round(btile.pollution) + ' (' + pollLabel + ')</span></div>';
    }
    // Desirability for housing — the gate that decides whether the
    // house can upgrade. Show what tier the current desirability
    // qualifies for.
    if (bt.category === 'housing' && btile && btile.desirability != null) {
      var d = Math.round(btile.desirability);
      var qualTier = 0;
      var nextThreshold = null;
      if (state.housingTierConfig) {
        for (var t = 0; t <= 8; t++) {
          var cfg = state.housingTierConfig[t];
          if (!cfg || cfg.min_desirability == null) continue;
          if (d >= cfg.min_desirability) qualTier = t;
          else { nextThreshold = cfg; break; }
        }
      }
      var qualName = (state.housingTierConfig && state.housingTierConfig[qualTier])
        ? state.housingTierConfig[qualTier].name : ('Tier ' + qualTier);
      var dHint = 'qualifies for ' + qualName;
      if (nextThreshold) dHint += ' — ' + nextThreshold.name + ' needs ' + nextThreshold.min_desirability;
      var dClass = d < 30 ? 'insp-warn' : '';
      html += '<div class="insp-row"><span class="insp-label">Desirability</span><span class="insp-value ' + dClass + '">' + d + '/100</span></div>';
      html += '<div class="insp-hint insp-hint-muted">' + dHint + '</div>';
    }

    // Production I/O
    if ((bt.category === 'extractor' || bt.category === 'food_extractor') && bt.output_resource_key) {
      var resName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
      html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + resName + '/min</span></div>';
      html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
    } else if (bt.category === 'processor') {
      // Processors can have a 2nd input (cross-recipe T4 buildings:
      // cabinetmaker = furniture + lime, etc.). Display both rows.
      var procInputs = [];
      if (bt.input_resource_key && bt.input_rate > 0) procInputs.push({ key: bt.input_resource_key, rate: bt.input_rate });
      if (bt.input_resource_key_2 && bt.input_rate_2 > 0) procInputs.push({ key: bt.input_resource_key_2, rate: bt.input_rate_2 });
      procInputs.forEach(function (inp, i) {
        var nm = state.resources[inp.key] ? state.resources[inp.key].name : inp.key;
        html += '<div class="insp-row"><span class="insp-label">' + (i === 0 ? 'Input' : 'Input 2') + '</span><span class="insp-value">' + inp.rate + ' ' + nm + '/min</span></div>';
      });
      if (bt.output_resource_key) {
        var outName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
        html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + outName + '/min</span></div>';
        html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
      }
    } else if (bt.category === 'service') {
      var inputs = [];
      if (bt.input_resource_key && bt.input_rate > 0) {
        inputs.push({ key: bt.input_resource_key, rate: bt.input_rate });
      }
      if (bt.input_resource_key_2 && bt.input_rate_2 > 0) {
        inputs.push({ key: bt.input_resource_key_2, rate: bt.input_rate_2 });
      }
      inputs.forEach(function (inp, i) {
        var nm = state.resources[inp.key] ? state.resources[inp.key].name : inp.key;
        html += '<div class="insp-row"><span class="insp-label">' + (i === 0 ? 'Input' : 'Input 2') + '</span><span class="insp-value">' + inp.rate + ' ' + nm + '/min</span></div>';
      });
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

    // Priority + pause controls (skip for roads — they don't consume
    // workers and don't have meaningful priority; pausing roads is
    // possible via the schema but the UX implications haven't been
    // designed, so omit for now).
    // Every category whose worker_cost > 0 should be pause-able. The
    // server's _pp_workers_needed counts all of these toward job
    // openings, so leaving food_extractor / booster / police out of
    // the pause UI was both inconsistent (you couldn't free up workers
    // for higher priorities) and confusing (a paused-by-pretending-not-
    // to-exist garden was still consuming the labor pool).
    var consumesWorkers = bt.category === 'extractor' || bt.category === 'food_extractor'
      || bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
      || bt.category === 'booster' || bt.category === 'police';
    if (consumesWorkers || bt.category === 'housing') {
      actHtml += '<div class="insp-controls">';
      if (consumesWorkers) {
        var pri = b.staffing_priority !== undefined ? b.staffing_priority : 1;
        actHtml += '<div class="insp-priority-row">';
        actHtml += '<span class="insp-label">Priority</span>';
        actHtml += '<div class="insp-priority-pills">';
        actHtml += '<div class="insp-priority-pill low' + (pri === 0 ? ' selected' : '') + '" data-priority="0">Low</div>';
        actHtml += '<div class="insp-priority-pill normal' + (pri === 1 ? ' selected' : '') + '" data-priority="1">Normal</div>';
        actHtml += '<div class="insp-priority-pill high' + (pri === 2 ? ' selected' : '') + '" data-priority="2">High</div>';
        actHtml += '</div></div>';
      }
      var paused = b.status === 'paused';
      actHtml += '<button class="insp-pause-btn' + (paused ? ' is-paused' : '') + '" id="btn-pause">'
        + (paused ? '▶ Resume' : '⏸ Pause') + '</button>';
      actHtml += '</div>';
    }

    // Demolish info line
    actHtml += '<div class="demolish-info">';
    actHtml += '<span class="demolish-refund">Refund: $' + refund + '</span>';
    if (depCount > 0) {
      actHtml += '<span class="demolish-warning">Will disconnect ' + depCount + ' building' + (depCount > 1 ? 's' : '') + '</span>';
    }
    actHtml += '</div>';

    actHtml += '<button class="btn-demolish' + (depCount > 0 ? ' btn-demolish-caution' : '') + '" id="btn-demolish">Demolish</button>';
    actionsEl.innerHTML = actHtml;

    actionsEl.querySelectorAll('.insp-priority-pill').forEach(function (pill) {
      pill.addEventListener('click', function () {
        setBuildingPriority(b, parseInt(pill.dataset.priority, 10));
      });
    });
    var pauseBtn = document.getElementById('btn-pause');
    if (pauseBtn) {
      pauseBtn.addEventListener('click', function () {
        toggleBuildingPaused(b);
      });
    }

    document.getElementById('btn-demolish').addEventListener('click', function () {
      confirmDemolish(b);
    });
  } else {
    actionsEl.innerHTML = '';
  }
}

function setBuildingPriority(building, priority) {
  if (building.staffing_priority === priority) return;
  sb.rpc('set_building_priority', { p_building_id: building.id, p_priority: priority })
    .then(function (r) {
      if (r.error) { showToast(r.error.message, 'error'); return; }
      // Mutate in place + re-render. Realtime will refresh other clients.
      building.staffing_priority = priority;
      computeLaborAllocation();
      renderInspector();
      renderMap();
      updateWorkers();
    });
}

function toggleBuildingPaused(building) {
  var nextPaused = building.status !== 'paused';
  sb.rpc('set_building_paused', { p_building_id: building.id, p_paused: nextPaused })
    .then(function (r) {
      if (r.error) { showToast(r.error.message, 'error'); return; }
      building.status = nextPaused ? 'paused' : 'active';
      computeLaborAllocation();
      renderInspector();
      renderMap();
      refreshActiveDataPanel();
      updateWorkers();
    });
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
      refreshActiveDataPanel();
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

  var jobTitles = {
    citizen: 'Citizen',
    timber: 'Lumberjack', sawmill: 'Sawyer',
    stone: 'Stonemason', clay: 'Potter', iron: 'Ironworker',
    grain: 'Miller', orchard: 'Fruit Picker', fish: 'Fisher', garden: 'Gardener',
    tavern: 'Barkeep', bathhouse: 'Bath Attendant', school: 'Scholar', temple: 'Priest',
    civic: 'Tax Clerk'
  };
  var jobType = walkerInfo.sourceType || 'citizen';
  // Citizen walkers display their persona flavor name (Happy Couple,
  // Well-Fed Citizen, Fancy Citizen, etc.); job walkers fall back to
  // the job title.
  if (jobType === 'citizen' && walkerInfo.personaName) {
    titleEl.textContent = walkerInfo.personaName;
  } else {
    titleEl.textContent = jobTitles[jobType] || 'Citizen';
  }

  var typeLabel;
  if (jobType === 'citizen') {
    var walkerTierLabels = { 0: 'Shanty dweller', 1: 'Villager', 2: 'Cottage resident', 3: 'Townhouse resident', 4: 'Villa resident', 5: 'Manor estate resident' };
    typeLabel = walkerInfo.personaName || walkerTierLabels[walkerInfo.sourceTier] || 'Citizen';
  } else {
    typeLabel = jobTitles[jobType] || 'Worker';
  }
  var stepsLeft = walkerInfo.maxSteps - walkerInfo.steps;
  var jobActivities = {
    citizen: stepsLeft > 4 ? 'Strolling' : 'Heading home',
    timber: stepsLeft > 4 ? 'Hauling timber' : 'Returning to camp',
    sawmill: stepsLeft > 4 ? 'Carrying planks' : 'Returning to mill',
    stone: stepsLeft > 4 ? 'Hauling stone' : 'Returning to quarry',
    clay: stepsLeft > 4 ? 'Carrying pottery' : 'Returning to the works',
    iron: stepsLeft > 4 ? 'Hauling ore' : 'Returning to the mine',
    grain: stepsLeft > 4 ? 'Delivering grain' : 'Returning to farm',
    orchard: stepsLeft > 4 ? 'Picking fruit' : 'Returning with the basket',
    fish: stepsLeft > 4 ? 'Heading to the water' : 'Returning with the catch',
    garden: stepsLeft > 4 ? 'Tending the garden' : 'Returning with vegetables',
    civic: stepsLeft > 4 ? 'Doing the rounds' : 'Returning to the office'
  };
  var activity = jobActivities[jobType] || (stepsLeft > 4 ? 'Working' : 'Heading back');

  var html = '';
  html += '<div class="insp-row"><span class="insp-label">Type</span><span class="insp-value">' + typeLabel + '</span></div>';
  html += '<div class="insp-row"><span class="insp-label">Activity</span><span class="insp-value">' + activity + '</span></div>';
  var originLabel = jobType === 'citizen' ? 'Home' : 'Workplace';
  html += '<div class="insp-row"><span class="insp-label">' + originLabel + '</span><span class="insp-value">' + walkerInfo.sourceName + '</span></div>';
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
  document.getElementById('inspector-mini').addEventListener('click', function () {
    var panel = document.getElementById('inspector-panel');
    panel.classList.toggle('minimized');
    // Re-run the visibility scroll after the height transition settles, so
    // the previously-covered cells are pulled into the freshly enlarged
    // visible strip.
    if (inspectedBuilding) {
      setTimeout(function () { ensureInspectionVisible(inspectedBuilding); }, 220);
    }
  });
  // Wire up walker click -> inspector
  setWalkerClickHandler(function (walkerInfo) {
    openWalkerInspector(walkerInfo);
  });
}
