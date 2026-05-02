// ── Entry point: bootstrap the app ──
import { PAGE_BUILD, REPO_OWNER, REPO_NAME } from './version.js';
import { sb } from './config.js';
import { showScreen } from './ui.js';
import { checkProfileAndRoute, initAuthEvents } from './auth.js';
import { initGameEvents } from './game.js';

var versionBadge = document.getElementById('version-badge');
versionBadge.textContent = PAGE_BUILD + ' • checking repo…';
versionBadge.title = 'Click to copy build info';

function flashBadgeCopied(ok) {
  var original = versionBadge.textContent;
  versionBadge.classList.add('copied');
  versionBadge.textContent = ok ? 'Copied build info' : 'Copy failed';
  setTimeout(function () {
    versionBadge.classList.remove('copied');
    versionBadge.textContent = original;
  }, 1100);
}

versionBadge.addEventListener('click', function () {
  var text = versionBadge.dataset.copyText || versionBadge.textContent;
  if (!navigator.clipboard || !navigator.clipboard.writeText) {
    flashBadgeCopied(false);
    return;
  }
  navigator.clipboard.writeText(text)
    .then(function () { flashBadgeCopied(true); })
    .catch(function () { flashBadgeCopied(false); });
});

function setBadgeText(text) {
  versionBadge.textContent = text;
  versionBadge.dataset.copyText = text;
}

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
