// ── Entry point: bootstrap the app ──
import { PAGE_BUILD, REPO_OWNER, REPO_NAME } from './version.js';
import { sb } from './config.js';
import { showScreen } from './ui.js';
import { checkProfileAndRoute, initAuthEvents } from './auth.js';
import { initGameEvents } from './game.js';

var versionBadge = document.getElementById('version-badge');
versionBadge.textContent = PAGE_BUILD + ' • checking repo…';
versionBadge.title = 'Tap to bust cache & reload';

function setBadgeText(text) {
  versionBadge.textContent = text;
  versionBadge.dataset.copyText = text;
}

// Tap badge → clear any browser-side caches and reload with a fresh URL.
// The unique query string forces the HTML fetch to bypass the HTTP cache;
// referenced JS/CSS revalidate as part of a full navigation. Sufficient
// for the GitHub-Pages test cycle without a build step.
async function bustCacheAndReload() {
  versionBadge.classList.add('copied');
  versionBadge.textContent = 'reloading…';
  try {
    if ('serviceWorker' in navigator) {
      var regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(function (r) { return r.unregister(); }));
    }
    if (typeof caches !== 'undefined' && caches.keys) {
      var keys = await caches.keys();
      await Promise.all(keys.map(function (k) { return caches.delete(k); }));
    }
  } catch (e) { /* best effort */ }
  var base = window.location.pathname;
  var hash = window.location.hash;
  window.location.replace(base + '?_cb=' + Date.now() + hash);
}

versionBadge.addEventListener('click', bustCacheAndReload);

fetch('https://api.github.com/repos/' + REPO_OWNER + '/' + REPO_NAME + '/commits/main', { cache: 'no-store' })
  .then(function (r) { return r.ok ? r.json() : null; })
  .then(function (data) {
    if (!data || !data.sha) {
      setBadgeText(PAGE_BUILD + ' • REPO unknown');
      return;
    }
    setBadgeText(PAGE_BUILD + ' • REPO ' + data.sha.slice(0, 7));
  })
  .catch(function () {
    setBadgeText(PAGE_BUILD + ' • REPO unknown');
  });

// Wire up all event listeners
initAuthEvents();
initGameEvents();

// Restore session on load
sb.auth.getSession().then(function (r) {
  var session = r.data && r.data.session;
  if (session && session.user) {
    checkProfileAndRoute(session.user);
  } else {
    showScreen('screen-welcome');
  }
}).catch(function () {
  showScreen('screen-welcome');
});

// Listen for auth state changes
sb.auth.onAuthStateChange(function (event, session) {
  if (event === 'SIGNED_IN' && session && session.user) {
    checkProfileAndRoute(session.user);
  } else if (event === 'SIGNED_OUT') {
    showScreen('screen-welcome');
  }
});
