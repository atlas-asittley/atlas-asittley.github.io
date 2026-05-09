// ── UI helpers: screens, toasts, errors, topbar ──
import { state } from './state.js';
import { addNotification } from './notifications.js';
import { computeCityRunway, formatRunway } from './panels.js';

var screens = document.querySelectorAll('.screen');

// Tutorial step copy. Step 0..2 are active instructions; step 3 means
// the tutorial is complete and the banner stays hidden.
var TUTORIAL_STEPS = [
  {
    title: 'Step 1 of 4 — Build 4 Houses',
    body: 'Tap the Build tab and place 4 Houses anywhere on your land. Each house holds 6 citizens who arrive immediately — by the end of this step you\'ll have ~24 workers ready to staff the rest of the city.'
  },
  {
    title: 'Step 2 of 4 — Build a Well',
    body: 'Place a Well on a tile next to a road, near your houses. Wells provide water service to nearby housing (within 4 tiles) so it can keep growing. The Well takes 3 workers when staffed.'
  },
  {
    title: 'Step 3 of 4 — Build a Food Producer',
    body: 'Pick a food extractor: Garden, Orchard, Fishing Pier, or Grain Farm — each needs its own type of resource tile. Food keeps citizens alive and happy. Each different food type also adds +2 happiness, and a happier city draws more immigrants per tick.'
  },
  {
    title: 'Step 4 of 4 — Build a Resource Extractor',
    body: 'Place your industry\'s extractor on a matching resource tile. It produces the goods you\'ll trade for money. Costs 10 workers when staffed. Tip: trade auto-happens once policies are set; expect ~$250/hour from one staffed extractor. Save up before building police buildings — their upkeep can sink an early-game economy.'
  }
];

export function updateTutorialBanner() {
  var banner = document.getElementById('tutorial-banner');
  if (!banner) return;
  var step = (state.profile && state.profile.tutorial_step) || 0;
  if (step >= 4) {                        // step 4 = tutorial done
    banner.style.display = 'none';
    return;
  }
  var copy = TUTORIAL_STEPS[step];
  if (!copy) {
    banner.style.display = 'none';
    return;
  }
  document.getElementById('tutorial-banner-title').textContent = copy.title;
  document.getElementById('tutorial-banner-body').textContent = copy.body;
  banner.style.display = '';
}

// Tutorial gating helper — used by the build panel to filter what's
// available. Step 0..3 are active steps; step 4 means done and the
// full panel opens up.
export function tutorialAllowsBuilding(bt) {
  var step = (state.profile && state.profile.tutorial_step) || 0;
  if (step >= 4) return true;
  if (!bt) return false;
  if (bt.category === 'road') return true;
  if (step === 0) return bt.category === 'housing';
  if (step === 1) return bt.category === 'housing' || bt.key === 'well';
  if (step === 2) {
    return bt.category === 'housing'
      || bt.key === 'well'
      || bt.category === 'food_extractor';
  }
  if (step === 3) {
    return bt.category === 'housing'
      || bt.key === 'well'
      || bt.category === 'food_extractor'
      || bt.category === 'extractor';
  }
  return false;
}

export function showScreen(id) {
  screens.forEach(function (s) { s.classList.remove('active'); });
  document.getElementById(id).classList.add('active');
}

export function showError(el, msg) {
  el.textContent = msg;
  el.classList.add('show');
}

export function clearError(el) {
  el.textContent = '';
  el.classList.remove('show');
}

export function capitalize(s) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

// Per Atlas (2026-05-08): the bell log shows ONLY the
// housing-ready-to-upgrade notification. showToast() used to forward
// to the bell; it's now a no-op compatibility shim so existing
// callers don't error.
export function showToast(_msg, _type) { /* notifications stripped */ }

// ── Topbar state display ──
export function updateMoney() {
  document.getElementById('g-money').textContent = '$' + state.profile.money;
  var parcelsOwned = state.profile.chunks_owned || 1;
  var parcelsEl = document.getElementById('g-parcels');
  if (parcelsEl) parcelsEl.textContent = parcelsOwned;
}

export function updateIdentity() {
  var cityEl = document.getElementById('g-city-name');
  var distEl = document.getElementById('g-district-name');
  if (cityEl) cityEl.textContent = state.cityName || '—';
  if (distEl) distEl.textContent = (state.profile && state.profile.district_name) || (state.profile && state.profile.display_name) || '—';
}

export function updateWorkers() {
  var li = state.laborInfo;
  var el = document.getElementById('g-workers');
  var used = Math.max(0, li.workersUsed || 0);
  var needed = Math.max(0, li.workersNeeded || 0);
  var stat = document.getElementById('g-workers-stat');
  if (el) {
    el.textContent = used + '/' + needed;
    el.className = 'v ' + (li.laborShortage ? 'shortage' : 'workers');
  }
  if (stat) {
    stat.title = used + ' workers employed / ' + needed + ' jobs available';
  }
  var badge = document.getElementById('g-labor-badge');
  if (badge) {
    badge.style.display = li.laborShortage ? 'inline' : 'none';
  }

  // Population stat: "current / housing capacity". Capacity = sum of
  // housing_tier_config.workers across all the player's active houses
  // (with their road/well prereqs satisfied). State is computed in
  // computeLaborAllocation; we expose laborInfo.housingCapacity below.
  var popEl = document.getElementById('g-population');
  if (popEl) {
    var pop = Math.floor((state.profile && state.profile.population) || 0);
    var cap = (li && li.housingCapacity != null) ? li.housingCapacity : pop;
    popEl.textContent = pop + '/' + cap;
  }
  var popStat = document.getElementById('g-population-stat');
  if (popStat) {
    var pop2 = Math.floor((state.profile && state.profile.population) || 0);
    var cap2 = (li && li.housingCapacity != null) ? li.housingCapacity : pop2;
    // First number = citizens currently living here. Second = total
    // housing spaces (sum of capacity across active houses).
    popStat.title = pop2 + ' citizens / ' + cap2 + ' housing spaces';
  }
}

export function updateHappiness() {
  var h = Math.round((state.profile && state.profile.happiness) || 50);
  var v = document.getElementById('g-happiness');
  var icon = document.getElementById('g-happiness-icon');
  if (v) v.textContent = h;
  if (icon) {
    icon.textContent = h <= 25 ? '☹'
                     : h <= 50 ? '😐'
                     : h <= 75 ? '🙂'
                     : '😊';
  }
  var stat = document.getElementById('g-happiness-stat');
  if (stat) {
    stat.title = 'Happiness ' + h + '/100. '
               + (h > 50 ? 'Citizens slowly moving in (~' + ((h - 50) / 50).toFixed(2) + '/min).'
                  : h < 50 ? 'Citizens slowly leaving (~' + ((50 - h) / 50).toFixed(2) + '/min).'
                  : 'Population steady.');
  }
}

export function updateMigration() {
  var rate = Number((state.profile && state.profile.migration_rate) || 0);
  var v = document.getElementById('g-migration');
  var icon = document.getElementById('g-migration-icon');
  if (!v || !icon) return;
  var rounded = Math.round(rate * 100) / 100;
  if (rounded > 0.01) {
    icon.textContent = '↑';
    v.textContent = '+' + rounded.toFixed(2);
    v.className = 'v migration-up';
  } else if (rounded < -0.01) {
    icon.textContent = '↓';
    v.textContent = rounded.toFixed(2);
    v.className = 'v migration-down';
  } else {
    icon.textContent = '→';
    v.textContent = '0';
    v.className = 'v migration-steady';
  }
  var stat = document.getElementById('g-migration-stat');
  if (stat) {
    stat.title = rounded > 0.01
      ? 'Citizens moving in: ' + rounded.toFixed(2) + '/min'
      : rounded < -0.01
        ? 'Citizens leaving: ' + Math.abs(rounded).toFixed(2) + '/min'
        : 'Population steady';
  }
}

export function updateProductivity() {
  var p = (state.profile && state.profile.productivity != null) ? Number(state.profile.productivity) : 1.0;
  var pct = Math.round(p * 100);
  var v = document.getElementById('g-productivity');
  if (!v) return;
  v.textContent = pct + '%';
  v.className = 'v ' + (pct >= 105 ? 'productivity-up' : pct < 100 ? 'productivity-down' : 'productivity-neutral');
  var stat = document.getElementById('g-productivity-stat');
  if (stat) {
    stat.title = pct === 100 ? 'Production multiplier — at baseline (100%).'
      : pct > 100 ? 'Production +' + (pct - 100) + '% above baseline.'
      : 'Production ' + (pct - 100) + '% below baseline.';
  }
}

export function updateCrime() {
  var c = Math.round((state.profile && state.profile.crime) || 0);
  var v = document.getElementById('g-crime');
  if (v) {
    v.textContent = c;
    v.className = 'v ' + (c <= 25 ? 'crime-low' : c <= 50 ? 'crime-mid' : 'crime-high');
  }
  var stat = document.getElementById('g-crime-stat');
  if (stat) {
    stat.title = 'Crime ' + c + '/100. '
               + (c <= 25 ? 'Streets are quiet.'
                  : c <= 50 ? 'Some unrest — consider more police coverage.'
                  : 'High crime is dragging down happiness — cover more housing with police.');
  }
}

// Topbar "city runway" indicator. Green when nothing is depleting
// faster than it's being produced; yellow when the bottleneck runs
// out within 4 hours; red within 1 hour.
// Trader daily quotas (trader_daily_quota.day_bucket = CURRENT_DATE on
// the server) reset at UTC midnight. Surface a countdown so players
// know when caps refresh — Atlas: "we just want to know when the day
// ends so the traders reset their buy capacities."
export function updateTraderResetCountdown() {
  var v = document.getElementById('g-trader-reset-val');
  if (!v) return;
  var now = new Date();
  var nextUtcMidnight = Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0
  );
  var msLeft = nextUtcMidnight - now.getTime();
  if (msLeft < 0) msLeft = 0;
  var totalMin = Math.floor(msLeft / 60000);
  var h = Math.floor(totalMin / 60);
  var m = totalMin % 60;
  if (h >= 1) {
    v.textContent = h + 'h ' + m + 'm';
  } else if (m >= 1) {
    v.textContent = m + 'm';
  } else {
    var s = Math.max(0, Math.floor(msLeft / 1000));
    v.textContent = s + 's';
  }
}

export function updateCityRunway() {
  var stat = document.getElementById('g-runway-stat');
  var v = document.getElementById('g-runway');
  if (!stat || !v) return;
  var r = computeCityRunway();
  v.textContent = formatRunway(r.minutes);
  stat.classList.remove('runway-stable', 'runway-warn', 'runway-bad');
  if (!isFinite(r.minutes)) {
    stat.classList.add('runway-stable');
    stat.title = 'Reserves are sustainable — production keeps up with consumption indefinitely.';
  } else if (r.minutes < 60) {
    stat.classList.add('runway-bad');
    stat.title = 'CRITICAL: ' + (state.resources && state.resources[r.bottleneck] ? state.resources[r.bottleneck].name : r.bottleneck === 'food' ? 'Food' : r.bottleneck) + ' depletes in ' + formatRunway(r.minutes) + '. Tap for breakdown.';
  } else if (r.minutes < 4 * 60) {
    stat.classList.add('runway-warn');
    stat.title = (state.resources && state.resources[r.bottleneck] ? state.resources[r.bottleneck].name : r.bottleneck === 'food' ? 'Food' : r.bottleneck) + ' depletes in ' + formatRunway(r.minutes) + '. Tap for breakdown.';
  } else {
    stat.title = 'Reserves last ' + formatRunway(r.minutes) + ' (bottleneck: ' + (state.resources && state.resources[r.bottleneck] ? state.resources[r.bottleneck].name : r.bottleneck === 'food' ? 'Food' : r.bottleneck) + '). Tap for breakdown.';
  }
}
