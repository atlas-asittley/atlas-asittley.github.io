import {
  CODE_LEN, MAX_GUESSES,
  dayNumber, targetForDay, evaluateGuess, isWin, isValidGuess, shareText,
} from './logic.js';

// Drew: set this to your Ko-fi URL to show the tip UI. REPLACE_ME hides it.
const TIP_URL = 'https://ko-fi.com/atlasentre';
const SHARE_URL = 'atlas-asittley.github.io/vaultle';
const TIP_ON = !TIP_URL.includes('REPLACE_ME');
const day = dayNumber();

let cur = makeContext('daily', targetForDay(day));
let current = []; // digits being entered

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

function makeContext(mode, target) {
  return {
    mode, target,
    game: mode === 'daily' ? loadGame() : { history: [], status: 'playing' },
  };
}
function randomTarget() {
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < CODE_LEN; i++) {
    const j = i + Math.floor(Math.random() * (10 - i));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, CODE_LEN);
}

// ── Persistence (daily only) ──
function loadGame() {
  try { const r = localStorage.getItem('vaultle:day:' + day); if (r) return JSON.parse(r); } catch {}
  return { history: [], status: 'playing' };
}
function saveGame() { if (cur.mode === 'daily') { try { localStorage.setItem('vaultle:day:' + day, JSON.stringify(cur.game)); } catch {} } }
function loadStats() {
  try { const r = localStorage.getItem('vaultle:stats'); if (r) return JSON.parse(r); } catch {}
  return { played: 0, wins: 0, curStreak: 0, maxStreak: 0, dist: {}, lastDay: 0 };
}
function saveStats(s) { try { localStorage.setItem('vaultle:stats', JSON.stringify(s)); } catch {} }
function recordResult(won, guesses) {
  const s = loadStats();
  if (s.lastDay === day) return s;
  s.played++;
  if (won) { s.wins++; s.dist[guesses] = (s.dist[guesses] || 0) + 1; s.curStreak = s.lastDay === day - 1 ? s.curStreak + 1 : 1; s.maxStreak = Math.max(s.maxStreak, s.curStreak); }
  else s.curStreak = 0;
  s.lastDay = day; saveStats(s); return s;
}

// ── Rendering ──
function buildBoard() {
  const board = $('#board'); board.innerHTML = '';
  for (let r = 0; r < MAX_GUESSES; r++) {
    const row = document.createElement('div');
    row.className = 'row'; row.dataset.r = r;
    for (let c = 0; c < CODE_LEN; c++) {
      const cell = document.createElement('div');
      cell.className = 'cell'; cell.dataset.r = r; cell.dataset.c = c;
      row.appendChild(cell);
    }
    const fb = document.createElement('div');
    fb.className = 'fb';
    fb.innerHTML = '<div class="pips"></div><div class="txt"></div>';
    row.appendChild(fb);
    board.appendChild(row);
  }
}
function paintRow(r, guess, fb, animate) {
  guess.forEach((d, i) => {
    const cell = document.querySelector(`.cell[data-r="${r}"][data-c="${i}"]`);
    cell.textContent = d;
    if (animate) { cell.classList.add('flip'); cell.style.animationDelay = i * 55 + 'ms'; setTimeout(() => cell.classList.remove('flip'), 520 + i * 55); }
  });
  const pips = document.querySelector(`.row[data-r="${r}"] .pips`);
  const txt = document.querySelector(`.row[data-r="${r}"] .txt`);
  const blanks = CODE_LEN - fb.bulls - fb.cows;
  let html = '';
  for (let i = 0; i < fb.bulls; i++) html += '<span class="pip bull"></span>';
  for (let i = 0; i < fb.cows; i++) html += '<span class="pip cow"></span>';
  for (let i = 0; i < blanks; i++) html += '<span class="pip"></span>';
  pips.innerHTML = html;
  txt.textContent = `🎯${fb.bulls} ◐${fb.cows}`;
}
function renderHistory() { cur.game.history.forEach((h, r) => paintRow(r, h.guess, h.fb, false)); }

function renderInput() {
  $$('.slot').forEach((s, i) => { s.textContent = current[i] ?? ''; s.classList.toggle('filled', current[i] != null); });
  $$('.key').forEach((k) => { const d = +k.dataset.d; k.disabled = current.includes(d) || current.length >= CODE_LEN; });
  $('#guess-btn').disabled = current.length !== CODE_LEN;
}

function setMystery() {
  $$('.dial').forEach((d) => { d.textContent = '?'; d.classList.remove('open'); });
  $('#vault-caption').textContent = cur.mode === 'practice' ? 'practice — crack the code' : 'the hidden code (4 different digits)';
}
function revealVault() {
  $$('.dial').forEach((d, i) => { d.textContent = cur.target[i]; d.classList.add('open'); });
  $('#vault-caption').textContent = 'code: ' + cur.target.join(' ');
}

// ── Flow ──
function submitGuess() {
  if (cur.game.status !== 'playing' || !isValidGuess(current)) return;
  const guess = [...current];
  const fb = evaluateGuess(guess, cur.target);
  const r = cur.game.history.length;
  cur.game.history.push({ guess, fb });
  paintRow(r, guess, fb, true);
  vibrate(15);
  current = []; renderInput();

  const won = isWin(fb);
  if (won) cur.game.status = 'won';
  else if (cur.game.history.length >= MAX_GUESSES) cur.game.status = 'lost';
  saveGame();
  if (cur.game.status !== 'playing') setTimeout(() => finish(won), 250 + CODE_LEN * 55 + 200);
}

function finish(won) {
  if (cur.mode === 'daily') recordResult(won, cur.game.history.length);
  revealVault();
  $('#input-area').classList.add('hidden');
  $('#endgame').classList.remove('hidden');
  const n = cur.game.history.length;
  const code = `<span class="inline-code">${cur.target.join(' ')}</span>`;
  $('#reveal-text').innerHTML = won
    ? `🔓 Cracked in <b>${n}/${MAX_GUESSES}</b>! The code was ${code}`
    : `🔒 Vault stayed shut. The code was ${code}`;
  const isDaily = cur.mode === 'daily';
  try { if (window.aaTrack && isDaily) aaTrack(won ? 'win' : 'loss', { n: cur.game.history.length }); } catch {}
  $('#share-btn').classList.toggle('hidden', !isDaily);
  $('#countdown-wrap').classList.toggle('hidden', !isDaily);
  const pb = $('#practice-btn'); pb.classList.remove('hidden');
  pb.textContent = isDaily ? '🎲 PLAY UNLIMITED' : '🎲 PLAY AGAIN';
  if (TIP_ON) {
    const el = $('#tip-nudge');
    el.innerHTML = `Vaultle is free &amp; ad-free. <a href="${TIP_URL}" target="_blank" rel="noopener">☕ Buy the dev a coffee</a> to keep the daily codes coming.`;
    el.classList.remove('hidden');
  }
  if (won) { vibrate([20, 40, 20]); celebrate(); }
  if (isDaily) startCountdown();
}

function startPractice() {
  try { window.aaTrack && aaTrack('practice'); } catch {}
  try { window.AAds && AAds.interstitial('practice'); } catch {}
  cur = makeContext('practice', randomTarget());
  current = [];
  buildBoard(); setMystery(); renderInput();
  $('#day-label').textContent = 'Practice';
  $('#endgame').classList.add('hidden');
  $('#tip-nudge').classList.add('hidden');
  $('#input-area').classList.remove('hidden');
}

function buildShare() { return shareText(day, cur.game.history.map((h) => h.fb), cur.game.status === 'won', SHARE_URL); }
async function share() {
  const text = buildShare();
  try { if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) { await navigator.share({ text }); return; } } catch {}
  try { await navigator.clipboard.writeText(text); toast('Result copied — paste it anywhere!'); }
  catch { toast('Copy failed — long-press to copy.'); }
}

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

// ── Helpers ──
function show(s) { $(s).classList.remove('hidden'); }
function hide(s) { $(s).classList.add('hidden'); }
function vibrate(p) { try { navigator.vibrate && navigator.vibrate(p); } catch {} }
let toastTimer;
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.add('hidden'), 2200); }
function celebrate() {
  const colors = ['#e0b341', '#f4d27a', '#3fbf6f', '#fff', '#d9b53a'];
  for (let i = 0; i < 60; i++) {
    const d = document.createElement('div'); const size = 6 + Math.random() * 8;
    Object.assign(d.style, { position: 'fixed', top: '-20px', left: Math.random() * 100 + 'vw', width: size + 'px', height: size + 'px', background: colors[i % colors.length], borderRadius: Math.random() > 0.5 ? '50%' : '2px', zIndex: 90, pointerEvents: 'none', transform: `rotate(${Math.random() * 360}deg)` });
    document.body.appendChild(d);
    d.animate([{ transform: d.style.transform + ' translateY(0)', opacity: 1 }, { transform: `translateY(${100 + Math.random() * 30}vh) rotate(${Math.random() * 720}deg)`, opacity: .9 }], { duration: 1600 + Math.random() * 1200, easing: 'cubic-bezier(.4,.1,.3,1)' }).onfinish = () => d.remove();
  }
}
let cdTimer;
function startCountdown() {
  const el = $('#countdown');
  function tick() {
    const now = new Date(); const next = new Date(now); next.setUTCHours(24, 0, 0, 0);
    let s = Math.max(0, Math.floor((next - now) / 1000));
    el.textContent = [Math.floor(s / 3600), Math.floor((s % 3600) / 60), s % 60].map((x) => String(x).padStart(2, '0')).join(':');
    if (s === 0) location.reload();
  }
  tick(); clearInterval(cdTimer); cdTimer = setInterval(tick, 1000);
}

// ── Wire up ──
function buildPad() {
  const pad = $('#pad'); pad.innerHTML = '';
  for (let d = 0; d <= 9; d++) {
    const b = document.createElement('button');
    b.className = 'key'; b.dataset.d = d; b.textContent = d;
    b.addEventListener('click', () => addDigit(d));
    pad.appendChild(b);
  }
}
function addDigit(d) {
  if (cur.game.status !== 'playing') return;
  if (current.length >= CODE_LEN || current.includes(d)) return;
  current.push(d); vibrate(6); renderInput();
}
function backspace() { if (current.length) { current.pop(); renderInput(); } }

function bind() {
  buildPad();
  $('#guess-btn').addEventListener('click', submitGuess);
  $('#back-btn').addEventListener('click', backspace);
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
    else if (e.key === 'Backspace') backspace();
    else if (/^[0-9]$/.test(e.key)) addDigit(+e.key);
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
  buildBoard(); bind(); renderInput();
  if (cur.game.history.length) renderHistory();
  if (cur.game.status === 'playing') {
    if (!localStorage.getItem('vaultle:seen-help')) { show('#help-modal'); localStorage.setItem('vaultle:seen-help', '1'); }
  } else {
    revealVault();
    $('#input-area').classList.add('hidden');
    $('#endgame').classList.remove('hidden');
    const n = cur.game.history.length;
    const code = `<span class="inline-code">${cur.target.join(' ')}</span>`;
    $('#reveal-text').innerHTML = cur.game.status === 'won'
      ? `🔓 Cracked in <b>${n}/${MAX_GUESSES}</b>! The code was ${code}`
      : `🔒 Vault stayed shut. The code was ${code}`;
    $('#practice-btn').classList.remove('hidden');
    if (TIP_ON) { const el = $('#tip-nudge'); el.innerHTML = `Vaultle is free &amp; ad-free. <a href="${TIP_URL}" target="_blank" rel="noopener">☕ Buy the dev a coffee</a> to keep the daily codes coming.`; el.classList.remove('hidden'); }
    startCountdown();
  }
}
init();
