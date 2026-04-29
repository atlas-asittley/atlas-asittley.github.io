// ── In-game message / notification system ──────────────────
// Messages appear briefly at the top of the screen then fade out.

const MAX_MESSAGES = 5;
const MESSAGE_DURATION = 180; // frames (~3 seconds at 60fps)

export function initMessages(state) {
  state.messages = [];
}

export function addMessage(state, text, type = 'info') {
  // type: 'info' | 'warning' | 'success' | 'danger'
  state.messages.push({ text, type, age: 0 });
  if (state.messages.length > MAX_MESSAGES) {
    state.messages.shift();
  }
}

export function tickMessages(state) {
  for (const m of state.messages) {
    m.age++;
  }
  state.messages = state.messages.filter(m => m.age < MESSAGE_DURATION);
}

// ── Render messages on-screen (called from renderer) ───────
export function renderMessages(ctx, state, cw) {
  const msgs = state.messages;
  if (!msgs || msgs.length === 0) return;

  const baseY = 56;
  ctx.save();
  ctx.textAlign = 'center';

  for (let i = 0; i < msgs.length; i++) {
    const m = msgs[i];
    const fadeStart = MESSAGE_DURATION * 0.7;
    const alpha = m.age > fadeStart
      ? 1 - (m.age - fadeStart) / (MESSAGE_DURATION - fadeStart)
      : 1;

    let bg, fg;
    switch (m.type) {
      case 'success': bg = 'rgba(40,140,60,'; fg = '#a0ffa0'; break;
      case 'warning': bg = 'rgba(180,140,30,'; fg = '#ffe080'; break;
      case 'danger':  bg = 'rgba(180,40,30,';  fg = '#ffa0a0'; break;
      default:        bg = 'rgba(30,26,18,';   fg = '#e8dcc8'; break;
    }

    const y = baseY + i * 28;
    ctx.fillStyle = `${bg}${(0.85 * alpha).toFixed(2)})`;
    const textW = ctx.measureText(m.text).width || 200;
    const boxW = Math.max(textW + 32, 160);

    // Rounded rect
    const rx = (cw - boxW) / 2;
    ctx.beginPath();
    ctx.roundRect(rx, y, boxW, 24, 4);
    ctx.fill();

    ctx.strokeStyle = `${bg}${(0.5 * alpha).toFixed(2)})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = fg;
    ctx.globalAlpha = alpha;
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.textBaseline = 'middle';
    ctx.fillText(m.text, cw / 2, y + 12);
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
