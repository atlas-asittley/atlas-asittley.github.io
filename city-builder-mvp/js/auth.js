// ── Authentication: login, register, logout, industry selection ──
import { sb } from './config.js';
import { state } from './state.js';
import { showScreen, showError, clearError, updateMoney, showToast } from './ui.js';
import { enterGame, stopProdLoop } from './game.js';

var selectedIndustry = null;

export function checkProfileAndRoute(user) {
  state.currentUser = user;
  sb.from('player_profiles').select('*').eq('id', user.id).maybeSingle()
    .then(function (r) {
      if (r.error) {
        console.warn('Profile check error:', r.error.message);
        enterIndustrySelect();
        return;
      }
      if (r.data && r.data.industry_key) {
        state.profile = r.data;
        enterGame();
      } else {
        enterIndustrySelect();
      }
    })
    .catch(function () { enterIndustrySelect(); });
}

function enterIndustrySelect() {
  var nameInput = document.getElementById('industry-name');
  nameInput.value = (state.currentUser.email || '').split('@')[0];
  selectedIndustry = null;
  document.querySelectorAll('.industry-card').forEach(function (c) { c.classList.remove('selected'); });
  document.getElementById('industry-confirm').disabled = true;
  clearError(document.getElementById('industry-error'));
  showScreen('screen-industry');
}

export function initAuthEvents() {
  // Industry cards
  document.querySelectorAll('.industry-card').forEach(function (card) {
    card.addEventListener('click', function () {
      document.querySelectorAll('.industry-card').forEach(function (c) { c.classList.remove('selected'); });
      card.classList.add('selected');
      selectedIndustry = card.dataset.industry;
      document.getElementById('industry-confirm').disabled = false;
    });
  });

  // Industry confirm
  document.getElementById('industry-confirm').addEventListener('click', function () {
    var name = document.getElementById('industry-name').value.trim();
    var errEl = document.getElementById('industry-error');
    clearError(errEl);
    if (!name || name.length < 2) { showError(errEl, 'Name must be at least 2 characters.'); return; }
    if (!selectedIndustry) { showError(errEl, 'Choose an industry.'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Setting up...';

    sb.rpc('choose_industry', { p_display_name: name, p_industry_key: selectedIndustry })
      .then(function (r) {
        if (r.error) {
          // FK violation on player_profiles_id_fkey means the JWT references
          // an auth.users row that no longer exists (account was deleted
          // server-side). Sign out so the next reload starts clean.
          if (r.error.message && r.error.message.indexOf('player_profiles_id_fkey') !== -1) {
            showError(errEl, 'This session points to a deleted account. Signing you out — please register again.');
            sb.auth.signOut().then(function () { showScreen('screen-welcome'); });
            return;
          }
          showError(errEl, r.error.message);
          btn.disabled = false;
          btn.textContent = 'Start Building';
          return;
        }
        state.profile = r.data;
        enterGame();
      })
      .catch(function (err) {
        showError(errEl, err.message || 'Setup failed. Try again.');
        btn.disabled = false;
        btn.textContent = 'Start Building';
      });
  });

  // Navigation between auth screens
  document.getElementById('btn-to-login').addEventListener('click', function () { showScreen('screen-login'); });
  document.getElementById('btn-to-register').addEventListener('click', function () { showScreen('screen-register'); });
  document.getElementById('login-to-register').addEventListener('click', function () {
    clearError(document.getElementById('login-error'));
    showScreen('screen-register');
  });
  document.getElementById('register-to-login').addEventListener('click', function () {
    clearError(document.getElementById('register-error'));
    showScreen('screen-login');
  });

  // Login form
  document.getElementById('login-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('login-error');
    clearError(err);
    var email = document.getElementById('login-email').value.trim();
    var pw = document.getElementById('login-password').value;
    if (!email || !pw) { showError(err, 'Email and password are required.'); return; }
    var btn = document.getElementById('login-submit');
    btn.disabled = true; btn.textContent = 'Signing in...';
    sb.auth.signInWithPassword({ email: email, password: pw }).then(function (r) {
      btn.disabled = false; btn.textContent = 'Sign In';
      if (r.error) showError(err, r.error.message);
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Sign In';
      showError(err, e.message || 'Login failed.');
    });
  });

  // Register form
  document.getElementById('register-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var err = document.getElementById('register-error');
    clearError(err);
    var email = document.getElementById('register-email').value.trim();
    var pw = document.getElementById('register-password').value;
    var confirm = document.getElementById('register-confirm').value;
    if (!email || !pw) { showError(err, 'Email and password are required.'); return; }
    if (pw.length < 6) { showError(err, 'Password must be at least 6 characters.'); return; }
    if (pw !== confirm) { showError(err, 'Passwords do not match.'); return; }
    var btn = document.getElementById('register-submit');
    btn.disabled = true; btn.textContent = 'Creating account...';
    sb.auth.signUp({ email: email, password: pw }).then(function (r) {
      if (r.error) {
        btn.disabled = false; btn.textContent = 'Create Account';
        showError(err, r.error.message);
        return;
      }
      if (r.data && r.data.session) {
        btn.disabled = false; btn.textContent = 'Create Account';
        return;
      }
      sb.auth.signInWithPassword({ email: email, password: pw }).then(function (lr) {
        btn.disabled = false; btn.textContent = 'Create Account';
        if (lr.error) showError(err, 'Account created! Please sign in.');
      }).catch(function () {
        btn.disabled = false; btn.textContent = 'Create Account';
        showError(err, 'Account created! Please sign in.');
      });
    }).catch(function (e) {
      btn.disabled = false; btn.textContent = 'Create Account';
      showError(err, e.message || 'Registration failed.');
    });
  });

  // Logout
  document.getElementById('g-logout').addEventListener('click', function () {
    stopProdLoop();
    if (state.channel) sb.removeChannel(state.channel);
    sb.auth.signOut().then(function () {
      state.currentUser = null;
      state.profile = null;
      showScreen('screen-welcome');
    });
  });

  // Reset game: wipe the player's game state and route to industry
  // selection so they can pick a fresh start. Auth session is kept so
  // they don't have to re-login. Heavily warned because this is
  // destructive — every chunk, building, and inventory is gone.
  document.getElementById('g-reset').addEventListener('click', function () {
    if (!state.currentUser) return;
    if (!confirm('Reset your game? Every chunk, building, and resource you have will be permanently deleted. This cannot be undone.')) return;
    var btn = document.getElementById('g-reset');
    btn.disabled = true;
    btn.textContent = 'Resetting…';
    sb.rpc('reset_player', { p_player_id: state.currentUser.id }).then(function (r) {
      if (r.error) {
        btn.disabled = false;
        btn.textContent = 'Reset';
        alert('Reset failed: ' + r.error.message);
        return;
      }
      stopProdLoop();
      if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
      // Profile is gone — re-routing through checkProfileAndRoute will
      // land the user on the industry-selection screen, where
      // choose_industry recreates the profile and a starter chunk.
      state.profile = null;
      btn.disabled = false;
      btn.textContent = 'Reset';
      checkProfileAndRoute(state.currentUser);
    }).catch(function (err) {
      btn.disabled = false;
      btn.textContent = 'Reset';
      alert('Reset failed: ' + (err.message || err));
    });
  });

  // Cheat: triple-tap the money display to grant $100,000. Strictly for
  // testing — easy to spot in the topbar so you don't trigger it by
  // accident during normal play.
  var moneyTaps = [];
  document.getElementById('g-money').addEventListener('click', function () {
    if (!state.currentUser || !state.profile) return;
    var now = Date.now();
    moneyTaps = moneyTaps.filter(function (t) { return now - t < 1500; });
    moneyTaps.push(now);
    if (moneyTaps.length < 3) return;
    moneyTaps = [];
    var bonus = 100000;
    sb.from('player_profiles')
      .update({ money: state.profile.money + bonus })
      .eq('id', state.currentUser.id)
      .then(function (r) {
        if (r.error) {
          showToast('Cheat failed: ' + r.error.message, 'error');
          return;
        }
        state.profile.money += bonus;
        updateMoney();
        showToast('+$' + bonus.toLocaleString() + ' (cheat)', 'success');
      });
  });
}
