// ── Building Inspector ──
// Renders the inspector panel for buildings (own and others'). Owns the
// building-specific render path, action handlers (priority, pause,
// demolish), and the demolish flow. Reads "what's currently inspected"
// from inspector core; calls back into core's closeInspector() when an
// action that ends the inspection completes (demolish).

import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel, refreshActiveDataPanel } from './panels.js';
import { closeInspector, getInspectedBuilding } from './inspector_core.js';
import {
  buildTradeValueRow,
  countDependentBuildings,
  getHousingUpgradeBlockers,
  getHousingDevolveRisks,
  describeUpgradeBlocker,
  computeBuildingIssues
} from './inspector_helpers.js';

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
        || bt.category === 'booster') {
      if (bt.worker_cost > 0) {
        html += '<div class="insp-row"><span class="insp-label">Workers</span><span class="insp-value">' + bt.worker_cost + ' required</span></div>';
      }
    }

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
        var evolving = canUpgrade && b.evolution_eligible_at;
        if (evolving) {
          var elapsed = Math.floor((Date.now() - new Date(b.evolution_eligible_at).getTime()) / 1000);
          var needed = htierCfg ? htierCfg.upgrade_secs : 30;
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
      var orName = state.resources[bt.output_resource_key] ? state.resources[bt.output_resource_key].name : bt.output_resource_key;
      html += '<div class="insp-row"><span class="insp-label">Output</span><span class="insp-value">' + bt.output_rate + ' ' + orName + '/min</span></div>';
      html += buildTradeValueRow(bt.output_resource_key, bt.output_rate);
    } else if (bt.category === 'processor') {
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
      var sInputs = [];
      if (bt.input_resource_key && bt.input_rate > 0) {
        sInputs.push({ key: bt.input_resource_key, rate: bt.input_rate });
      }
      if (bt.input_resource_key_2 && bt.input_rate_2 > 0) {
        sInputs.push({ key: bt.input_resource_key_2, rate: bt.input_rate_2 });
      }
      sInputs.forEach(function (inp, i) {
        var nm = state.resources[inp.key] ? state.resources[inp.key].name : inp.key;
        html += '<div class="insp-row"><span class="insp-label">' + (i === 0 ? 'Input' : 'Input 2') + '</span><span class="insp-value">' + inp.rate + ' ' + nm + '/min</span></div>';
      });
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
}

function setBuildingPriority(building, priority) {
  if (building.staffing_priority === priority) return;
  sb.rpc('set_building_priority', { p_building_id: building.id, p_priority: priority })
    .then(function (r) {
      if (r.error) { showToast(r.error.message, 'error'); return; }
      building.staffing_priority = priority;
      computeLaborAllocation();
      renderBuildingInspector();
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
      renderBuildingInspector();
      renderMap();
      refreshActiveDataPanel();
      updateWorkers();
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

      var tile = state.tileMap[building.x + ',' + building.y];
      if (tile) tile.occupied_building_id = null;

      state.allBuildings = state.allBuildings.filter(function (b) {
        return b.id !== building.id;
      });

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
