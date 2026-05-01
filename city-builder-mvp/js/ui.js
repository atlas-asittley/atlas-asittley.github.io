// ── UI helpers: screens, toasts, errors ──

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
