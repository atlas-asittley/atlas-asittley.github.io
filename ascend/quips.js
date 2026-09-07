/* ============================================================
   Ascend — quips
   Encouraging. Never nagging, never shaming. A missed week gets
   a welcome, not a guilt trip. His worth is not his output.
   ============================================================ */

function pickQuip(st, bosses, snap) {
  const c = st.consistency;
  const lines = [];

  /* Coming back after a gap — highest priority, warmest tone. */
  if (c.daysSinceLast >= 10) {
    lines.push(
      "Welcome back, Drew. Nothing here expired while you were gone.",
      "There you are. The road didn't move — we just start walking again.",
      "No ground was lost that mattered. Good to see you."
    );
  } else if (c.daysSinceLast >= 6) {
    lines.push(
      "Been a minute. That's allowed. Ready when you are.",
      "Welcome back. Rest was probably the right call anyway."
    );
  }

  /* A boss about to fall. */
  const close = bosses.filter(b => !b.beaten && b.p >= 0.7).sort((a, b) => b.p - a.p)[0];
  if (close) {
    lines.push(
      `${close.name} is close. ${close.now} — needs ${close.need}.`,
      `You're most of the way through ${close.name}. It knows it.`
    );
  }

  /* Real consistency, named plainly. */
  if (c.last28 >= 14) {
    lines.push(
      `${c.last28} sessions in four weeks. That's not motivation — that's a habit.`,
      "Quiet, faithful work. It's the kind that actually compounds."
    );
  } else if (c.weekStreak >= 3) {
    lines.push(`${c.weekStreak} weeks running. Steady beats spectacular.`);
  }

  /* Something recently moved. */
  const recent = Object.values(st.lift)
    .filter(l => l.date && daysAgo(l.date) <= 10 && l.pct > 0.05)
    .sort((a, b) => new Date(b.date) - new Date(a.date))[0];
  if (recent) {
    lines.push(`${recent.label} is at ${recent.current}${recent.label === 'Pull-ups' ? ' reps' : ' lb'} now. You moved that, not the game.`);
  }

  /* The always-true ones. */
  lines.push(
    "You're not behind. You're mid-build.",
    "The avatar only grows when you do. That's the whole deal.",
    "Strength is real life's job here. Everything else is just gear.",
    "Grace over striving — the work still counts, it just isn't the point.",
    "Bigger than last month. Smaller than next year. Right on time."
  );

  /* Stable for the day, so it doesn't flicker on every render. */
  const seed = new Date().toISOString().slice(0, 10)
    .split('').reduce((a, ch) => a + ch.charCodeAt(0), 0);
  return lines[seed % lines.length];
}
