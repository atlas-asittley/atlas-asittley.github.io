// ── Building Inspector ──
// Renders the inspector panel for buildings (own and others'). Owns the
// building-specific render path, action handlers (priority, pause,
// demolish), and the demolish flow. Reads "what's currently inspected"
// from inspector core; calls back into core's closeInspector() when an
// action that ends the inspection completes (demolish).

import { sb } from './config.js';
import { fetchAllPaged } from './paginate.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast, updateMoney, updateWorkers, updateCityRunway } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel, refreshActiveDataPanel } from './panels.js';
import { closeInspector, getInspectedBuilding } from './inspector_core.js';
import {
  buildTradeValueRow,
  countDependentBuildings,
  getHousingUpgradeBlockers,
  getHousingDevolveRisks,
  describeUpgradeBlocker,
  describeDevolveReason,
  computeBuildingIssues
} from './inspector_helpers.js';
import { recipeOf, periodSuffix, resourceName } from './recipe_format.js';

// Re-render the building inspector against whatever building is
// currently inspected. Called after any action that mutates the
// building (priority change, pause toggle).
export function renderBuildingInspector() {
  var b = getInspectedBuilding();
  if (!b) return;

  var bt = state.buildingTypes[b.building_type_key];
  if (!bt) return;

  var mine = b.player_id === state.currentUser.id;
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');

  var name = bt.name;
  if (bt.category === 'housing') {
    var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
    var tierCfg = state.housingTierConfig[tier];
    if (tierCfg) name = tierCfg.name + ' (Tier ' + tier + ')';
  }
  titleEl.textContent = name;

  var html = '';
  var catLabel = bt.category.charAt(0).toUpperCase() + bt.category.slice(1);
  html += '<div class="insp-row"><span class="insp-label">Type</span><span class="insp-value">' + catLabel + '</span></div>';

  if (!mine && b.player_profiles) {
    html += '<div class="insp-row"><span class="insp-label">Owner</span><span class="insp-value">' + b.player_profiles.display_name + '</span></div>';
  }

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

    if (bt.category === 'extractor' || bt.category === 'food_extractor'
        || bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
        || bt.category === 'booster' || bt.category === 'police'
        || bt.category === 'transport_hub' || bt.category === 'transport_connector') {
      if (bt.worker_cost > 0) {
        html += '<div class="insp-row"><span class="insp-label">Workers</span><span class="insp-value">' + bt.worker_cost + ' required</span></div>';
      }
    }

    // Transport hubs: show expansion level + Expand button.
    if (bt.category === 'transport_hub') {
      var lvl = b.expansion_level || 0;
      var modeName = b.building_type_key === 'airport' ? 'airport'
                  : b.building_type_key === 'seaport' ? 'seaport' : 'train';
      html += '<div class="insp-row"><span class="insp-label">Role</span><span class="insp-value">'
           + bt.name + ' — spawned ' + (1 + lvl) + ' procedural ' + modeName
           + ' trade partner' + ((1 + lvl) === 1 ? '' : 's') + ' for the city.</span></div>';
      if (mine && lvl < 1) {
        var nextCost = bt.build_cost * 2 * (lvl + 1);
        var canAfford = (state.profile && state.profile.money || 0) >= nextCost;
        html += '<div class="insp-row"><span class="insp-label">Expansion</span><span class="insp-value">Level ' + lvl + ' / 1</span></div>';
        html += '<div class="insp-hint insp-hint-muted">Expanding adds another procedural ' + modeName + ' partner to the city pool. Cost $' + nextCost.toLocaleString() + '.</div>';
        html += '<button class="btn-primary" id="btn-expand-hub"' + (canAfford ? '' : ' disabled') + '>Expand — $' + nextCost.toLocaleString() + '</button>';
      } else if (lvl >= 1) {
        html += '<div class="insp-row"><span class="insp-label">Expansion</span><span class="insp-value insp-good">Maxed out</span></div>';
      }
    }
    if (bt.category === 'transport_connector') {
      html += '<div class="insp-row"><span class="insp-label">Role</span><span class="insp-value">Truck route — connects you to every road-connected hub in the city.</span></div>';
    }

    if (bt.category === 'extractor' && b.target_x !== null && b.target_x !== undefined) {
      var canonical = 4;
      var pathLen = b.path_length || 1;
      var pathFactor = Math.min(1, canonical / Math.max(pathLen, 1));
      var effectiveRate = bt.output_rate * pathFactor;
      // Integer-ratio: scale up until effective rate is whole. For
      // canonical-or-shorter paths, scale = recipeOf's base scale. For
      // longer paths (rate × 4/path_length), the path length itself
      // typically becomes the period.
      var rateScale = 1;
      for (var rk = 1; rk <= 60; rk++) {
        if (Math.abs(effectiveRate * rk - Math.round(effectiveRate * rk)) < 0.001) { rateScale = rk; break; }
      }
      var rateQty = Math.round(effectiveRate * rateScale);
      var rateSuffix = rateScale === 1 ? '/min' : ' per ' + rateScale + ' min';
      var resNameLower = ((state.resources[bt.output_resource_key] && state.resources[bt.output_resource_key].name) || bt.output_resource_key).toLowerCase();
      html += '<div class="insp-row"><span class="insp-label">Target</span><span class="insp-value">(' + b.target_x + ', ' + b.target_y + ')</span></div>';
      html += '<div class="insp-row"><span class="insp-label">Path</span><span class="insp-value">' + pathLen + ' tile' + (pathLen === 1 ? '' : 's') + '</span></div>';
      html += '<div class="insp-row"><span class="insp-label">Rate</span><span class="insp-value">' + rateQty + ' ' + resNameLower + rateSuffix + '</span></div>';
      if (pathLen > canonical) {
        html += '<div class="insp-hint insp-hint-muted">Shorter paths produce faster. ' + canonical + '-tile path = full rate.</div>';
      }
    }

    if (bt.category === 'housing') {
      var htier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var htierCfg = state.housingTierConfig[htier];
      var workers = htierCfg ? htierCfg.workers : (bt.workers_provided || 0);
      var providing = !(htierCfg && htierCfg.needs_road && !state.roadAccessIds[b.id]);
      var capacityLabel = providing
        ? 'Houses up to ' + workers + ' people'
        : 'Houses up to ' + workers + ' people (none yet — needs road access)';
      html += '<div class="insp-row"><span class="insp-label">Capacity</span><span class="insp-value">' + capacityLabel + '</span></div>';

      var nextTierCfg = state.housingTierConfig[htier + 1];
      if (nextTierCfg) {
        var blockers = getHousingUpgradeBlockers(b, nextTierCfg);
        var canUpgrade = blockers.length === 0;
        // evolution_eligible_at is server-confirmed: set on the tick
        // that all next-tier conditions check out, cleared on a tick
        // that finds them slipped. Acts as the gate for the manual
        // Upgrade button — if the server says you're eligible, the
        // button is live; otherwise we show why.
        var serverEligible = !!b.evolution_eligible_at;
        if (canUpgrade && serverEligible) {
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value insp-good">' + nextTierCfg.name + ' (+' + nextTierCfg.workers + ' wkrs)</span></div>';
          html += '<div class="insp-hint insp-hint-muted">Ready to upgrade. Tap below to step this house up to ' + nextTierCfg.name + '.</div>';
          html += '<button class="btn-upgrade-house" data-bldg="' + b.id + '">Upgrade to ' + nextTierCfg.name + '</button>';
        } else if (canUpgrade) {
          html += '<div class="insp-row"><span class="insp-label">Next</span><span class="insp-value">' + nextTierCfg.name + ' (+' + nextTierCfg.workers + ' wkrs)</span></div>';
          html += '<div class="insp-hint insp-hint-muted">Conditions met — eligibility will be confirmed on the next production tick (~30s), then the Upgrade button appears here.</div>';
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

      // Pantry section (per-house buffers, 2026-05-09). Show fill ratio
      // for each gated resource on this tier so the player can see at a
      // glance how much buffer they have before any actual devolve risk.
      var pantry = (state.buildingBuffers && state.buildingBuffers[b.id]) || {};
      var pantryKeys = Object.keys(pantry);
      if (pantryKeys.length > 0) {
        html += '<div class="insp-row"><span class="insp-label">Pantry</span><span class="insp-value insp-hint-muted">per-house supply buffer</span></div>';
        pantryKeys.sort().forEach(function (rk) {
          var entry = pantry[rk];
          if (!entry || !entry.capacity) return;
          var pct = Math.max(0, Math.min(100, Math.round(entry.quantity / entry.capacity * 100)));
          var label = rk === 'food' ? 'food' : (state.resources[rk] && state.resources[rk].name) || rk;
          var pctClass = pct === 0 ? 'insp-warn' : pct < 25 ? 'insp-warn' : '';
          html += '<div class="insp-hint insp-hint-muted">'
               +    '<span class="' + pctClass + '">' + label + ': ' + entry.quantity.toFixed(2) + ' / ' + entry.capacity.toFixed(2) + ' (' + pct + '%)</span>'
               +  '</div>';
        });
      }

      // Last-devolve history. Server stamps b.last_devolve_reason +
      // b.last_devolve_from_tier when _pp_evolve_housing devolves a
      // house. NULL on a house that's never devolved → section
      // hidden. Once stamped, stays visible until the next devolve
      // overwrites it.
      if (b.last_devolve_reason && b.last_devolve_from_tier != null) {
        var fromCfg = state.housingTierConfig[b.last_devolve_from_tier];
        var toCfg = state.housingTierConfig[b.last_devolve_from_tier - 1];
        var fromName = (fromCfg && fromCfg.name) || ('Tier ' + b.last_devolve_from_tier);
        var toName = (toCfg && toCfg.name) || ('Tier ' + (b.last_devolve_from_tier - 1));
        html += '<div class="insp-row"><span class="insp-label">Last devolve</span>'
             +    '<span class="insp-value insp-hint-muted">' + fromName + ' → ' + toName + '</span>'
             +  '</div>';
        html += '<div class="insp-hint insp-hint-muted">Reason: ' + describeDevolveReason(b.last_devolve_reason) + '.</div>';
      }

      var risks = getHousingDevolveRisks(b, htierCfg);
      if (risks.blockers.length > 0) {
        var prevTier = state.housingTierConfig[htier - 1];
        var prevTierName = (prevTier && prevTier.name) || 'lower tier';
        var graceSecs = (htierCfg && htierCfg.devolve_secs) || 60;
        var risksDesc = risks.blockers.map(describeUpgradeBlocker).join(', plus ');
        if (risks.willDevolve) {
          html += '<div class="insp-row"><span class="insp-label">Devolve risk</span><span class="insp-value insp-warn">Will drop to ' + prevTierName + ' within ~' + graceSecs + 's</span></div>';
          html += '<div class="insp-hint insp-warn">Missing: ' + risksDesc + '. Restock before the grace window expires or the house tier will drop.</div>';
        } else {
          html += '<div class="insp-row"><span class="insp-label">Devolve risk</span><span class="insp-value insp-hint-muted">Bathhouse coverage is holding the tier — for now</span></div>';
          html += '<div class="insp-hint insp-hint-muted">Conditions are slipping (missing: ' + risksDesc + '). The bathhouse blocks the actual devolve, but if its inputs run out OR it goes unstaffed, the house will drop.</div>';
        }
      }

      var li = state.laborInfo;
      if (providing && li.laborShortage) {
        html += '<div class="insp-hint insp-hint-muted">Labor shortage: ' + li.workersNeeded + ' needed, ' + li.workerSupply + ' available. Build more housing.</div>';
      } else if (providing && !li.laborShortage && li.workersIdle > 0) {
        html += '<div class="insp-hint insp-hint-muted">' + li.workersIdle + ' idle worker' + (li.workersIdle > 1 ? 's' : '') + ' — build production buildings to employ them.</div>';
      }
    }

    var btile = state.tileMap[b.x + ',' + b.y];
    if (btile && btile.pollution && btile.pollution > 0) {
      var pollLabel = btile.pollution < 30 ? 'light' : btile.pollution < 60 ? 'heavy' : 'toxic';
      var pollClass = btile.pollution < 30 ? '' : 'insp-warn';
      html += '<div class="insp-row"><span class="insp-label">Pollution</span><span class="insp-value ' + pollClass + '">' + Math.round(btile.pollution) + ' (' + pollLabel + ')</span></div>';
    }
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

    if ((bt.category === 'extractor' || bt.category === 'food_extractor') && bt.output_resource_key) {
      // Integer-ratio display: "2 lumber per 2 min" instead of "0.5 lumber/min".
      var er = recipeOf(bt);
      var suffix = periodSuffix(er.period_min);
      html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + er.output_q + ' ' + resourceName(bt.output_resource_key).toLowerCase() + suffix + '</span></div>';
      html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
    } else if (bt.category === 'processor') {
      var pr = recipeOf(bt);
      var psuffix = periodSuffix(pr.period_min);
      if (pr.input_q > 0 && bt.input_resource_key) {
        html += '<div class="insp-row"><span class="insp-label">Input</span><span class="insp-value">' + pr.input_q + ' ' + resourceName(bt.input_resource_key).toLowerCase() + psuffix + '</span></div>';
      }
      if (pr.input_q_2 > 0 && bt.input_resource_key_2) {
        html += '<div class="insp-row"><span class="insp-label">Input 2</span><span class="insp-value">' + pr.input_q_2 + ' ' + resourceName(bt.input_resource_key_2).toLowerCase() + psuffix + '</span></div>';
      }
      if (pr.output_q > 0 && bt.output_resource_key) {
        html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + pr.output_q + ' ' + resourceName(bt.output_resource_key).toLowerCase() + psuffix + '</span></div>';
        html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
      }
    } else if (bt.category === 'service') {
      var sr = recipeOf(bt);
      var ssuffix = periodSuffix(sr.period_min);
      if (sr.input_q > 0 && bt.input_resource_key) {
        html += '<div class="insp-row"><span class="insp-label">Input</span><span class="insp-value">' + sr.input_q + ' ' + resourceName(bt.input_resource_key).toLowerCase() + ssuffix + '</span></div>';
      }
      if (sr.input_q_2 > 0 && bt.input_resource_key_2) {
        html += '<div class="insp-row"><span class="insp-label">Input 2</span><span class="insp-value">' + sr.input_q_2 + ' ' + resourceName(bt.input_resource_key_2).toLowerCase() + ssuffix + '</span></div>';
      }
    }
  }

  if (mine && bt.category === 'road') {
    var depCount = countDependentBuildings(b);
    if (depCount > 0) {
      html += '<div class="insp-row"><span class="insp-label">Connects</span><span class="insp-value">' + depCount + ' building' + (depCount > 1 ? 's' : '') + '</span></div>';
      html += '<div class="insp-hint">Removing this road will disconnect ' + depCount + ' building' + (depCount > 1 ? 's' : '') + '.</div>';
    }
  }

  bodyEl.innerHTML = html;

  if (mine) {
    var refund = bt ? Math.floor(bt.build_cost * 0.5) : 0;
    var depCount2 = bt.category === 'road' ? countDependentBuildings(b) : 0;
    var actHtml = '';

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

    actHtml += '<div class="demolish-info">';
    actHtml += '<span class="demolish-refund">Refund: $' + refund + '</span>';
    if (depCount2 > 0) {
      actHtml += '<span class="demolish-warning">Will disconnect ' + depCount2 + ' building' + (depCount2 > 1 ? 's' : '') + '</span>';
    }
    actHtml += '</div>';

    actHtml += '<button class="btn-demolish' + (depCount2 > 0 ? ' btn-demolish-caution' : '') + '" id="btn-demolish">Demolish</button>';
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

  // Wire housing Upgrade button (manual upgrades — the player chooses
  // when to step a house up; the server has already validated
  // eligibility via evolution_eligible_at).
  var upgradeBtn = document.querySelector('.btn-upgrade-house');
  if (upgradeBtn) {
    upgradeBtn.addEventListener('click', function () {
      upgradeBtn.disabled = true; upgradeBtn.textContent = 'Upgrading…';
      sb.rpc('upgrade_house', { p_building_id: b.id }).then(function (r) {
        if (r.error) {
          alert('Upgrade failed: ' + r.error.message);
          upgradeBtn.disabled = false; upgradeBtn.textContent = 'Upgrade';
          return;
        }
        var data = r.data || {};
        b.housing_tier = data.to_tier;
        b.evolution_eligible_at = null;
        showToast('Upgraded to ' + (data.tier_name || ('tier ' + data.to_tier)), 'success');
        // Reload buildings so the labor model + map sprite see the new tier.
        // Paginated to survive the 1000-row server cap.
        fetchAllPaged(function () {
          return sb.from('buildings').select('*, player_profiles(display_name, color_hex)').order('id');
        }).then(function (rr) {
          if (rr.data) {
            state.allBuildings = rr.data;
            // Re-render map and inspector.
            renderBuildingInspector();
            renderMap();
            updateWorkers();
          }
        });
      });
    });
  }

  // Wire transport-hub Expand button (lives in the body, not actions).
  var expandBtn = document.getElementById('btn-expand-hub');
  if (expandBtn) {
    expandBtn.addEventListener('click', function () {
      expandBtn.disabled = true; expandBtn.textContent = 'Expanding…';
      sb.rpc('expand_transport_hub', { p_building_id: b.id }).then(function (r) {
        if (r.error) { alert('Expand failed: ' + r.error.message); expandBtn.disabled = false; return; }
        var data = r.data;
        b.expansion_level = data.new_level;
        state.profile.money = data.money;
        showToast(bt.name + ' expanded! New trader unlocked.', 'success');
        updateMoney();
        renderBuildingInspector();
        renderMap();
      });
    });
  }
}

function setBuildingPriority(building, priority) {
  if (building.staffing_priority === priority) return;
  sb.rpc('set_building_priority', { p_building_id: building.id, p_priority: priority })
    .then(function (r) {
      if (r.error) { alert(r.error.message); return; }
      building.staffing_priority = priority;
      computeLaborAllocation();
      renderBuildingInspector();
      renderMap();
      updateWorkers();
      updateCityRunway();
    });
}

function toggleBuildingPaused(building) {
  var nextPaused = building.status !== 'paused';
  sb.rpc('set_building_paused', { p_building_id: building.id, p_paused: nextPaused })
    .then(function (r) {
      if (r.error) { alert(r.error.message); return; }
      building.status = nextPaused ? 'paused' : 'active';
      computeLaborAllocation();
      renderBuildingInspector();
      renderMap();
      refreshActiveDataPanel();
      updateWorkers();
      updateCityRunway();
    });
}

function confirmDemolish(building) {
  var bt = state.buildingTypes[building.building_type_key];
  var btn = document.getElementById('btn-demolish');

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

  sb.rpc('demolish_building', { p_building_id: building.id })
    .then(function (r) {
      if (r.error) {
        alert('Demolish failed: ' + r.error.message);
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Demolish';
          btn.dataset.confirmed = '0';
          btn.classList.remove('confirm');
        }
        return;
      }

      var data = r.data || {};
      var refund = data.refund || 0;
      var newMoney = data.money !== undefined ? data.money : state.profile.money;

      var tile = state.tileMap[building.x + ',' + building.y];
      if (tile) tile.occupied_building_id = null;

      state.allBuildings = state.allBuildings.filter(function (b) {
        return b.id !== building.id;
      });

      state.profile.money = newMoney;

      var bt = state.buildingTypes[building.building_type_key];

      computeLaborAllocation();
      updateMoney();
      updateWorkers();
      updateCityRunway();

      renderMap();
      renderBuildPanel();
      refreshActiveDataPanel();
      closeInspector();

      var name = bt ? bt.name : 'Building';
      var msg = name + ' demolished';
      if (refund > 0) msg += ' (+$' + refund + ' refund)';
      showToast(msg, 'success');

      // (No client-side player_profiles UPDATE — the RPC's already
      // wired the money change + cash_transactions ledger row.)
    })
    .catch(function (err) {
      alert(err.message || 'Demolish failed');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Demolish';
        btn.dataset.confirmed = '0';
        btn.classList.remove('confirm');
      }
    });
}
