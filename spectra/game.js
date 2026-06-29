import {
  MAX_GUESSES, MAX_VALUE, CHANNELS,
  dayNumber, targetForDay, evaluateGuess, isWin, isValidGuess,
  shareText, toCss,
} from './logic.js';

// ── Config ───────────────────────────────────────────────────────────────
// Drew: replace this with your Ko-fi / Buy-Me-a-Coffee URL to turn on the tip
// jar. While it still contains REPLACE_ME the tip UI stays hidden.
const TIP_URL = 'https://ko-fi.com/atlasentre';
const SHARE_URL = 'atlas-asittley.github.io/spectra';

const TIP_ON = !TIP_URL.includes('REPLACE_ME');
const day = dayNumber();

// Active round context. `mode` is 'daily' or 'practice'.
let cur = makeContext('daily', targetForDay(day));
let guess = [5, 5, 5];

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function makeContext(mode, target) {
  return {
    mode,
    target,
    targetCss: toCss(target),
    game: mode === 'daily' ? loadGame() : { history: [], status: 'playing' },
  };
}
function randomTarget() {
  const t = [];
  for (let i = 0; i < CHANNELS; i++) t.push(Math.floor(Math.random() * (MAX_VALUE + 1)));
  return t;
}

// ── Persistence (daily only) ─────────────────────────────────────────────
function loadGame() {
  try {
    const raw = localStorage.getItem('spectra:day:' + day);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { history: [], status: 'playing' };
}
function saveGame() {
  if (cur.mode !== 'daily') return;
  try { localStorage.setItem('spectra:day:' + day, JSON.stringify(cur.game)); } catch {}
}
function loadStats() {
  try {
    const raw = localStorage.getItem('spectra:stats');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { played: 0, wins: 0, curStreak: 0, maxStreak: 0, dist: {}, lastDay: 0 };
}
function saveStats(s) { try { localStorage.setItem('spectra:stats', JSON.stringify(s)); } catch {} }
function recordResult(won, guesses) {
  const s = loadStats();
  if (s.lastDay === day) return s; // already recorded today
  s.played++;
  if (won) {
    s.wins++;
    s.dist[guesses] = (s.dist[guesses] || 0) + 1;
    s.curStreak = s.lastDay === day - 1 ? s.curStreak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.curStreak);
  } else s.curStreak = 0;
  s.lastDay = day;
  saveStats(s);
  return s;
}

// ── Rendering ────────────────────────────────────────────────────────────
const DIR = { up: '▲', down: '▼' };

function buildBoard() {
  const board = $('#board');
  board.innerHTML = '';
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'row';
    for (let c = 0; c < CHANNELS; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell';
      cell.dataset.r = r; cell.dataset.c = c;
      cell.innerHTML = '<span class="num"></span><span class="dir"></span>';
      row.appendChild(cell);
    }
    const sw = document.createElement('div');
    sw.className = 'row-swatch';
    sw.dataset.r = r;
    row.appendChild(sw);
    board.appendChild(row);
  }
}

function paintRow(r, g, animate) {
  const ev = evaluateGuess(g, cur.target);
  ev.forEach((c, i) => {
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${i}"]`);
    cell.querySelector('.num').textContent = c.value;
    cell.querySelector('.dir').textContent = c.dir ? DIR[c.dir] : '';
    cell.classList.remove('green', 'yellow', 'gray');
    const apply = () => cell.classList.add(c.state);
    if (animate) {
      cell.classList.add('flip');
      setTimeout(apply, 230 + i * 60);
      setTimeout(() => cell.classList.remove('flip'), 520 + i * 60);
      cell.style.animationDelay = i * 60 + 'ms';
    } else apply();
  });
  document.querySelector(`.row-swatch[data-r="${r}"]`).style.background = toCss(g);
}

function renderHistory() { cur.game.history.forEach((g, r) => paintRow(r, g, false)); }

function updatePreview() {
  $('#preview-swatch').style.background = toCss(guess);
  $$('.stepper').forEach((st) => { st.querySelector('.ch-val').textContent = guess[+st.dataset.ch]; });
}

function setMystery() {
  const sw = $('#target-swatch');
  sw.style.background = '';        // fall back to checker pattern in CSS
  $('#target-mark').textContent = '?';
  $('#target-caption').textContent = cur.mode === 'practice' ? 'practice — the mystery color' : 'the mystery color';
}
function revealTarget() {
  $('#target-swatch').style.background = cur.targetCss;
  $('#target-mark').textContent = '';
  $('#target-caption').textContent = 'RGB ' + cur.target.join('-');
}

// ── Game flow ────────────────────────────────────────────────────────────
function submitGuess() {
  if (cur.game.status !== 'playing' || !isValidGuess(guess)) return;
  const r = cur.game.history.length;
  cur.game.history.push([...guess]);
  paintRow(r, guess, true);
  vibrate(15);

  const won = isWin(evaluateGuess(guess, cur.target));
  if (won) cur.game.status = 'won';
  else if (cur.game.history.length >= MAX_GUESSES) cur.game.status = 'lost';
  saveGame();

  if (cur.game.status !== 'playing') {
    setTimeout(() => finish(won), 230 + CHANNELS * 60 + 250);
  }
}

function finish(won) {
  if (cur.mode === 'daily') recordResult(won, cur.game.history.length);
  revealTarget();
  $('#input-area').classList.add('hidden');
  $('#endgame').classList.remove('hidden');

  const n = cur.game.history.length;
  const swatch = `<span class="inline-swatch" style="background:${cur.targetCss}"></span>`;
  $('#reveal-text').innerHTML = won
    ? `Nice! Solved in <b>${n}/${MAX_GUESSES}</b>. The color was <b>${cur.target.join('-')}</b> ${swatch}`
    : `Out of guesses — the color was <b>${cur.target.join('-')}</b> ${swatch}`;

  // Daily vs practice endgame controls
  const isDaily = cur.mode === 'daily';
  try { if (window.aaTrack && isDaily) aaTrack(won ? 'win' : 'loss', { n: cur.game.history.length }); } catch {}
  $('#share-btn').classList.toggle('hidden', !isDaily);
  $('#countdown-wrap').classList.toggle('hidden', !isDaily);
  const pb = $('#practice-btn');
  pb.classList.remove('hidden');
  pb.textContent = isDaily ? '🎲 PLAY UNLIMITED' : '🎲 PLAY AGAIN';

  if (TIP_ON) {
    const el = $('#tip-nudge');
    el.innerHTML = `Spectra is free &amp; ad-free. <a href="${TIP_URL}" target="_blank" rel="noopener">☕ Buy the dev a coffee</a> to keep the daily puzzles coming.`;
    el.classList.remove('hidden');
  }

  if (won) { vibrate([20, 40, 20]); celebrate(); }
  if (isDaily) startCountdown();
}

function startPractice() {
  try { window.aaTrack && aaTrack('practice'); } catch {}
  cur = makeContext('practice', randomTarget());
  guess = [5, 5, 5];
  buildBoard();
  setMystery();
  updatePreview();
  $('#day-label').textContent = 'Practice';
  $('#endgame').classList.add('hidden');
  $('#tip-nudge').classList.add('hidden');
  $('#input-area').classList.remove('hidden');
}

function buildShare() {
  const evals = cur.game.history.map((g) => evaluateGuess(g, cur.target));
  return shareText(day, evals, cur.game.status === 'won', SHARE_URL);
}
async function share() {
  const text = buildShare();
  try {
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      await navigator.share({ text }); return;
    }
  } catch {}
  try { await navigator.clipboard.writeText(text); toast('Result copied — paste it anywhere!'); }
  catch { toast('Copy failed — long-press to copy.'); }
}

// ── Stats UI ─────────────────────────────────────────────────────────────
function openStats() {
  const s = loadStats();
  const winPct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  $('#stats-row').innerHTML = [['Played', s.played], ['Win %', winPct], ['Streak', s.curStreak], ['Max', s.maxStreak]]
    .map(([l, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('');
  const max = Math.max(1, ...Object.values(s.dist));
  const curN = (cur.mode === 'daily' && cur.game.status === 'won') ? cur.game.history.length : -1;
  $('#dist').innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => i + 1).map((n) => {
    const v = s.dist[n] || 0;
    return `<div class="bar-row"><span class="n">${n}</span><div class="bar ${n === curN ? 'cur' : ''}" style="width:${8 + (v / max) * 92}%">${v}</div></div>`;
  }).join('');
  $('#share-btn-2').classList.toggle('hidden', !(cur.mode === 'daily' && cur.game.status !== 'playing'));
  show('#stats-modal');
}

// ── Helpers ──────────────────────────────────────────────────────────────
function show(sel) { $(sel).classList.remove('hidden'); }
function hide(sel) { $(sel).classList.add('hidden'); }
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
}
function celebrate() {
  const colors = ['#ff5a5a', '#45d67e', '#5a8bff', '#d9b53a', '#fff'];
  for (let i = 0; i < 60; i++) {
    const d = document.createElement('div');
    const size = 6 + Math.random() * 8;
    Object.assign(d.style, {
      position: 'fixed', top: '-20px', left: Math.random() * 100 + 'vw',
      width: size + 'px', height: size + 'px', background: colors[i % colors.length],
      borderRadius: Math.random() > 0.5 ? '50%' : '2px', zIndex: 90, pointerEvents: 'none',
      transform: `rotate(${Math.random() * 360}deg)`,
    });
    document.body.appendChild(d);
    d.animate(
      [{ transform: d.style.transform + ' translateY(0)', opacity: 1 },
       { transform: `translateY(${100 + Math.random() * 30}vh) rotate(${Math.random() * 720}deg)`, opacity: 0.9 }],
      { duration: 1600 + Math.random() * 1200, easing: 'cubic-bezier(.4,.1,.3,1)' }
    ).onfinish = () => d.remove();
  }
}
let cdTimer;
function startCountdown() {
  const el = $('#countdown');
  function tick() {
    const now = new Date();
    const next = new Date(now); next.setUTCHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    el.textContent = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60]
      .map((x) => String(x).padStart(2, '0')).join(':');
    if (s === 0) location.reload();
  }
  tick(); clearInterval(cdTimer); cdTimer = setInterval(tick, 1000);
}

// ── Wire up ──────────────────────────────────────────────────────────────
function bind() {
  $$('.stepper').forEach((st) => {
    const ch = +st.dataset.ch;
    st.querySelector('.up').addEventListener('click', () => { guess[ch] = Math.min(MAX_VALUE, guess[ch] + 1); updatePreview(); vibrate(8); });
    st.querySelector('.down').addEventListener('click', () => { guess[ch] = Math.max(0, guess[ch] - 1); updatePreview(); vibrate(8); });
  });
  $('#guess-btn').addEventListener('click', submitGuess);
  $('#share-btn').addEventListener('click', share);
  $('#share-btn-2').addEventListener('click', share);
  $('#practice-btn').addEventListener('click', startPractice);
  $('#help-btn').addEventListener('click', () => show('#help-modal'));
  $('#stats-btn').addEventListener('click', openStats);
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { hide('#help-modal'); hide('#stats-modal'); }));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));
  document.addEventListener('keydown', (e) => {
    if (cur.game.status !== 'playing') return;
    if (e.key === 'Enter') submitGuess();
    else if (/^[0-9]$/.test(e.key)) { guess = [guess[1], guess[2], +e.key]; updatePreview(); }
  });
  const tip = $('#tip-link');
  if (!TIP_ON) tip.style.display = 'none'; else tip.href = TIP_URL;
  document.addEventListener('click', (e) => {
    const a = e.target.closest && e.target.closest('a[href*="ko-fi.com"]');
    if (a) { try { window.aaTrack && aaTrack('tip_click'); } catch {} }
  });
}

function init() {
  $('#day-label').textContent = 'Day #' + day;
  buildBoard();
  bind();
  updatePreview();
  if (cur.game.history.length) renderHistory();
  if (cur.game.status === 'playing') {
    if (!localStorage.getItem('spectra:seen-help')) { show('#help-modal'); localStorage.setItem('spectra:seen-help', '1'); }
  } else {
    // restore finished daily endgame
    finishRestore();
  }
}
function finishRestore() {
  revealTarget();
  $('#input-area').classList.add('hidden');
  $('#endgame').classList.remove('hidden');
  const n = cur.game.history.length;
  const swatch = `<span class="inline-swatch" style="background:${cur.targetCss}"></span>`;
  $('#reveal-text').innerHTML = cur.game.status === 'won'
    ? `Solved in <b>${n}/${MAX_GUESSES}</b>. The color was <b>${cur.target.join('-')}</b> ${swatch}`
    : `Out of guesses — the color was <b>${cur.target.join('-')}</b> ${swatch}`;
  $('#practice-btn').classList.remove('hidden');
  $('#practice-btn').textContent = '🎲 PLAY UNLIMITED';
  if (TIP_ON) {
    const el = $('#tip-nudge');
    el.innerHTML = `Spectra is free &amp; ad-free. <a href="${TIP_URL}" target="_blank" rel="noopener">☕ Buy the dev a coffee</a> to keep the daily puzzles coming.`;
    el.classList.remove('hidden');
  }
  startCountdown();
}

init();
