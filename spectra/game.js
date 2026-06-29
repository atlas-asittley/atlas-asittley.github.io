import {
  MAX_GUESSES, MAX_VALUE, CHANNELS,
  dayNumber, targetForDay, evaluateGuess, isWin, isValidGuess,
  shareText, toCss,
} from './logic.js';

// ── Config ───────────────────────────────────────────────────────────────
// Drew: replace this with your Ko-fi / Buy-Me-a-Coffee URL to turn on the tip
// jar. While it still contains REPLACE_ME the tip button stays hidden.
const TIP_URL = 'https://ko-fi.com/REPLACE_ME';
const SHARE_URL = 'atlas-asittley.github.io/spectra';

// ── State ────────────────────────────────────────────────────────────────
const day = dayNumber();
const target = targetForDay(day);
const targetCss = toCss(target);
let guess = [5, 5, 5];
let game = loadGame();

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

// ── Persistence ──────────────────────────────────────────────────────────
function loadGame() {
  try {
    const raw = localStorage.getItem('spectra:day:' + day);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { history: [], status: 'playing' };
}
function saveGame() {
  try { localStorage.setItem('spectra:day:' + day, JSON.stringify(game)); } catch {}
}
function loadStats() {
  try {
    const raw = localStorage.getItem('spectra:stats');
    if (raw) return JSON.parse(raw);
  } catch {}
  return { played: 0, wins: 0, curStreak: 0, maxStreak: 0, dist: {}, lastDay: 0 };
}
function saveStats(s) {
  try { localStorage.setItem('spectra:stats', JSON.stringify(s)); } catch {}
}
function recordResult(won, guesses) {
  const s = loadStats();
  if (s.lastDay === day) return s; // already recorded today
  s.played++;
  if (won) {
    s.wins++;
    s.dist[guesses] = (s.dist[guesses] || 0) + 1;
    s.curStreak = s.lastDay === day - 1 ? s.curStreak + 1 : 1;
    s.maxStreak = Math.max(s.maxStreak, s.curStreak);
  } else {
    s.curStreak = 0;
  }
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
  const ev = evaluateGuess(g, target);
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
  const sw = document.querySelector(`.row-swatch[data-r="${r}"]`);
  sw.style.background = toCss(g);
}

function renderHistory() {
  game.history.forEach((g, r) => paintRow(r, g, false));
}

function updatePreview() {
  $('#preview-swatch').style.background = toCss(guess);
  $$('.stepper').forEach((st) => {
    st.querySelector('.ch-val').textContent = guess[+st.dataset.ch];
  });
}

// ── Game flow ────────────────────────────────────────────────────────────
function submitGuess() {
  if (game.status !== 'playing') return;
  if (!isValidGuess(guess)) return;
  const r = game.history.length;
  game.history.push([...guess]);
  paintRow(r, guess, true);
  vibrate(15);

  const ev = evaluateGuess(guess, target);
  const won = isWin(ev);
  if (won) game.status = 'won';
  else if (game.history.length >= MAX_GUESSES) game.status = 'lost';
  saveGame();

  if (game.status !== 'playing') {
    const delay = 230 + CHANNELS * 60 + 250;
    setTimeout(() => finish(won), delay);
  }
}

function finish(won) {
  recordResult(won, game.history.length);
  revealTarget();
  $('#input-area').classList.add('hidden');
  const eg = $('#endgame');
  eg.classList.remove('hidden');
  $('#reveal-text').innerHTML = won
    ? `Solved in <b>${game.history.length}/${MAX_GUESSES}</b>! The color was <b>${target.join('-')}</b>.`
    : `Out of guesses. The color was <b>${target.join('-')}</b> &nbsp;<span style="display:inline-block;width:16px;height:16px;border-radius:4px;vertical-align:middle;background:${targetCss}"></span>`;
  if (won) { vibrate([20, 40, 20]); celebrate(); }
  startCountdown();
}

function revealTarget() {
  const sw = $('#target-swatch');
  sw.style.background = targetCss;
  $('#target-mark').textContent = '';
  $('#target-caption').textContent = `RGB ${target.join('-')}`;
}

function buildShare() {
  const evals = game.history.map((g) => evaluateGuess(g, target));
  return shareText(day, evals, game.status === 'won', SHARE_URL);
}

async function share() {
  const text = buildShare();
  try {
    if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
      await navigator.share({ text });
      return;
    }
  } catch {}
  try {
    await navigator.clipboard.writeText(text);
    toast('Result copied to clipboard!');
  } catch {
    toast('Copy failed — long-press to copy:\n' + text);
  }
}

// ── Stats UI ─────────────────────────────────────────────────────────────
function openStats() {
  const s = loadStats();
  const winPct = s.played ? Math.round((s.wins / s.played) * 100) : 0;
  $('#stats-row').innerHTML = [
    ['Played', s.played],
    ['Win %', winPct],
    ['Streak', s.curStreak],
    ['Max', s.maxStreak],
  ].map(([l, n]) => `<div class="stat"><div class="num">${n}</div><div class="lbl">${l}</div></div>`).join('');
  const max = Math.max(1, ...Object.values(s.dist));
  const cur = game.status === 'won' ? game.history.length : -1;
  $('#dist').innerHTML = Array.from({ length: MAX_GUESSES }, (_, i) => i + 1).map((n) => {
    const v = s.dist[n] || 0;
    const w = 8 + (v / max) * 92;
    return `<div class="bar-row"><span class="n">${n}</span><div class="bar ${n === cur ? 'cur' : ''}" style="width:${w}%">${v}</div></div>`;
  }).join('');
  $('#share-btn-2').classList.toggle('hidden', game.status === 'playing');
  show('#stats-modal');
}

// ── Helpers ──────────────────────────────────────────────────────────────
function show(sel) { $(sel).classList.remove('hidden'); }
function hide(sel) { $(sel).classList.add('hidden'); }
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.remove('hidden');
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
      width: size + 'px', height: size + 'px',
      background: colors[i % colors.length],
      borderRadius: Math.random() > 0.5 ? '50%' : '2px',
      zIndex: 90, pointerEvents: 'none',
      transform: `rotate(${Math.random() * 360}deg)`,
    });
    document.body.appendChild(d);
    const fall = 100 + Math.random() * 30;
    d.animate(
      [{ transform: d.style.transform + ' translateY(0)', opacity: 1 },
       { transform: `translateY(${fall}vh) rotate(${Math.random() * 720}deg)`, opacity: 0.9 }],
      { duration: 1600 + Math.random() * 1200, easing: 'cubic-bezier(.4,.1,.3,1)' }
    ).onfinish = () => d.remove();
  }
}

let cdTimer;
function startCountdown() {
  const el = $('#countdown');
  function tick() {
    const now = new Date();
    const next = new Date(now);
    next.setUTCHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    const h = String(Math.floor(s / 3600)).padStart(2, '0');
    const m = String(Math.floor((s % 3600) / 60)).padStart(2, '0');
    const sec = String(s % 60).padStart(2, '0');
    el.textContent = `${h}:${m}:${sec}`;
    if (s === 0) location.reload();
  }
  tick();
  clearInterval(cdTimer);
  cdTimer = setInterval(tick, 1000);
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
  $('#help-btn').addEventListener('click', () => show('#help-modal'));
  $('#stats-btn').addEventListener('click', openStats);
  $$('[data-close]').forEach((b) => b.addEventListener('click', () => { hide('#help-modal'); hide('#stats-modal'); }));
  $$('.modal').forEach((m) => m.addEventListener('click', (e) => { if (e.target === m) m.classList.add('hidden'); }));

  document.addEventListener('keydown', (e) => {
    if (game.status !== 'playing') return;
    if (e.key === 'Enter') submitGuess();
    else if (/^[0-9]$/.test(e.key)) { guess = [guess[1], guess[2], +e.key]; updatePreview(); }
  });

  // Tip jar — only show once configured.
  const tip = $('#tip-link');
  if (TIP_URL.includes('REPLACE_ME')) tip.style.display = 'none';
  else tip.href = TIP_URL;
}

function init() {
  $('#day-label').textContent = 'Day #' + day;
  buildBoard();
  bind();
  updatePreview();
  if (game.history.length) renderHistory();
  if (game.status === 'playing') {
    if (!localStorage.getItem('spectra:seen-help')) { show('#help-modal'); localStorage.setItem('spectra:seen-help', '1'); }
  } else {
    revealTarget();
    $('#input-area').classList.add('hidden');
    show('#endgame');
    $('#reveal-text').innerHTML = game.status === 'won'
      ? `Solved in <b>${game.history.length}/${MAX_GUESSES}</b>! The color was <b>${target.join('-')}</b>.`
      : `Out of guesses. The color was <b>${target.join('-')}</b>.`;
    startCountdown();
  }
}

init();
