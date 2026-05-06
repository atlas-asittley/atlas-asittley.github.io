// ── Notification log ──
//
// Background events that used to spam the toast layer (housing
// upgraded / devolved, trade-offer arrived, deficit warning, ...) get
// routed here instead. Persistent across reloads, capped at MAX_LOG
// entries, scoped per user.
//
// API surface:
//   addNotification(type, message)  — append; type ∈ success/info/warn/error
//   getNotifications()              — newest-first list
//   markAllRead()
//   unreadCount()
//   clearAll()
//
// The bell button + dropdown live here too — exported as
// initNotificationBell() called once at game-enter time.

import { state } from './state.js';

var MAX_LOG = 50;
var STORAGE_PREFIX = 'city_notifications:';
var READ_PREFIX = 'city_notifications_read_at:';

var listeners = [];
var entries = [];           // newest-first
var lastReadAt = 0;         // ms epoch — entries older than this are 'read'

// Some background tabs / bursts can fire the same event repeatedly in
// the same tick; collapse identical (type+message) entries that arrive
// within DEDUP_MS of the prior one.
var DEDUP_MS = 1500;

function storageKey() {
  var uid = state.currentUser && state.currentUser.id;
  return uid ? STORAGE_PREFIX + uid : null;
}
function readKey() {
  var uid = state.currentUser && state.currentUser.id;
  return uid ? READ_PREFIX + uid : null;
}

function persist() {
  var k = storageKey();
  if (!k) return;
  try { localStorage.setItem(k, JSON.stringify(entries)); }
  catch (e) { /* quota exceeded — drop the oldest half and retry */
    entries = entries.slice(0, Math.floor(MAX_LOG / 2));
    try { localStorage.setItem(k, JSON.stringify(entries)); } catch (e2) {}
  }
}
function persistReadAt() {
  var k = readKey();
  if (k) localStorage.setItem(k, String(lastReadAt));
}

export function loadNotifications() {
  var k = storageKey(), rk = readKey();
  if (!k) { entries = []; lastReadAt = 0; return; }
  try {
    var raw = localStorage.getItem(k);
    entries = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(entries)) entries = [];
  } catch (e) { entries = []; }
  var rraw = localStorage.getItem(rk);
  lastReadAt = rraw ? Number(rraw) || 0 : 0;
  notifyListeners();
}

export function addNotification(type, message) {
  if (!message) return;
  var now = Date.now();
  // Dedup: if the very latest entry matches and is recent, just bump its
  // count instead of adding a sibling. Avoids 5x "Cottage devolved to Hut"
  // when 5 houses devolve in one tick.
  if (entries.length > 0) {
    var last = entries[0];
    if (last.type === type && last.message === message && (now - last.t) < DEDUP_MS) {
      last.t = now;
      last.count = (last.count || 1) + 1;
      persist();
      notifyListeners();
      return;
    }
  }
  entries.unshift({ t: now, type: type || 'info', message: message, count: 1 });
  if (entries.length > MAX_LOG) entries.length = MAX_LOG;
  persist();
  notifyListeners();
}

export function getNotifications() { return entries.slice(); }

export function unreadCount() {
  var n = 0;
  for (var i = 0; i < entries.length; i++) {
    if (entries[i].t > lastReadAt) n++;
    else break; // newest-first; once we hit a read entry, we're done
  }
  return n;
}

export function markAllRead() {
  if (entries.length === 0) return;
  lastReadAt = entries[0].t;
  persistReadAt();
  notifyListeners();
}

export function clearAll() {
  entries = [];
  persist();
  notifyListeners();
}

function notifyListeners() { listeners.forEach(function (cb) { try { cb(); } catch (e) {} }); }
function subscribe(cb) { listeners.push(cb); }


// ── Bell button + dropdown ──

var dropdownEl = null;
var bellInitialized = false;

export function initNotificationBell() {
  if (bellInitialized) return;
  bellInitialized = true;
  var bell = document.getElementById('g-notifications');
  if (!bell) return;
  bell.addEventListener('click', toggleDropdown);
  subscribe(updateBadge);
  document.addEventListener('click', function (e) {
    if (!dropdownEl) return;
    if (dropdownEl.contains(e.target) || bell.contains(e.target)) return;
    closeDropdown();
  });
  updateBadge();
}

function updateBadge() {
  var bell = document.getElementById('g-notifications');
  if (!bell) return;
  var n = unreadCount();
  var badge = bell.querySelector('.notif-badge');
  if (n > 0) {
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'notif-badge';
      bell.appendChild(badge);
    }
    badge.textContent = n > 9 ? '9+' : String(n);
  } else if (badge) {
    badge.remove();
  }
  if (dropdownEl) renderDropdownBody();
}

function toggleDropdown() {
  if (dropdownEl) { closeDropdown(); return; }
  openDropdown();
}

function openDropdown() {
  dropdownEl = document.createElement('div');
  dropdownEl.className = 'notif-dropdown';
  dropdownEl.innerHTML = '<div class="notif-header"><span class="notif-title">Notifications</span>'
    + '<button class="notif-clear" id="notif-clear">Clear</button></div>'
    + '<div class="notif-list" id="notif-list"></div>';
  document.body.appendChild(dropdownEl);
  positionDropdown();
  document.getElementById('notif-clear').addEventListener('click', function (e) {
    e.stopPropagation();
    clearAll();
  });
  renderDropdownBody();
  // Mark read on a slight delay so the unread style is visible briefly
  setTimeout(markAllRead, 250);
}

function closeDropdown() {
  if (!dropdownEl) return;
  dropdownEl.remove();
  dropdownEl = null;
}

function positionDropdown() {
  var bell = document.getElementById('g-notifications');
  if (!bell || !dropdownEl) return;
  var r = bell.getBoundingClientRect();
  // Pin to the right edge of the viewport rather than aligning with the
  // bell — the bell can sit deep inside topbar-right (with several other
  // buttons after it on desktop, or near the right edge on mobile), and
  // anchoring to it pushed the 320px panel off the left edge on phones.
  dropdownEl.style.top = (r.bottom + 6) + 'px';
  dropdownEl.style.right = '8px';
  dropdownEl.style.left = 'auto';
}

function renderDropdownBody() {
  var list = document.getElementById('notif-list');
  if (!list) return;
  if (entries.length === 0) {
    list.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
    return;
  }
  var html = '';
  entries.forEach(function (e) {
    var unread = e.t > lastReadAt;
    var countSuffix = (e.count && e.count > 1) ? ' <span class="notif-count">×' + e.count + '</span>' : '';
    html += '<div class="notif-row notif-' + (e.type || 'info') + (unread ? ' notif-unread' : '') + '">'
         +    '<span class="notif-dot"></span>'
         +    '<span class="notif-msg">' + escapeHtml(e.message) + countSuffix + '</span>'
         +    '<span class="notif-time">' + relTime(e.t) + '</span>'
         +  '</div>';
  });
  list.innerHTML = html;
}

function relTime(t) {
  var s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return s + 's';
  if (s < 3600) return Math.floor(s / 60) + 'm';
  if (s < 86400) return Math.floor(s / 3600) + 'h';
  return Math.floor(s / 86400) + 'd';
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
  });
}
