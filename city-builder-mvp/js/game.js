// ── Game entry, data loading, and production loop ──
import { sb } from './config.js';
import { state, computeTraderUnlocks, computeLaborAllocation, computeGridBounds } from './state.js';
import { showScreen, showToast, capitalize, updateMoney, updateWorkers, updateHappiness, updateCrime, updateMigration, updateProductivity, updateCityRunway, updateIdentity, updateTutorialBanner, updateTraderResetCountdown } from './ui.js';
import { addNotification, loadNotifications, initNotificationBell } from './notifications.js';
import { renderMap, initMapEvents, restoreMapView } from './map.js';
import { renderBuildPanel, renderTradePanel, refreshActiveDataPanel, refreshActiveDataPanelIfIdle, initTabs, initPanelCollapse } from './panels.js';
import { subscribeRealtime } from './realtime.js';
import { startWalkers, stopWalkers, spawnImmigrantWalker, spawnEmigrantWalker, renderWalkers } from './walkers.js';
import { initInspector } from './inspector.js';
import { initHelp } from './help.js';
import { fetchAndShowUnseenChangelog } from './changelog.js';
import { fetchAllPaged } from './paginate.js';


// After each production tick, fetch the player's tile metrics
// (pollution + desirability) and update the heatmap classes /
// inspector data in place. Avoids a full renderMap rebuild —
// touches only cells whose values actually changed.
// Pull today's per-trader-per-resource demand-cap usage (for the
// "X / Y today" indicators on the trade-partner panel). Cheap RPC,
// returns one row per (trader, resource).
function refreshTraderQuotas() {
  if (!state.currentUser) return;
  sb.rpc('get_trader_daily_quotas').then(function (r) {
    if (!r.data) return;
    var out = {};
    r.data.forEach(function (row) {
      out[row.trader_key] = out[row.trader_key] || {};
      out[row.trader_key][row.resource_key] = {
        buy_cap: row.buy_cap,
        buy_used: row.buy_used,
        sell_cap: row.sell_cap,
        sell_used: row.sell_used,
      };
    });
    state.traderQuotas = out;
  }).catch(function () { /* non-fatal — keep prior data */ });
}

function refreshTileMetrics() {
  if (!state.currentUser) return;
  sb.from('map_tiles')
    .select('id, x, y, pollution, desirability')
    .eq('owner_player_id', state.currentUser.id)
    .then(function (r) {
      if (!r.data) return;
      r.data.forEach(function (row) {
        var key = row.x + ',' + row.y;
        var tile = state.tileMap[key];
        if (!tile) return;
        var oldP = Number(tile.pollution || 0);
        var newP = Number(row.pollution || 0);
        var oldD = Number(tile.desirability == null ? 50 : tile.desirability);
        var newD = Number(row.desirability == null ? 50 : row.desirability);
        if (oldP === newP && oldD === newD) return;
        tile.pollution = newP;
        tile.desirability = newD;
        var cell = document.querySelector('[data-tile-id="' + tile.id + '"]');
        if (!cell) return;
        if (newP !== oldP) {
          if (newP > 0) {
            cell.classList.add('pollution-tinted');
            cell.style.setProperty('--pollution', newP);
          } else {
            cell.classList.remove('pollution-tinted');
            cell.style.removeProperty('--pollution');
          }
        }
        if (newD !== oldD) {
          cell.style.setProperty('--desirability', newD);
        }
      });
    });
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
    var prevMoney = state.profile.money;
    var prevCrime = state.profile.crime;
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
    if (data.migration_rate !== undefined) state.profile.migration_rate = data.migration_rate;
    if (data.productivity !== undefined) state.profile.productivity = data.productivity;
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
    updateMigration();
    updateProductivity();
    updateCityRunway();

    // Perf #2: pulse the previously-infinite act-glow buildings once
    // per tick instead of running the keyframe loop forever. CSS keeps
    // them at static opacity 0.65; this transiently animates them up
    // and back. Animation auto-completes in ~2s; remove the class
    // after so subsequent ticks can re-trigger from a clean state
    // (CSS animations don't restart if the class is already present).
    var pulseTargets = document.querySelectorAll('.bldg.producing');
    if (pulseTargets.length) {
      for (var pi = 0; pi < pulseTargets.length; pi++) pulseTargets[pi].classList.add('tick-pulse');
      setTimeout(function () {
        for (var ri = 0; ri < pulseTargets.length; ri++) pulseTargets[ri].classList.remove('tick-pulse');
      }, 2100);
    }

    // Bankruptcy + crime cascade notifications stripped per Atlas
    // (2026-05-08) — the bell log shows ONLY housing_ready_to_upgrade.
    // The state values are still set on state.profile so the topbar
    // money chip and crime stat reflect the situation visually.

    // Refresh the visible data-driven panel (Trade or City) — but
    // skip if the user is mid-interaction so we don't tear down
    // their expanded rows or focused input. Atlas's report 2026-05-10:
    // typing in a trade-policy price field, the 30s tick would wipe
    // the panel and lose the cursor.
    refreshActiveDataPanelIfIdle();

    // Handle housing evolution events
    if (data.evolution_events && data.evolution_events.length > 0) {
      // Reload buildings to get updated tiers — paginated so the
      // shared buildings table can outgrow 1000 without truncation.
      fetchAllPaged(function () {
        return sb.from('buildings').select('*, player_profiles(display_name, color_hex)').order('id');
      }).then(function (r) {
        if (r.data) {
          state.allBuildings = r.data;
          computeLaborAllocation();
          renderMap();
          updateWorkers();
          refreshActiveDataPanelIfIdle();
        }
      });
      data.evolution_events.forEach(function (ev) {
        // Server emits one of:
        //   { event: 'devolve', from_tier, to_tier, building_id }  — auto
        //   { event: 'housing_ready_to_upgrade', count }            — manual
        //   { event: 'housing_lost_eligibility', count }            — silent
        // The lost_eligibility event exists purely to keep the
        // events array non-empty so the buildings refetch above
        // fires and the client drops stale evolution_eligible_at.
        // (Auto-upgrade is gone: housing only steps up when the
        // player taps Upgrade in the inspector. Devolves still
        // fire on condition-slip after the grace window.)
        if (ev.event === 'housing_ready_to_upgrade') {
          var n = ev.count || 1;
          var msg = n === 1
            ? '1 house is ready to upgrade — open its inspector to step it up.'
            : n + ' houses are ready to upgrade — open each inspector to step them up.';
          addNotification('info', msg);
          return;
        }
        var fromCfg = state.housingTierConfig[ev.from_tier];
        var toCfg = state.housingTierConfig[ev.to_tier];
        var fromName = (fromCfg && fromCfg.name) || ('Tier ' + ev.from_tier);
        var toName = (toCfg && toCfg.name) || ('Tier ' + ev.to_tier);
        // Legacy 'upgrade' / 'devolve' events: state is still applied
        // (the buildings reload above picks up the new tier), but no
        // notification is emitted — only housing_ready_to_upgrade goes
        // in the bell log per Atlas's 2026-05-08 directive.
        // (Variables intentionally referenced so unused-var lints stay
        // quiet during the strip-down.)
        void fromName; void toName;
      });
    }

    // Pull the latest tile metrics (pollution + desirability) so heatmaps
    // + inspector reflect this tick. Only updates cells whose values
    // actually changed.
    refreshTileMetrics();
    // Auto-trade fired during process_production may have moved the
    // daily quota. Refresh so the partner panel shows current state.
    refreshTraderQuotas();
    // Drain server-side notifications (currently only fires for
    // counterparties when someone cancels a recurring trade — Atlas's
    // 2026-05-08 notification policy: bell shows housing_ready_to_upgrade
    // + trade_agreement_cancelled, nothing else). RPC marks rows read
    // in the same call so a slow network can't double-toast.
    sb.rpc('fetch_unread_notifications').then(function (r) {
      if (r.error || !r.data) return;
      r.data.forEach(function (n) {
        addNotification('info', n.body || n.title);
      });
    });
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
    // Paginated — see fetchAllPaged comment. Supabase's server-side
    // db-max-rows=1000 caps any single response, so we loop in 1000-row
    // pages until a short page arrives.
    fetchAllPaged(function () {
      return sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true });
    }),
    fetchAllPaged(function () {
      return sb.from('buildings').select('*, player_profiles(display_name, color_hex)').order('id');
    }),
    sb.from('trader_prices').select('*').eq('is_active', true),
    sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id),
    sb.from('trade_policies').select('*').eq('player_id', state.currentUser.id),
    sb.from('trader_visits').select('*').eq('player_id', state.currentUser.id).order('visited_at', { ascending: false }).limit(10),
    sb.from('traders').select('*').eq('is_active', true),
    sb.from('housing_tier_config').select('*'),
    sb.from('housing_lifestyle_demands').select('*'),
    sb.from('building_type_resource_costs').select('*'),
    // Per-house pantry buffers — drives the inspector's devolve-risk
    // gate against the building's own buffer rather than city stock.
    sb.from('building_resource_buffers')
      .select('building_id, resource_key, quantity, capacity')
      .range(0, 9999)
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

    // Load trader prices indexed by trader_key → resource_key. Mirror the
    // server's _trader_catalog precedence: a row whose city_id matches
    // the player's city wins over a global (city_id NULL) row for the
    // same (trader, resource). Otherwise the random-rolled per-city
    // catalogs (sky_caravans + friends) collide with the leftover global
    // defaults from transport_network_schema.sql and the JS picks
    // whichever arrived last from PostgREST — wrong prices + caps in the
    // partner panel and computeNetRates.
    state.allTraderPrices = {};
    if (results[4].data) {
      var myCityId = (state.profile && state.profile.city_id) || null;
      // First pass: index globals.
      results[4].data.forEach(function (tp) {
        if (tp.city_id) return;
        if (!state.allTraderPrices[tp.trader_key]) state.allTraderPrices[tp.trader_key] = {};
        state.allTraderPrices[tp.trader_key][tp.resource_key] = {
          buy_price: tp.buy_price,
          sell_price: tp.sell_price,
          daily_buy_cap: tp.daily_buy_cap,
          daily_sell_cap: tp.daily_sell_cap
        };
      });
      // Second pass: per-city rows for THIS city overwrite globals; if
      // ANY city row exists for a (trader), the trader's catalog is
      // rebuilt from city rows alone (same as _trader_catalog: city
      // rows entirely shadow global rows for that trader).
      var cityTraders = {};
      results[4].data.forEach(function (tp) {
        if (tp.city_id !== myCityId) return;
        cityTraders[tp.trader_key] = true;
      });
      Object.keys(cityTraders).forEach(function (tk) {
        state.allTraderPrices[tk] = {};
      });
      results[4].data.forEach(function (tp) {
        if (tp.city_id !== myCityId) return;
        state.allTraderPrices[tp.trader_key][tp.resource_key] = {
          buy_price: tp.buy_price,
          sell_price: tp.sell_price,
          daily_buy_cap: tp.daily_buy_cap,
          daily_sell_cap: tp.daily_sell_cap
        };
      });
    }

    state.inventory = {};
    if (results[5].data) results[5].data.forEach(function (inv) { state.inventory[inv.resource_key] = Number(inv.quantity); });

    // Trade policies (graceful if table doesn't exist yet)
    // tradePolicies[resource_key] holds mode/reserve_target plus the
    // 2026-05-09 reservation-price gates (nullable). null = "no gate".
    state.tradePolicies = {};
    if (results[6].data && !results[6].error) {
      results[6].data.forEach(function (p) {
        state.tradePolicies[p.resource_key] = {
          mode: p.mode,
          reserve_target: p.reserve_target,
          min_sell_price: p.min_sell_price,
          max_buy_price: p.max_buy_price
        };
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

    // Load per-tier lifestyle demands (pottery for cottages, bread for
    // townhouses, etc.). Indexed by tier so the inspector can quickly
    // ask "what does this house consume each tick?".
    state.housingLifestyleDemands = {};
    if (results[10] && results[10].data && !results[10].error) {
      results[10].data.forEach(function (d) {
        if (!state.housingLifestyleDemands[d.tier]) state.housingLifestyleDemands[d.tier] = [];
        state.housingLifestyleDemands[d.tier].push({
          resource_key: d.resource_key,
          qty_per_minute: Number(d.qty_per_minute)
        });
      });
    }

    // Resource costs for placing buildings (2026-05-08): money is no
    // longer the only build cost. state.buildingResourceCosts[bt_key]
    // is an array of { resource_key, quantity } pairs the player must
    // have in inventory at placement time.
    state.buildingResourceCosts = {};
    if (results[11] && results[11].data) {
      results[11].data.forEach(function (c) {
        if (!state.buildingResourceCosts[c.building_type_key]) {
          state.buildingResourceCosts[c.building_type_key] = [];
        }
        state.buildingResourceCosts[c.building_type_key].push({
          resource_key: c.resource_key,
          quantity: c.quantity
        });
      });
    }

    // Per-house pantry buffers, indexed [building_id][resource_key].
    // Inspector reads these to show pantry fill + minutes remaining.
    state.buildingBuffers = {};
    if (results[12] && results[12].data) {
      results[12].data.forEach(function (b) {
        if (!state.buildingBuffers[b.building_id]) state.buildingBuffers[b.building_id] = {};
        state.buildingBuffers[b.building_id][b.resource_key] = {
          quantity: Number(b.quantity),
          capacity: Number(b.capacity),
        };
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
  updateIdentity();
  updateMoney();
  updateWorkers();
  updateHappiness();
  updateCrime();
  updateMigration();
  updateProductivity();
  updateCityRunway();
  updateTutorialBanner();
  updateTraderResetCountdown();
  // Refresh the trader-reset countdown once a minute. Cheap (no DB call,
  // just date math), so we don't need a smarter cadence.
  if (state.traderResetTimer) clearInterval(state.traderResetTimer);
  state.traderResetTimer = setInterval(updateTraderResetCountdown, 60000);

  loadGameData().then(function () {
    computeLaborAllocation();
    updateWorkers();
    renderMap(true);  // immediate — restoreMapView below depends on a populated grid
    // Restore the scroll + zoom from the player's last session, or center
    // on home for a first-ever load. Must run AFTER renderMap so the grid
    // is sized and scrollable.
    restoreMapView();
    renderBuildPanel();
    renderTradePanel();
    processProduction();
    subscribeRealtime();
    startProdLoop();
    startWalkers();
    // Defensive: walkers spawned during enterGame may have hit the
    // grid-not-measurable race (offsetWidth=0 if layout hadn't fully
    // committed). Re-render after a frame so they get correct positions.
    requestAnimationFrame(function () { renderWalkers(); });
    refreshTraderQuotas();
    loadNotifications();
    initNotificationBell();
    // Surface "What's new" entries the player hasn't seen. Runs after
    // the city is rendered so it's a momentary interrupt, not a
    // load-blocker. Returns silently if there's nothing new.
    fetchAndShowUnseenChangelog();
  }).catch(function (err) {
    console.error('Game load failed:', err);
    alert('Failed to load game data');
  });
}

// Wire up map and tab events once
export function initGameEvents() {
  initMapEvents();
  initTabs();
  initPanelCollapse();
  initInspector();
  initHelp();
  initVisibilityPause();
}
