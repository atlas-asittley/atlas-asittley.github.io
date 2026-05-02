// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state, computeTraderUnlocks } from './state.js';
import { showToast } from './ui.js';
import { BLDG_LABELS, renderMap } from './map.js';

function resourceName(key) {
  if (state.resources[key]) return state.resources[key].name;
  return key ? key.charAt(0).toUpperCase() + key.slice(1) : '';
}

// ── Build panel ──
export function renderBuildPanel() {
  var panel = document.getElementById('panel-build');
  var html = '';

  var available = Object.keys(state.buildingTypes).filter(function (k) {
    var bt = state.buildingTypes[k];
    return bt.industry_key === state.profile.industry_key || bt.industry_key === 'common';
  }).sort(function (a, b) {
    var btA = state.buildingTypes[a];
    var btB = state.buildingTypes[b];
    // Roads first, then housing, then by tier
    var order = { road: 0, housing: 1 };
    var oa = order[btA.category] !== undefined ? order[btA.category] : 2;
    var ob = order[btB.category] !== undefined ? order[btB.category] : 2;
    if (oa !== ob) return oa - ob;
    return btA.tier - btB.tier;
  });

  if (available.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:20px;">No buildings available for your industry.</div>';
    panel.innerHTML = html;
    return;
  }

  var li = state.laborInfo;

  available.forEach(function (key) {
    var bt = state.buildingTypes[key];
    var canAfford = state.profile.money >= bt.build_cost;
    // Only money blocks placement now — workers are soft constraint
    var disabled = !canAfford;
    var selected = state.selectedBuildType === key;

    var colors = {
      timber_camp: '#3a7a4a', sawmill: '#7a5a2a',
      stone_quarry: '#5a5a7a', mason_workshop: '#7a4a3a',
      grain_farm: '#5a7a3a', mill: '#6a5a4a',
      clay_pit: '#8a5a3a', pottery_kiln: '#7a4a4a',
      bakery: '#8a7a3a', woodcarver: '#5a6a3a', sculptor: '#6a5a7a',
      house: '#4a6a8a', road: '#6a6a5a'
    };
    var spriteIcons = {
      timber_camp: 'assets/sprites/icons/timber_camp.png',
      sawmill: 'assets/sprites/icons/sawmill.png',
      stone_quarry: 'assets/sprites/icons/stone_quarry.png',
      mason_workshop: 'assets/sprites/icons/mason_workshop.png',
      house: 'assets/sprites/icons/house_t1.png',
      road: 'assets/sprites/icons/road.png'
    };
    var bgColor = colors[key] || '#4a4a6a';
    var spriteUrl = spriteIcons[key] || null;
    var label = BLDG_LABELS[key] || '?';

    var desc;
    if (bt.category === 'road') {
      desc = 'Connects buildings to the city. Housing and processors need road access.';
    } else if (bt.category === 'housing') {
      desc = 'Starts as Shanty (2 workers). Upgrades to Mud Hut (6 workers) with road access.';
    } else if (bt.category === 'extractor') {
      desc = 'Produces ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min';
    } else {
      desc = bt.input_rate + ' ' + resourceName(bt.input_resource_key).toLowerCase() + ' \u2192 ' + bt.output_rate + ' ' + resourceName(bt.output_resource_key).toLowerCase() + '/min (road required)';
    }

    var costStr;
    var costClass = 'build-cost';
    if (bt.category === 'road') {
      costStr = '$' + bt.build_cost + ' | no workers';
    } else if (bt.category === 'housing') {
      costStr = '$' + bt.build_cost + ' | +2 workers (upgradable to +6)';
    } else {
      costStr = '$' + bt.build_cost + ' | ' + bt.worker_cost + ' worker';
    }

    if (!canAfford) {
      costStr = '$' + bt.build_cost + ' (need $' + (bt.build_cost - state.profile.money) + ' more)';
      costClass += ' warn';
    } else if (bt.category !== 'housing' && bt.category !== 'road' && li.workerSupply - li.workersNeeded < bt.worker_cost) {
      costStr += ' (no workers — will be inactive)';
      costClass += ' warn';
    }

    var showTier = bt.category !== 'housing' && bt.category !== 'road';
    html += '<div class="build-item' + (disabled ? ' disabled' : '') + (selected ? ' selected' : '') + '" data-bt="' + key + '">';
    if (spriteUrl) {
      html += '<div class="build-icon" data-sprite="1" style="background-image:url(' + spriteUrl + ');background-color:' + bgColor + '"></div>';
    } else {
      html += '<div class="build-icon" style="background:' + bgColor + '">' + label + '</div>';
    }
    html += '<div class="build-info">';
    html += '<div class="build-name">' + bt.name + (showTier ? ' <small>Tier ' + bt.tier + '</small>' : '') + '</div>';
    html += '<div class="' + costClass + '">' + costStr + '</div>';
    html += '<div class="build-desc">' + desc + '</div>';
    html += '</div></div>';
  });

  panel.innerHTML = html;

  panel.querySelectorAll('.build-item:not(.disabled)').forEach(function (item) {
    item.addEventListener('click', function () {
      selectBuildingType(item.dataset.bt);
    });
  });
}

function selectBuildingType(key) {
  state.selectedBuildType = key;
  var bt = state.buildingTypes[key];
  document.getElementById('placement-text').textContent = 'Tap a tile to place ' + bt.name;
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
  });
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
  var panel = document.getElementById('panel-trade');
  var html = '';

  var traderKeys = Object.keys(state.traders);

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
      document.getElementById('g-money').textContent = '$' + state.profile.money;
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

    document.getElementById('g-money').textContent = '$' + state.profile.money;

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
      else if (btn.dataset.tab === 'trade') renderTradePanel();
      else if (btn.dataset.tab === 'build') renderBuildPanel();
    });
  });
}
