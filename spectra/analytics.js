// Tiny, privacy-friendly analytics. Writes events to our own Supabase (public
// key, insert-only). No cookies, no PII, no fingerprinting — just a random
// per-browser id so we can count unique players. Never blocks the game.
(function () {
  // Skip automated browsers (puppeteer/headless/most bots set navigator.webdriver).
  try { if (navigator.webdriver) return; } catch (e) {}
  var URL = 'https://igaulapupbtdcqqjobhs.supabase.co/rest/v1/site_events';
  var KEY = 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e';
  var GAME = 'spectra';
  function sid() {
    try {
      var s = localStorage.getItem('aa_sid');
      if (!s) { s = Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('aa_sid', s); }
      return s;
    } catch (e) { return 'na'; }
  }
  function track(type, meta) {
    try {
      var body = JSON.stringify({ game: GAME, type: type, sid: sid(), ref: (document.referrer || '').split('/')[2] || null, meta: meta || null });
      fetch(URL, { method: 'POST', headers: { apikey: KEY, Authorization: 'Bearer ' + KEY, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: body, keepalive: true }).catch(function () {});
    } catch (e) {}
  }
  window.aaTrack = track;
  track('visit');
})();
