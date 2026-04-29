import { SCENARIOS } from './scenario.js';
import { hasSave } from './save.js';

// ── Menu screen rendering ──────────────────────────────────
export function renderMenuScreen(ctx, canvas, state) {
  const cw = canvas.width;
  const ch = canvas.height;

  // Dark papyrus background
  ctx.fillStyle = '#1a1410';
  ctx.fillRect(0, 0, cw, ch);

  // Subtle radial gradient overlay (warm center glow)
  const grd = ctx.createRadialGradient(cw / 2, ch * 0.3, 0, cw / 2, ch * 0.3, cw * 0.6);
  grd.addColorStop(0, 'rgba(180,140,60,0.06)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = grd;
  ctx.fillRect(0, 0, cw, ch);

  // Decorative border lines
  ctx.strokeStyle = 'rgba(212,160,74,0.15)';
  ctx.lineWidth = 1;
  // Top horizontal double line
  ctx.beginPath();
  ctx.moveTo(cw * 0.1, ch * 0.1);
  ctx.lineTo(cw * 0.9, ch * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cw * 0.1, ch * 0.1 + 3);
  ctx.lineTo(cw * 0.9, ch * 0.1 + 3);
  ctx.stroke();
  // Bottom double line
  ctx.beginPath();
  ctx.moveTo(cw * 0.1, ch * 0.9);
  ctx.lineTo(cw * 0.9, ch * 0.9);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cw * 0.1, ch * 0.9 + 3);
  ctx.lineTo(cw * 0.9, ch * 0.9 + 3);
  ctx.stroke();

  // Corner accents
  const cornerSize = 20;
  ctx.strokeStyle = 'rgba(212,160,74,0.25)';
  ctx.lineWidth = 2;
  for (const [cx, cy, sx, sy] of [
    [cw * 0.1, ch * 0.1, 1, 1],
    [cw * 0.9, ch * 0.1, -1, 1],
    [cw * 0.1, ch * 0.9 + 3, 1, -1],
    [cw * 0.9, ch * 0.9 + 3, -1, -1],
  ]) {
    ctx.beginPath();
    ctx.moveTo(cx, cy + sy * cornerSize);
    ctx.lineTo(cx, cy);
    ctx.lineTo(cx + sx * cornerSize, cy);
    ctx.stroke();
  }

  // Title with shadow
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.font = 'bold 52px serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Pharaoh Tycoon', cw / 2 + 2, ch * 0.2 + 2);
  ctx.fillStyle = '#d4a04a';
  ctx.fillText('Pharaoh Tycoon', cw / 2, ch * 0.2);

  // Decorative line under title
  ctx.strokeStyle = 'rgba(212,160,74,0.3)';
  ctx.lineWidth = 1;
  const tLineW = 180;
  ctx.beginPath();
  ctx.moveTo(cw / 2 - tLineW, ch * 0.2 + 32);
  ctx.lineTo(cw / 2 + tLineW, ch * 0.2 + 32);
  ctx.stroke();
  // Center diamond
  ctx.fillStyle = 'rgba(212,160,74,0.4)';
  ctx.save();
  ctx.translate(cw / 2, ch * 0.2 + 32);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-3, -3, 6, 6);
  ctx.restore();

  // Subtitle
  ctx.fillStyle = '#7a6a5a';
  ctx.font = '15px "Segoe UI", system-ui, sans-serif';
  ctx.fillText('A city-builder inspired by Sierra\'s Pharaoh', cw / 2, ch * 0.2 + 50);

  // Scenario buttons
  const scenarios = Object.entries(SCENARIOS);
  const btnW = 340;
  const btnH = 68;
  const gap = 14;
  const startY = ch * 0.38;

  state._menuButtons = [];

  for (let i = 0; i < scenarios.length; i++) {
    const [key, def] = scenarios[i];
    const bx = (cw - btnW) / 2;
    const by = startY + i * (btnH + gap);

    const hover = state._menuHover === i;

    // Button shadow
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.roundRect(bx + 2, by + 2, btnW, btnH, 6);
    ctx.fill();

    // Button background
    ctx.fillStyle = hover ? 'rgba(212,160,74,0.15)' : 'rgba(35,28,20,0.95)';
    ctx.strokeStyle = hover ? '#d4a04a' : 'rgba(80,65,45,0.6)';
    ctx.lineWidth = hover ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(bx, by, btnW, btnH, 6);
    ctx.fill();
    ctx.stroke();

    // Left accent bar
    if (hover) {
      ctx.fillStyle = '#d4a04a';
      ctx.fillRect(bx, by + 8, 3, btnH - 16);
    }

    // Name
    ctx.fillStyle = hover ? '#e8c870' : '#d4a04a';
    ctx.font = 'bold 16px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(def.name, bx + 18, by + 14);

    // Description
    ctx.fillStyle = '#7a6a5a';
    ctx.font = '12px "Segoe UI", system-ui, sans-serif';
    ctx.fillText(def.description, bx + 18, by + 38);

    state._menuButtons.push({ x: bx, y: by, w: btnW, h: btnH, key });
  }

  // Load game button
  if (hasSave()) {
    const loadY = startY + scenarios.length * (btnH + gap) + 24;
    const lbx = (cw - btnW) / 2;
    const hover = state._menuHover === scenarios.length;

    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.roundRect(lbx + 2, loadY + 2, btnW, 50, 6);
    ctx.fill();

    ctx.fillStyle = hover ? 'rgba(90,154,191,0.15)' : 'rgba(35,28,20,0.95)';
    ctx.strokeStyle = hover ? '#5a9abf' : 'rgba(80,65,45,0.6)';
    ctx.lineWidth = hover ? 2 : 1;
    ctx.beginPath();
    ctx.roundRect(lbx, loadY, btnW, 50, 6);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = hover ? '#80c0e0' : '#5a9abf';
    ctx.font = 'bold 15px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Load Saved Game', cw / 2, loadY + 25);

    state._menuButtons.push({ x: lbx, y: loadY, w: btnW, h: 50, key: '_load' });
  }

  ctx.textAlign = 'left';
}
