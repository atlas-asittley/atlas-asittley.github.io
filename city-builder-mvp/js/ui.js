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
    ? 'Labor shortage! ' + li.workersNeeded + ' needed, only ' + li.workerSupply + ' available'
    : li.workersIdle > 0
      ? li.workersIdle + ' workers idle'
      : 'All workers employed';
  var badge = document.getElementById('g-labor-badge');
  if (badge) {
    badge.style.display = li.laborShortage ? 'inline' : 'none';
  }
}
