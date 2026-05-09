// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state, computeTraderUnlocks } from './state.js';
import { showToast, updateMoney, tutorialAllowsBuilding, updateCityRunway } from './ui.js';
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

  // Group buildings into 5 sections so the panel doesn't dump 15+
  // items in a flat list:
  //   infra     — road + housing (always available, structural)
  //   industry  — resource chain locked to the player's industry
  //               (extractor + non-food processors + cross-converters +
  //                cross-recipe T4 + resource boosters)
  //   farming   — food chain (food_extractor + food-output processors +
  //               luxury food T3 + food boosters)
  //   civic     — services + tax + police (common to everyone)
  //   transport — airport / seaport / train depot / truck depot
  //               (city-wide trade-route infrastructure)
  // Each section collapses independently; state persists in localStorage.
  var CATEGORY_ORDER = {
    road: 0, housing: 1, extractor: 2, food_extractor: 3,
    processor: 4, booster: 5, service: 6, tax: 7, police: 8, park: 9,
    transport_hub: 10, transport_connector: 11
  };
  var SECTION_RANK = { infra: 0, industry: 1, farming: 2, civic: 3, transport: 4 };
  function isFoodOutput(bt) {
    if (!bt.output_resource_key || !state.resources) return false;
    var r = state.resources[bt.output_resource_key];
    return !!(r && r.is_food);
  }
  function sectionFor(bt) {
    if (bt.category === 'road' || bt.category === 'housing') return 'infra';
    if (bt.category === 'transport_hub' || bt.category === 'transport_connector') return 'transport';
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
    civic: 'Civic & Services',
    transport: 'Transport Network'
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
    // Resource-cost gate (2026-05-08): every non-basic building consumes
    // a small set of resources at placement time. Compute now and feed
    // both the disabled flag and the materials chip line below.
    var resourceCosts = (state.buildingResourceCosts && state.buildingResourceCosts[key]) || [];
    var resourcesOK = true;
    var costShortages = [];
    resourceCosts.forEach(function (rc) {
      var have = Math.floor((state.inventory && state.inventory[rc.resource_key]) || 0);
      if (have < rc.quantity) {
        resourcesOK = false;
        costShortages.push({
          resource_key: rc.resource_key,
          short: rc.quantity - have
        });
      }
    });
    // Progressive unlock: gate buildings hide / lock until the player
    // has reached the required housing tier at least once (sticky).
    var unlockTier = bt.unlocks_at_housing_tier;
    var maxTierEver = (state.profile && state.profile.highest_housing_tier_ever) || 0;
    var unlocked = unlockTier == null || maxTierEver >= unlockTier;
    var disabled = !canAfford || !unlocked || !resourcesOK;
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
    } else if (bt.category === 'transport_hub') {
      var hubMode = key === 'airport' ? 'airport' : key === 'seaport' ? 'seaport' : 'train depot';
      desc = 'Transport hub. Building this unlocks 1 city-wide trade partner via the ' + hubMode
           + ' network. Expand it later (tap once built) to add another. Anyone in the city with road-connected'
           + ' truck depots can use the partners too.';
    } else if (bt.category === 'transport_connector') {
      desc = 'Truck Depot. Unlocks the Regional Hauliers trader (raw materials at moderate prices), and connects you to every airport / seaport / train depot in the city — you can use other players\' transport-hub traders.';
    } else if (bt.category === 'tax') {
      desc = 'Tax revenue scales with population: $' + bt.output_rate + '/min per 100 citizens. Needs road access + staff.';
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
    if (resourceCosts.length > 0) {
      var chips = resourceCosts.map(function (rc) {
        var have = Math.floor((state.inventory && state.inventory[rc.resource_key]) || 0);
        var ok = have >= rc.quantity;
        return '<span class="build-mat-chip' + (ok ? '' : ' short') + '">'
             + rc.quantity + ' ' + resourceName(rc.resource_key)
             + (ok ? '' : ' <span class="build-mat-have">(' + have + ')</span>')
             + '</span>';
      }).join('');
      html += '<div class="build-materials">' + chips + '</div>';
    }
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
        // Sustained rate respects daily caps (see computeResourceFlow
        // for the full reasoning). 1440 min = 24h.
        var burst = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
        if (policy.mode === 'sell_surplus' && prices.buy_price) {
          var rate = prices.daily_buy_cap != null
            ? Math.min(burst, prices.daily_buy_cap / 1440)
            : burst;
          rates[rk] = (rates[rk] || 0) - rate;
        } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
          var rateB = prices.daily_sell_cap != null
            ? Math.min(burst, prices.daily_sell_cap / 1440)
            : burst;
          rates[rk] = (rates[rk] || 0) + rateB;
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
    // Cap-aware sustained rate. Per-visit projection (cap/interval) is
    // the BURST rate; daily caps create a SUSTAINED rate ceiling. The
    // long-term flow is min(burst, daily_cap/1440min). For runway
    // calculations the sustained rate is what matters — a player with
    // 20-cap-per-visit pottery and a 200/day sell cap actually averages
    // 0.139/min over 24h, not 2/min.
    var DAY_MINS = 24 * 60;
    Object.keys(state.traders || {}).forEach(function (tk) {
      var t = state.traders[tk];
      var prices = (state.allTraderPrices && state.allTraderPrices[tk]
                    && state.allTraderPrices[tk][resourceKey]) || null;
      if (!prices) return;
      var unlock = state.unlockedTraders && state.unlockedTraders[tk];
      if (unlock && !unlock.unlocked) return;
      var burst = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
      if (policy.mode === 'sell_surplus' && prices.buy_price) {
        var sustained = prices.daily_buy_cap != null
          ? Math.min(burst, prices.daily_buy_cap / DAY_MINS)
          : burst;
        flow.exports.push({ trader: t.name, rate: sustained, price: prices.buy_price });
      } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
        var sustainedB = prices.daily_sell_cap != null
          ? Math.min(burst, prices.daily_sell_cap / DAY_MINS)
          : burst;
        flow.imports.push({ trader: t.name, rate: sustainedB, price: prices.sell_price });
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
        var burst = (t.visit_capacity || 0) / (t.visit_interval_minutes || 1);
        if (policy.mode === 'sell_surplus' && prices.buy_price) {
          var sellRate = prices.daily_buy_cap != null
            ? Math.min(burst, prices.daily_buy_cap / 1440)
            : burst;
          totalFoodDrain += sellRate;
        } else if (policy.mode === 'buy_to_reserve' && prices.sell_price) {
          var buyRate = prices.daily_sell_cap != null
            ? Math.min(burst, prices.daily_sell_cap / 1440)
            : burst;
          totalFoodProduction += buyRate;
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
  // Trade → Partners as a vertical scroll list of trader cards (Atlas's
  // 2026-05-09 redesign). The per-trader tab strip didn't scale past
  // a handful of partners, and the partner you'd want to see depended
  // on the resource you were checking — not on a sticky selection.
  //
  // Layout:
  //   1. "Best deals" banner — per resource you've gated, the partner
  //      whose price beats the gate (or "no one yet" if none).
  //   2. Unlocked traders, each a card with name + mode + visit cadence
  //      + a per-resource goods table.
  //   3. Locked traders at the bottom collapsed with their unlock hint.
  var panel = document.getElementById('panel-trade-partners');
  var html = '';

  var traderKeys = Object.keys(state.traders);

  var unlockInfo = computeTradeUnlockState();
  if (!unlockInfo.unlocked) {
    panel.innerHTML = renderLockedTradeHtml(unlockInfo);
    return;
  }
  if (traderKeys.length === 0) {
    panel.innerHTML = '<div style="color:#7a8a9e;text-align:center;padding:16px;">No trade partners loaded.</div>';
    return;
  }

  computeTraderUnlocks();

  var unlockedKeys = traderKeys.filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  var lockedKeys = traderKeys.filter(function (tk) {
    var info = state.unlockedTraders[tk];
    return info && !info.unlocked;
  });

  // ── Visit cadence banner ──
  html += '<div class="visit-status">';
  var soonest = null;
  unlockedKeys.forEach(function (tk) {
    var nv = state.nextVisitAts[tk];
    if (nv && (!soonest || nv.getTime() < soonest)) soonest = nv.getTime();
  });
  if (soonest && soonest > Date.now()) {
    var mins = Math.ceil((soonest - Date.now()) / 60000);
    html += '<span class="visit-timer">Next auto-trade in ~' + mins + ' min</span>';
  } else {
    html += '<span class="visit-timer">Auto-trading every production tick</span>';
  }
  html += '</div>';

  // ── Best deals banner — driven by your reservation prices ──
  html += renderBestDealsBanner(unlockedKeys);

  // ── Unlocked partner cards ──
  html += '<div class="trader-cards">';
  unlockedKeys.forEach(function (tk) {
    html += renderTraderCard(tk);
  });
  html += '</div>';

  // ── Locked partners (compact, at the bottom) ──
  if (lockedKeys.length > 0) {
    html += '<div class="trader-locked-section">';
    html += '<div class="trader-locked-title">Locked partners</div>';
    lockedKeys.forEach(function (tk) {
      var t = state.traders[tk];
      var info = state.unlockedTraders[tk];
      html += '<div class="trader-locked-card">';
      html += '<div class="trader-locked-name"><span class="lock-icon">&#x1f512;</span> ' + escapeHtml(t.name) + '</div>';
      html += '<div class="trader-locked-hint">' + escapeHtml(info.hint || 'Locked') + '</div>';
      html += '</div>';
    });
    html += '</div>';
  }

  panel.innerHTML = html;
}


// Per resource that the player has a price gate on, find the best
// match across the unlocked partners. Best buyer = highest buy_price
// that meets min_sell_price; best seller = lowest sell_price that
// meets max_buy_price. Renders nothing if no gates are set.
function renderBestDealsBanner(unlockedKeys) {
  var entries = [];
  if (!state.tradePolicies) return '';

  Object.keys(state.tradePolicies).forEach(function (rk) {
    var pol = state.tradePolicies[rk];
    if (!pol) return;
    if (pol.mode === 'sell_surplus' && pol.min_sell_price != null) {
      var bestBuyer = null, bestPrice = -Infinity;
      unlockedKeys.forEach(function (tk) {
        var prices = state.allTraderPrices[tk] && state.allTraderPrices[tk][rk];
        if (!prices || !prices.buy_price) return;
        if (prices.buy_price >= pol.min_sell_price && prices.buy_price > bestPrice) {
          bestPrice = prices.buy_price;
          bestBuyer = tk;
        }
      });
      entries.push({
        rk: rk, mode: 'sell',
        gate: pol.min_sell_price,
        partner: bestBuyer,
        partnerPrice: bestBuyer ? bestPrice : null
      });
    } else if (pol.mode === 'buy_to_reserve' && pol.max_buy_price != null) {
      var bestSeller = null, bestSPrice = Infinity;
      unlockedKeys.forEach(function (tk) {
        var prices = state.allTraderPrices[tk] && state.allTraderPrices[tk][rk];
        if (!prices || !prices.sell_price) return;
        if (prices.sell_price <= pol.max_buy_price && prices.sell_price < bestSPrice) {
          bestSPrice = prices.sell_price;
          bestSeller = tk;
        }
      });
      entries.push({
        rk: rk, mode: 'buy',
        gate: pol.max_buy_price,
        partner: bestSeller,
        partnerPrice: bestSeller ? bestSPrice : null
      });
    }
  });

  if (entries.length === 0) return '';

  var html = '<div class="best-deals">';
  html += '<div class="best-deals-title">Your price gates</div>';
  entries.forEach(function (e) {
    var name = resourceName(e.rk);
    html += '<div class="best-deals-row">';
    html += '<span class="best-deals-res">' + escapeHtml(name) + '</span>';
    if (e.mode === 'sell') {
      html += '<span class="best-deals-gate">sell at $' + e.gate + '+</span>';
      if (e.partner) {
        var p = state.traders[e.partner];
        html += '<span class="best-deals-match">→ ' + escapeHtml(p ? p.name : e.partner)
             +  ' <span class="best-deals-price">$' + e.partnerPrice + '</span></span>';
      } else {
        html += '<span class="best-deals-nomatch">no partner pays that yet</span>';
      }
    } else {
      html += '<span class="best-deals-gate">buy at $' + e.gate + '−</span>';
      if (e.partner) {
        var p2 = state.traders[e.partner];
        html += '<span class="best-deals-match">→ ' + escapeHtml(p2 ? p2.name : e.partner)
             +  ' <span class="best-deals-price">$' + e.partnerPrice + '</span></span>';
      } else {
        html += '<span class="best-deals-nomatch">no partner sells that low yet</span>';
      }
    }
    html += '</div>';
  });
  html += '</div>';
  return html;
}


// Single trader card — name, mode badge, cadence, last-visit summary
// (collapsible), and the per-resource goods table inline.
function renderTraderCard(tk) {
  var t = state.traders[tk];
  if (!t) return '';
  var modeLabel = t.transport_mode || 'starter';
  var nextVisit = state.nextVisitAts[tk];
  var visitLabel = '';
  if (nextVisit) {
    var diff = nextVisit.getTime() - Date.now();
    if (diff > 0) visitLabel = '~' + Math.ceil(diff / 60000) + ' min';
  }
  var html = '<div class="trader-card" data-trader="' + escapeHtml(tk) + '">';
  html += '<div class="trader-card-header">';
  html += '<div class="trader-card-name">' + escapeHtml(t.name) + '</div>';
  html += '<div class="trader-card-meta">';
  html += '<span class="trader-card-mode trader-card-mode-' + escapeHtml(modeLabel) + '">' + escapeHtml(modeLabel) + '</span>';
  html += '<span class="trader-card-cadence">cap ' + t.visit_capacity + '/visit · every ' + t.visit_interval_minutes + 'm</span>';
  if (visitLabel) html += '<span class="trader-card-next">next ~' + visitLabel + '</span>';
  html += '</div></div>';
  if (t.description) {
    html += '<div class="trader-card-desc">' + escapeHtml(t.description) + '</div>';
  }
  html += renderVisitSummary(tk);
  html += renderPartnerGoodsCompact(tk);
  html += '</div>';
  return html;
}


// Compact per-resource goods table for the inline trader card. Same
// info as the old renderPartnerGoods but flatter.
function renderPartnerGoodsCompact(traderKey) {
  var prices = state.allTraderPrices[traderKey] || {};
  var resources = Object.keys(prices);
  if (resources.length === 0) return '';
  var quotas = (state.traderQuotas && state.traderQuotas[traderKey]) || {};
  var html = '<table class="trader-goods-table"><thead><tr>'
           + '<th>Resource</th><th>Buys at</th><th>Sells at</th><th>Today</th>'
           + '</tr></thead><tbody>';
  // Sort by resource name for stable ordering.
  resources.sort(function (a, b) {
    return resourceName(a).localeCompare(resourceName(b));
  });
  resources.forEach(function (rk) {
    var p = prices[rk];
    var q = quotas[rk] || {};
    var todayParts = [];
    if (p.buy_price && q.buy_cap != null) {
      var buyUsed = q.buy_used || 0;
      todayParts.push('<span class="tg-cap' + (buyUsed >= q.buy_cap ? ' tg-cap-full' : '') + '" title="Bought from you today">b ' + buyUsed + '/' + q.buy_cap + '</span>');
    }
    if (p.sell_price && q.sell_cap != null) {
      var sellUsed = q.sell_used || 0;
      todayParts.push('<span class="tg-cap' + (sellUsed >= q.sell_cap ? ' tg-cap-full' : '') + '" title="Sold to you today">s ' + sellUsed + '/' + q.sell_cap + '</span>');
    }
    // Highlight if a player gate matches this row.
    var pol = state.tradePolicies && state.tradePolicies[rk];
    var buyHighlight = '';
    var sellHighlight = '';
    if (pol) {
      if (pol.mode === 'sell_surplus' && pol.min_sell_price != null && p.buy_price) {
        buyHighlight = (p.buy_price >= pol.min_sell_price) ? ' tg-meets' : ' tg-misses';
      }
      if (pol.mode === 'buy_to_reserve' && pol.max_buy_price != null && p.sell_price) {
        sellHighlight = (p.sell_price <= pol.max_buy_price) ? ' tg-meets' : ' tg-misses';
      }
    }
    html += '<tr>'
         +  '<td class="tg-res">' + escapeHtml(resourceName(rk)) + '</td>'
         +  '<td class="tg-buy' + buyHighlight + '">' + (p.buy_price ? '$' + p.buy_price : '—') + '</td>'
         +  '<td class="tg-sell' + sellHighlight + '">' + (p.sell_price ? '$' + p.sell_price : '—') + '</td>'
         +  '<td class="tg-today">' + todayParts.join(' ') + '</td>'
         +  '</tr>';
  });
  html += '</tbody></table>';
  return html;
}

// ── Black Market sub-tab ──
// Always available, every active resource. Sell at 35% of base_price,
// buy at 200% of base_price. Server (black_market_trade RPC) computes
// the same multipliers — UI just displays them so the player sees the
// terrible rate before committing.
function renderBlackMarketPanel() {
  var panel = document.getElementById('panel-trade-black_market');
  if (!panel) return;
  var html = '<div class="bm-section">';
  html += '<div class="bm-header"><span class="bm-title">Black Market</span></div>';
  html += '<div class="bm-warning">Always available. Buys anything from your inventory at 35% of fair value, sells anything to you at 200%. The emergency option.</div>';

  // Group resources for readability: raw → processed; food / luxury
  // pulled out so the list isn't 33 unsorted rows.
  var groups = [
    { label: 'Raw materials', filter: function (r) { return r.kind === 'raw' && !r.is_food; } },
    { label: 'Raw food',      filter: function (r) { return r.kind === 'raw' && r.is_food; } },
    { label: 'Processed',     filter: function (r) { return r.kind === 'processed' && !r.is_food && !r.is_luxury_food && !r.is_industrial_luxury; } },
    { label: 'Cooked food',   filter: function (r) { return r.kind === 'processed' && r.is_food && !r.is_luxury_food; } },
    { label: 'Lifestyle',     filter: function (r) { return r.kind === 'processed' && !r.is_food && !r.is_industrial_luxury && (r.key === 'tiles' || r.key === 'glass' || r.key === 'furniture' || r.key === 'statuary' || r.key === 'wine' || r.key === 'ale'); } },
    { label: 'Industrial luxury', filter: function (r) { return r.is_industrial_luxury; } },
    { label: 'Luxury food',   filter: function (r) { return r.is_luxury_food; } }
  ];
  var resources = Object.keys(state.resources || {})
    .map(function (k) { return state.resources[k]; })
    .filter(function (r) { return r.is_active && r.base_price; });

  groups.forEach(function (g) {
    var members = resources.filter(g.filter);
    if (members.length === 0) return;
    html += '<div class="bm-group-label">' + escapeHtml(g.label) + '</div>';
    members.sort(function (a, b) {
      return (a.base_price - b.base_price) || a.key.localeCompare(b.key);
    });
    members.forEach(function (r) {
      var rk = r.key;
      var sellPrice = Math.max(1, Math.floor(r.base_price * 0.35));
      var buyPrice = Math.ceil(r.base_price * 2.0);
      var stock = Math.floor((state.inventory && state.inventory[rk]) || 0);
      var sellKey = 'bm-sell-' + rk;
      var buyKey = 'bm-buy-' + rk;
      var sellAmt = state.blackMarketAmounts[sellKey] || 0;
      var buyAmt = state.blackMarketAmounts[buyKey] || 0;
      var maxBuy = buyPrice > 0 ? Math.floor((state.profile && state.profile.money || 0) / buyPrice) : 0;

      html += '<div class="bm-row">';
      html += '<div class="bm-row-header">';
      html += '<span class="bm-res-name">' + resourceName(rk) + '</span>';
      html += '<span class="bm-res-stock">Stock: ' + stock + '</span>';
      html += '</div>';
      html += '<div class="bm-prices">';
      html += '<span class="bm-price bm-price-sell">Sell at $' + sellPrice + '</span>';
      html += '<span class="bm-price bm-price-buy">Buy at $' + buyPrice + '</span>';
      html += '</div>';

      html += '<div class="bm-trade-row">';
      html += '<span class="bm-trade-label">Sell:</span>';
      html += '<div class="trade-controls">';
      html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="dec">-</button>';
      html += '<span class="trade-amt" id="bma-' + sellKey + '">' + sellAmt + '</span>';
      html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + sellKey + '" data-dir="inc" data-max="' + stock + '">+</button>';
      html += '<button class="btn-bm-sell" data-resource="' + rk + '" data-bmkey="' + sellKey + '"' + (sellAmt < 1 ? ' disabled' : '') + '>Sell</button>';
      html += '</div></div>';

      html += '<div class="bm-trade-row">';
      html += '<span class="bm-trade-label">Buy:</span>';
      html += '<div class="trade-controls">';
      html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="dec">-</button>';
      html += '<span class="trade-amt" id="bma-' + buyKey + '">' + buyAmt + '</span>';
      html += '<button class="trade-amt-btn bm-amt-btn" data-bmkey="' + buyKey + '" data-dir="inc" data-max="' + maxBuy + '">+</button>';
      html += '<button class="btn-bm-buy" data-resource="' + rk + '" data-bmkey="' + buyKey + '"' + (buyAmt < 1 ? ' disabled' : '') + '>Buy</button>';
      html += '</div></div>';

      html += '</div>';
    });
  });
  html += '</div>';
  panel.innerHTML = html;

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
  panel.querySelectorAll('.btn-bm-sell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var amt = state.blackMarketAmounts[btn.dataset.bmkey] || 0;
      if (amt < 1) return;
      blackMarketTrade(rk, amt, 'sell', btn);
    });
  });
  panel.querySelectorAll('.btn-bm-buy').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var amt = state.blackMarketAmounts[btn.dataset.bmkey] || 0;
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
// minSellPrice / maxBuyPrice are optional (null = no gate).
export function saveTradePolicy(resourceKey, mode, reserveTarget, minSellPrice, maxBuyPrice) {
  if (minSellPrice === undefined) minSellPrice = null;
  if (maxBuyPrice === undefined) maxBuyPrice = null;
  state.tradePolicies[resourceKey] = {
    mode: mode,
    reserve_target: reserveTarget,
    min_sell_price: minSellPrice,
    max_buy_price: maxBuyPrice
  };
  sb.rpc('save_trade_policy', {
    p_resource_key: resourceKey,
    p_mode: mode,
    p_reserve_target: reserveTarget,
    p_min_sell_price: minSellPrice,
    p_max_buy_price: maxBuyPrice
  }).then(function (r) {
    if (r.error) {
      showToast('Policy save failed: ' + r.error.message, 'error');
    }
  }).catch(function () {
    showToast('Policy save failed', 'error');
  });
}

// (Removed checkAllTraderVisits — vestigial from the pre-2026-05-06
// "Check All" button. Trader visits auto-resolve every process_production
// tick via _pp_resolve_trader_visits server-side. The standalone
// resolve_trader_visit RPC stays for the test suite's catch-up coverage.)

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
    updateCityRunway();

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
// (partners / players) and panel-city-<sub> for the City tab
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
  else if (sub === 'black_market') renderBlackMarketPanel();
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

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
