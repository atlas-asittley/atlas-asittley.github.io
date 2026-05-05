// ── UI helpers: screens, toasts, errors, topbar ──
import { state } from './state.js';

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

var toastTimer = null;
export function showToast(msg, type) {
  var t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show' + (type ? ' ' + type : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2500);
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
    var nextCost = 500 * chunksOwned * chunksOwned;
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
