/* ============================================================
   Ascend — the boss ladder
   Every boss IS one of Drew's real training targets, lifted
   straight out of workout_program.next_target. Beating one
   happens in the gym. There is no in-game way to win a fight.
   ============================================================ */

const SELF_MARK_KEY = 'ascend.selfmarked.v1';

function selfMarked() {
  try { return JSON.parse(localStorage.getItem(SELF_MARK_KEY)) || {}; } catch (e) { return {}; }
}
function setSelfMark(id, val) {
  const m = selfMarked();
  m[id] = val;
  localStorage.setItem(SELF_MARK_KEY, JSON.stringify(m));
}

const BOSSES = [
  {
    id: 'eighty',
    name: 'The Eighty',
    domain: 'Chest & pressing',
    blurb: 'The 80s go up nine times, then eight, then seven. It wins on the third set. Make all three sets ten.',
    target: '3 × 10 @ 80 lb — DB bench press',
    reward: 'Gauntlets of the Eighty',
    progress(st, snap) {
      const r = repsAcross(snap.sets, ['db bench'], 80, 3);
      return { p: clamp01(r.value / 10), now: `${r.value} across @80`, need: '10 across' };
    }
  },
  {
    id: 'gravity',
    name: 'Gravity',
    domain: 'Lats — the V',
    blurb: 'Your own bodyweight, and it has never once let you cheat. Ten on every set and the width follows.',
    target: '3 × 10 — Pull-ups',
    reward: 'Ascendant Cape',
    progress(st, snap) {
      const r = repsAcross(snap.sets, ['pull-up'], null, 3);
      return { p: clamp01(r.value / 10), now: `${r.value} across`, need: '10 across' };
    }
  },
  {
    id: 'thebar',
    name: 'The Bar',
    domain: 'Hinge & posterior chain',
    blurb: 'The one lift you brace for. It respects the hip rules and still asks for everything.',
    target: '8 reps @ 225 lb — Trap-bar deadlift',
    reward: 'Chalk of the Hinge',
    progress(st, snap) {
      const b = bestWeight(snap.sets, ['trap-bar'], 8);
      return { p: clamp01((b.value - 155) / 70), now: `${b.value || '—'} lb × 8`, need: '225 lb × 8' };
    }
  },
  {
    id: 'taper',
    name: 'The Taper',
    domain: 'The silhouette',
    blurb: 'Not a lift — a shape. Shoulders divided by waist. The only boss that can move while you sleep, for better or worse.',
    target: 'Shoulder-to-waist ratio 1.40',
    reward: 'Mantle of the V',
    progress(st) {
      const v = st.frame.vRatio;
      if (!v) return { p: 0, now: 'no measurement', need: '1.40' };
      return { p: clamp01((v - 1.25) / 0.15), now: v.toFixed(3), need: '1.40' };
    }
  },
  {
    id: 'rise',
    name: 'Rise Unaided',
    domain: 'Back function',
    blurb: 'Flat on the floor to sitting up, no leg-swing, no hand. Smaller than the others and worth more than all of them.',
    target: 'Sit up from flat, unassisted',
    reward: 'Crown of the Faithful',
    selfMark: true,
    markPrompt: 'Did it — sat up from flat with no swing and no hands',
    progress(st) {
      const done = !!selfMarked().rise;
      return { p: done ? 1 : 0, now: done ? 'done' : 'not yet', need: 'unassisted' };
    }
  }
];

function evaluateBosses(st, snap) {
  return BOSSES.map(b => {
    const pr = b.progress(st, snap);
    return { ...b, ...pr, beaten: pr.p >= 1 };
  });
}
