// Vaultle — pure game logic. No DOM. Works in browser (ES module) and Node.
// Crack a hidden 4-digit code (all digits distinct) in N guesses. Classic
// "Bulls & Cows": feedback is the COUNT of right-digit-right-place (bulls) and
// right-digit-wrong-place (cows) — not per-position colors.

export const CODE_LEN = 4;
export const MAX_GUESSES = 9;   // min budget where a methodical player always wins (see logic.test.mjs)

// Shared launch epoch with Spectra so "Day #N" lines up across our games.
export const EPOCH_UTC = Date.UTC(2026, 5, 29);
const DAY_MS = 86400000;

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function dayNumber(nowMs = Date.now()) {
  const today = Math.floor(nowMs / DAY_MS) * DAY_MS;
  return Math.floor((today - EPOCH_UTC) / DAY_MS) + 1;
}

// Deterministic distinct-digit code for a given day.
export function targetForDay(day) {
  const rand = mulberry32(day * 2654435761 + 40503); // distinct offset from Spectra
  const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
  for (let i = 0; i < CODE_LEN; i++) {
    const j = i + Math.floor(rand() * (10 - i));
    [digits[i], digits[j]] = [digits[j], digits[i]];
  }
  return digits.slice(0, CODE_LEN);
}

// Returns { bulls, cows } for a guess against the code (both distinct, length 4).
export function evaluateGuess(guess, target) {
  let bulls = 0, present = 0;
  for (let i = 0; i < CODE_LEN; i++) {
    if (guess[i] === target[i]) bulls++;
    if (target.includes(guess[i])) present++;
  }
  return { bulls, cows: present - bulls };
}

export function isWin(fb) { return fb.bulls === CODE_LEN; }

export function isValidGuess(guess) {
  return (
    Array.isArray(guess) &&
    guess.length === CODE_LEN &&
    guess.every((n) => Number.isInteger(n) && n >= 0 && n <= 9) &&
    new Set(guess).size === CODE_LEN // all distinct
  );
}

const G = '🟩', Y = '🟨', B = '⬛';
export function shareText(day, history, won, url = 'vaultle') {
  const score = won ? history.length : 'X';
  const lines = history.map(
    (fb) => G.repeat(fb.bulls) + Y.repeat(fb.cows) + B.repeat(CODE_LEN - fb.bulls - fb.cows),
  );
  return `Vaultle #${day} ${score}/${MAX_GUESSES}\n${lines.join('\n')}\n${url}`;
}

// All 5040 distinct-digit codes — used by the solver/tests and by any UI hint.
export function allCodes() {
  const out = [];
  for (let a = 0; a < 10; a++)
    for (let b = 0; b < 10; b++) if (b !== a)
      for (let c = 0; c < 10; c++) if (c !== a && c !== b)
        for (let d = 0; d < 10; d++) if (d !== a && d !== b && d !== c)
          out.push([a, b, c, d]);
  return out;
}
