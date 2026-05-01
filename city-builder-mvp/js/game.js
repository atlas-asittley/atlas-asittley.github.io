// ── Game entry, data loading, and production loop ──
import { sb } from './config.js';
import { state } from './state.js';
import { showScreen, showToast, capitalize } from './ui.js';
import { renderMap, initMapEvents } from './map.js';
import { renderBuildPanel, renderInventory, renderTradePanel, initTabs, checkTraderVisit } from './panels.js';
import { subscribeRealtime } from './realtime.js';

export function updateMoney() {
  document.getElementById('g-money').textContent = '$' + state.profile.money;
}

export function updateWorkers() {
  document.getElementById('g-workers').textContent = state.profile.workers_used + '/' + state.profile.worker_capacity;
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
    sb.from('trader_prices').select('*').eq('is_active', true).eq('trader_key', 'starter_trader'),
    sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id),
    sb.from('trade_policies').select('*').eq('player_id', state.currentUser.id),
    sb.from('trader_visits').select('*').eq('player_id', state.currentUser.id).eq('trader_key', 'starter_trader').order('visited_at', { ascending: false }).limit(1)
  ]).then(function (results) {
    state.buildingTypes = {};
    if (results[0].data) results[0].data.forEach(function (bt) { state.buildingTypes[bt.key] = bt; });

    state.resources = {};
    if (results[1].data) results[1].data.forEach(function (r) { state.resources[r.key] = r; });

    state.tiles = results[2].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });

    state.allBuildings = results[3].data || [];

    state.traderPrices = {};
    if (results[4].data) results[4].data.forEach(function (tp) {
      state.traderPrices[tp.resource_key] = { buy_price: tp.buy_price, sell_price: tp.sell_price };
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

    // Last visit (graceful if table doesn't exist yet)
    state.lastVisit = null;
    if (results[7].data && !results[7].error && results[7].data.length > 0) {
      state.lastVisit = results[7].data[0];
    }
    if (state.lastVisit) {
      var lastTime = new Date(state.lastVisit.visited_at).getTime();
      state.nextVisitAt = new Date(lastTime + 10 * 60 * 1000);
    } else {
      var created = new Date(state.profile.created_at || Date.now()).getTime();
      state.nextVisitAt = new Date(created + 10 * 60 * 1000);
    }
  });
}

export function enterGame() {
  showScreen('screen-game');
  document.getElementById('g-industry').textContent = capitalize(state.profile.industry_key);
  document.getElementById('g-player-name').textContent = state.profile.display_name;
  updateMoney();
  updateWorkers();

  loadGameData().then(function () {
    renderMap();
    renderBuildPanel();
    renderInventory();
    renderTradePanel();
    processProduction();
    subscribeRealtime();
    startProdLoop();
    // Lazy visit resolution: check if a trader visit is due
    checkTraderVisit();
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
