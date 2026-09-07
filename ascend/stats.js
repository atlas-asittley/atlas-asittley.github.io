/* ============================================================
   Ascend — stats
   Turns Drew's real logged numbers into the avatar's four bars.
   RULE: nothing here is earned in-game. Every value traces back
   to a set he actually completed or a tape measure reading.
   ============================================================ */

/* Exercise name matching. The tracker has drifted on spellings
   ("Leg press" vs "Leg press (depth-capped)"), so match loosely. */
function bestWeight(sets, aliases, minReps = 5) {
  let best = 0, when = null;
  for (const s of sets) {
    const name = s.exercise.toLowerCase();
    if (!aliases.some(a => name.includes(a))) continue;
    if (s.reps < minReps) continue;
    if (s.weight > best) { best = s.weight; when = s.date; }
  }
  return { value: best, date: when };
}

function bestReps(sets, aliases) {
  let best = 0, when = null;
  for (const s of sets) {
    const name = s.exercise.toLowerCase();
    if (!aliases.some(a => name.includes(a))) continue;
    if (s.reps > best) { best = s.reps; when = s.date; }
  }
  return { value: best, date: when };
}

/* Reps on the WEAKEST of the top sets at a given weight — this is
   what "10 across" means, and it's how the bosses are judged. */
function repsAcross(sets, aliases, weight, setCount = 3) {
  const byDate = {};
  for (const s of sets) {
    const name = s.exercise.toLowerCase();
    if (!aliases.some(a => name.includes(a))) continue;
    if (weight != null && s.weight < weight) continue;
    (byDate[s.date] = byDate[s.date] || []).push(s.reps);
  }
  let best = 0, when = null;
  for (const [date, reps] of Object.entries(byDate)) {
    if (reps.length < setCount) continue;
    const top = reps.sort((a, b) => b - a).slice(0, setCount);
    const across = top[top.length - 1];
    if (across > best) { best = across; when = date; }
  }
  return { value: best, date: when };
}

/* Each lift: where he STARTED (first real logged set) and where
   he's headed. Baselines below are his actual first entries. */
const LIFTS = {
  bench:      { label: 'DB bench press',   aliases: ['db bench'],            base: 65,  goal: 100 },
  press:      { label: 'DB shoulder press',aliases: ['shoulder press'],      base: 40,  goal: 65  },
  trapbar:    { label: 'Trap-bar deadlift',aliases: ['trap-bar'],            base: 155, goal: 275 },
  row:        { label: 'One-arm DB row',   aliases: ['one-arm db row'],      base: 65,  goal: 100 },
  shrug:      { label: 'DB shrugs',        aliases: ['shrug'],               base: 80,  goal: 140 },
  facepull:   { label: 'Face pulls',       aliases: ['face pull'],           base: 40,  goal: 70  },
  lateral:    { label: 'DB lateral raise', aliases: ['db lateral raise'],    base: 15,  goal: 30  },
  legpress:   { label: 'Leg press',        aliases: ['leg press'],           base: 230, goal: 400 },
  hipthrust:  { label: 'Hip thrust',       aliases: ['hip thrust'],          base: 95,  goal: 275 },
  legcurl:    { label: 'Seated leg curl',  aliases: ['leg curl'],            base: 110, goal: 200 },
  legext:     { label: 'Leg extension',    aliases: ['leg extension'],       base: 160, goal: 250 },
  calf:       { label: 'Calf raise',       aliases: ['calf raise machine'],  base: 200, goal: 300 },
  suitcase:   { label: 'Suitcase carry',   aliases: ['suitcase'],            base: 80,  goal: 150 },
};
/* Pull-ups are scored in reps, not pounds. */
const PULLUP = { label: 'Pull-ups', aliases: ['pull-up'], base: 7, goal: 15 };

/* Straight-arm cable pulldown is deliberately excluded: the tracker
   switched units on it mid-July (90 -> 57.5), so a "drop" there is a
   measurement artifact, not Drew. Don't let it dent the avatar. */

/* Declared as functions so every script file can use them regardless
   of load order — bosses.js leans on clamp01 too. */
function clamp01(x) { return Math.max(0, Math.min(1, x)); }
function pct(cur, base, goal) { return clamp01((cur - base) / (goal - base)); }

function computeStats(snap) {
  const sets = snap.sets;
  const lift = {};
  for (const [key, def] of Object.entries(LIFTS)) {
    const b = bestWeight(sets, def.aliases, key === 'calf' ? 10 : 5);
    lift[key] = { ...def, current: b.value, date: b.date, pct: pct(b.value, def.base, def.goal) };
  }
  const pu = bestReps(sets, PULLUP.aliases);
  lift.pullup = { ...PULLUP, current: pu.value, date: pu.date, pct: pct(pu.value, PULLUP.base, PULLUP.goal) };

  /* --- consistency, straight from completed sessions --- */
  const dates = snap.sessions.map(s => s.session_date);
  const last28 = snap.sessions.filter(s => daysAgo(s.session_date) <= 28);
  const rehabDays = last28.filter(s => s.day_type === 'mobility' || s.day_type === 'hip').length;
  const gymDays = last28.filter(s => s.day_type === 'upper' || s.day_type === 'lower').length;

  const consistency = {
    totalSessions: snap.sessions.length,
    last28: last28.length,
    gymLast28: gymDays,
    rehabLast28: rehabDays,
    perWeek: last28.length / 4,
    daysSinceLast: dates.length ? daysAgo(dates[0]) : 999,
    bestWeek: bestWeekCount(dates),
    weeksActive: new Set(dates.map(weekKey)).size,
    weekStreak: currentWeekStreak(dates)
  };

  /* --- the four bars --- */
  const avg = keys => keys.reduce((a, k) => a + lift[k].pct, 0) / keys.length;

  const bars = {
    might:  { label: 'Might',  keys: ['bench', 'press', 'trapbar'] },
    width:  { label: 'Width',  keys: ['row', 'shrug', 'pullup', 'facepull', 'lateral'] },
    legs:   { label: 'Legs',   keys: ['legpress', 'hipthrust', 'legcurl', 'legext', 'calf'] },
  };
  for (const b of Object.values(bars)) b.value = avg(b.keys);

  /* Resilience = the rehab work he actually shows up for, plus the
     anti-lateral-flexion carry that offloads his right QL. */
  const rehabScore = clamp01(rehabDays / 12);
  bars.resilience = {
    label: 'Resilience',
    keys: ['suitcase'],
    value: rehabScore * 0.6 + lift.suitcase.pct * 0.4,
    detail: `${rehabDays} rehab/mobility days in 28`
  };

  /* --- the frame: his actual tape measure --- */
  const m = snap.measures[0] || {};
  const first = snap.measures[snap.measures.length - 1] || {};
  const vRatio = m.shoulders && m.waist ? m.shoulders / m.waist : null;
  const vFirst = first.shoulders && first.waist ? first.shoulders / first.waist : null;

  const frame = {
    weight: snap.weights[0] ? Number(snap.weights[0].weight) : null,
    weightDate: snap.weights[0] ? snap.weights[0].log_date : null,
    shoulders: m.shoulders, waist: m.waist, chest: m.chest, arm: m.arm, thigh: m.thigh,
    measureDate: m.log_date,
    vRatio, vFirst,
    vGoal: 1.40,
    /* 1.20 -> 1.45 is the silhouette range. Deliberately NOT anchored to
       his baseline: the V has narrowed slightly during the bulk, and a
       bar reading zero would be a lie about a man who got stronger. */
    vShape: vRatio ? clamp01((vRatio - 1.20) / 0.25) : 0.4
  };

  /* Overall mass drives how big the avatar is drawn. */
  const power = bars.might.value * 0.40 + bars.width.value * 0.35 + bars.legs.value * 0.25;

  return { lift, bars, frame, consistency, power };
}

/* ---------- week helpers ---------- */
function weekKey(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  d.setDate(d.getDate() - d.getDay()); // back to Sunday
  return d.toISOString().slice(0, 10);
}
function bestWeekCount(dates) {
  const counts = {};
  dates.forEach(d => { counts[weekKey(d)] = (counts[weekKey(d)] || 0) + 1; });
  return Math.max(0, ...Object.values(counts));
}
function currentWeekStreak(dates) {
  const weeks = new Set(dates.map(weekKey));
  const cursor = new Date();
  cursor.setDate(cursor.getDate() - cursor.getDay());
  let streak = 0;
  // Allow the current week to be empty without breaking the streak —
  // it may simply not have happened yet.
  if (!weeks.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 7);
  while (weeks.has(cursor.toISOString().slice(0, 10))) {
    streak++;
    cursor.setDate(cursor.getDate() - 7);
  }
  return streak;
}
