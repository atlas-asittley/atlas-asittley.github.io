// ── Entry point: bootstrap the app ──
import { APP_VERSION } from './version.js';
import { sb } from './config.js';
import { showScreen } from './ui.js';
import { checkProfileAndRoute, initAuthEvents } from './auth.js';
import { initGameEvents } from './game.js';

// Display version
document.getElementById('version-badge').textContent = APP_VERSION;

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
