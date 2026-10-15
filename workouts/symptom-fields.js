/* symptom-fields.js — ONE definition of the symptom check-in, shared by checkin.html and index.html.
   Created 2026-10-15 at Drew's suggestion ("why don't we use the same checkin fields as the check-in
   page?"). Before this, the field list lived in both pages and had to be patched twice, which is the
   same duplication that caused the 2026-10-13 BP-card bug. Edit the fields HERE and nowhere else. */
(function () {
  var FIELDS = [
    { col: 'back',       gid: 'sf-back',  label: 'Belt line — deep tightness/pain under the pelvic bone, toward your core (not lower down)' },
    { col: 'paraspinal', gid: 'sf-para',  label: 'Beside the spine — just ABOVE the belt line, close in to the spine', sideCol: 'paraspinal_side', sideGid: 'sf-paraside' },
    { col: 'r_band',     gid: 'sf-rband', label: 'Band — hip up to mid-back, between spine and side, EITHER side' },
    { col: 'l_hip',      gid: 'sf-lhip',  label: 'Left hip (pinch)' },
    { col: 'r_hip',      gid: 'sf-rhip',  label: 'Right hip' }
  ];
  var ACTIVITIES = ['Just woke', 'Sitting <1h', 'Sitting 1–3h', 'Sitting 3h+', 'Standing', 'Walking', 'Driving', 'Pre-workout', 'After workout', 'Lifting', 'Lying down', 'Other'];

  var CSS = '.sf-metric{margin:10px 0}.sf-metric>.sf-lbl{font-size:12px;color:var(--dim);margin-bottom:4px;line-height:1.35}'
    + '.sf-scale{display:flex;gap:3px}.sf-scale button{flex:1;min-width:0;background:var(--bg);border:1px solid var(--border);color:var(--dim);border-radius:5px;padding:9px 0;font-family:inherit;font-size:13px}'
    + '.sf-scale button.sel{background:var(--green);color:#04231b;border-color:var(--green);font-weight:bold}'
    + '.sf-chips{display:flex;flex-wrap:wrap;gap:6px}.sf-chips button{background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:14px;padding:7px 11px;font-family:inherit;font-size:12.5px}'
    + '.sf-chips button.sel{background:var(--green);color:#04231b;border-color:var(--green);font-weight:bold}'
    + '.sf-note{width:100%;background:var(--bg);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:8px;font-family:inherit;font-size:15px;min-height:52px;box-sizing:border-box}';

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function group(gid, opts, cls, preset) {
    return '<div class="' + cls + '" data-group="' + gid + '" data-val="' + esc(preset == null ? '' : preset) + '">'
      + opts.map(function (o) {
        var v = esc(String(o));
        return '<button type="button" data-v="' + v + '"' + (String(o) === String(preset) ? ' class="sel"' : '') + '>' + v + '</button>';
      }).join('') + '</div>';
  }
  function scale(gid) { var o = []; for (var i = 0; i <= 10; i++) o.push(i); return group(gid, o, 'sf-scale'); }
  function gval(gid) { var el = document.querySelector('[data-group="' + gid + '"]'); return el ? (el.getAttribute('data-val') || null) : null; }
  function numOr(gid) { var v = gval(gid); return v == null || v === '' ? null : parseInt(v, 10); }

  var bound = false;
  function bind() {
    if (bound) return; bound = true;
    document.addEventListener('click', function (e) {
      var b = e.target && e.target.closest ? e.target.closest('[data-group] button') : null;
      if (!b) return;
      var g = b.parentNode;
      Array.prototype.forEach.call(g.children, function (x) { x.classList.remove('sel'); });
      b.classList.add('sel'); g.setAttribute('data-val', b.getAttribute('data-v'));
    });
    if (!document.getElementById('sf-css')) {
      var st = document.createElement('style'); st.id = 'sf-css'; st.textContent = CSS; document.head.appendChild(st);
    }
  }

  /* render(hostEl, opts) — opts.activity preselects an activity chip; opts.context:false hides
     activity/stress/note. Returns nothing; read it back with SymptomFields.read(). */
  function render(host, opts) {
    opts = opts || {}; bind();
    var h = '';
    FIELDS.forEach(function (f) {
      h += '<div class="sf-metric"><div class="sf-lbl">' + f.label + ' — 0 none, 10 worst</div>' + scale(f.gid) + '</div>';
      if (f.sideGid) h += '<div class="sf-metric"><div class="sf-lbl">… and which side is that one?</div>' + group(f.sideGid, ['L', 'R', 'Both'], 'sf-chips') + '</div>';
    });
    if (opts.context !== false) {
      h += '<div class="sf-metric"><div class="sf-lbl">What were you just doing?</div>' + group('sf-act', ACTIVITIES, 'sf-chips', opts.activity) + '</div>';
      h += '<div class="sf-metric"><div class="sf-lbl">Stress right now (optional)</div>' + group('sf-stress', ['Low', 'Med', 'High'], 'sf-chips') + '</div>';
      h += '<div class="sf-metric"><div class="sf-lbl">Note (optional)</div><textarea id="sf-note" class="sf-note" placeholder="e.g. worse after driving; eased when I stood up"></textarea></div>';
    }
    host.innerHTML = h;
  }

  /* read() — returns a workout_symptom_log row, or null if no pain number was tapped. */
  function read(fallbackActivity) {
    var any = false, row = {};
    FIELDS.forEach(function (f) {
      var v = numOr(f.gid); row[f.col] = v; if (v != null) any = true;
      if (f.sideCol) row[f.sideCol] = gval(f.sideGid);
    });
    if (!any) return null;
    var d = new Date(), p = function (n) { return String(n).padStart(2, '0'); };
    row.logged_at = d.toISOString();
    row.log_date = d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    row.local_time = p(d.getHours()) + ':' + p(d.getMinutes());
    row.hour = d.getHours();
    row.activity = gval('sf-act') || fallbackActivity || null;
    row.stress = gval('sf-stress');
    var n = document.getElementById('sf-note');
    row.note = n && n.value.trim() ? n.value.trim() : null;
    return row;
  }

  window.SymptomFields = { FIELDS: FIELDS, ACTIVITIES: ACTIVITIES, render: render, read: read };
})();
