// ── Game entry, data loading, and production loop ──
import { sb } from './config.js';
import { state, computeTraderUnlocks, computeLaborAllocation } from './state.js';
import { showScreen, showToast, capitalize } from './ui.js';
import { renderMap, initMapEvents } from './map.js';
import { renderBuildPanel, renderInventory, renderTradePanel, initTabs, checkAllTraderVisits } from './panels.js';
import { subscribeRealtime } from './realtime.js';

export function updateMoney() {
  document.getElementById('g-money').textContent = '$' + state.profile.money;
}

export function updateWorkers() {
  var li = state.laborInfo;
  var el = document.getElementById('g-workers');
  el.textContent = li.workersUsed + '/' + li.workerSupply;
  el.className = 'v ' + (li.laborShortage ? 'shortage' : 'workers');
  el.title = li.laborShortage
    ? 'Labor shortage! ' + li.workersNeeded + ' needed, only ' + li.workerSupply + ' available'
    : li.workersIdle > 0
      ? li.workersIdle + ' workers idle'
      : 'All workers employed';
  // Update shortage badge
  var badge = document.getElementById('g-labor-badge');
  if (badge) {
    badge.style.display = li.laborShortage ? 'inline' : 'none';
  }
}

function processProduction() {
  return sb.rpc('process_production').then(function (r) {
    if (r.error) {
      console.warn('Production error:', r.error.message);
      return;
    }
    var data = r.data;
    if (data.inventory) {
      state.inventory = {};
      Object.keys(data.inventory).forEach(function (k) {
        state.inventory[k] = Number(data.inventory[k]);
      });
    }
    if (data.money !== undefined) state.profile.money = data.money;
    if (data.workers_used !== undefined) state.profile.workers_used = data.workers_used;
    if (data.worker_capacity !== undefined) state.profile.worker_capacity = data.worker_capacity;

    // Update labor info from server response (authoritative)
    if (data.workers_needed !== undefined) {
      state.laborInfo.workerSupply = data.worker_capacity;
      state.laborInfo.workersNeeded = data.workers_needed;
      state.laborInfo.workersUsed = data.workers_used;
      state.laborInfo.workersIdle = Math.max(0, data.worker_capacity - data.workers_needed);
      state.laborInfo.laborShortage = !!data.labor_shortage;
    }
    // Recompute client-side staffed/unstaffed IDs for map rendering
    computeLaborAllocation();

    updateMoney();
    updateWorkers();
    renderInventory();

    if (document.getElementById('panel-trade').classList.contains('active')) {
      renderTradePanel();
    }

    if (data.total_produced > 0) {
      showToast('+' + data.total_produced + ' goods produced', 'success');
    }
  }).catch(function (err) {
    console.warn('Production fetch error:', err);
  });
}

function startProdLoop() {
  stopProdLoop();
  state.prodTimer = setInterval(function () { processProduction(); }, 30000);
}

export function stopProdLoop() {
  if (state.prodTimer) { clearInterval(state.prodTimer); state.prodTimer = null; }
}

function loadGameData() {
  return Promise.all([
    sb.from('building_types').select('*').eq('is_active', true),
    sb.from('resources').select('*').eq('is_active', true),
    sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true }),
    sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
    sb.from('trader_prices').select('*').eq('is_active', true),
    sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id),
    sb.from('trade_policies').select('*').eq('player_id', state.currentUser.id),
    sb.from('trader_visits').select('*').eq('player_id', state.currentUser.id).order('visited_at', { ascending: false }).limit(10),
    sb.from('traders').select('*').eq('is_active', true)
  ]).then(function (results) {
    state.buildingTypes = {};
    if (results[0].data) results[0].data.forEach(function (bt) { state.buildingTypes[bt.key] = bt; });

    state.resources = {};
    if (results[1].data) results[1].data.forEach(function (r) { state.resources[r.key] = r; });

    state.tiles = results[2].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });

    state.allBuildings = results[3].data || [];

    // Load all trader prices indexed by trader_key then resource_key
    state.allTraderPrices = {};
    if (results[4].data) results[4].data.forEach(function (tp) {
      if (!state.allTraderPrices[tp.trader_key]) {
        state.allTraderPrices[tp.trader_key] = {};
      }
      state.allTraderPrices[tp.trader_key][tp.resource_key] = {
        buy_price: tp.buy_price,
        sell_price: tp.sell_price
      };
    });

    state.inventory = {};
    if (results[5].data) results[5].data.forEach(function (inv) { state.inventory[inv.resource_key] = Number(inv.quantity); });

    // Trade policies (graceful if table doesn't exist yet)
    state.tradePolicies = {};
    if (results[6].data && !results[6].error) {
      results[6].data.forEach(function (p) {
        state.tradePolicies[p.resource_key] = { mode: p.mode, reserve_target: p.reserve_target };
      });
    }

    // Last visits per trader (graceful if table doesn't exist yet)
    state.lastVisits = {};
    if (results[7].data && !results[7].error) {
      results[7].data.forEach(function (v) {
        // Keep only the most recent visit per trader
        if (!state.lastVisits[v.trader_key]) {
          state.lastVisits[v.trader_key] = v;
        }
      });
    }

    // Load traders
    state.traders = {};
    if (results[8].data) {
      results[8].data.sort(function (a, b) {
        return (a.display_order || 0) - (b.display_order || 0);
      });
      results[8].data.forEach(function (t) { state.traders[t.key] = t; });
    }

    // Set default selected trader
    var traderKeys = Object.keys(state.traders);
    if (traderKeys.length > 0) {
      state.selectedTrader = traderKeys[0];
      state.traderPrices = state.allTraderPrices[state.selectedTrader] || {};
    }

    // Phase 2C: compute trader unlock state from progression
    computeTraderUnlocks();

    // Calculate next visit times per trader
    state.nextVisitAts = {};
    traderKeys.forEach(function (tk) {
      var t = state.traders[tk];
      var lastVisit = state.lastVisits[tk];
      var lastTime;
      if (lastVisit) {
        lastTime = new Date(lastVisit.visited_at).getTime();
      } else {
        lastTime = new Date(state.profile.created_at || Date.now()).getTime();
      }
      state.nextVisitAts[tk] = new Date(lastTime + t.visit_interval_minutes * 60 * 1000);
    });
  });
}

export function enterGame() {
  showScreen('screen-game');
  document.getElementById('g-industry').textContent = capitalize(state.profile.industry_key);
  document.getElementById('g-player-name').textContent = state.profile.display_name;
  updateMoney();
  updateWorkers();

  loadGameData().then(function () {
    computeLaborAllocation();
    updateWorkers();
    renderMap();
    renderBuildPanel();
    renderInventory();
    renderTradePanel();
    processProduction();
    subscribeRealtime();
    startProdLoop();
    // Lazy visit resolution: check if any trader visits are due
    checkAllTraderVisits();
  }).catch(function (err) {
    console.error('Game load failed:', err);
    showToast('Failed to load game data', 'error');
  });
}

// Wire up map and tab events once
export function initGameEvents() {
  initMapEvents();
  initTabs();
}
