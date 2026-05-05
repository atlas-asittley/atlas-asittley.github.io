// ── Game entry, data loading, and production loop ──
import { sb } from './config.js';
import { state, computeTraderUnlocks, computeLaborAllocation, computeGridBounds } from './state.js';
import { showScreen, showToast, capitalize, updateMoney, updateWorkers, updateHappiness, updateCrime } from './ui.js';
import { renderMap, initMapEvents, expandDistrict, restoreMapView } from './map.js';
import { renderBuildPanel, renderInventory, renderTradePanel, initTabs, initPanelCollapse, checkAllTraderVisits } from './panels.js';
import { subscribeRealtime } from './realtime.js';
import { startWalkers, stopWalkers, spawnImmigrantWalker, spawnEmigrantWalker } from './walkers.js';
import { initInspector } from './inspector.js';


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

    // Server is authoritative on happiness + population. Compare floor
    // before/after to spawn immigrant or emigrant walkers (cosmetic).
    var prevPopFloor = Math.floor(state.profile.population || 0);
    if (data.happiness !== undefined) state.profile.happiness = data.happiness;
    if (data.population !== undefined) state.profile.population = data.population;
    if (data.crime !== undefined) state.profile.crime = data.crime;
    var newPopFloor = Math.floor(data.population || prevPopFloor);
    var popDelta = newPopFloor - prevPopFloor;
    if (popDelta > 0) {
      var n = Math.min(popDelta, 3);  // cap so first-load doesn't flood
      for (var i = 0; i < n; i++) spawnImmigrantWalker();
    } else if (popDelta < 0) {
      var n2 = Math.min(-popDelta, 3);
      for (var j = 0; j < n2; j++) spawnEmigrantWalker();
    }

    updateMoney();
    updateWorkers();
    updateHappiness();
    updateCrime();
    renderInventory();

    if (document.getElementById('panel-trade').classList.contains('active')) {
      renderTradePanel();
    }

    // Handle housing evolution events
    if (data.evolution_events && data.evolution_events.length > 0) {
      // Reload buildings to get updated tiers
      sb.from('buildings').select('*, player_profiles(display_name, color_hex)').then(function (r) {
        if (r.data) {
          state.allBuildings = r.data;
          computeLaborAllocation();
          renderMap();
          renderInventory();
          updateWorkers();
        }
      });
      data.evolution_events.forEach(function (ev) {
        // Server emits { event: 'upgrade'|'devolve', from_tier, to_tier }.
        // Look up tier names client-side from housingTierConfig.
        var fromCfg = state.housingTierConfig[ev.from_tier];
        var toCfg = state.housingTierConfig[ev.to_tier];
        var fromName = (fromCfg && (fromCfg.label || fromCfg.name)) || ('Tier ' + ev.from_tier);
        var toName = (toCfg && (toCfg.label || toCfg.name)) || ('Tier ' + ev.to_tier);
        if (ev.event === 'upgrade') {
          showToast(fromName + ' upgraded to ' + toName + '!', 'success');
        } else {
          showToast(fromName + ' devolved to ' + toName, 'info');
        }
      });
    }

    // total_produced is a numeric — per-minute rate × elapsed seconds —
    // so it's almost always a fraction. Floor to whole goods (sub-1
    // production carries over to the next tick anyway) and skip the
    // toast entirely if it's less than 1.
    var producedWhole = Math.floor(data.total_produced || 0);
    if (producedWhole >= 1) {
      showToast('+' + producedWhole + ' goods produced', 'success');
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
  stopWalkers();
}

// Pause everything when the player switches apps or locks the phone.
// Mobile browsers throttle JS timers when backgrounded but DO NOT pause
// CSS animations — those keep compositing every frame, draining battery.
// The `app-hidden` class on body flips animation-play-state to paused,
// and we fully tear down the prod timer + walker spawn tick so nothing
// fires while we're invisible. On revisible, both restart.
function initVisibilityPause() {
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      document.body.classList.add('app-hidden');
      if (state.prodTimer) { clearInterval(state.prodTimer); state.prodTimer = null; }
      stopWalkers();
    } else {
      document.body.classList.remove('app-hidden');
      if (state.profile && !state.prodTimer) {
        startProdLoop();
        startWalkers();
        // Also catch up production for the time we were away.
        processProduction();
      }
    }
  });
}

function loadGameData() {
  return Promise.all([
    sb.from('building_types').select('*').eq('is_active', true),
    sb.from('resources').select('*'),
    sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true }),
    sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
    sb.from('trader_prices').select('*').eq('is_active', true),
    sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id),
    sb.from('trade_policies').select('*').eq('player_id', state.currentUser.id),
    sb.from('trader_visits').select('*').eq('player_id', state.currentUser.id).order('visited_at', { ascending: false }).limit(10),
    sb.from('traders').select('*').eq('is_active', true),
    sb.from('housing_tier_config').select('*')
  ]).then(function (results) {
    state.buildingTypes = {};
    if (results[0].data) results[0].data.forEach(function (bt) { state.buildingTypes[bt.key] = bt; });

    state.resources = {};
    if (results[1].data) results[1].data.forEach(function (r) { state.resources[r.key] = r; });

    state.tiles = results[2].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });

    state.allBuildings = results[3].data || [];
    computeGridBounds();

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

    // Load housing tier config (graceful if table doesn't exist yet)
    state.housingTierConfig = {};
    if (results[9] && results[9].data && !results[9].error) {
      results[9].data.forEach(function (tc) {
        state.housingTierConfig[tc.tier] = tc;
      });
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
  updateHappiness();
  updateCrime();

  loadGameData().then(function () {
    computeLaborAllocation();
    updateWorkers();
    renderMap();
    // Restore the scroll + zoom from the player's last session, or center
    // on home for a first-ever load. Must run AFTER renderMap so the grid
    // is sized and scrollable.
    restoreMapView();
    renderBuildPanel();
    renderInventory();
    renderTradePanel();
    processProduction();
    subscribeRealtime();
    startProdLoop();
    startWalkers();
    initVisibilityPause();
    var expandBtn = document.getElementById('g-expand-district');
    if (expandBtn) {
      expandBtn.onclick = function () { expandDistrict(); };
    }
    checkAllTraderVisits();
    showTapHintOnce();
  }).catch(function (err) {
    console.error('Game load failed:', err);
    showToast('Failed to load game data', 'error');
  });
}

// Show a one-time hint that buildings are tappable (only on first session)
function showTapHintOnce() {
  var key = 'city_tap_hint_shown';
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, '1');
  } catch (e) { return; }
  setTimeout(function () {
    showToast('Tap any building or citizen to inspect it', 'info');
  }, 2500);
}

// Wire up map and tab events once
export function initGameEvents() {
  initMapEvents();
  initTabs();
  initPanelCollapse();
  initInspector();
}
