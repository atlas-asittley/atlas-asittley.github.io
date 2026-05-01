// ── Build, Inventory, and Trade panels ──
import { sb } from './config.js';
import { state } from './state.js';
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
    return state.buildingTypes[k].industry_key === state.profile.industry_key;
  }).sort(function (a, b) {
    return state.buildingTypes[a].tier - state.buildingTypes[b].tier;
  });

  if (available.length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:20px;">No buildings available for your industry.</div>';
    panel.innerHTML = html;
    return;
  }

  available.forEach(function (key) {
    var bt = state.buildingTypes[key];
    var canAfford = state.profile.money >= bt.build_cost;
    var hasWorkers = state.profile.workers_used + bt.worker_cost <= state.profile.worker_capacity;
    var disabled = !canAfford || !hasWorkers;
    var selected = state.selectedBuildType === key;

    var colors = {
      timber_camp: '#3a7a4a', sawmill: '#7a5a2a',
      stone_quarry: '#5a5a7a', mason_workshop: '#7a4a3a'
    };
    var bgColor = colors[key] || '#4a4a6a';
    var label = BLDG_LABELS[key] || '?';

    var desc = bt.category === 'extractor'
      ? 'Extracts ' + resourceName(bt.output_resource_key) + ' from resource tiles'
      : 'Converts ' + resourceName(bt.input_resource_key) + ' into ' + resourceName(bt.output_resource_key);

    var costStr = '$' + bt.build_cost + ' | ' + bt.worker_cost + ' worker';
    var costClass = 'build-cost';
    if (!canAfford) { costStr = '$' + bt.build_cost + ' (need $' + (bt.build_cost - state.profile.money) + ' more)'; costClass += ' warn'; }
    else if (!hasWorkers) { costStr += ' (no workers available)'; costClass += ' warn'; }

    html += '<div class="build-item' + (disabled ? ' disabled' : '') + (selected ? ' selected' : '') + '" data-bt="' + key + '">';
    html += '<div class="build-icon" style="background:' + bgColor + '">' + label + '</div>';
    html += '<div class="build-info">';
    html += '<div class="build-name">' + bt.name + ' <small>Tier ' + bt.tier + '</small></div>';
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
export function renderInventory() {
  var panel = document.getElementById('panel-inventory');
  var html = '';

  html += '<div class="inv-section">Raw Materials</div>';
  ['timber', 'stone'].forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Processed Goods</div>';
  ['lumber', 'brick'].forEach(function (k) {
    var qty = Math.floor(state.inventory[k] || 0);
    html += '<div class="inv-row"><span class="inv-name">' + resourceName(k) + '</span><span class="inv-qty' + (qty === 0 ? ' zero' : '') + '">' + qty + '</span></div>';
  });

  html += '<div class="inv-section">Economy</div>';
  html += '<div class="inv-row"><span class="inv-name">Money</span><span class="inv-qty" style="color:#e6c65a;">$' + state.profile.money + '</span></div>';
  html += '<div class="inv-row"><span class="inv-name">Workers</span><span class="inv-qty">' + state.profile.workers_used + ' / ' + state.profile.worker_capacity + '</span></div>';

  var myBldgs = state.allBuildings.filter(function (b) { return b.player_id === state.currentUser.id; });
  html += '<div class="inv-row"><span class="inv-name">Your Buildings</span><span class="inv-qty">' + myBldgs.length + '</span></div>';

  panel.innerHTML = html;
}

// ── Trade panel (Phase 2A: policy-driven trade) ──
export function renderTradePanel() {
  var panel = document.getElementById('panel-trade');
  var html = '';

  // Trader header + visit status
  html += '<div class="trader-header">Starter Trader</div>';
  html += '<div class="trader-desc">Set trade policy per resource. The trader visits every 10 min and executes your orders automatically.</div>';
  html += renderVisitStatus();

  // Last visit summary
  html += renderVisitSummary();

  // Policy controls per resource
  html += '<div class="trade-section-label">Trade Policies</div>';
  var tradeResources = ['timber', 'lumber', 'stone', 'brick'];
  tradeResources.forEach(function (rk) {
    var prices = state.traderPrices[rk];
    if (!prices) return;
    var stock = Math.floor(state.inventory[rk] || 0);
    var policy = state.tradePolicies[rk] || { mode: 'keep', reserve_target: 0 };

    html += '<div class="policy-row" data-resource="' + rk + '">';
    html += '<div class="policy-header">';
    html += '<span class="policy-res">' + resourceName(rk) + '</span>';
    html += '<span class="policy-stock">Stock: ' + stock + '</span>';
    html += '</div>';
    html += '<div class="policy-prices">';
    html += '<span class="policy-price sell-price">Sells at ' + prices.buy_price + 'g</span>';
    html += '<span class="policy-price buy-price">Buys at ' + (prices.sell_price || '?') + 'g</span>';
    html += '</div>';
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

  // Manual sell section (kept as fallback)
  html += '<div class="trade-section-label" style="margin-top:12px;">Quick Sell (Manual)</div>';
  tradeResources.forEach(function (rk) {
    var prices = state.traderPrices[rk];
    if (!prices) return;
    var stock = Math.floor(state.inventory[rk] || 0);
    var key = 'sell-' + rk;
    var amt = state.tradeAmounts[key] || 0;

    html += '<div class="trade-row-manual">';
    html += '<span class="trade-manual-name">' + resourceName(rk) + '</span>';
    html += '<div class="trade-controls">';
    html += '<button class="trade-amt-btn" data-key="' + key + '" data-dir="dec">-</button>';
    html += '<span class="trade-amt" id="ta-' + rk + '">' + amt + '</span>';
    html += '<button class="trade-amt-btn" data-key="' + key + '" data-dir="inc" data-max="' + stock + '">+</button>';
    html += '<button class="btn-sell" data-resource="' + rk + '" data-key="' + key + '"' + (amt < 1 ? ' disabled' : '') + '>Sell</button>';
    html += '</div>';
    html += '</div>';
  });

  if (Object.keys(state.traderPrices).length === 0) {
    html = '<div style="color:#7a8a9e;text-align:center;padding:16px;">Trader prices not loaded. Run the Phase 2A migration first.</div>';
  }

  panel.innerHTML = html;

  // Wire policy mode selects
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

  // Wire reserve inputs
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

  // Wire manual sell amount buttons
  panel.querySelectorAll('.trade-amt-btn').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var key = btn.dataset.key;
      var dir = btn.dataset.dir;
      var max = parseInt(btn.dataset.max || '999');
      var current = state.tradeAmounts[key] || 0;

      if (dir === 'inc' && current < max) current++;
      else if (dir === 'dec' && current > 0) current--;
      state.tradeAmounts[key] = current;

      var rk = key.replace('sell-', '');
      var el = document.getElementById('ta-' + rk);
      if (el) el.textContent = current;

      var row = btn.closest('.trade-row-manual');
      var sellBtn = row.querySelector('.btn-sell');
      if (sellBtn) sellBtn.disabled = current < 1;
    });
  });

  // Wire manual sell buttons
  panel.querySelectorAll('.btn-sell').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var rk = btn.dataset.resource;
      var key = btn.dataset.key;
      var amt = state.tradeAmounts[key] || 0;
      if (amt < 1) return;
      sellToTrader(rk, amt, btn);
    });
  });

  // Wire check-now button
  var checkBtn = document.getElementById('btn-check-visit');
  if (checkBtn) {
    checkBtn.addEventListener('click', function () {
      checkBtn.disabled = true;
      checkBtn.textContent = '...';
      checkTraderVisit();
    });
  }
}

function renderVisitStatus() {
  var html = '<div class="visit-status">';
  if (state.nextVisitAt) {
    var now = Date.now();
    var next = new Date(state.nextVisitAt).getTime();
    var diff = next - now;
    if (diff <= 0) {
      html += '<span class="visit-due">Trader visit due now!</span>';
    } else {
      var mins = Math.ceil(diff / 60000);
      html += '<span class="visit-timer">Next visit in ~' + mins + ' min</span>';
    }
  } else {
    html += '<span class="visit-timer">Next visit: soon</span>';
  }
  html += ' <button class="btn-check-visit" id="btn-check-visit">Check Now</button>';
  html += '</div>';
  return html;
}

function renderVisitSummary() {
  var html = '';
  if (state.lastVisit && state.lastVisit.summary) {
    var summary = state.lastVisit.summary;
    if (typeof summary === 'string') {
      try { summary = JSON.parse(summary); } catch (e) { summary = []; }
    }
    html += '<div class="visit-summary">';
    html += '<div class="visit-summary-title">Last Visit</div>';
    if (summary.length === 0) {
      html += '<div class="visit-summary-item empty">Trader visited — no trades matched your policy.</div>';
    } else {
      summary.forEach(function (item) {
        if (item.type === 'sell') {
          html += '<div class="visit-summary-item sold">Sold ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        } else if (item.type === 'buy') {
          html += '<div class="visit-summary-item bought">Bought ' + item.quantity + ' ' + resourceName(item.resource) + ' for ' + item.total + 'g</div>';
        }
      });
    }
    var usedLabel = state.lastVisit.capacity_used + '/' + state.lastVisit.capacity_total + ' capacity used';
    html += '<div class="visit-summary-cap">' + usedLabel + '</div>';
    html += '</div>';
  }
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

export function checkTraderVisit() {
  // Lazy visit resolution: call RPC and let the server decide
  sb.rpc('resolve_trader_visit', { p_trader_key: 'starter_trader' }).then(function (r) {
    if (r.error) {
      // RPC may not exist yet if migration hasn't run — fail silently
      console.warn('Trader visit check:', r.error.message);
      return;
    }
    var data = r.data;
    if (!data) return;

    if (data.visit_resolved) {
      // Update local state
      if (data.money !== undefined) {
        state.profile.money = data.money;
        document.getElementById('g-money').textContent = '$' + state.profile.money;
      }
      if (data.inventory) {
        state.inventory = {};
        Object.keys(data.inventory).forEach(function (k) {
          state.inventory[k] = Number(data.inventory[k]);
        });
      }
      state.lastVisit = {
        capacity_total: data.capacity_total,
        capacity_used: data.capacity_used,
        summary: data.summary,
        visited_at: new Date().toISOString()
      };
      state.nextVisitAt = data.next_visit_at ? new Date(data.next_visit_at) : new Date(Date.now() + 10 * 60 * 1000);

      // Show toast summarizing visit
      var earned = data.total_earned || 0;
      var spent = data.total_spent || 0;
      var msg = 'Trader visited!';
      if (earned > 0) msg += ' Earned $' + earned + '.';
      if (spent > 0) msg += ' Spent $' + spent + '.';
      if (earned === 0 && spent === 0) msg += ' No trades this visit.';
      showToast(msg, 'success');

      renderInventory();
      renderTradePanel();
    } else {
      // Not due yet — update next visit time
      if (data.next_visit_at) {
        state.nextVisitAt = new Date(data.next_visit_at);
      }
      // Re-render to update timer
      renderTradePanel();
    }
    state.visitChecked = true;
  }).catch(function (err) {
    console.warn('Trader visit check failed:', err);
  });
}

function sellToTrader(resourceKey, quantity, btn) {
  btn.disabled = true;
  btn.textContent = '...';

  sb.rpc('sell_to_trader', {
    p_trader_key: 'starter_trader',
    p_resource_key: resourceKey,
    p_quantity: quantity
  }).then(function (r) {
    if (r.error) {
      showToast(r.error.message, 'error');
      btn.disabled = false;
      btn.textContent = 'Sell';
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
    state.tradeAmounts['sell-' + resourceKey] = 0;
    renderInventory();
    renderTradePanel();
    showToast('Sold ' + quantity + ' ' + resourceName(resourceKey) + ' for $' + data.total_price, 'success');
  }).catch(function (err) {
    showToast(err.message || 'Sale failed', 'error');
    btn.disabled = false;
    btn.textContent = 'Sell';
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
