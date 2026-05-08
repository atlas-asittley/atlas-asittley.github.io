// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state, computeTraderUnlocks } from './state.js';
import { showToast, updateMoney, tutorialAllowsBuilding } from './ui.js';
import { BLDG_LABELS, renderMap, cancelPlacement } from './map.js';
import { renderPlayersPanel, openTradeDialog } from './players.js';
import { renderResourcesPanel, renderTreasuryPanel } from './reports.js';
import { renderWalkers } from './walkers.js';
import { recipeOf, periodSuffix } from './recipe_format.js';

export function resourceName(key) {
  if (state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

// ── Build panel ──

// ── Build-panel sprite + accent-color maps (module-scope so they're not
//    rebuilt for every row of every render — ~150KB of SVG data URLs each). ──
import { colors, spriteIcons } from './sprites.js';

// Per-resource debounce timer for the trade-policy reserve inputs.
// Module-scope so panel re-renders don't fragment the debounce — a
// re-render could otherwise leave an old timer hanging that the new
// render's input handler can't clear. Keyed by resource_key.
var policyDebounceTimers = {};

export function renderBuildPanel() {
  var panel = document.getElementById('panel-build');
  var html = '';

  // Group buildings into 4 sections so the panel doesn't dump 15+
  // items in a flat list:
  //   infra    — road + housing (always available, structural)
  //   industry — resource chain locked to the player's industry
  //              (extractor + non-food processors + cross-converters +
  //               cross-recipe T4 + resource boosters)
  //   farming  — food chain (food_extractor + food-output processors +
  //              luxury food T3 + food boosters)
  //   civic    — services + tax (common to everyone)
  // Each section collapses independently; state persists in localStorage.
  var CATEGORY_ORDER = { road: 0, housing: 1, extractor: 2, food_extractor: 3, processor: 4, booster: 5, service: 6, tax: 7, police: 8, park: 9 };
  var SECTION_RANK = { infra: 0, industry: 1, farming: 2, civic: 3 };
  function isFoodOutput(bt) {
    if (!bt.output_resource_key || !state.resources) return false;
    var r = state.resources[bt.output_resource_key];
    return !!(r && r.is_food);
  }
  function sectionFor(bt) {
    if (bt.category === 'road' || bt.category === 'housing') return 'infra';
    if (bt.industry_key === 'common') return 'civic';
    // Industry-locked: split resource chain (industry) from food chain (farming).
    if (bt.category === 'food_extractor') return 'farming';
    if (bt.category === 'extractor') return 'industry';
    if (bt.category === 'booster') {
      return bt.boost_target === 'food_extractor' ? 'farming' : 'industry';
    }
    if (bt.category === 'processor') {
      return isFoodOutput(bt) ? 'farming' : 'industry';
    }
    return 'industry';
  }
  var available = Object.keys(state.buildingTypes).filter(function (k) {
    var bt = state.buildingTypes[k];
    if (bt.industry_key !== state.profile.industry_key && bt.industry_key !== 'common') return false;
    // Tutorial gate: until step 3, hide everything that isn't part of
    // the current step's allowed set (road / housing / well / food).
    return tutorialAllowsBuilding(bt);
  }).sort(function (a, b) {
    var btA = state.buildingTypes[a];
    var btB = state.buildingTypes[b];
    var sa = SECTION_RANK[sectionFor(btA)];
    var sb = SECTION_RANK[sectionFor(btB)];
    if (sa !== sb) return sa - sb;
    var oa = CATEGORY_ORDER[btA.category] !== undefined ? CATEGORY_ORDER[btA.category] : 9;
    var ob = CATEGORY_ORDER[btB.category] !== undefined ? CATEGORY_ORDER[btB.category] : 9;
    if (oa !== ob) return oa - ob;
    return (btA.tier || 0) - (btB.tier || 0);
  });

  if (available.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:20px;">No buildings available for your industry.</div>';
    panel.innerHTML = html;
    return;
  }

  var li = state.laborInfo;
  var industryName = state.profile.industry_key
    ? state.profile.industry_key.charAt(0).toUpperCase() + state.profile.industry_key.slice(1)
    : 'Industry';
  var SECTION_TITLES = {
    infra: 'Infrastructure',
    industry: industryName + ' Industry',
    farming: 'Farming',
    civic: 'Civic & Services'
  };
  // Accordion behavior: at most one section is open at a time. Stored
  // as a single string — section name when one is open, empty string
  // when the user has explicitly closed all of them. Null on first
  // load defaults to Infrastructure.
  var BUILD_OPEN_KEY = 'city_build_section_open';
  var openSection;
  try { openSection = localStorage.getItem(BUILD_OPEN_KEY); } catch (e) { openSection = null; }
  if (openSection === null) openSection = 'infra';
  var lastSection = null;

  available.forEach(function (key) {
    var bt = state.buildingTypes[key];
    // Emit a collapsible section header when we cross from one section
    // (infra / industry / farming / civic) to the next.
    var thisSection = sectionFor(bt);
    if (thisSection !== lastSection) {
      if (lastSection !== null) html += '</div></div>';
      var isCollapsed = thisSection !== openSection;
      html += '<div class="build-section' + (isCollapsed ? ' collapsed' : '') + '" data-section="' + thisSection + '">';
      html += '<div class="build-section-header">';
      html += '<span class="build-section-title">' + SECTION_TITLES[thisSection] + '</span>';
      html += '<span class="build-section-chevron">▾</span>';
      html += '</div>';
      html += '<div class="build-section-body">';
      lastSection = thisSection;
    }
    var canAfford = state.profile.money >= bt.build_cost;
    // Progressive unlock: gate buildings hide / lock until the player
    // has reached the required housing tier at least once (sticky).
    var unlockTier = bt.unlocks_at_housing_tier;
    var maxTierEver = (state.profile && state.profile.highest_housing_tier_ever) || 0;
    var unlocked = unlockTier == null || maxTierEver >= unlockTier;
    var disabled = !canAfford || !unlocked;
    var selected = state.selectedBuildType === key;

    var bgColor = colors[key] || '#4a4a6a';
    var spriteUrl = spriteIcons[key] || null;
    var label = BLDG_LABELS[key] || '?';

    var desc;
    if (bt.category === 'road') {
      desc = 'Connects buildings to the city. Housing and processors need road access.';
    } else if (bt.category === 'housing') {
      desc = 'Shanty \u2192 Hut \u2192 Cottage \u2192 Townhouse \u2192 Villa \u2192 Manor \u2192 Mansion \u2192 Estate \u2192 Palace. Workers: 2\u2013100 as conditions improve. Each tier adds one prereq: T1 well, T2 food, T3 road, T4 school, T5 temple. T6+ adds a luxury food (spirits/caviar/spices/ale), T7+ any industrial luxury, T8 ALL FOUR (cabinets, monuments, mosaics, machinery) \u2014 full trade network required.';
    } else if (bt.category === 'extractor') {
      var er = recipeOf(bt);
      desc = 'Produces ' + er.output_q + ' ' + resourceName(bt.output_resource_key).toLowerCase() + periodSuffix(er.period_min) + '. Needs road access.';
    } else if (bt.category === 'food_extractor') {
      var tileLabel = bt.placement_resource_node_key
        ? resourceName(bt.placement_resource_node_key).toLowerCase() + ' tile'
        : 'any open tile';
      var fer = recipeOf(bt);
      desc = 'Produces ' + fer.output_q + ' ' + resourceName(bt.output_resource_key).toLowerCase() + periodSuffix(fer.period_min) + ' (a food). Place on a ' + tileLabel + '. Needs road access.';
    } else if (bt.category === 'booster') {
      var pct = Math.round(((bt.boost_multiplier || 1) - 1) * 100);
      var targetText = bt.boost_target === 'food_extractor' ? 'food extractors' : 'extractors';
      desc = '+' + pct + '% output to your ' + targetText + ' within ' + (bt.boost_range || 2) + ' tiles. Must be staffed. Needs road access.';
    } else if (bt.category === 'service') {
      if (key === 'well') {
        desc = 'Lets housing within 4 tiles upgrade past tier 0. Needs road + 3 workers.';
      } else if (key === 'tavern') {
        desc = 'Consumes bread + pottery while staffed; +5% productivity (and a small crime hit). Needs road.';
      } else if (key === 'bathhouse') {
        desc = 'Consumes brick + clay while staffed; nearby housing won’t devolve. Needs road.';
      } else if (key === 'school') {
        desc = 'Consumes lumber + flour while staffed; gates Townhouse (tier 3) within 5 tiles. Needs road.';
      } else if (key === 'temple') {
        desc = 'Consumes statuary + brick while staffed; gates Villa (tier 4) within 6 tiles. Needs road.';
      } else {
        desc = 'Service building. Needs road access.';
      }
    } else if (bt.category === 'tax') {
      desc = 'Generates $' + bt.output_rate + '/min when staffed. Needs road access.';
    } else if (bt.category === 'police') {
      desc = 'Covers nearby housing within ' + (bt.coverage_radius || 0) + ' tiles to reduce crime. Costs $'
           + (bt.upkeep_per_minute || 0) + '/min in upkeep while active. Needs road access.';
    } else if (bt.category === 'park') {
      var dampen = Math.abs(bt.pollution_emit || 0);
      desc = 'Reduces pollution by ' + dampen + ' within ' + (bt.pollution_radius || 0) + ' tiles. Costs $'
           + (bt.upkeep_per_minute || 0) + '/min upkeep. No workers needed.';
    } else {
      // Processor (catchall): list every required input including the
      // optional second input. Without this, dual-input processors like
      // cabinetmaker (furniture + lime) and architect (statuary + glass)
      // hide the second prereq from the player. Use integer-ratio
      // formatting (Atlas rule 2026-05-08): "2 timber + 1 statuary \u2192
      // 1 lumber per 2 min", not "1 timber + 0.5 statuary \u2192 0.5 lumber/min".
      var pr = recipeOf(bt);
      var psuf = periodSuffix(pr.period_min);
      var inParts2 = [];
      if (pr.input_q > 0 && bt.input_resource_key) {
        inParts2.push(pr.input_q + ' ' + resourceName(bt.input_resource_key).toLowerCase());
      }
      if (pr.input_q_2 > 0 && bt.input_resource_key_2) {
        inParts2.push(pr.input_q_2 + ' ' + resourceName(bt.input_resource_key_2).toLowerCase());
      }
      desc = inParts2.join(' + ') + ' \u2192 ' + pr.output_q + ' ' + resourceName(bt.output_resource_key).toLowerCase() + psuf + '. Needs road access.';
    }

    var costStr;
    var costClass = 'build-cost';
    if (bt.category === 'road') {
      costStr = '$' + bt.build_cost + ' | no workers';
    } else if (bt.category === 'housing') {
      costStr = '$' + bt.build_cost + ' | +2\u201334 workers (evolves with conditions)';
    } else {
      costStr = '$' + bt.build_cost + ' | ' + bt.worker_cost + ' worker';
    }
    // Surface ongoing upkeep (police, future buildings) so the player
    // sees the running cost before they place. Otherwise it's an
    // invisible drain \u2014 the police-upkeep trap that bankrupted Jill.
    if (bt.upkeep_per_minute && bt.upkeep_per_minute > 0) {
      costStr += ' | $' + bt.upkeep_per_minute + '/min upkeep';
    }

    if (!unlocked) {
      var tierName = (state.housingTierConfig && state.housingTierConfig[unlockTier] && state.housingTierConfig[unlockTier].name) || ('Tier ' + unlockTier);
      costStr = 'Locked — reach ' + tierName + ' housing first';
      costClass += ' warn';
    } else if (!canAfford) {
      costStr = '$' + bt.build_cost + ' (need $' + (bt.build_cost - state.profile.money) + ' more)';
      costClass += ' warn';
    } else if (bt.category !== 'housing' && bt.category !== 'road' && li.workerSupply - li.workersNeeded < bt.worker_cost) {
      costStr += ' (no workers — will be inactive)';
      costClass += ' warn';
    }

    var showTier = bt.category !== 'housing' && bt.category !== 'road';
    html += '<div class="build-item' + (disabled ? ' disabled' : '') + (selected ? ' selected' : '') + '" data-bt="' + key + '">';
    if (spriteUrl) {
      // Wrap url() value in &quot; — the inline-SVG data URLs contain
      // unencoded ')' (e.g. fill='url(%23gradId)') that would otherwise
      // close the outer CSS url() prematurely. The on-map .bldg.* CSS
      // rules already wrap in "...", which is why on-map sprites work
      // even when the build-panel sidebar icons disappear.
      html += '<div class="build-icon" data-sprite="1" style="background-image:url(&quot;' + spriteUrl + '&quot;);background-color:' + bgColor + '"></div>';
    } else {
      html += '<div class="build-icon" style="background:' + bgColor + '">' + label + '</div>';
    }
    html += '<div class="build-info">';
    html += '<div class="build-name">' + bt.name + (showTier ? ' <small>Tier ' + bt.tier + '</small>' : '') + '</div>';
    html += '<div class="' + costClass + '">' + costStr + '</div>';
    html += '<div class="build-desc">' + desc + '</div>';
    html += '</div></div>';
  });
  // Close whichever section we ended in.
  if (lastSection !== null) html += '</div></div>';

  // Hint about inspection/demolition
  html += '<div class="build-hint">Tap any building or citizen on the map to inspect it. Demolish from the inspector.</div>';

  panel.innerHTML = html;

  panel.querySelectorAll('.build-section-header').forEach(function (h) {
    h.addEventListener('click', function () {
      var sec = h.parentElement;
      var section = sec.dataset.section;
      var allSections = panel.querySelectorAll('.build-section');
      var nextOpen;
      if (sec.classList.contains('collapsed')) {
        // Open this section, collapse every other one.
        allSections.forEach(function (s) { s.classList.add('collapsed'); });
        sec.classList.remove('collapsed');
        nextOpen = section;
      } else {
        // Clicked the open section — close it, leaves nothing open.
        sec.classList.add('collapsed');
        nextOpen = '';
      }
      try { localStorage.setItem(BUILD_OPEN_KEY, nextOpen); } catch (e) {}
    });
  });

  panel.querySelectorAll('.build-item:not(.disabled)').forEach(function (item) {
    item.addEventListener('click', function () {
      // Toggle: clicking the already-selected build type deselects it
      if (state.selectedBuildType === item.dataset.bt) {
        cancelPlacement();
      } else {
        selectBuildingType(item.dataset.bt);
      }
    });
  });
}

function selectBuildingType(key) {
  state.selectedBuildType = key;
  var bt = state.buildingTypes[key];
  var text;
  if (bt.category === 'road') {
    text = 'Drag to paint roads, or tap to place one';
  } else if (bt.category === 'extractor') {
    text = 'Tap any tile to place ' + bt.name + '. Highlighted resource tiles are potential targets.';
  } else if (bt.category === 'food_extractor') {
    text = 'Tap any tile to place ' + bt.name + '. Produces food at a flat rate — no resource tile needed.';
  } else {
    text = 'Tap a tile to place ' + bt.name;
  }
  document.getElementById('placement-text').textContent = text;
  document.getElementById('placement-bar').classList.add('active');
  renderMap();
  renderBuildPanel();
}

// ── Inventory panel ──
export function computeNetRates() {
  var rates = {};
  if (!state.currentUser) return rates;
  var myBuildings = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id;
  });
  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category === 'road' || bt.category === 'housing') return;
    // Only staffed buildings produce
    if (state.laborInfo.unstaffedIds[b.id]) return;
    // Processors need road access
    if (bt.category === 'processor' && state.noRoadAccessIds[b.id]) return;
    if (bt.output_resource_key && bt.output_rate) {
      rates[bt.output_resource_key] = (rates[bt.output_resource_key] || 0) + bt.output_rate;
    }
    if (bt.input_resource_key && bt.input_rate) {
      rates[bt.input_resource_key] = (rates[bt.input_resource_key] || 0) - bt.input_rate;
    }
    if (bt.input_resource_key_2 && bt.input_rate_2) {
      rates[bt.input_resource_key_2] = (rates[bt.input_resource_key_2] || 0) - bt.input_rate_2;
    }
  });

  // Housing food consumption: aggregate food drain across active tier-1+
  // houses, then split it proportionally across whatever foods the player
  // currently has in stock — that's how the server distributes the drain.
  var totalFoodPerMin = 0;
  myBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category !== 'housing' || b.status !== 'active') return;
    var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
    var cfg = state.housingTierConfig[tier];
    if (cfg && cfg.food_per_minute) {
      totalFoodPerMin += Number(cfg.food_per_minute);
    }
  });
  if (totalFoodPerMin > 0) {
    var foodKeys = Object.keys(state.resources).filter(function (k) {
      return state.resources[k].is_food;
    });
    var totalFoodAvail = foodKeys.reduce(function (sum, k) {
      return sum + (state.inventory[k] || 0);
    }, 0);
    if (totalFoodAvail > 0) {
      foodKeys.forEach(function (k) {
        var qty = state.inventory[k] || 0;
        if (qty <= 0) return;
        var share = qty / totalFoodAvail;
        rates[k] = (rates[k] || 0) - totalFoodPerMin * share;
      });
    } else {
      // No food in stock — show the full demand against the cheapest food
      // (grain) so the player at least sees a -rate signal in the panel.
      if (foodKeys.indexOf('grain') >= 0) {
        rates['grain'] = (rates['grain'] || 0) - totalFoodPerMin;
      }
    }
  }

  // Cumulative lifestyle goods drain — pottery / bread / furniture /
  // statuary at every tier-or-above house. The drain is a flat
  // per-resource subtraction (not pro-rata like food) since each
  // demand row specifies a single resource.
  if (state.housingLifestyleDemands) {
    Object.keys(state.housingLifestyleDemands).forEach(function (tier) {
      var demands = state.housingLifestyleDemands[tier];
      var houseCount = myBuildings.filter(function (b) {
        var bt = state.buildingTypes[b.building_type_key];
        return bt && bt.category === 'housing'
          && b.status === 'active'
          && b.housing_tier === Number(tier);
      }).length;
      if (houseCount === 0) return;
      demands.forEach(function (d) {
        rates[d.resource_key] = (rates[d.resource_key] || 0) - houseCount * Number(d.qty_per_minute);
      });
    });
  }

  // NPC trade flow — buy_to_reserve adds to inventory, sell_surplus
  // drains it. Rate uses projected max (visit_capacity / interval),
  // matching the "+X/min max" displayed in the resource drilldown.
  // Without this the Rate column under-reported by the trade-flow
  // amount; Jill's pottery showed −1.8/min in the listing while the
  // drilldown's Net was +2.7/min from her three import policies.
  if (state.profile && state.profile.trade_unlocked && state.tradePolicies) {
    Object.keys(state.tradePolicies).forEach(function (rk) {
      var policy = state.tradePolicies[rk];
      if (!policy || policy.mode === 'keep') return;
      Object.keys(state.traders || {}).forEach(function (tk) {
        var t = state.traders[tk];
        if (!t) return;
        var prices = (state.allTraderPrices && state.allTraderPrices[tk]
                      && state.allTraderPrices[tk][rk]) || null;
        if (!prices) return;
        var unlock = state.unlockedTraders && state.unlockedTraders[tk];
        if (unlock && !unlock.unlocked) return;
        var rate = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
        if (policy.mode === 'sell_surplus' && prices.buy_price) {
          rates[rk] = (rates[rk] || 0) - rate;
        } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
          rates[rk] = (rates[rk] || 0) + rate;
        }
      });
    });
  }

  return rates;
}

// Per-resource flow breakdown — used by the City → Resources drilldown.
// Returns where this resource is being produced and consumed at the
// current tick. Buildings are grouped by type (so "3× Mason Workshop"
// instead of three separate rows).
//
// Shape:
//   {
//     production: [{name, count, rate}],          // staffed extractors/processors that produce this
//     processing: [{name, count, rate, output}],  // processors consuming this -> output
//     services:   [{name, count, rate}],          // services consuming this as fuel
//     citizens:   number (food only — pro-rata share of housing food drain),
//     exports:    [{trader, rate, price}],        // sell_surplus to traders that buy this
//     imports:    [{trader, rate, price}],        // buy_to_reserve from traders that sell this
//   }
//
// Trader rates are PROJECTED MAX = capacity / visit_interval (e.g.
// river_traders 20 cap / 10 min = 2.0/min). Actual rate may be lower
// if stock or money runs out.
export function computeResourceFlow(resourceKey) {
  var flow = { production: [], processing: [], services: [],
               citizens: 0, exports: [], imports: [] };
  if (!state.currentUser) return flow;

  var myActive = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id && b.status === 'active';
  });

  // Group worker-consuming buildings by type, only counting those
  // currently staffed (anything else doesn't actually move the
  // resource needle). Housing not relevant here — it's handled by
  // the citizens branch below.
  var byType = {};
  myActive.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt) return;
    if (bt.category === 'road' || bt.category === 'housing') return;
    if (state.laborInfo.unstaffedIds && state.laborInfo.unstaffedIds[b.id]) return;
    if (!byType[bt.key]) byType[bt.key] = { bt: bt, count: 0 };
    byType[bt.key].count++;
  });

  Object.keys(byType).forEach(function (k) {
    var bt = byType[k].bt;
    var count = byType[k].count;
    if (bt.output_resource_key === resourceKey && bt.output_rate > 0) {
      flow.production.push({ name: bt.name, count: count,
                             rate: count * Number(bt.output_rate) });
    }
    if (bt.input_resource_key === resourceKey && bt.input_rate > 0) {
      var item = { name: bt.name, count: count, rate: count * Number(bt.input_rate) };
      if (bt.output_resource_key && state.resources[bt.output_resource_key]) {
        item.output = state.resources[bt.output_resource_key].name;
      }
      (bt.category === 'service' ? flow.services : flow.processing).push(item);
    }
    if (bt.input_resource_key_2 === resourceKey && bt.input_rate_2 > 0) {
      var item2 = { name: bt.name, count: count, rate: count * Number(bt.input_rate_2) };
      if (bt.output_resource_key && state.resources[bt.output_resource_key]) {
        item2.output = state.resources[bt.output_resource_key].name;
      }
      (bt.category === 'service' ? flow.services : flow.processing).push(item2);
    }
  });

  // Citizens (food drain). Same pro-rata split logic as computeNetRates.
  var resInfo = state.resources && state.resources[resourceKey];
  if (resInfo && resInfo.is_food) {
    var totalFoodPerMin = 0;
    myActive.forEach(function (b) {
      var bt = state.buildingTypes[b.building_type_key];
      if (!bt || bt.category !== 'housing') return;
      var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
      var cfg = state.housingTierConfig[tier];
      if (cfg && cfg.food_per_minute) totalFoodPerMin += Number(cfg.food_per_minute);
    });
    if (totalFoodPerMin > 0) {
      var foodKeys = Object.keys(state.resources).filter(function (k2) {
        return state.resources[k2].is_food;
      });
      var totalFoodAvail = foodKeys.reduce(function (s, k2) {
        return s + (state.inventory[k2] || 0);
      }, 0);
      if (totalFoodAvail > 0) {
        var qty = state.inventory[resourceKey] || 0;
        flow.citizens = totalFoodPerMin * (qty / totalFoodAvail);
      } else if (resourceKey === 'grain') {
        flow.citizens = totalFoodPerMin;
      }
    }
  }

  // Lifestyle drain — direct (not pro-rata) per-tier demand. If this
  // resource is the lifestyle good for some tier and the player has
  // houses at that tier, sum up the drain rate.
  if (state.housingLifestyleDemands) {
    var lifestyleRate = 0;
    Object.keys(state.housingLifestyleDemands).forEach(function (tier) {
      var demands = state.housingLifestyleDemands[tier];
      demands.forEach(function (d) {
        if (d.resource_key !== resourceKey) return;
        var houseCount = myActive.filter(function (b) {
          var bt = state.buildingTypes[b.building_type_key];
          return bt && bt.category === 'housing'
            && b.status === 'active'
            && (b.housing_tier === Number(tier));
        }).length;
        lifestyleRate += houseCount * d.qty_per_minute;
      });
    });
    if (lifestyleRate > 0) {
      flow.citizens = (flow.citizens || 0) + lifestyleRate;
    }
  }

  // NPC trade flow — only relevant if the player has a policy on this
  // resource AND the trade gate is open.
  var policy = state.tradePolicies && state.tradePolicies[resourceKey];
  if (policy && policy.mode !== 'keep'
      && state.profile && state.profile.trade_unlocked) {
    Object.keys(state.traders || {}).forEach(function (tk) {
      var t = state.traders[tk];
      var prices = (state.allTraderPrices && state.allTraderPrices[tk]
                    && state.allTraderPrices[tk][resourceKey]) || null;
      if (!prices) return;
      var unlock = state.unlockedTraders && state.unlockedTraders[tk];
      if (unlock && !unlock.unlocked) return;
      var rate = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
      if (policy.mode === 'sell_surplus' && prices.buy_price) {
        flow.exports.push({ trader: t.name, rate: rate, price: prices.buy_price });
      } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
        flow.imports.push({ trader: t.name, rate: rate, price: prices.sell_price });
      }
    });
  }

  return flow;
}

// renderInventory removed: the Inventory tab was folded into City →
// Resources, which carries the same rate/stock data alongside trade-flow
// context. Other Inventory sections (housing tiers / labor) live in the
// topbar + per-building inspector now.

// ── City runway: how long can current reserves support the city? ──
//
// "If I go to bed for 8 hours, will my city survive?" — the question
// this metric answers. Computes how long until the first devolve-
// triggering resource runs out, using current stock and net production
// vs consumption rates.
//
// Tracks two classes of devolve-triggering resources:
//   1) Aggregate food. Houses drain food proportionally across all
//      is_food resources, and stop when total = 0 — so the meaningful
//      number is total_food / max(0, total_drain - total_production).
//   2) Each lifestyle good (pottery / bread / furniture / statuary)
//      independently. With cumulative demand a single lifestyle good
//      running out kicks every house at its tier-or-above into devolve
//      grace.
//
// computeResourceFlow already gives net production/consumption per
// resource (production + imports - processing - services - exports -
// citizens), so we lean on it for lifestyle goods.
//
// Returns:
//   { minutes, bottleneck, perResource: {key: minutes_or_Infinity} }
//   - minutes:    minutes until the bottleneck resource depletes; Infinity
//                 means everything is sustainable.
//   - bottleneck: which resource depletes first (key in perResource).
//   - perResource: per-resource runway in minutes (Infinity when sustainable).
//
// Special key 'food' aggregates over all is_food resources.
export function computeCityRunway() {
  var perResource = {};
  var bottleneck = null;
  var bottleneckMin = Infinity;

  function consider(key, stock, production, drain) {
    var net = production - drain;
    if (net >= 0 || drain <= 0) {
      perResource[key] = Infinity;
      return;
    }
    var minutes = stock / -net;
    perResource[key] = minutes;
    if (minutes < bottleneckMin) {
      bottleneckMin = minutes;
      bottleneck = key;
    }
  }

  if (!state.currentUser) {
    return { minutes: Infinity, bottleneck: null, perResource: perResource };
  }

  var myActive = state.allBuildings.filter(function (b) {
    return b.player_id === state.currentUser.id && b.status === 'active';
  });

  // ── 1) Food (aggregate) ──
  var foodKeys = Object.keys(state.resources || {}).filter(function (k) {
    return state.resources[k].is_food;
  });
  var totalFoodStock = foodKeys.reduce(function (s, k) {
    return s + (state.inventory[k] || 0);
  }, 0);
  var totalFoodDrain = 0;
  myActive.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category !== 'housing') return;
    var tier = b.housing_tier !== undefined ? b.housing_tier : 1;
    var cfg = state.housingTierConfig[tier];
    if (cfg && cfg.food_per_minute) totalFoodDrain += Number(cfg.food_per_minute);
  });
  var totalFoodProduction = 0;
  myActive.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (!bt || bt.category !== 'food_extractor') return;
    if (state.laborInfo.unstaffedIds && state.laborInfo.unstaffedIds[b.id]) return;
    if (bt.output_resource_key && bt.output_rate > 0) {
      totalFoodProduction += Number(bt.output_rate);
    }
  });
  // Add NPC trade flow on every food resource (so a buy_to_reserve on
  // grain extends runway just like a grain farm would). Lifestyle-good
  // runways already get this via computeResourceFlow; food was being
  // computed standalone and missing it.
  if (state.profile && state.profile.trade_unlocked && state.tradePolicies) {
    foodKeys.forEach(function (fk) {
      var policy = state.tradePolicies[fk];
      if (!policy || policy.mode === 'keep') return;
      Object.keys(state.traders || {}).forEach(function (tk) {
        var t = state.traders[tk];
        if (!t) return;
        var prices = (state.allTraderPrices && state.allTraderPrices[tk]
                      && state.allTraderPrices[tk][fk]) || null;
        if (!prices) return;
        var unlock = state.unlockedTraders && state.unlockedTraders[tk];
        if (unlock && !unlock.unlocked) return;
        var rate = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
        if (policy.mode === 'sell_surplus' && prices.buy_price) {
          totalFoodDrain += rate;
        } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
          totalFoodProduction += rate;
        }
      });
    });
  }
  consider('food', totalFoodStock, totalFoodProduction, totalFoodDrain);

  // ── 2) Lifestyle goods ──
  if (state.housingLifestyleDemands) {
    var seen = {};
    Object.keys(state.housingLifestyleDemands).forEach(function (tier) {
      state.housingLifestyleDemands[tier].forEach(function (d) {
        seen[d.resource_key] = true;
      });
    });
    Object.keys(seen).forEach(function (key) {
      var stock = state.inventory[key] || 0;
      var flow = computeResourceFlow(key);
      var production = flow.production.reduce(function (s, x) { return s + x.rate; }, 0)
                     + flow.imports.reduce(function (s, x) { return s + x.rate; }, 0);
      // For lifestyle goods, food.citizens (computed in flow) includes
      // ONLY the lifestyle-tier drain (since this resource isn't a
      // food). processing/services/exports come from the same
      // computeResourceFlow output.
      var drain = flow.processing.reduce(function (s, x) { return s + x.rate; }, 0)
                + flow.services.reduce(function (s, x) { return s + x.rate; }, 0)
                + (flow.citizens || 0)
                + flow.exports.reduce(function (s, x) { return s + x.rate; }, 0);
      consider(key, stock, production, drain);
    });
  }

  return {
    minutes: bottleneckMin,
    bottleneck: bottleneck,
    perResource: perResource
  };
}

// Format a minute count for display: "8h 30m", "45m", "3d", or "∞".
export function formatRunway(minutes) {
  if (!isFinite(minutes)) return '∞';
  if (minutes < 1) return '<1m';
  var min = Math.floor(minutes);
  if (min < 60) return min + 'm';
  if (min < 24 * 60) {
    var hr = Math.floor(min / 60);
    var rem = min % 60;
    return rem > 0 ? hr + 'h ' + rem + 'm' : hr + 'h';
  }
  var days = Math.floor(min / (24 * 60));
  var hrs = Math.floor((min % (24 * 60)) / 60);
  return hrs > 0 ? days + 'd ' + hrs + 'h' : days + 'd';
}

// ── Trade panel (Phase 2B: multi-partner trade) ──
export function renderTradePanel() {
  // Renders the Partners sub-panel of the Trade tab. The Trade tab also
  // hosts Missions / Players / Stats sub-panels rendered separately.
  var panel = document.getElementById('panel-trade-partners');
  var html = '';

  var traderKeys = Object.keys(state.traders);

  // Gate: NPC trade is locked until the player has 1 extractor + 1 food
  // extractor + 1 tier-1 housing in their district.
  var unlockInfo = computeTradeUnlockState();
  if (!unlockInfo.unlocked) {
    panel.innerHTML = renderLockedTradeHtml(unlockInfo);
    return;
  }

  // Fallback if no traders loaded
  if (traderKeys.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:16px;">No trade partners loaded. Run the Phase 2B migration first.</div>';
    panel.innerHTML = html;
    return;
  }

  // Phase 2C: recompute unlocks (buildings may have changed)
  computeTraderUnlocks();

  // Ensure selected trader is valid and unlocked
  if (!state.selectedTrader || !state.traders[state.selectedTrader] ||
      (state.unlockedTraders[state.selectedTrader] && !state.unlockedTraders[state.selectedTrader].unlocked)) {
    var firstUnlocked = traderKeys.filter(function (tk) {
      return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
    })[0];
    state.selectedTrader = firstUnlocked || traderKeys[0];
  }
  state.traderPrices = state.allTraderPrices[state.selectedTrader] || {};

  var trader = state.traders[state.selectedTrader];

  // ── Partner selector tabs (Phase 2C: locked/unlocked) ──
  html += '<div class="partner-tabs">';
  traderKeys.forEach(function (tk) {
    var t = state.traders[tk];
    var selected = tk === state.selectedTrader;
    var unlockInfo = state.unlockedTraders[tk] || { unlocked: true, hint: '' };
    var isLocked = !unlockInfo.unlocked;

    if (isLocked) {
      html += '<button class="partner-tab locked" data-trader="' + tk + '" data-locked="1" title="' + unlockInfo.hint.replace(/"/g, '&quot;') + '">';
      html += '<div class="partner-tab-name"><span class="lock-icon">&#x1f512;</span> ' + t.name + '</div>';
      html += '<div class="partner-tab-hint">' + unlockInfo.hint + '</div>';
      html += '</button>';
    } else {
      var nextVisit = state.nextVisitAts[tk];
      var visitLabel = '';
      if (nextVisit) {
        var diff = nextVisit.getTime() - Date.now();
        if (diff > 0) {
          visitLabel = '<span class="partner-tab-timer">~' + Math.ceil(diff / 60000) + 'm</span>';
        }
        // Don't show a "Due!" badge anymore — auto-resolve handles it.
      }
      html += '<button class="partner-tab' + (selected ? ' selected' : '') + '" data-trader="' + tk + '">';
      html += '<div class="partner-tab-name">' + t.name + '</div>';
      html += '<div class="partner-tab-meta">Cap ' + t.visit_capacity + ' &middot; ' + t.visit_interval_minutes + 'm</div>';
      if (visitLabel) {
        html += '<div class="partner-tab-visit">' + visitLabel + '</div>';
      }
      html += '</button>';
    }
  });
  html += '</div>';

  // ── Visit status (auto-resolve) ──
  // Trade visits are now resolved automatically every production tick by
  // _pp_resolve_trader_visits on the server. The player's per-resource
  // policies (City → Resources) decide what gets sold or bought; nothing
  // to click here. Show the soonest next-visit time as ambient info.
  var unlockedKeys = traderKeys.filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  html += '<div class="visit-status">';
  var soonest = null;
  unlockedKeys.forEach(function (tk) {
    var nv = state.nextVisitAts[tk];
    if (nv && (!soonest || nv.getTime() < soonest)) {
      soonest = nv.getTime();
    }
  });
  if (soonest && soonest > Date.now()) {
    var mins = Math.ceil((soonest - Date.now()) / 60000);
    html += '<span class="visit-timer">Next auto-trade in ~' + mins + ' min</span>';
  } else {
    html += '<span class="visit-timer">Auto-trading on each production tick</span>';
  }
  html += '</div>';

  // ── Selected partner detail ──
  html += '<div class="partner-detail">';
  html += '<div class="trader-header">' + trader.name + '</div>';
  html += '<div class="trader-desc">' + (trader.description || '') + '</div>';

  // Visit status for selected partner — purely informational; no action.
  var selectedNextVisit = state.nextVisitAts[state.selectedTrader];
  if (selectedNextVisit) {
    var sdiff = selectedNextVisit.getTime() - Date.now();
    html += '<div class="partner-visit-info">';
    if (sdiff <= 0) {
      html += '<span class="visit-timer">Auto-trades on the next production tick</span>';
    } else {
      html += '<span class="visit-timer">Next auto-trade in ~' + Math.ceil(sdiff / 60000) + ' min</span>';
    }
    html += '</div>';
  }

  // Last visit summary for selected partner
  html += renderVisitSummary(state.selectedTrader);

  // Goods this partner trades
  html += renderPartnerGoods(state.selectedTrader);

  html += '</div>';

  // Trade-policy controls live in City → Resources now (per-resource,
  // alongside stock + rate + flow), so the Partners view is just the
  // partner picker + selected partner's goods + Black Market.

  // ── Black Market section (separate from partner trade) ──
  html += '<div class="bm-section">';
  html += '<div class="bm-header">';
  html += '<span class="bm-title">Black Market</span>';
  html += '</div>';
  html += '<div class="bm-warning">Instant trade for emergencies. Always available, but the rates are terrible.</div>';

  var bmPrices = {
    timber: { buy: 2, sell: 10 },
    stone:  { buy: 2, sell: 11 },
    lumber: { buy: 5, sell: 18 },
    brick:  { buy: 6, sell: 20 },
    grain:  { buy: 2, sell: 9 },
    flour:  { buy: 5, sell: 16 }
  };

  // The City-tab refactor (e2562dc) removed the surrounding tradeResources
  // array but left this loop pointing at it, throwing a silent ReferenceError
  // mid-render and leaving the entire Partners panel blank. Restore the list
  // (display order matches the prior version: raw → processed by industry).
  var tradeResources = ['timber', 'lumber', 'stone', 'brick', 'grain', 'flour'];

  tradeResources.forEach(function (rk) {
    var bmp = bmPrices[rk];
    var stock = Math.floor(state.inventory[rk] || 0);
    var sellKey = 'bm-sell-' + rk;
    var buyKey = 'bm-buy-' + rk;
    var sellAmt = state.blackMarketAmounts[sellKey] || 0;
    var buyAmt = state.blackMarketAmounts[buyKey] || 0;
    var maxBuy = bmp.sell > 0 ? Math.floor(state.profile.money / bmp.sell) : 0;

    html += '<div class="bm-row">';
    html += '<div class="bm-row-header">';
    html += '<span class="bm-res-name">' + resourceName(rk) + '</span>';
    html += '<span class="bm-res-stock">Stock: ' + stock + '</span>';
    html += '</div>';
    html += '<div class="bm-prices">';
    html += '<span class="bm-price bm-price-sell">Sell at ' + bmp.buy + 'g</span>';
    html += '<span class="bm-price bm-price-buy">Buy at ' + bmp.sell + 'g</span>';
    html += '</div>';

    // Sell to black market row
    html += '<div class="bm-trade-row">';
    html += '<span class="bm-trade-label">Sell:</span>';
    html += '<div class="trade-controls">';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="dec">-</button>';
    html += '<span class="trade-amt" id="bma-' + sellKey + '">' + sellAmt + '</span>';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="inc" data-max="' + stock + '">+</button>';
    html += '<button class="btn-bm-sell" data-resource="' + rk + '" data-bmkey="' + sellKey + '"' + (sellAmt < 1 ? ' disabled' : '') + '>Sell</button>';
    html += '</div>';
    html += '</div>';

    // Buy from black market row
    html += '<div class="bm-trade-row">';
    html += '<span class="bm-trade-label">Buy:</span>';
    html += '<div class="trade-controls">';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="dec">-</button>';
    html += '<span class="trade-amt" id="bma-' + buyKey + '">' + buyAmt + '</span>';
    html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="inc" data-max="' + maxBuy + '">+</button>';
    html += '<button class="btn-bm-buy" data-resource="' + rk + '" data-bmkey="' + buyKey + '"' + (buyAmt < 1 ? ' disabled' : '') + '>Buy</button>';
    html += '</div>';
    html += '</div>';

    html += '</div>';
  });
  html += '</div>';

  panel.innerHTML = html;

  // ── Wire partner tab clicks (skip locked partners) ──
  panel.querySelectorAll('.partner-tab').forEach(function (tab) {
    tab.addEventListener('click', function () {
      if (tab.dataset.locked === '1') {
        var tk = tab.dataset.trader;
        var hint = state.unlockedTraders[tk] ? state.unlockedTraders[tk].hint : 'Locked';
        showToast(hint, 'info');
        return;
      }
      state.selectedTrader = tab.dataset.trader;
      state.traderPrices = state.allTraderPrices[state.selectedTrader] || {};
      renderTradePanel();
    });
  });

  // (The Check All button is gone — visits auto-resolve every production
  // tick via _pp_resolve_trader_visits on the server.)

  // ── Wire Black Market amount buttons ──
  panel.querySelectorAll('.bm-amt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.bmkey;
      var dir = btn.dataset.dir;
      var max = parseInt(btn.dataset.max || '999');
      var current = state.blackMarketAmounts[key] || 0;

      if (dir === 'inc' && current < max) current++;
      else if (dir === 'dec' && current > 0) current--;
      state.blackMarketAmounts[key] = current;

      var el = document.getElementById('bma-' + key);
      if (el) el.textContent = current;

      var row = btn.closest('.bm-trade-row');
      var actionBtn = row.querySelector('.btn-bm-sell, .btn-bm-buy');
      if (actionBtn) actionBtn.disabled = current < 1;
    });
  });

  // ── Wire Black Market sell buttons ──
  panel.querySelectorAll('.btn-bm-sell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var key = btn.dataset.bmkey;
      var amt = state.blackMarketAmounts[key] || 0;
      if (amt < 1) return;
      blackMarketTrade(rk, amt, 'sell', btn);
    });
  });

  // ── Wire Black Market buy buttons ──
  panel.querySelectorAll('.btn-bm-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var key = btn.dataset.bmkey;
      var amt = state.blackMarketAmounts[key] || 0;
      if (amt < 1) return;
      blackMarketTrade(rk, amt, 'buy', btn);
    });
  });
}

function renderVisitSummary(traderKey) {
  var html = '';
  var lastVisit = state.lastVisits[traderKey];
  if (lastVisit && lastVisit.summary) {
    var summary = lastVisit.summary;
    if (typeof summary === 'string') {
      try { summary = JSON.parse(summary); } catch (e) { summary = []; }
    }
    html += '<div class="visit-summary">';
    html += '<div class="visit-summary-title">Last Visit</div>';
    if (summary.length === 0) {
      html += '<div class="visit-summary-item empty">Visited — no trades matched your policy.</div>';
    } else {
      summary.forEach(function (item) {
        if (item.type === 'sell') {
          html += '<div class="visit-summary-item sold">Sold ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        } else if (item.type === 'buy') {
          html += '<div class="visit-summary-item bought">Bought ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        }
      });
    }
    var usedLabel = lastVisit.capacity_used + '/' + lastVisit.capacity_total + ' capacity used';
    html += '<div class="visit-summary-cap">' + usedLabel + '</div>';
    html += '</div>';
  }
  return html;
}

function renderPartnerGoods(traderKey) {
  var prices = state.allTraderPrices[traderKey] || {};
  var resources = Object.keys(prices);
  if (resources.length === 0) return '';
  var quotas = (state.traderQuotas && state.traderQuotas[traderKey]) || {};

  var html = '<div class="partner-goods">';
  html += '<div class="partner-goods-title">Traded Goods <span class="partner-goods-hint">(daily caps reset at midnight UTC)</span></div>';
  resources.forEach(function (rk) {
    var p = prices[rk];
    var q = quotas[rk] || {};
    var parts = [];
    if (p.buy_price) {
      var capStr = '';
      if (q.buy_cap != null) {
        var remaining = Math.max(0, q.buy_cap - (q.buy_used || 0));
        var fullClass = remaining === 0 ? ' pg-cap-full' : '';
        capStr = '<span class="pg-cap' + fullClass + '">' + (q.buy_used || 0) + '/' + q.buy_cap + ' today</span>';
      }
      parts.push('<span class="pg-sell">Buys at ' + p.buy_price + 'g ' + capStr + '</span>');
    }
    if (p.sell_price) {
      var capStr2 = '';
      if (q.sell_cap != null) {
        var remaining2 = Math.max(0, q.sell_cap - (q.sell_used || 0));
        var fullClass2 = remaining2 === 0 ? ' pg-cap-full' : '';
        capStr2 = '<span class="pg-cap' + fullClass2 + '">' + (q.sell_used || 0) + '/' + q.sell_cap + ' today</span>';
      }
      parts.push('<span class="pg-buy">Sells at ' + p.sell_price + 'g ' + capStr2 + '</span>');
    }
    html += '<div class="partner-goods-item">';
    html += '<span class="partner-goods-name">' + resourceName(rk) + '</span>';
    html += '<span class="partner-goods-prices">' + parts.join(' &middot; ') + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

// Called by reports.js's resource-row policy controls.
export function saveTradePolicy(resourceKey, mode, reserveTarget) {
  state.tradePolicies[resourceKey] = { mode: mode, reserve_target: reserveTarget };
  sb.rpc('save_trade_policy', {
    p_resource_key: resourceKey,
    p_mode: mode,
    p_reserve_target: reserveTarget
  }).then(function (r) {
    if (r.error) {
      showToast('Policy save failed: ' + r.error.message, 'error');
      return;
    }
    showToast(resourceName(resourceKey) + ' policy updated', 'success');
  }).catch(function (err) {
    showToast('Policy save failed', 'error');
  });
}

// ── Check all trader visits sequentially (only unlocked) ──
export function checkAllTraderVisits() {
  // Phase 2C: only resolve visits for unlocked traders
  var traderKeys = Object.keys(state.traders).filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  if (traderKeys.length === 0) return;

  var idx = 0;
  var totalEarned = 0;
  var totalSpent = 0;
  var anyResolved = false;
  var resolvedNames = [];

  function resolveNext() {
    if (idx >= traderKeys.length) {
      // All traders processed — show results
      if (anyResolved) {
        var msg = resolvedNames.join(', ') + ' visited!';
        if (totalEarned > 0) msg += ' Earned $' + totalEarned + '.';
        if (totalSpent > 0) msg += ' Spent $' + totalSpent + '.';
        if (totalEarned === 0 && totalSpent === 0) msg += ' No trades this round.';
        showToast(msg, 'success');
      }
      updateMoney();
      refreshActiveDataPanel();
      renderTradePanel();
      state.visitChecked = true;
      return;
    }

    var tk = traderKeys[idx];
    idx++;

    sb.rpc('resolve_trader_visit', { p_trader_key: tk }).then(function (r) {
      if (r.error) {
        console.warn('Trader visit check (' + tk + '):', r.error.message);
        resolveNext();
        return;
      }
      var data = r.data;
      if (!data) { resolveNext(); return; }

      if (data.visit_resolved) {
        anyResolved = true;
        totalEarned += data.total_earned || 0;
        totalSpent += data.total_spent || 0;
        resolvedNames.push(state.traders[tk] ? state.traders[tk].name : tk);

        state.lastVisits[tk] = {
          capacity_total: data.capacity_total,
          capacity_used: data.capacity_used,
          summary: data.summary,
          visited_at: new Date().toISOString(),
          trader_key: tk
        };
      }

      if (data.next_visit_at) {
        state.nextVisitAts[tk] = new Date(data.next_visit_at);
      }

      // Update inventory/money from each resolved visit (last one has latest state)
      if (data.money !== undefined) {
        state.profile.money = data.money;
      }
      if (data.inventory) {
        state.inventory = {};
        Object.keys(data.inventory).forEach(function (k) {
          state.inventory[k] = Number(data.inventory[k]);
        });
      }

      resolveNext();
    }).catch(function (err) {
      console.warn('Trader visit check failed (' + tk + '):', err);
      resolveNext();
    });
  }

  resolveNext();
}

function blackMarketTrade(resourceKey, quantity, direction, btn) {
  var originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = '...';

  sb.rpc('black_market_trade', {
    p_resource_key: resourceKey,
    p_quantity: quantity,
    p_direction: direction
  }).then(function (r) {
    if (r.error) {
      showToast(r.error.message, 'error');
      btn.disabled = false;
      btn.textContent = originalText;
      return;
    }
    var data = r.data;
    state.profile.money = data.money;
    if (data.inventory) {
      state.inventory = {};
      Object.keys(data.inventory).forEach(function (k) {
        state.inventory[k] = Number(data.inventory[k]);
      });
    }

    updateMoney();

    var bmKey = 'bm-' + direction + '-' + resourceKey;
    state.blackMarketAmounts[bmKey] = 0;

    refreshActiveDataPanel();
    renderTradePanel();

    var verb = direction === 'sell' ? 'Sold' : 'Bought';
    var preposition = direction === 'sell' ? 'for' : 'for';
    showToast(verb + ' ' + quantity + ' ' + resourceName(resourceKey) + ' on Black Market ' + preposition + ' $' + data.total_price, 'success');
  }).catch(function (err) {
    showToast(err.message || 'Black Market trade failed', 'error');
    btn.disabled = false;
    btn.textContent = originalText;
  });
}

// ── Panel state toggle (three states: collapsed / half / expanded) ──
//
// Two buttons in the header:
//   panel-collapse — toggles open ↔ closed (preserves the half/expanded
//                    sub-state so re-opening returns to whatever size
//                    the user had before hiding).
//   panel-size     — toggles half ↔ full when open (hidden when closed).
//
// State is persisted in localStorage so reloading the game returns to
// the same layout.
export function initPanelCollapse() {
  var collapseBtn = document.getElementById('panel-collapse');
  var sizeBtn = document.getElementById('panel-size');
  var panel = document.getElementById('bottom-panel');
  if (!collapseBtn || !panel) return;

  var STORAGE_KEY = 'city_panel_state';
  var current;
  try { current = localStorage.getItem(STORAGE_KEY); } catch (e) {}
  if (current !== 'collapsed' && current !== 'expanded' && current !== 'half') current = 'half';

  function apply(state) {
    var wasHidden = current === 'expanded';
    panel.classList.remove('collapsed', 'expanded');
    document.body.classList.toggle('panel-expanded', state === 'expanded');
    if (state === 'collapsed') {
      panel.classList.add('collapsed');
      collapseBtn.textContent = 'Show ▴';
    } else if (state === 'expanded') {
      panel.classList.add('expanded');
      collapseBtn.textContent = 'Hide ▾';
      if (sizeBtn) { sizeBtn.textContent = 'Half ▾'; sizeBtn.title = 'Shrink to half-screen'; }
    } else {
      collapseBtn.textContent = 'Hide ▾';
      if (sizeBtn) { sizeBtn.textContent = 'Full ▴'; sizeBtn.title = 'Expand to full-screen'; }
    }
    current = state;
    try { localStorage.setItem(STORAGE_KEY, state); } catch (e) {}
    // If the map area was hidden (panel-expanded → display:none on
    // .map-area) and we're now showing it again, walkers that spawned
    // while it was hidden have their position-retry chain stuck — the
    // rAF loop keeps reading offsetWidth=0. Re-render after the next
    // frame so the layer has measurable width and walkers find their
    // tiles.
    if (wasHidden && state !== 'expanded') {
      requestAnimationFrame(function () { renderWalkers(); });
    }
  }

  apply(current);

  collapseBtn.addEventListener('click', function () {
    if (current === 'collapsed') {
      // Re-open at whatever the previous open size was. We track only
      // the active state in storage; default to 'half' on first open.
      var resume;
      try { resume = localStorage.getItem(STORAGE_KEY + '_resume'); } catch (e) {}
      apply(resume === 'expanded' ? 'expanded' : 'half');
    } else {
      // Remember the size we're collapsing FROM, so re-opening restores it.
      try { localStorage.setItem(STORAGE_KEY + '_resume', current); } catch (e) {}
      apply('collapsed');
    }
  });

  if (sizeBtn) {
    sizeBtn.addEventListener('click', function () {
      apply(current === 'expanded' ? 'half' : 'expanded');
    });
  }
}

// ── Tab system ──
// Top-level tabs: Build / City / Trade. City and Trade each have their
// own .trade-subtabs row + .trade-subpanels container, so sub-tab clicks
// scope to the LOCAL container — a global selector would also clear the
// inactive sibling tab's remembered sub-state.
//
// Sub-panel containers are named panel-trade-<sub> for the Trade tab
// (partners / missions / players) and panel-city-<sub> for the City tab
// (resources / treasury). The sub-tab click handler uses the dataset
// to figure out which prefix to look for.
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel-content').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var tabId = 'panel-' + btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (btn.dataset.tab === 'trade') renderTradeTab();
      else if (btn.dataset.tab === 'city') renderCityTab();
      else if (btn.dataset.tab === 'build') renderBuildPanel();
    });
  });

  document.querySelectorAll('.trade-subtab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var subtabs = btn.closest('.trade-subtabs');
      if (!subtabs) return;
      var container = subtabs.parentElement;
      container.querySelectorAll('.trade-subtab').forEach(function (b) { b.classList.remove('active'); });
      container.querySelectorAll('.trade-subpanel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      // Sub-panel ID prefix depends on which top-level tab owns it.
      var parentPanel = container.closest('.panel-content');
      var prefix = parentPanel && parentPanel.id === 'panel-city' ? 'panel-city-' : 'panel-trade-';
      var sub = document.getElementById(prefix + btn.dataset.subtab);
      if (sub) sub.classList.add('active');
      renderSubpanel(btn.dataset.subtab);
    });
  });
}

// Render Trade's currently-active sub-panel.
export function renderTradeTab() {
  var trade = document.getElementById('panel-trade');
  var active = trade ? trade.querySelector('.trade-subtab.active') : null;
  renderSubpanel(active ? active.dataset.subtab : 'partners');
}

// Render City's currently-active sub-panel.
export function renderCityTab() {
  var city = document.getElementById('panel-city');
  var active = city ? city.querySelector('.trade-subtab.active') : null;
  renderSubpanel(active ? active.dataset.subtab : 'resources');
}

// Re-render whichever data-driven panel is currently visible. Called
// from game.js after each production tick so the panel reflects the
// latest server state.
export function refreshActiveDataPanel() {
  if (document.getElementById('panel-trade').classList.contains('active')) {
    renderTradeTab();
  } else if (document.getElementById('panel-city').classList.contains('active')) {
    renderCityTab();
  }
}

function renderSubpanel(sub) {
  if (sub === 'partners') renderTradePanel();
  else if (sub === 'missions') renderMissionsPanel();
  else if (sub === 'players') renderPlayersPanel();
  else if (sub === 'resources') renderResourcesPanel();
  else if (sub === 'treasury') renderTreasuryPanel();
}

// ── Trade-unlock gate (client-side mirror of is_trade_unlocked) ──
// Trade unlocks once during the tutorial (after the player places their
// first food extractor) and STAYS unlocked. Demolishing buildings
// later doesn't lock it back. Server keeps the same flag in
// player_profiles.trade_unlocked.
function computeTradeUnlockState() {
  var unlocked = !!(state.profile && state.profile.trade_unlocked);
  return {
    unlocked: unlocked,
    // Legacy fields kept so renderLockedTradeHtml doesn't crash if
    // it gets called for any reason — they all read true once unlocked.
    hasExtractor: unlocked,
    hasFoodExt: unlocked,
    hasTier1: unlocked
  };
}

function renderLockedTradeHtml(info) {
  // Trade is locked until the new player finishes the tutorial. The
  // panel just points back at the active tutorial step.
  var step = (state.profile && state.profile.tutorial_step) || 0;
  var hint;
  if (step === 0) hint = 'Build a House (see the tutorial banner at the top of the screen).';
  else if (step === 1) hint = 'Build a Well next to your house to provide water service.';
  else if (step === 2) hint = 'Build a food producer (Garden, Orchard, Fishing Pier, or Grain Farm) — that\'s the last tutorial step before trade opens up.';
  else hint = 'Finishing the tutorial will unlock trade.';
  return '<div class="trade-lock">'
       + '<div class="trade-lock-title">Trade unlocks after the tutorial</div>'
       + '<div class="trade-lock-body">' + hint + '</div>'
       + '<div class="trade-lock-hint">Once trade opens it stays open — even if you demolish buildings later.</div>'
       + '</div>';
}

function renderMissionsPanel() {
  var panel = document.getElementById('panel-trade-missions');
  var unlock = computeTradeUnlockState();
  if (!unlock.unlocked) {
    panel.innerHTML = renderLockedTradeHtml(unlock);
    return;
  }
  panel.innerHTML = '<div class="trade-loading">Loading missions…</div>';
  sb.rpc('get_active_missions').then(function (r) {
    if (r.error) {
      panel.innerHTML = '<div class="trade-error">Failed to load missions: ' + escapeHtml(r.error.message) + '</div>';
      return;
    }
    var data = r.data || {};
    var open = data.open || [];
    var quiet = data.quiet || [];
    if (open.length === 0 && quiet.length === 0) {
      panel.innerHTML = '<div class="trade-empty">No traders are working with the city yet.</div>';
      return;
    }
    var html = '';
    if (open.length) {
      html += '<div class="missions-list">';
      open.forEach(function (m) {
        var pct = Math.min(100, Math.round((m.current_qty / m.target_qty) * 100));
        var youHave = Math.floor((state.inventory && state.inventory[m.resource_key]) || 0);
        var remaining = m.target_qty - m.current_qty;
        var disabled = youHave <= 0 || remaining <= 0;
        var deadlineMs = new Date(m.soft_deadline).getTime() - Date.now();
        var deadlineText = deadlineMs > 0
          ? Math.max(1, Math.round(deadlineMs / 60000)) + ' min until soft deadline'
          : 'past soft deadline (still accepting partial)';
        html += '<div class="mission-card">'
              + '<div class="mission-header">'
              + '<span class="mission-trader">' + escapeHtml(m.trader_name) + ' wants</span>'
              + '<span class="mission-deadline">' + deadlineText + '</span>'
              + '</div>'
              + '<div class="mission-target">' + m.target_qty + ' ' + escapeHtml(resourceName(m.resource_key)) + '</div>'
              + '<div class="mission-progress"><div class="mission-progress-fill" style="width:' + pct + '%"></div></div>'
              + '<div class="mission-meta">'
              + '<span>' + m.current_qty + ' / ' + m.target_qty + '</span>'
              + '<span>You: ' + (m.your_donated_qty || 0) + ' donated · have ' + youHave + '</span>'
              + '</div>'
              + '<div class="mission-actions">'
              + '<input type="number" min="1" step="1" value="' + Math.min(remaining, youHave || 1) + '" class="mission-qty" data-mission="' + m.id + '">'
              + '<button class="btn-mission-donate" data-mission="' + m.id + '"' + (disabled ? ' disabled' : '') + '>Donate</button>'
              + '</div>'
              + '</div>';
      });
      html += '</div>';
    }
    if (quiet.length) {
      html += '<div class="quiet-traders">';
      html += '<div class="quiet-traders-title">Waiting on next request</div>';
      quiet.forEach(function (q) {
        var nextMs = new Date(q.next_eligible_at).getTime() - Date.now();
        var nextText = nextMs <= 60000 ? 'soon' : '~' + Math.max(1, Math.round(nextMs / 60000)) + ' min';
        html += '<div class="quiet-trader-card">'
              + '<span class="quiet-trader-name">' + escapeHtml(q.trader_name) + '</span>'
              + '<span class="quiet-trader-eta">Next request in ' + nextText + '</span>'
              + '</div>';
      });
      html += '</div>';
    }
    panel.innerHTML = html;

    panel.querySelectorAll('.btn-mission-donate').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var mid = btn.dataset.mission;
        var qtyInput = panel.querySelector('.mission-qty[data-mission="' + mid + '"]');
        var qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);
        btn.disabled = true; btn.textContent = 'Sending…';
        sb.rpc('donate_to_mission', { p_mission_id: mid, p_qty: qty }).then(function (rr) {
          if (rr.error) {
            showToast('Donate failed: ' + rr.error.message, 'error');
            btn.disabled = false; btn.textContent = 'Donate';
            return;
          }
          var d = rr.data || {};
          showToast('Donated ' + d.donated_qty + (d.fulfilled ? ' — mission fulfilled!' : ''), 'success');
          // Refresh inventory + missions.
          sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id).then(function (q) {
            state.inventory = {};
            (q.data || []).forEach(function (row) { state.inventory[row.resource_key] = row.quantity; });
            refreshActiveDataPanel();
          });
          renderMissionsPanel();
        });
      });
    });
  });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
