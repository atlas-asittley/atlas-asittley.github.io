// ── UI helpers: screens, toasts, errors, topbar ──
import { state } from './state.js';
import { addNotification } from './notifications.js';

var screens = document.querySelectorAll('.screen');

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

// All notification surface is now the bell-icon log. showToast() is kept
// as a thin compatibility shim so the dozens of existing callers don't
// each need a touch — empty / unknown types map to 'info'.
export function showToast(msg, type) {
  if (!msg) return;
  var t = (type === 'success' || type === 'info' || type === 'warn' || type === 'error') ? type : 'info';
  addNotification(t, msg);
}

// ── Topbar state display ──
export function updateMoney() {
  document.getElementById('g-money').textContent = '$' + state.profile.money;
  // Also refresh district chunk count and the expand button cost (M1)
  var chunksOwned = state.profile.chunks_owned || 1;
  var chunksEl = document.getElementById('g-chunks');
  if (chunksEl) chunksEl.textContent = chunksOwned;
  var expandBtn = document.getElementById('g-expand-district');
  if (expandBtn) {
    var nextCost = 1000 * chunksOwned * chunksOwned;
    var canAfford = (state.profile.money || 0) >= nextCost;
    expandBtn.title = 'Buy the next chunk for $' + nextCost + (canAfford ? '' : ' (insufficient funds)');
    expandBtn.disabled = !canAfford;
    expandBtn.classList.toggle('disabled', !canAfford);
  }
}

export function updateWorkers() {
  var li = state.laborInfo;
  var el = document.getElementById('g-workers');
  el.textContent = li.workersUsed + '/' + li.workerSupply;
  el.className = 'v ' + (li.laborShortage ? 'shortage' : 'workers');
  el.title = li.laborShortage
    ? 'Labor shortage! ' + li.workersNeeded + ' workers needed, only ' + li.workerSupply + ' available. Build more housing.'
    : li.workersIdle > 0
      ? li.workersUsed + ' of ' + li.workerSupply + ' workers employed (' + li.workersIdle + ' idle — build more production to use them)'
      : 'All ' + li.workerSupply + ' workers employed';
  var badge = document.getElementById('g-labor-badge');
  if (badge) {
    badge.style.display = li.laborShortage ? 'inline' : 'none';
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
