// ── Changelog modal ──
//
// "What's new" surface. On game load we ask the server for any
// changelog_entries the player hasn't seen yet (get_unseen_changelog_entries
// — newer than their player_profiles.last_changelog_seen_at watermark).
// If any come back, we pop a modal stacking them newest-first. Hitting
// "Got it" calls mark_changelog_seen() so they don't see them again.
//
// The same rendering also powers the "What's new" button inside the
// Settings modal (history mode), but that path uses list_changelog_entries
// and does NOT mark anything as seen.

import { sb } from './config.js';

var openOverlay = null;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Body is plain text; \n separates paragraphs. Render each paragraph
// in its own <p> so it breathes vertically.
function renderBody(body) {
  var paras = String(body || '').split(/\n\n?/);
  return paras.map(function (p) {
    return '<p>' + escapeHtml(p) + '</p>';
  }).join('');
}

function formatDate(ts) {
  if (!ts) return '';
  var d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function entriesHtml(entries) {
  return entries.map(function (e) {
    return (
      '<div class="changelog-entry">' +
        '<div class="changelog-entry-meta">' + escapeHtml(formatDate(e.published_at)) + '</div>' +
        '<div class="changelog-entry-title">' + escapeHtml(e.title) + '</div>' +
        '<div class="changelog-entry-body">' + renderBody(e.body) + '</div>' +
      '</div>'
    );
  }).join('');
}

function close() {
  if (!openOverlay) return;
  openOverlay.remove();
  openOverlay = null;
  document.removeEventListener('keydown', escListener);
}

function escListener(e) {
  if (e.key === 'Escape') close();
}

// mode: 'unseen' (auto-popup, has Got-it button that marks seen) or
// 'history' (Settings → What's new, just a Close button).
function open(entries, mode) {
  if (openOverlay) return;
  if (!entries || entries.length === 0) {
    if (mode === 'history') {
      openOverlay = document.createElement('div');
      openOverlay.className = 'help-overlay';
      openOverlay.innerHTML =
        '<div class="changelog-modal" role="dialog" aria-modal="true">' +
          '<div class="help-header">' +
            '<span class="help-title">📰 What\'s new</span>' +
            '<button class="help-close" id="changelog-close" aria-label="Close">×</button>' +
          '</div>' +
          '<div class="help-body changelog-body"><div class="changelog-empty">No changelog entries yet.</div></div>' +
        '</div>';
      document.body.appendChild(openOverlay);
      document.getElementById('changelog-close').addEventListener('click', close);
      openOverlay.addEventListener('click', function (e) { if (e.target === openOverlay) close(); });
      document.addEventListener('keydown', escListener);
    }
    return;
  }

  var btnLabel = (mode === 'unseen') ? 'Got it' : 'Close';
  var btnId = (mode === 'unseen') ? 'changelog-gotit' : 'changelog-close';

  openOverlay = document.createElement('div');
  openOverlay.className = 'help-overlay';
  openOverlay.innerHTML =
    '<div class="changelog-modal" role="dialog" aria-modal="true">' +
      '<div class="help-header">' +
        '<span class="help-title">📰 What\'s new</span>' +
        '<button class="help-close" id="changelog-x" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="help-body changelog-body">' +
        entriesHtml(entries) +
      '</div>' +
      '<div class="changelog-footer">' +
        '<button class="btn-primary" id="' + btnId + '">' + btnLabel + '</button>' +
      '</div>' +
    '</div>';
  document.body.appendChild(openOverlay);

  // The X always just closes (without marking seen) — that way a
  // player who isn't ready to dismiss can shut the modal and have
  // it reappear next session. Got-it explicitly marks seen.
  document.getElementById('changelog-x').addEventListener('click', close);
  openOverlay.addEventListener('click', function (e) { if (e.target === openOverlay) close(); });
  document.addEventListener('keydown', escListener);

  if (mode === 'unseen') {
    document.getElementById('changelog-gotit').addEventListener('click', function () {
      sb.rpc('mark_changelog_seen').then(function (r) {
        if (r.error) console.warn('mark_changelog_seen failed:', r.error.message);
        close();
      });
    });
  } else {
    document.getElementById('changelog-close').addEventListener('click', close);
  }
}

// Auto-popup on game load.
export function fetchAndShowUnseenChangelog() {
  return sb.rpc('get_unseen_changelog_entries').then(function (r) {
    if (r.error) {
      console.warn('get_unseen_changelog_entries failed:', r.error.message);
      return;
    }
    var entries = r.data || [];
    if (entries.length === 0) return;
    open(entries, 'unseen');
  });
}

// Manual re-open from Settings.
export function openChangelogHistory() {
  return sb.rpc('list_changelog_entries', { p_limit: 30 }).then(function (r) {
    if (r.error) {
      console.warn('list_changelog_entries failed:', r.error.message);
      open([], 'history');
      return;
    }
    open(r.data || [], 'history');
  });
}
