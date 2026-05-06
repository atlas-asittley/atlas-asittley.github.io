// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state, computeTraderUnlocks } from './state.js';
import { showToast, updateMoney } from './ui.js';
import { BLDG_LABELS, renderMap, cancelPlacement } from './map.js';
import { renderPlayersPanel, openTradeDialog } from './players.js';

function resourceName(key) {
  if (state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

// ── Build panel ──

// ── Build-panel sprite + accent-color maps (module-scope so they're not
//    rebuilt for every row of every render — ~150KB of SVG data URLs each). ──
import { colors, spriteIcons } from './sprites.js';

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
  var CATEGORY_ORDER = { road: 0, housing: 1, extractor: 2, food_extractor: 3, processor: 4, booster: 5, service: 6, tax: 7, police: 8 };
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
    return bt.industry_key === state.profile.industry_key || bt.industry_key === 'common';
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
      desc = 'Produces ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min. Needs road access.';
    } else if (bt.category === 'food_extractor') {
      var tileLabel = bt.placement_resource_node_key
        ? resourceName(bt.placement_resource_node_key).toLowerCase() + ' tile'
        : 'any open tile';
      desc = 'Produces ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min (a food). Place on a ' + tileLabel + '. Needs road access.';
    } else if (bt.category === 'booster') {
      var pct = Math.round(((bt.boost_multiplier || 1) - 1) * 100);
      var targetText = bt.boost_target === 'food_extractor' ? 'food extractors' : 'extractors';
      desc = '+' + pct + '% output to your ' + targetText + ' within ' + (bt.boost_range || 2) + ' tiles. Must be staffed. Needs road access.';
    } else if (bt.category === 'service') {
      if (key === 'well') {
        desc = 'Lets housing within 4 tiles upgrade past tier 0. Needs road + 3 workers.';
      } else if (key === 'tavern') {
        desc = 'Consumes bread + pottery while staffed; +10 worker capacity. Needs road.';
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
    } else {
      // Processor (catchall): list every required input including the
      // optional second input. Without this, dual-input processors like
      // cabinetmaker (furniture + lime) and architect (statuary + glass)
      // hide the second prereq from the player.
      var inParts = [bt.input_rate + ' ' + resourceName(bt.input_resource_key).toLowerCase()];
      if (bt.input_resource_key_2) {
        var rate2 = (bt.input_rate_2 != null) ? bt.input_rate_2 : bt.input_rate;
        inParts.push(rate2 + ' ' + resourceName(bt.input_resource_key_2).toLowerCase());
      }
      desc = inParts.join(' + ') + ' \u2192 ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min. Needs road access.';
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
function computeNetRates() {
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

  return rates;
}

function rateLabel(rate) {
  if (!rate) return '';
  var sign = rate > 0 ? '+' : '';
  var color = rate > 0 ? '#5ec49e' : '#f0a0a0';
  var val = Math.round(rate * 100) / 100;
  return ' <span style="font-size:0.68rem;color:' + color + '">' + sign + val + '/m</span>';
}

export function renderInventory() {
  var panel = document.getElementById('panel-inventory');
  var html = '';
  var rates = computeNetRates();

  // Build resource lists dynamically from loaded resources
  var rawKeys = [];
  var processedKeys = [];
  Object.keys(state.resources).forEach(function (k) {
    var r = state.resources[k];
    if (r.kind === 'raw') rawKeys.push(k);
    else if (r.kind === 'processed') processedKeys.push(k);
  });

  html += '<div class="inv-section">Raw Materials</div>';
  rawKeys.forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + rateLabel(rates[k]) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Processed Goods</div>';
  processedKeys.forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + rateLabel(rates[k]) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Economy</div>';
  html += '<div class="inv-row"><span class="inv-name">Money</span><span class="inv-qty" style="color:#e6c65a;">$' + state.profile.money + '</span></div>';

  var myBldgs = state.allBuildings.filter(function (b) { return b.player_id === state.currentUser.id; });
  html += '<div class="inv-row"><span class="inv-name">Your Buildings</span><span class="inv-qty">' + myBldgs.length + '</span></div>';

  // ── Housing tiers section ──
  var tierCounts = {};
  var totalHouses = 0;
  myBldgs.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'housing') {
      var t = b.housing_tier !== undefined ? b.housing_tier : 1;
      tierCounts[t] = (tierCounts[t] || 0) + 1;
      totalHouses++;
    }
  });
  if (totalHouses > 0) {
    html += '<div class="inv-section">Housing</div>';
    Object.keys(tierCounts).sort().forEach(function (t) {
      var cfg = state.housingTierConfig[t];
      var tierName = cfg ? cfg.name : 'Tier ' + t;
      var tierWorkers = cfg ? cfg.workers : '?';
      html += '<div class="inv-row"><span class="inv-name">' + tierName + ' (' + tierWorkers + 'w each)</span><span class="inv-qty">' + tierCounts[t] + '</span></div>';
    });
  }

  // ── Roads section ──
  var disconnectedCount = Object.keys(state.noRoadAccessIds).length;
  if (disconnectedCount > 0) {
    html += '<div class="inv-section">Roads</div>';
    html += '<div class="inv-row labor-shortage-row"><span class="inv-name" style="color:#d4a040;">Disconnected Buildings</span><span class="inv-qty" style="color:#d4a040;">' + disconnectedCount + '</span></div>';
    html += '<div class="labor-shortage-hint" style="color:#8a7a5a;">Place roads next to buildings that need them.</div>';
  }

  // ── Labor section ──
  var li = state.laborInfo;
  html += '<div class="inv-section">Labor</div>';
  html += '<div class="inv-row"><span class="inv-name">Worker Supply</span><span class="inv-qty" style="color:#5ec49e;">' + li.workerSupply + '</span></div>';
  html += '<div class="inv-row"><span class="inv-name">Workers Needed</span><span class="inv-qty">' + li.workersNeeded + '</span></div>';
  html += '<div class="inv-row"><span class="inv-name">Employed</span><span class="inv-qty">' + li.workersUsed + '</span></div>';
  if (li.workersIdle > 0) {
    html += '<div class="inv-row"><span class="inv-name">Idle</span><span class="inv-qty" style="color:#e6c65a;">' + li.workersIdle + '</span></div>';
  }
  if (li.laborShortage) {
    var shortage = li.workersNeeded - li.workerSupply;
    html += '<div class="inv-row labor-shortage-row"><span class="inv-name" style="color:#f06060;">Labor Shortage!</span><span class="inv-qty" style="color:#f06060;">' + shortage + ' workers short</span></div>';
    html += '<div class="labor-shortage-hint">Build housing to increase worker supply.</div>';
  }

  panel.innerHTML = html;
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
        if (diff <= 0) {
          visitLabel = '<span class="partner-tab-due">Due!</span>';
        } else {
          visitLabel = '<span class="partner-tab-timer">~' + Math.ceil(diff / 60000) + 'm</span>';
        }
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

  // ── Check All Visits button (only unlocked traders) ──
  var unlockedKeys = traderKeys.filter(function (tk) {
    return !state.unlockedTraders[tk] || state.unlockedTraders[tk].unlocked;
  });
  html += '<div class="visit-status">';
  var anyDue = unlockedKeys.some(function (tk) {
    var nv = state.nextVisitAts[tk];
    return nv && nv.getTime() <= Date.now();
  });
  if (anyDue) {
    html += '<span class="visit-due">Trade visits available!</span>';
  } else {
    // Show time until next visit across unlocked traders
    var soonest = null;
    unlockedKeys.forEach(function (tk) {
      var nv = state.nextVisitAts[tk];
      if (nv && (!soonest || nv.getTime() < soonest)) {
        soonest = nv.getTime();
      }
    });
    if (soonest) {
      var mins = Math.ceil((soonest - Date.now()) / 60000);
      html += '<span class="visit-timer">Next visit in ~' + mins + ' min</span>';
    } else {
      html += '<span class="visit-timer">Next visit: soon</span>';
    }
  }
  html += ' <button class="btn-check-visit" id="btn-check-visit">Check All</button>';
  html += '</div>';

  // ── Selected partner detail ──
  html += '<div class="partner-detail">';
  html += '<div class="trader-header">' + trader.name + '</div>';
  html += '<div class="trader-desc">' + (trader.description || '') + '</div>';

  // Visit status for selected partner
  var selectedNextVisit = state.nextVisitAts[state.selectedTrader];
  if (selectedNextVisit) {
    var sdiff = selectedNextVisit.getTime() - Date.now();
    html += '<div class="partner-visit-info">';
    if (sdiff <= 0) {
      html += '<span class="visit-due">Visit due now!</span>';
    } else {
      html += '<span class="visit-timer">Next visit in ~' + Math.ceil(sdiff / 60000) + ' min</span>';
    }
    html += '</div>';
  }

  // Last visit summary for selected partner
  html += renderVisitSummary(state.selectedTrader);

  // Goods this partner trades
  html += renderPartnerGoods(state.selectedTrader);

  html += '</div>';

  // ── Trade Policies (global, with selected partner prices) ──
  html += '<div class="trade-section-label">Trade Policies</div>';
  html += '<div class="trade-policy-note">Policies apply to all partners. Each partner only trades goods they support.</div>';
  var tradeResources = ['timber', 'lumber', 'stone', 'brick', 'grain', 'flour'];
  tradeResources.forEach(function (rk) {
    var stock = Math.floor(state.inventory[rk] || 0);
    var policy = state.tradePolicies[rk] || { mode: 'keep', reserve_target: 0 };
    var supportingPartners = [];
    var bestBuyPrice = null;   // what a partner pays player
    var bestSellPrice = null;  // what a partner charges player

    // Only count unlocked partners for best prices and "Handled by"
    unlockedKeys.forEach(function (tk) {
      var partnerPrices = state.allTraderPrices[tk] || {};
      var partnerPrice = partnerPrices[rk];
      if (!partnerPrice) return;

      supportingPartners.push(state.traders[tk] ? state.traders[tk].name : tk);

      if (partnerPrice.buy_price && (bestBuyPrice === null || partnerPrice.buy_price > bestBuyPrice)) {
        bestBuyPrice = partnerPrice.buy_price;
      }
      if (partnerPrice.sell_price && (bestSellPrice === null || partnerPrice.sell_price < bestSellPrice)) {
        bestSellPrice = partnerPrice.sell_price;
      }
    });

    html += '<div class="policy-row" data-resource="' + rk + '">';
    html += '<div class="policy-header">';
    html += '<span class="policy-res">' + resourceName(rk) + '</span>';
    html += '<span class="policy-stock">Stock: ' + stock + '</span>';
    html += '</div>';

    html += '<div class="policy-prices">';
    if (bestBuyPrice !== null) html += '<span class="policy-price sell-price">Best partner buy: ' + bestBuyPrice + 'g</span>';
    if (bestSellPrice !== null) html += '<span class="policy-price buy-price">Best partner sell: ' + bestSellPrice + 'g</span>';
    if (supportingPartners.length === 0) {
      html += '<span class="policy-price not-traded-label">No active partner currently trades this</span>';
    }
    html += '</div>';

    if (supportingPartners.length > 0) {
      html += '<div class="policy-prices"><span class="policy-price not-traded-label">Handled by: ' + supportingPartners.join(', ') + '</span></div>';
    }

    html += '<div class="policy-controls">';
    html += '<select class="policy-mode-select" data-resource="' + rk + '">';
    html += '<option value="keep"' + (policy.mode === 'keep' ? ' selected' : '') + '>Keep</option>';
    html += '<option value="sell_surplus"' + (policy.mode === 'sell_surplus' ? ' selected' : '') + '>Sell Surplus</option>';
    html += '<option value="buy_to_reserve"' + (policy.mode === 'buy_to_reserve' ? ' selected' : '') + '>Buy to Reserve</option>';
    html += '</select>';
    html += '<div class="policy-reserve-wrap">';
    html += '<label class="policy-reserve-label">Reserve:</label>';
    html += '<input type="number" class="policy-reserve-input" data-resource="' + rk + '" min="0" max="999" value="' + policy.reserve_target + '"' + (policy.mode === 'keep' ? ' disabled' : '') + '>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  });

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

  // ── Wire policy mode selects ──
  panel.querySelectorAll('.policy-mode-select').forEach(function (sel) {
    sel.addEventListener('change', function () {
      var rk = sel.dataset.resource;
      var mode = sel.value;
      var row = sel.closest('.policy-row');
      var reserveInput = row.querySelector('.policy-reserve-input');
      reserveInput.disabled = (mode === 'keep');
      var reserve = parseInt(reserveInput.value) || 0;
      saveTradePolicy(rk, mode, reserve);
    });
  });

  // ── Wire reserve inputs ──
  panel.querySelectorAll('.policy-reserve-input').forEach(function (inp) {
    var debounceTimer = null;
    inp.addEventListener('input', function () {
      var rk = inp.dataset.resource;
      var reserve = Math.max(0, parseInt(inp.value) || 0);
      var row = inp.closest('.policy-row');
      var mode = row.querySelector('.policy-mode-select').value;
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () {
        saveTradePolicy(rk, mode, reserve);
      }, 600);
    });
  });

  // ── Wire check-all button ──
  var checkBtn = document.getElementById('btn-check-visit');
  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      checkBtn.disabled = true;
      checkBtn.textContent = '...';
      checkAllTraderVisits();
    });
  }

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

  var html = '<div class="partner-goods">';
  html += '<div class="partner-goods-title">Traded Goods</div>';
  resources.forEach(function (rk) {
    var p = prices[rk];
    var parts = [];
    if (p.buy_price) parts.push('<span class="pg-sell">Buys at ' + p.buy_price + 'g</span>');
    if (p.sell_price) parts.push('<span class="pg-buy">Sells at ' + p.sell_price + 'g</span>');
    html += '<div class="partner-goods-item">';
    html += '<span class="partner-goods-name">' + resourceName(rk) + '</span>';
    html += '<span class="partner-goods-prices">' + parts.join(' &middot; ') + '</span>';
    html += '</div>';
  });
  html += '</div>';
  return html;
}

function saveTradePolicy(resourceKey, mode, reserveTarget) {
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
      renderInventory();
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

    renderInventory();
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

// ── Panel collapse toggle ──
export function initPanelCollapse() {
  var btn = document.getElementById('panel-collapse');
  var panel = document.getElementById('bottom-panel');
  if (!btn || !panel) return;

  function syncLabel() {
    btn.textContent = panel.classList.contains('collapsed') ? 'Show panel ▴' : 'Hide panel ▾';
  }

  syncLabel();
  btn.addEventListener('click', function () {
    panel.classList.toggle('collapsed');
    syncLabel();
  });
}

// ── Tab system ──
export function initTabs() {
  document.querySelectorAll('.tab-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.tab-btn').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.panel-content').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var tabId = 'panel-' + btn.dataset.tab;
      document.getElementById(tabId).classList.add('active');

      if (btn.dataset.tab === 'inventory') renderInventory();
      else if (btn.dataset.tab === 'trade') renderTradeTab();
      else if (btn.dataset.tab === 'build') renderBuildPanel();
    });
  });

  // Sub-tab switching inside the Trade tab.
  document.querySelectorAll('.trade-subtab').forEach(function (btn) {
    btn.addEventListener('click', function () {
      document.querySelectorAll('.trade-subtab').forEach(function (b) { b.classList.remove('active'); });
      document.querySelectorAll('.trade-subpanel').forEach(function (p) { p.classList.remove('active'); });
      btn.classList.add('active');
      var subId = 'panel-trade-' + btn.dataset.subtab;
      document.getElementById(subId).classList.add('active');
      renderTradeSubpanel(btn.dataset.subtab);
    });
  });
}

// Render the trade tab + currently-active sub-panel.
export function renderTradeTab() {
  var active = document.querySelector('.trade-subtab.active');
  var sub = active ? active.dataset.subtab : 'partners';
  renderTradeSubpanel(sub);
}

function renderTradeSubpanel(sub) {
  if (sub === 'partners') renderTradePanel();
  else if (sub === 'missions') renderMissionsPanel();
  else if (sub === 'players') renderPlayersPanel();
  else if (sub === 'resources') renderResourcesPanel();
  else if (sub === 'treasury') renderTreasuryPanel();
}

// ── Trade-unlock gate (client-side mirror of is_trade_unlocked) ──
// Cheap local check; the server is authoritative on actual RPC calls.
function computeTradeUnlockState() {
  var mine = (state.allBuildings || []).filter(function (b) {
    return b.player_id === state.currentUser.id && b.status === 'active';
  });
  var hasExtractor = mine.some(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'extractor';
  });
  var hasFoodExt = mine.some(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'food_extractor';
  });
  var hasTier1 = mine.some(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    return bt && bt.category === 'housing' && (b.housing_tier || 0) >= 1;
  });
  return {
    unlocked: hasExtractor && hasFoodExt && hasTier1,
    hasExtractor: hasExtractor,
    hasFoodExt: hasFoodExt,
    hasTier1: hasTier1
  };
}

function renderLockedTradeHtml(info) {
  function row(ok, label) {
    return '<div class="trade-lock-row">'
         + '<span class="trade-lock-icon">' + (ok ? '✔' : '○') + '</span>'
         + '<span class="trade-lock-label">' + label + '</span>'
         + '</div>';
  }
  return '<div class="trade-lock">'
       + '<div class="trade-lock-title">Develop your district to unlock trade</div>'
       + '<div class="trade-lock-body">'
       + 'Outside cities won’t come trading until your district can produce on its own. '
       + 'You need:'
       + '</div>'
       + row(info.hasExtractor, 'Build at least one resource extractor')
       + row(info.hasFoodExt, 'Build at least one food extractor (orchard, fishing pier, garden, or grain farm)')
       + row(info.hasTier1, 'Upgrade a house to tier 1 (Hut)')
       + '<div class="trade-lock-hint">The black market is always open if you really need to offload goods, but its rates are intentionally bad.</div>'
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
            renderInventory();
          });
          renderMissionsPanel();
        });
      });
    });
  });
}

// ── Resources sub-tab ──
// One row per known resource:
//   icon · name · production rate · inventory · imports / exports / net $
// Click a row to drill down into a per-partner breakdown for that resource.

function renderResourcesPanel() {
  var panel = document.getElementById('panel-trade-resources');
  var period = state.tradeStatsPeriod || 'today';
  panel.innerHTML = renderPeriodToggleHtml(period) + '<div class="trade-loading">Loading…</div>';
  wirePeriodToggle(panel, function (p) { state.tradeStatsPeriod = p; renderResourcesPanel(); });

  fetchTradeFlows(period).then(function (flows) {
    var rates = computeNetRates();
    var rows = buildResourceRows(rates, flows);
    if (rows.length === 0) {
      replaceLoading(panel, '<div class="trade-empty">No resources or trade activity yet.</div>');
      return;
    }
    var html = '<div class="rsrc-table">'
      + '<div class="rsrc-tr rsrc-thead">'
      + '<span class="rsrc-icon"></span>'
      + '<span class="rsrc-name">Resource</span>'
      + '<span class="rsrc-rate">Rate</span>'
      + '<span class="rsrc-stock">Stock</span>'
      + '<span class="rsrc-net">Net $</span>'
      + '</div>';
    rows.forEach(function (row) {
      var netClass = row.net > 0 ? 'good' : row.net < 0 ? 'bad' : '';
      html += '<div class="rsrc-tr" data-resource="' + escapeHtml(row.key) + '">'
            + '<span class="rsrc-icon ' + resIconClass(row.key) + '"></span>'
            + '<span class="rsrc-name">' + escapeHtml(row.name) + '</span>'
            + '<span class="rsrc-rate">' + (row.rate ? formatRate(row.rate) : '—') + '</span>'
            + '<span class="rsrc-stock">' + row.stock + '</span>'
            + '<span class="rsrc-net ' + netClass + '">' + (row.net === 0 ? '—' : (row.net > 0 ? '+$' : '−$') + Math.abs(row.net)) + '</span>'
            + '</div>'
            + '<div class="rsrc-detail" id="rsrc-detail-' + escapeHtml(row.key) + '" style="display:none;"></div>';
    });
    html += '</div>';
    replaceLoading(panel, html);

    panel.querySelectorAll('.rsrc-tr[data-resource]').forEach(function (tr) {
      tr.addEventListener('click', function () {
        var rk = tr.dataset.resource;
        var detail = document.getElementById('rsrc-detail-' + rk);
        if (!detail) return;
        if (detail.style.display === 'none') {
          detail.innerHTML = renderResourceDrilldownHtml(rk, flows);
          detail.style.display = 'block';
          tr.classList.add('expanded');
          // Wire any per-partner trade buttons inside the drilldown.
          detail.querySelectorAll('.btn-rsrc-trade').forEach(function (btn) {
            btn.addEventListener('click', function (e) {
              e.stopPropagation();
              openTradeDialog(btn.dataset.playerId, btn.dataset.playerName);
            });
          });
        } else {
          detail.style.display = 'none';
          tr.classList.remove('expanded');
        }
      });
    });
  }).catch(function (err) {
    replaceLoading(panel, '<div class="trade-error">Failed to load: ' + escapeHtml(err.message || err) + '</div>');
  });
}

function buildResourceRows(rates, flows) {
  // Build the full set of resources that the player either has, produces,
  // consumes, or has traded recently. Skip terrain.
  var seen = {};
  Object.keys(state.resources || {}).forEach(function (k) {
    var r = state.resources[k];
    if (r && r.kind !== 'terrain') seen[k] = true;
  });
  var rows = Object.keys(seen).map(function (k) {
    var r = state.resources[k] || {};
    var stock = Math.floor((state.inventory && state.inventory[k]) || 0);
    var rate = rates[k] || 0;
    var f = flows.byResource[k] || { import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
    return {
      key: k,
      name: resourceName(k),
      stock: stock,
      rate: rate,
      import_qty: f.import_qty,
      import_money: f.import_money,
      export_qty: f.export_qty,
      export_money: f.export_money,
      net: (f.export_money || 0) - (f.import_money || 0),
      kind: r.kind || 'other'
    };
  });
  // Sort: anything with rate or stock or trade volume first, alphabetical within.
  rows.sort(function (a, b) {
    var aActive = a.stock > 0 || a.rate !== 0 || a.import_qty > 0 || a.export_qty > 0;
    var bActive = b.stock > 0 || b.rate !== 0 || b.import_qty > 0 || b.export_qty > 0;
    if (aActive !== bActive) return aActive ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
  return rows;
}

function renderResourceDrilldownHtml(resourceKey, flows) {
  var byPartner = (flows.byPartner[resourceKey] || []).slice();
  byPartner.sort(function (a, b) { return (b.export_qty + b.import_qty) - (a.export_qty + a.import_qty); });
  if (byPartner.length === 0) {
    return '<div class="rsrc-detail-empty">No trade activity for this resource in the selected period.</div>';
  }
  var html = '<div class="rsrc-detail-table">';
  html += '<div class="rsrc-detail-tr rsrc-detail-thead"><span>Partner</span><span>You sent</span><span>You got</span><span class="rsrc-detail-act"></span></div>';
  byPartner.forEach(function (p) {
    var act = '';
    if (p.kind === 'player' && p.player_id) {
      act = '<button class="btn-rsrc-trade" data-player-id="' + escapeHtml(p.player_id) + '" data-player-name="' + escapeHtml(p.name) + '">Trade</button>';
    }
    var sent = p.export_qty > 0 ? p.export_qty + ' (+$' + p.export_money + ')' : '—';
    var got = p.import_qty > 0 ? p.import_qty + ' (−$' + p.import_money + ')' : '—';
    html += '<div class="rsrc-detail-tr"><span>' + escapeHtml(p.name) + '</span><span class="good">' + sent + '</span><span class="bad">' + got + '</span><span class="rsrc-detail-act">' + act + '</span></div>';
  });
  html += '</div>';
  return html;
}

// ── Treasury sub-tab ──

function renderTreasuryPanel() {
  var panel = document.getElementById('panel-trade-treasury');
  var period = state.tradeStatsPeriod || 'today';
  panel.innerHTML = renderPeriodToggleHtml(period) + '<div class="trade-loading">Loading…</div>';
  wirePeriodToggle(panel, function (p) { state.tradeStatsPeriod = p; renderTreasuryPanel(); });

  Promise.all([fetchTradeFlows(period), fetchCashLedger(period)]).then(function (results) {
    var flows = results[0];
    var ledger = results[1];
    var earnedBySource = Object.assign({}, flows.earnedBySource);
    var spentByDest = Object.assign({}, flows.spentByDest);
    // Merge cash-ledger entries — tax_revenue / build_cost / expansion_cost / etc.
    Object.keys(ledger.bySource).forEach(function (s) {
      var amt = ledger.bySource[s];
      if (amt > 0) earnedBySource[s] = (earnedBySource[s] || 0) + amt;
      else if (amt < 0) spentByDest[s] = (spentByDest[s] || 0) + (-amt);
    });
    var totalIn = Object.keys(earnedBySource).reduce(function (s, k) { return s + earnedBySource[k]; }, 0);
    var totalOut = Object.keys(spentByDest).reduce(function (s, k) { return s + spentByDest[k]; }, 0);

    var html = '<div class="stats-summary">';
    html += '<div class="stats-row"><span class="stats-label">Earned</span><span class="stats-val good">$' + totalIn + '</span></div>';
    html += '<div class="stats-row"><span class="stats-label">Spent</span><span class="stats-val bad">$' + totalOut + '</span></div>';
    html += '<div class="stats-row"><span class="stats-label">Net</span><span class="stats-val ' + ((totalIn - totalOut) >= 0 ? 'good' : 'bad') + '">$' + (totalIn - totalOut) + '</span></div>';
    html += '</div>';

    if (Object.keys(earnedBySource).length) {
      html += '<div class="stats-section-title">Income sources</div><div class="stats-table">';
      Object.keys(earnedBySource).sort(function (a, b) { return earnedBySource[b] - earnedBySource[a]; })
        .forEach(function (k) {
          html += '<div class="stats-tr"><span>' + escapeHtml(prettySource(k)) + '</span><span class="good">$' + earnedBySource[k] + '</span></div>';
        });
      html += '</div>';
    }
    if (Object.keys(spentByDest).length) {
      html += '<div class="stats-section-title">Spending</div><div class="stats-table">';
      Object.keys(spentByDest).sort(function (a, b) { return spentByDest[b] - spentByDest[a]; })
        .forEach(function (k) {
          html += '<div class="stats-tr"><span>' + escapeHtml(prettySource(k)) + '</span><span class="bad">$' + spentByDest[k] + '</span></div>';
        });
      html += '</div>';
    }
    if (totalIn === 0 && totalOut === 0) {
      html += '<div class="trade-empty">No money has moved in this period.</div>';
    }
    replaceLoading(panel, html);
  }).catch(function (err) {
    replaceLoading(panel, '<div class="trade-error">Failed to load: ' + escapeHtml(err.message || err) + '</div>');
  });
}

function prettySource(k) {
  if (k === 'black_market') return 'Black Market';
  if (k === 'player_trade') return 'Player Trade';
  if (k === 'tax_revenue') return 'Tax Revenue';
  if (k === 'build_cost') return 'Building Construction';
  if (k === 'expansion_cost') return 'District Expansion';
  if (k === 'starting_grant') return 'Starting Grant';
  if (k === 'demolish_refund') return 'Demolish Refund';
  return (state.traders && state.traders[k] && state.traders[k].name) || k;
}

// Fetch cash_transactions for the period and aggregate by source.
function fetchCashLedger(period) {
  var since;
  if (period === 'today') {
    var d = new Date(); d.setHours(0, 0, 0, 0); since = d.toISOString();
  } else if (period === 'week') {
    since = new Date(Date.now() - 7 * 86400000).toISOString();
  } else {
    since = '1970-01-01T00:00:00Z';
  }
  return sb.from('cash_transactions')
    .select('source, amount').gte('created_at', since)
    .then(function (r) {
      var bySource = {};
      (r.data || []).forEach(function (row) {
        bySource[row.source] = (bySource[row.source] || 0) + row.amount;
      });
      return { bySource: bySource };
    });
}

function resIconClass(key) {
  // Map a resource key to a CSS class that picks up .res-X { background } rules.
  return 'res-icon-' + key;
}

function formatRate(r) {
  var sign = r > 0 ? '+' : '−';
  var abs = Math.abs(r);
  var disp = abs >= 10 ? abs.toFixed(0) : abs.toFixed(1);
  return sign + disp + '/min';
}

// ── Period toggle helpers (shared by Resources + Treasury) ──

function renderPeriodToggleHtml(period) {
  return '<div class="stats-period-row">'
    + ['today','week','all'].map(function (p) {
        var label = p === 'today' ? 'Today' : p === 'week' ? 'Week' : 'All time';
        return '<button class="stats-period-btn' + (period === p ? ' active' : '') + '" data-period="' + p + '">' + label + '</button>';
      }).join('')
    + '</div>';
}

function wirePeriodToggle(panel, onChange) {
  panel.querySelectorAll('.stats-period-btn').forEach(function (b) {
    b.addEventListener('click', function () { onChange(b.dataset.period); });
  });
}

function replaceLoading(panel, newHtml) {
  var ex = panel.querySelector('.trade-loading') || panel.querySelector('.trade-error');
  if (ex) ex.outerHTML = newHtml;
  else {
    var body = document.createElement('div');
    body.innerHTML = newHtml;
    panel.appendChild(body);
  }
}

// ── Trade-flow aggregation ──
// Walks the player's trade_transactions + accepted player_trade_offers
// in the period and rolls up per-resource and per-partner numbers.
function fetchTradeFlows(period) {
  var since;
  if (period === 'today') {
    var d = new Date(); d.setHours(0, 0, 0, 0); since = d.toISOString();
  } else if (period === 'week') {
    since = new Date(Date.now() - 7 * 86400000).toISOString();
  } else {
    since = '1970-01-01T00:00:00Z';
  }
  var uid = state.currentUser.id;

  var pTrans = sb.from('trade_transactions')
    .select('*').eq('player_id', uid).gte('created_at', since);
  var pOffers = sb.from('player_trade_offers')
    .select('*').eq('status', 'accepted').gte('resolved_at', since)
    .or('from_player_id.eq.' + uid + ',to_player_id.eq.' + uid);

  return Promise.all([pTrans, pOffers]).then(function (results) {
    var allOffers = results[1].data || [];
    // Resolve counterparty display names via a single follow-up query.
    var ids = {};
    allOffers.forEach(function (o) {
      if (o.from_player_id !== uid) ids[o.from_player_id] = true;
      if (o.to_player_id !== uid) ids[o.to_player_id] = true;
    });
    var idList = Object.keys(ids);
    var pNames = idList.length > 0
      ? sb.from('player_profiles').select('id, display_name').in('id', idList)
      : Promise.resolve({ data: [] });

    return pNames.then(function (np) {
      var nameMap = {};
      (np.data || []).forEach(function (p) { nameMap[p.id] = p.display_name; });
      return aggregateTradeFlows(uid, results[0].data || [], allOffers, nameMap);
    });
  });
}

function aggregateTradeFlows(uid, transactions, offers, nameMap) {
    var byResource = {};       // resource_key → {import_qty, import_money, export_qty, export_money}
    var byPartner = {};        // resource_key → [{name, kind, player_id, import_qty, import_money, export_qty, export_money}]
    var earnedBySource = {};   // partner-key → $
    var spentByDest = {};      // partner-key → $

    function bumpResource(rk, dir, qty, money) {
      var b = byResource[rk] = byResource[rk] || { import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
      if (dir === 'import') { b.import_qty += qty; b.import_money += money; }
      else { b.export_qty += qty; b.export_money += money; }
    }
    function bumpPartner(rk, partnerKey, partnerName, kind, playerId, dir, qty, money) {
      byPartner[rk] = byPartner[rk] || [];
      var existing = byPartner[rk].find(function (p) { return p.partnerKey === partnerKey; });
      if (!existing) {
        existing = { partnerKey: partnerKey, name: partnerName, kind: kind, player_id: playerId,
                     import_qty: 0, import_money: 0, export_qty: 0, export_money: 0 };
        byPartner[rk].push(existing);
      }
      if (dir === 'import') { existing.import_qty += qty; existing.import_money += money; }
      else { existing.export_qty += qty; existing.export_money += money; }
    }
    function bumpCash(target, partnerKey, amount) {
      target[partnerKey] = (target[partnerKey] || 0) + amount;
    }

    // Trade transactions: NPC + black market.
    transactions.forEach(function (t) {
      var isExport = t.transaction_type === 'sell';
      var dir = isExport ? 'export' : 'import';
      bumpResource(t.resource_key, dir, t.quantity, t.total_price);
      var traderName = (state.traders && state.traders[t.trader_key] && state.traders[t.trader_key].name)
                     || prettySource(t.trader_key);
      bumpPartner(t.resource_key, t.trader_key, traderName, 'npc', null, dir, t.quantity, t.total_price);
      if (isExport) bumpCash(earnedBySource, t.trader_key, t.total_price);
      else bumpCash(spentByDest, t.trader_key, t.total_price);
    });

    // Player trades. Each accepted offer touches both sides' books.
    offers.forEach(function (o) {
      var iAmSender = o.from_player_id === uid;
      var counterpartyId = iAmSender ? o.to_player_id : o.from_player_id;
      var counterpartyKey = 'player:' + counterpartyId;
      var counterpartyName = nameMap[counterpartyId] || 'Player';

      var giveRes = o.give_resources || {};
      var recvRes = o.receive_resources || {};
      // Sender exports give_*; recipient exports receive_*.
      var myExports = iAmSender ? giveRes : recvRes;
      var myImports = iAmSender ? recvRes : giveRes;
      var myCashOut = iAmSender ? (o.give_money || 0) : (o.receive_money || 0);
      var myCashIn  = iAmSender ? (o.receive_money || 0) : (o.give_money || 0);

      Object.keys(myExports).forEach(function (rk) {
        var qty = parseInt(myExports[rk], 10) || 0;
        if (qty <= 0) return;
        bumpResource(rk, 'export', qty, 0);
        bumpPartner(rk, counterpartyKey, counterpartyName, 'player', counterpartyId, 'export', qty, 0);
      });
      Object.keys(myImports).forEach(function (rk) {
        var qty = parseInt(myImports[rk], 10) || 0;
        if (qty <= 0) return;
        bumpResource(rk, 'import', qty, 0);
        bumpPartner(rk, counterpartyKey, counterpartyName, 'player', counterpartyId, 'import', qty, 0);
      });
      if (myCashIn > 0) bumpCash(earnedBySource, 'player_trade', myCashIn);
      if (myCashOut > 0) bumpCash(spentByDest, 'player_trade', myCashOut);
    });

    return { byResource: byResource, byPartner: byPartner,
             earnedBySource: earnedBySource, spentByDest: spentByDest };
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
