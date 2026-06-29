// Spectra — pure game logic. No DOM, no globals. Works in browser (ES module)
// and in Node (import). Deterministic so the "daily" puzzle is identical for
// everyone on a given calendar day (UTC).

export const MAX_GUESSES = 6;
export const CHANNELS = 3; // R, G, B
export const MAX_VALUE = 9; // each channel is 0..9  -> 1000 possible colors
export const YELLOW_BAND = 2; // |diff| <= 2 (and != 0) => "close"

// Day 1 = 2026-06-29 (launch day). One puzzle per UTC day.
export const EPOCH_UTC = Date.UTC(2026, 5, 29); // month is 0-indexed (5 = June)
const DAY_MS = 86400000;

// Small, fast, deterministic PRNG (mulberry32).
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Day number for a given timestamp (defaults to "now"). Day 1 on launch day.
export function dayNumber(nowMs = Date.now()) {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS; // midnight UTC of `now`
  return Math.floor((today - EPOCH_UTC) / DAY_MS) + 1;
}

// The hidden color for a given day. Deterministic from the day number.
export function targetForDay(day) {
  // Offset the seed so day 1 isn't a trivial PRNG starting state.
  const rand = mulberry32(day * 2654435761 + 1013904223);
  const t = [];
  for (let i = 0; i < CHANNELS; i++) {
    t.push(Math.floor(rand() * (MAX_VALUE + 1)));
  }
  return t;
}

// Evaluate one guess against the target.
// Returns an array (one per channel) of { state, dir, value }.
//   state: 'green' (exact) | 'yellow' (within band) | 'gray' (far)
//   dir:   'up' (target is higher) | 'down' | null (exact)
export function evaluateGuess(guess, target) {
  return guess.map((g, i) => {
    const diff = target[i] - g;
    let state;
    if (diff === 0) state = 'green';
    else if (Math.abs(diff) <= YELLOW_BAND) state = 'yellow';
    else state = 'gray';
    const dir = diff === 0 ? null : diff > 0 ? 'up' : 'down';
    return { state, dir, value: g };
  });
}

export function isWin(evaluation) {
  return evaluation.every((c) => c.state === 'green');
}

export function isValidGuess(guess) {
  return (
    Array.isArray(guess) &&
    guess.length === CHANNELS &&
    guess.every((n) => Number.isInteger(n) && n >= 0 && n <= MAX_VALUE)
  );
}

const EMOJI = { green: '🟩', yellow: '🟨', gray: '⬛' };

// Build the spoiler-free share text (Wordle-style).
// history: array of evaluations (each an array of {state,...}).
export function shareText(day, history, won, url = 'spectra') {
  const score = won ? history.length : 'X';
  const lines = history.map((ev) => ev.map((c) => EMOJI[c.state]).join(''));
  return `Spectra #${day} ${score}/${MAX_GUESSES}\n${lines.join('\n')}\n${url}`;
}

// Convert a 0..9 channel value to a 0..255 byte for rendering.
export function toByte(v) {
  return Math.round((v / MAX_VALUE) * 255);
}

export function toCss(triple) {
  const [r, g, b] = triple.map(toByte);
  return `rgb(${r}, ${g}, ${b})`;
}
