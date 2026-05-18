// ── Inspector helpers shared across modes ──
// Pure helpers that don't depend on any mode state — kept out of the
// per-mode modules so each mode imports the same canonical version
// rather than duplicating lookups.

import { state } from './state.js';

export function resName(key) {
  if (state.resources && state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

// Lookups for the resource-tile inspector role rows.
export function findExtractorFor(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.category === 'extractor' && bt.output_resource_key === resourceKey) match = bt;
  });
  return match;
}

export function findBuilderRequiringTile(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.placement_resource_node_key === resourceKey) match = bt;
  });
  return match;
}

export function isTerrainResource(resourceKey) {
  return !!(state.resources && state.resources[resourceKey] && state.resources[resourceKey].kind === 'terrain');
}

export function findProcessorConsuming(resourceKey) {
  var match = null;
  Object.keys(state.buildingTypes).forEach(function (k) {
    var bt = state.buildingTypes[k];
    if (bt && bt.category === 'processor' && bt.input_resource_key === resourceKey) match = bt;
  });
  return match;
}

// Trade-value row for the building inspector — finds the best sell
// price across unlocked traders for the given output resource and
// renders an "$/min" hint row.
export function buildTradeValueRow(resourceKey, rate) {
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

// Count buildings that would lose road access if a road is demolished.
// Used by the building inspector to show a "Connects N buildings"
// warning before demolishing a road.
export function countDependentBuildings(building) {
  var bt = state.buildingTypes[building.building_type_key];
  if (!bt || bt.category !== 'road') return 0;

  var count = 0;
  state.allBuildings.forEach(function (b) {
    if (b.player_id !== state.currentUser.id) return;
    var bbt = state.buildingTypes[b.building_type_key];
    if (!bbt) return;
    if (bbt.category === 'road' || bbt.category === 'extractor') return;
    if (Math.abs(b.x - building.x) + Math.abs(b.y - building.y) === 1) {
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

// ── Housing tier-requirement gating ──
// Returns the labels of any prerequisite that's blocking the given
// tier's requirements. The same logic answers two questions depending
// on which tier config is passed:
//   - pass nextTierCfg → "what's blocking the upgrade?"
//   - pass currentTierCfg → "what's failing maintenance? (will devolve)"
//
// Server reference (process_production):
//   needs_road   → has_road_access (any road tile orthogonal, status='active')
//   needs_well   → well within Manhattan dist 4, status='active' (no staff/feed required)
//   needs_school → school within 5, in v_operating_services (staffed AND both inputs available)
//   needs_temple → temple within 6, in v_operating_services
export function getHousingUpgradeBlockers(building, tierCfg) {
  if (!tierCfg) return [];
  var blockers = [];

  if (tierCfg.needs_road && !state.roadAccessIds[building.id]) {
    blockers.push('road');
  }

  if (tierCfg.needs_food) {
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

  if (tierCfg.needs_well && !hasNearbyService('well', 4, false)) blockers.push('well');
  if (tierCfg.needs_school && !hasNearbyService('school', 5, true)) blockers.push('school');
  if (tierCfg.needs_temple && !hasNearbyService('temple', 6, true)) blockers.push('temple');

  if (tierCfg.needs_luxury_food) {
    var hasLuxFood = Object.keys(state.resources).some(function (k) {
      return state.resources[k].is_luxury_food && (state.inventory[k] || 0) > 0;
    });
    if (!hasLuxFood) blockers.push('luxury_food');
  }

  if (tierCfg.needs_industrial_luxury) {
    var hasIndLux = Object.keys(state.resources).some(function (k) {
      return state.resources[k].is_industrial_luxury && (state.inventory[k] || 0) > 0;
    });
    if (!hasIndLux) blockers.push('industrial_luxury');
  }

  if (tierCfg.needs_all_industrial_luxuries) {
    var allIndLux = Object.keys(state.resources)
      .filter(function (k) { return state.resources[k].is_industrial_luxury; })
      .every(function (k) { return (state.inventory[k] || 0) > 0; });
    if (!allIndLux) blockers.push('all_industrial_luxuries');
  }

  // Cumulative lifestyle demands: every row for this tier must have
  // its resource in stock. With the cumulative model that includes all
  // lower-tier goods (Manor needs pottery + bread + furniture +
  // statuary, etc.). One blocker entry per missing demand.
  var demands = state.housingLifestyleDemands && state.housingLifestyleDemands[tierCfg.tier];
  if (demands) {
    demands.forEach(function (d) {
      if (!_lifestyleDemandSatisfied(d.resource_key)) {
        blockers.push('lifestyle:' + d.resource_key);
      }
    });
  }

  // Desirability gate (server-side _pp_evolve_housing checks
  // v_desirability >= COALESCE(v_next_tier.min_desirability, 0)). Mirror
  // it on the client so the inspector lists it as a blocker instead of
  // silently saying "Conditions met" when the server refuses to
  // flag eligible. tile.desirability defaults to 50 when unset
  // (matches the SQL COALESCE).
  if (tierCfg.min_desirability && tierCfg.min_desirability > 0) {
    var tile = state.tileMap && state.tileMap[building.x + ',' + building.y];
    var desirability = tile && tile.desirability != null ? Number(tile.desirability) : 50;
    if (desirability < tierCfg.min_desirability) {
      blockers.push('desirability');
    }
  }

  return blockers;
}

// Devolve risk: same tier-requirement logic applied to the CURRENT
// tier, plus a bathhouse-coverage check matching the SQL devolve gate's
// safeguard (an operating bathhouse within 4 tiles suppresses devolve).
// Returns { blockers, hasBathhouseCover, willDevolve }.
//
// 2026-05-09: food + lifestyle gates now read the building's own pantry
// buffer (state.buildingBuffers), not city stock. A house with city
// stock at zero but a half-full pantry is NOT at devolve risk yet.
export function getHousingDevolveRisks(building, currentTierCfg) {
  if (!currentTierCfg) return { blockers: [], hasBathhouseCover: false, willDevolve: false };
  // Start with non-supply blockers from the standard helper (road, well,
  // services, desirability, luxury food, industrial luxury) — these are
  // unchanged. Then re-evaluate food + lifestyle against the per-house
  // pantry buffer.
  var globalBlockers = getHousingUpgradeBlockers(building, currentTierCfg);
  var buf = (state.buildingBuffers && state.buildingBuffers[building.id]) || {};
  var blockers = globalBlockers.filter(function (b) {
    if (b === 'food') {
      // Replace with per-house food buffer check.
      var foodEntry = buf['food'];
      return !foodEntry || foodEntry.quantity <= 0;
    }
    if (b.indexOf('lifestyle:') === 0) {
      var rk = b.slice('lifestyle:'.length);
      var entry = buf[rk];
      return !entry || entry.quantity <= 0;
    }
    return true;
  });
  // Also consider buffers that ARE empty even when global stock is
  // present (e.g., player offline long enough that the pantry drained
  // despite a refilled inventory). Walk demanded resources for this
  // tier and add any whose buffer is empty.
  var demands = state.housingLifestyleDemands && state.housingLifestyleDemands[currentTierCfg.tier];
  if (demands) {
    demands.forEach(function (d) {
      var entry = buf[d.resource_key];
      if ((!entry || entry.quantity <= 0) && blockers.indexOf('lifestyle:' + d.resource_key) === -1) {
        blockers.push('lifestyle:' + d.resource_key);
      }
    });
  }
  if (currentTierCfg.needs_food) {
    var foodEntry = buf['food'];
    if ((!foodEntry || foodEntry.quantity <= 0) && blockers.indexOf('food') === -1) {
      blockers.push('food');
    }
  }
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

// Past-tense reason for a house's last devolve. Same key vocabulary
// as describeUpgradeBlocker but phrased as what happened, not what's
// needed. Used by the inspector's "Last devolve" section.
export function describeDevolveReason(key) {
  if (key === 'road') return 'lost road access to the house';
  if (key === 'well') return 'lost a well within 4 tiles';
  if (key === 'food') return 'ran out of food in its pantry';
  if (key === 'school') return 'the school within 5 tiles stopped operating (unstaffed, or ran out of lumber/flour)';
  if (key === 'temple') return 'the temple within 6 tiles stopped operating (unstaffed, or ran out of inputs)';
  if (key === 'luxury_food') return 'ran out of all luxury foods (spirits, caviar, spices, ale)';
  if (key === 'industrial_luxury') return 'ran out of all industrial luxuries (cabinets, monuments, mosaics, machinery)';
  if (key === 'all_industrial_luxuries') return 'at least one of the four industrial luxuries ran out (Palace needs all of them at once)';
  if (key === 'desirability') return 'tile desirability dropped too low (more pollution/crime/tax pressure, or a service went away)';
  if (key.indexOf('lifestyle:') === 0) {
    var rk = key.slice('lifestyle:'.length);
    var name = (state.resources && state.resources[rk] && state.resources[rk].name) || rk;
    var subs = _substituteNames(rk);
    if (subs.length > 0) {
      return 'ran out of ' + name + ' and all substitutes (' + subs.join(' / ') + ') in its pantry';
    }
    return 'ran out of ' + name + ' in its pantry';
  }
  return 'an unspecified gate failed';
}

export function describeUpgradeBlocker(key) {
  if (key === 'road') return 'a road touching this house';
  if (key === 'well') return 'a well within 4 tiles';
  if (key === 'food') return 'food in stock (any food: grain, flour, bread, berries, fish, vegetables, or any luxury food)';
  if (key === 'school') return 'an operating school within 5 tiles';
  if (key === 'temple') return 'an operating temple within 6 tiles';
  if (key === 'luxury_food') return 'a luxury food in stock (spirits, caviar, spices, or ale)';
  if (key === 'industrial_luxury') return 'an industrial luxury in stock (cabinets, monuments, mosaics, or machinery)';
  if (key === 'all_industrial_luxuries') return 'ALL FOUR industrial luxuries in stock simultaneously (cabinets + monuments + mosaics + machinery)';
  if (key === 'desirability') return 'higher tile desirability (build parks/services nearby, reduce pollution + crime + tax pressure)';
  if (key.indexOf('lifestyle:') === 0) {
    var rk = key.slice('lifestyle:'.length);
    var name = (state.resources && state.resources[rk] && state.resources[rk].name) || rk;
    var subs = _substituteNames(rk);
    if (subs.length > 0) {
      return name + ' (or any of ' + subs.join(' / ') + ') in stock';
    }
    return name + ' in stock (this tier consumes it ongoingly)';
  }
  return key;
}

function _lifestyleDemandSatisfied(primary) {
  if ((state.inventory[primary] || 0) > 0) return true;
  var subs = (state.lifestyleSubstitutes && state.lifestyleSubstitutes[primary]) || [];
  for (var i = 0; i < subs.length; i++) {
    if ((state.inventory[subs[i]] || 0) > 0) return true;
  }
  return false;
}

function _substituteNames(primary) {
  var subs = (state.lifestyleSubstitutes && state.lifestyleSubstitutes[primary]) || [];
  return subs.map(function (k) {
    return (state.resources && state.resources[k] && state.resources[k].name) || k;
  });
}

// Issues: consolidated list of reasons this building isn't operational.
// Returns an array of { label, hint, severity } where severity is 'bad'
// (blocks operation entirely) or 'warn' (idle but recoverable). Empty
// array means the building is fully operational.
export function computeBuildingIssues(b, bt) {
  if (b.player_id !== state.currentUser.id) return [];
  if (bt.category === 'road') return [];
  if (b.status === 'paused') return [];
  var issues = [];

  // Road access — must match the staffing rule in computeLaborAllocation
  // (state.js): every worker-consuming production category requires a
  // road for staffing.
  var needsRoad = false;
  if (bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
      || bt.category === 'extractor' || bt.category === 'food_extractor'
      || bt.category === 'booster' || bt.category === 'police'
      || bt.category === 'transport_hub' || bt.category === 'transport_connector') {
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

  var consumesWorkers = bt.category === 'extractor' || bt.category === 'food_extractor'
    || bt.category === 'processor' || bt.category === 'service' || bt.category === 'tax'
    || bt.category === 'booster' || bt.category === 'police'
    || bt.category === 'transport_hub' || bt.category === 'transport_connector';
  if (consumesWorkers && state.laborInfo.unstaffedIds[b.id]) {
    var li = state.laborInfo;
    var hint = 'Needs ' + bt.worker_cost + ' worker' + (bt.worker_cost > 1 ? 's' : '')
      + '. Pool is ' + li.workerSupply + ', used ' + li.workersUsed + '. '
      + 'Older buildings staff first — build or upgrade housing to add capacity.';
    issues.push({ severity: 'bad', label: 'Not staffed', hint: hint });
  }

  if (bt.category === 'extractor'
      && (b.path_length === null || b.path_length === undefined)) {
    var resKey = bt.output_resource_key || 'resource';
    var rname = state.resources[resKey] ? state.resources[resKey].name.toLowerCase() : resKey;
    issues.push({
      severity: 'warn',
      label: 'No reachable resource',
      hint: 'No unclaimed ' + rname + ' tile is reachable. Clear obstructions or place roads toward one.'
    });
  }

  if (!state.laborInfo.unstaffedIds[b.id] && (bt.category === 'extractor' ? false : !needsRoad || state.roadAccessIds[b.id])) {
    var inputs = [];
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
