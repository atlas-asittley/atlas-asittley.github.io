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
        loadCityName().then(enterGame);
      } else {
        enterIndustrySelect();
      }
    })
    .catch(function () { enterIndustrySelect(); });
}

// Pull the current player's city name into state. Cheap — single row read.
export function loadCityName() {
  if (!state.profile || !state.profile.city_id) {
    state.cityName = null;
    return Promise.resolve();
  }
  return sb.from('cities').select('name').eq('id', state.profile.city_id).maybeSingle()
    .then(function (r) { state.cityName = (r.data && r.data.name) || null; })
    .catch(function () { state.cityName = null; });
}

function enterIndustrySelect() {
  // Leave the screen-name field empty so the user actively chooses a
  // name. Previously this prefilled with the email's local part, which
  // exposed the email in their public display name by default.
  var nameInput = document.getElementById('industry-name');
  var districtInput = document.getElementById('industry-district');
  var cityInput = document.getElementById('industry-city');
  var cityField = document.getElementById('industry-city-field');
  nameInput.value = '';
  if (districtInput) districtInput.value = '';
  if (cityInput) cityInput.value = '';
  selectedIndustry = null;
  document.querySelectorAll('.industry-card').forEach(function (c) { c.classList.remove('selected'); });
  document.getElementById('industry-confirm').disabled = true;
  clearError(document.getElementById('industry-error'));
  showScreen('screen-industry');

  // Show the city-name field only if no city exists yet (first-player
  // flow). Cheap probe — single row.
  if (cityField) {
    cityField.style.display = 'none';
    sb.from('cities').select('id').limit(1).then(function (r) {
      var noCity = !r.data || r.data.length === 0;
      cityField.style.display = noCity ? '' : 'none';
    });
  }

  setTimeout(function () { nameInput.focus(); }, 60);
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
    var districtName = (document.getElementById('industry-district').value || '').trim();
    var cityField = document.getElementById('industry-city-field');
    var cityName = (document.getElementById('industry-city').value || '').trim();
    var errEl = document.getElementById('industry-error');
    clearError(errEl);
    if (!name || name.length < 2) { showError(errEl, 'Name must be at least 2 characters.'); return; }
    if (!districtName || districtName.length < 2) { showError(errEl, 'District name must be at least 2 characters.'); return; }
    if (cityField && cityField.style.display !== 'none') {
      if (!cityName || cityName.length < 2) { showError(errEl, 'City name must be at least 2 characters.'); return; }
    }
    if (!selectedIndustry) { showError(errEl, 'Choose an industry.'); return; }

    var btn = this;
    btn.disabled = true;
    btn.textContent = 'Setting up...';

    sb.rpc('choose_industry', {
      p_display_name: name,
      p_industry_key: selectedIndustry,
      p_district_name: districtName,
      p_city_name: cityName || null
    })
      .then(function (r) {
        if (r.error) {
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
        loadCityName().then(enterGame);
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

  // Reset + Logout buttons used to live in the topbar; they now sit
  // inside the Settings modal (help.js), which calls these exported
  // helpers directly.

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


// ── Session actions (called from the Settings modal in help.js) ──

export function doLogout() {
  stopProdLoop();
  if (state.channel) sb.removeChannel(state.channel);
  sb.auth.signOut().then(function () {
    state.currentUser = null;
    state.profile = null;
    showScreen('screen-welcome');
  });
}

export function doReset() {
  if (!state.currentUser) return;
  if (!confirm('Reset your district? Every parcel, building, and resource you have will be permanently deleted. This cannot be undone.')) return;
  sb.rpc('reset_player', { p_player_id: state.currentUser.id }).then(function (r) {
    if (r.error) {
      alert('Reset failed: ' + r.error.message);
      return;
    }
    stopProdLoop();
    if (state.channel) { sb.removeChannel(state.channel); state.channel = null; }
    // Hard reload after reset. checkProfileAndRoute would normally
    // re-fetch and re-render, but state.tileMap / state.allBuildings /
    // localStorage map-view all carry references to the old district
    // and any miss in the cleanup keeps the old district visible on
    // the broader map. A full page reload reloads everything from
    // scratch, which is bulletproof and simpler than chasing every
    // potential cache.
    state.profile = null;
    try { localStorage.removeItem('city_map_view_' + state.currentUser.id); } catch (e) {}
    window.location.reload();
  }).catch(function (err) {
    alert('Reset failed: ' + (err.message || err));
  });
}
