/* ============================================================
   Ascend — the avatar
   A heroic figure whose SIZE comes from Drew's lifts and whose
   SHAPE comes from his tape measure. Nothing here is decorative
   guesswork: change a real number, the body changes.

   Built from tapered muscle forms rather than stroked tubes —
   every limb is a closed outline whose width varies along its
   length, so it reads as a body instead of a mannequin.
   ============================================================ */

/* ---------- path helpers ---------- */

/* Smooth curve through a list of points (quadratics via midpoints). */
function smooth(pts, move = true) {
  let d = move ? `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
               : ` L ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length - 1; i++) {
    const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
    d += ` Q ${pts[i].x.toFixed(1)} ${pts[i].y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  const l = pts[pts.length - 1];
  return d + ` L ${l.x.toFixed(1)} ${l.y.toFixed(1)}`;
}

/* Outward normal at each point, from the direction of travel. */
function normalsOf(pts) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
    return { x: -dy / len, y: dx / len };
  });
}

/* A closed limb outline through {x,y,w} points, with rounded caps.
   Varying `w` along the spine is what gives biceps and calves. */
function limbPath(pts) {
  const n = normalsOf(pts);
  const side = s => pts.map((p, i) => ({ x: p.x + s * n[i].x * p.w, y: p.y + s * n[i].y * p.w }));
  const right = side(1), left = side(-1).reverse();
  const first = pts[0], last = pts[pts.length - 1];
  return smooth(right)
    + ` A ${last.w.toFixed(1)} ${last.w.toFixed(1)} 0 0 1 ${left[0].x.toFixed(1)} ${left[0].y.toFixed(1)}`
    + smooth(left, false)
    + ` A ${first.w.toFixed(1)} ${first.w.toFixed(1)} 0 0 1 ${right[0].x.toFixed(1)} ${right[0].y.toFixed(1)} Z`;
}

const lerp = (a, b, t) => a + (b - a) * t;

/* ============================================================
   Geometry — every dimension traces back to a real number.
   `m` is overall power (his lifts), `v` is the V-taper (his tape).
   ============================================================ */
function avatarGeometry(m, v) {
  const cx = 200;
  const Y = { head: 78, neck: 116, shoulder: 154, chest: 218, armpit: 236,
              waist: 322, hip: 374, crotch: 396, knee: 544, ankle: 688, floor: 716 };

  const g = {
    cx, Y, mass: m, v,
    headR: 31 + m * 2,
    neckHalf: 14 + m * 7,

    /* The V. Shoulders widen with both strength and his real ratio;
       the waist actually narrows as the ratio improves. */
    shoulderHalf: 56 + m * 24 + v * 38,
    chestHalf:    50 + m * 18 + v * 22,
    armpitHalf:   42 + m * 13 + v * 15,
    waistHalf:    35 + m * 5  - v * 9,
    hipHalf:      44 + m * 8,
    crotchHalf:   11,

    /* Arms carried out from the lats — a lat spread, which is exactly
       the shape he's training for. They flare further as the V grows. */
    delt:   16 + m * 9,
    bicep:  16 + m * 10,
    elbowW: 12.5 + m * 6,
    foreW:  14 + m * 7,
    wristW: 8.5 + m * 4,
    handW:  11 + m * 4.5,

    thighTop: 25 + m * 13,
    quadW:    26 + m * 14,
    kneeW:    17 + m * 6,
    calfW:    20 + m * 9,
    ankleW:   10.5 + m * 3.5,
  };

  /* Joints. Kept under these names because the gear art anchors to them. */
  g.shoulderJointX = g.shoulderHalf - g.delt * 0.25;
  g.shoulderJointY = Y.shoulder + g.delt * 0.35;
  g.elbowX = g.shoulderHalf + 24 + v * 16;
  g.elbowY = Y.chest + 96;
  g.handX  = g.hipHalf + 20;
  g.handY  = Y.hip + 38;

  g.hipX   = g.crotchHalf + g.thighTop + 2;
  g.kneeX  = 34 + m * 4;
  g.ankleX = 41 + m * 4;

  /* Legacy aliases so gear.js keeps fitting without a rewrite. */
  g.upperArm = g.bicep; g.foreArm = g.foreW; g.thigh = g.quadW; g.calf = g.calfW;

  return g;
}

/* ---------- body forms ---------- */

function armPts(g, s) {
  const { cx, Y } = g;
  return [
    { x: cx + s * (g.shoulderHalf - g.delt * 0.62), y: Y.shoulder + 4,           w: g.delt * 0.72 },
    { x: cx + s * g.shoulderJointX,                 y: g.shoulderJointY + 8,     w: g.delt },
    { x: cx + s * (g.shoulderHalf + 13),            y: lerp(Y.shoulder, g.elbowY, 0.45), w: g.bicep },
    { x: cx + s * g.elbowX,                         y: g.elbowY,                 w: g.elbowW },
    { x: cx + s * lerp(g.elbowX, g.handX, 0.34),    y: lerp(g.elbowY, g.handY, 0.3), w: g.foreW },
    { x: cx + s * g.handX,                          y: g.handY,                  w: g.wristW },
    { x: cx + s * (g.handX - 2),                    y: g.handY + g.handW * 1.1,  w: g.handW },
  ];
}

function legPts(g, s) {
  const { cx, Y } = g;
  return [
    { x: cx + s * (g.crotchHalf + g.thighTop * 0.98), y: Y.hip - 16, w: g.thighTop },
    { x: cx + s * lerp(g.hipX, g.kneeX, 0.45),       y: lerp(Y.hip, Y.knee, 0.42), w: g.quadW },
    { x: cx + s * g.kneeX,                           y: Y.knee,     w: g.kneeW },
    { x: cx + s * lerp(g.kneeX, g.ankleX, 0.42),     y: lerp(Y.knee, Y.ankle, 0.3), w: g.calfW },
    { x: cx + s * g.ankleX,                          y: Y.ankle,    w: g.ankleW },
  ];
}

/* Torso: traps, the delt notch, the lat flare, the waist, the hips.
   The lat line from armpit to waist is the V the whole game is about. */
function torsoPath(g) {
  const { cx, Y } = g;
  const sh = g.shoulderHalf, ch = g.chestHalf, ap = g.armpitHalf,
        wa = g.waistHalf, hp = g.hipHalf;
  return `
    M ${cx - g.neckHalf - 2} ${Y.neck}
    C ${cx - g.neckHalf - 16} ${Y.neck + 12}, ${cx - sh * 0.7} ${Y.shoulder - 22}, ${cx - sh} ${Y.shoulder + 2}
    C ${cx - sh - 2} ${Y.shoulder + 16}, ${cx - ch - 6} ${Y.armpit - 18}, ${cx - ap} ${Y.armpit}
    C ${cx - ap + 2} ${Y.armpit + 44}, ${cx - wa - 8} ${Y.waist - 34}, ${cx - wa} ${Y.waist}
    C ${cx - wa - 2} ${Y.waist + 26}, ${cx - hp} ${Y.hip - 30}, ${cx - hp} ${Y.hip}
    L ${cx - hp + 4} ${Y.crotch + 8}
    Q ${cx - 16} ${Y.crotch + 6} ${cx} ${Y.crotch - 8}
    Q ${cx + 16} ${Y.crotch + 6} ${cx + hp - 4} ${Y.crotch + 8}
    L ${cx + hp} ${Y.hip}
    C ${cx + hp} ${Y.hip - 30}, ${cx + wa + 2} ${Y.waist + 26}, ${cx + wa} ${Y.waist}
    C ${cx + wa + 8} ${Y.waist - 34}, ${cx + ap - 2} ${Y.armpit + 44}, ${cx + ap} ${Y.armpit}
    C ${cx + ch + 6} ${Y.armpit - 18}, ${cx + sh + 2} ${Y.shoulder + 16}, ${cx + sh} ${Y.shoulder + 2}
    C ${cx + sh * 0.7} ${Y.shoulder - 22}, ${cx + g.neckHalf + 16} ${Y.neck + 12}, ${cx + g.neckHalf + 2} ${Y.neck}
    Z`;
}

/* Cel shadows — chest, abs, obliques. They deepen as he gets stronger,
   so definition arrives with the real work rather than for free. */
function definition(g) {
  const { cx, Y, mass: m } = g;
  const o = (0.3 + m * 0.45).toFixed(2);
  const pw = g.chestHalf * 0.66, top = Y.chest - 46, bot = Y.chest + 12;

  /* Pec mass: out from the sternum, with the lower border sweeping up
     toward the armpit the way a real chest does. */
  const pec = s => `M ${cx + s * 5} ${top}
    C ${cx + s * pw * 0.8} ${top - 10}, ${cx + s * pw} ${top + 14}, ${cx + s * pw * 0.95} ${bot - 10}
    C ${cx + s * pw * 0.55} ${bot + 8}, ${cx + s * 24} ${bot + 4}, ${cx + s * 5} ${bot - 4} Z`;

  /* The lower-pec edge catches the light — the line that says "chest". */
  const pecEdge = s => `M ${cx + s * 6} ${bot - 5}
    C ${cx + s * 26} ${bot + 5}, ${cx + s * pw * 0.6} ${bot + 8}, ${cx + s * pw * 0.94} ${bot - 11}`;

  let abs = '';
  for (let r = 0; r < 3; r++) {
    const y = bot + 24 + r * 26, w = g.waistHalf * (0.52 - r * 0.06);
    abs += `<path d="M ${cx - w} ${y} L ${cx + w} ${y}" class="ink"/>`;
  }

  return `<g class="detail" opacity="${o}">
      <path d="${pec(-1)}" class="shade"/>
      <path d="${pec(1)}" class="shade"/>
      <path d="${pecEdge(-1)}" class="ink"/>
      <path d="${pecEdge(1)}" class="ink"/>
      <path d="M ${cx} ${top + 6} L ${cx} ${Y.waist - 2}" class="ink"/>
      ${abs}
      <path d="M ${cx - g.armpitHalf + 7} ${Y.armpit + 16} Q ${cx - g.waistHalf - 9} ${Y.waist - 52} ${cx - g.waistHalf + 3} ${Y.waist - 6}" class="ink"/>
      <path d="M ${cx + g.armpitHalf - 7} ${Y.armpit + 16} Q ${cx + g.waistHalf + 9} ${Y.waist - 52} ${cx + g.waistHalf - 3} ${Y.waist - 6}" class="ink"/>
    </g>`;
}

function feet(g) {
  const { cx, Y } = g;
  return [-1, 1].map(s => `
    <path d="M ${cx + s * (g.ankleX - g.ankleW - 2)} ${Y.ankle - 6}
             L ${cx + s * (g.ankleX + g.ankleW + 2)} ${Y.ankle - 6}
             C ${cx + s * (g.ankleX + g.ankleW + 20)} ${Y.floor - 16}, ${cx + s * (g.ankleX + g.ankleW + 24)} ${Y.floor}, ${cx + s * (g.ankleX + g.ankleW + 10)} ${Y.floor}
             L ${cx + s * (g.ankleX - g.ankleW - 6)} ${Y.floor}
             Z" class="skin"/>`).join('');
}

/* Head: skull, jaw and a hair mass. No face — a stylized avatar reads
   better blank than it does with two dots for eyes. */
function head(g) {
  const { cx, Y, headR: r } = g;
  return `
    <path d="M ${cx - r} ${Y.head - 4}
             C ${cx - r} ${Y.head - r - 6}, ${cx + r} ${Y.head - r - 6}, ${cx + r} ${Y.head - 4}
             C ${cx + r} ${Y.head + r * 0.55}, ${cx + r * 0.55} ${Y.head + r + 4}, ${cx} ${Y.head + r + 6}
             C ${cx - r * 0.55} ${Y.head + r + 4}, ${cx - r} ${Y.head + r * 0.55}, ${cx - r} ${Y.head - 4} Z" class="skin"/>
    <path d="M ${cx - r - 1} ${Y.head - 6}
             C ${cx - r - 1} ${Y.head - r - 10}, ${cx + r + 1} ${Y.head - r - 10}, ${cx + r + 1} ${Y.head - 6}
             C ${cx + r * 0.6} ${Y.head - 14}, ${cx - r * 0.6} ${Y.head - 14}, ${cx - r - 1} ${Y.head - 6} Z" class="hair"/>`;
}

/* ---------------- gear art ----------------
   Every piece anchors to the SAME joints the body uses, so gear keeps
   fitting as Drew grows instead of sliding off him. */

/* A point fraction `t` along the forearm, sampled from the real arm spine
   (elbow -> wrist -> fist) so gear follows the curve of the limb. */
function foreArmAt(g, s, t) {
  const p = armPts(g, s).slice(3);
  const seg = Math.min(Math.floor(t * (p.length - 1)), p.length - 2);
  const f = t * (p.length - 1) - seg;
  return { x: lerp(p[seg].x, p[seg + 1].x, f), y: lerp(p[seg].y, p[seg + 1].y, f) };
}

/* A scalloped bottom edge, for anything meant to read as fur. */
function scallop(x1, x2, y, n, depth) {
  const step = (x2 - x1) / n;
  let d = '';
  for (let i = 0; i < n; i++) d += ` q ${step / 2} ${depth} ${step} 0`;
  return d;
}

const GEAR_ART = {
  sweatband: g => `<rect x="${g.cx - g.headR - 1}" y="${g.Y.head - 20}" width="${g.headR * 2 + 2}" height="13" rx="4" class="g-band"/>`,

  circlet: g => `
    <path d="M ${g.cx - g.headR - 1} ${g.Y.head - 12} Q ${g.cx} ${g.Y.head - 30} ${g.cx + g.headR + 1} ${g.Y.head - 12}"
          class="g-metal" fill="none" stroke-width="6"/>
    <circle cx="${g.cx}" cy="${g.Y.head - 22}" r="4.5" class="g-gem"/>`,

  crown: g => `
    <path d="M ${g.cx - 28} ${g.Y.head - 16} L ${g.cx - 28} ${g.Y.head - 40} L ${g.cx - 14} ${g.Y.head - 26}
             L ${g.cx} ${g.Y.head - 47} L ${g.cx + 14} ${g.Y.head - 26} L ${g.cx + 28} ${g.Y.head - 40}
             L ${g.cx + 28} ${g.Y.head - 16} Z" class="g-gold"/>
    <circle cx="${g.cx}" cy="${g.Y.head - 27}" r="3.5" class="g-gem"/>`,

  towel: g => {
    const x = g.cx - g.shoulderJointX + 10, y = g.Y.shoulder - 6;
    return `<path d="M ${x - 12} ${y} q 12 -12 24 0 l 5 82 q -15 7 -29 0 Z" class="g-cloth"/>`;
  },

  pelt: g => {
    const { cx, Y, shoulderHalf: sh } = g;
    const L = cx - sh - 12, R = cx + sh + 12, hem = Y.chest + 2;
    return `<path d="M ${L} ${Y.shoulder + 10}
      Q ${cx} ${Y.shoulder - 40} ${R} ${Y.shoulder + 10}
      L ${R - 4} ${hem}${scallop(R - 4, L + 4, hem, 7, 16)}
      L ${L} ${Y.shoulder + 10} Z" class="g-fur"/>`;
  },

  cape: g => {
    const { cx, Y, shoulderHalf: sh } = g;
    return `<path d="M ${cx - sh + 8} ${Y.shoulder - 6}
      C ${cx - sh - 26} ${Y.chest + 90}, ${cx - sh - 40} ${Y.knee + 60}, ${cx - sh - 22} ${Y.floor - 10}
      Q ${cx} ${Y.ankle + 14} ${cx + sh + 22} ${Y.floor - 10}
      C ${cx + sh + 40} ${Y.knee + 60}, ${cx + sh + 26} ${Y.chest + 90}, ${cx + sh - 8} ${Y.shoulder - 6}
      Z" class="g-cape"/>`;
  },

  straps: g => [-1, 1].map(s => {
    const a = foreArmAt(g, s, 0.62), b = foreArmAt(g, s, 0.82);
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}" stroke-width="${g.wristW * 2 + 3}" class="g-wrap"/>`;
  }).join(''),

  chalk: g => [-1, 1].map(s => {
    const f = foreArmAt(g, s, 1);
    return `<circle cx="${f.x}" cy="${f.y}" r="${g.handW + 8}" class="g-chalk"/>`;
  }).join(''),

  gauntlets: g => [-1, 1].map(s => {
    const pts = [0.3, 0.55, 0.8, 1].map(t => foreArmAt(g, s, t));
    return `<path d="${smooth(pts)}" stroke-width="${g.foreW * 2 - 1}" class="g-plate"/>`;
  }).join(''),

  /* Follows the torso outline, inset — a tank top at every size. */
  tank: g => {
    const { cx, Y } = g;
    const sh = g.shoulderHalf - 12, ap = g.armpitHalf - 3, wa = g.waistHalf - 1, hp = g.hipHalf - 3;
    return `<path d="M ${cx - sh} ${Y.shoulder + 14}
      C ${cx - sh - 2} ${Y.shoulder + 26}, ${cx - g.chestHalf - 2} ${Y.armpit - 10}, ${cx - ap} ${Y.armpit + 4}
      C ${cx - ap + 2} ${Y.armpit + 46}, ${cx - wa - 8} ${Y.waist - 30}, ${cx - wa} ${Y.waist + 6}
      C ${cx - wa - 2} ${Y.waist + 28}, ${cx - hp} ${Y.hip - 26}, ${cx - hp} ${Y.hip + 6}
      L ${cx + hp} ${Y.hip + 6}
      C ${cx + hp} ${Y.hip - 26}, ${cx + wa + 2} ${Y.waist + 28}, ${cx + wa} ${Y.waist + 6}
      C ${cx + wa + 8} ${Y.waist - 30}, ${cx + ap - 2} ${Y.armpit + 46}, ${cx + ap} ${Y.armpit + 4}
      C ${cx + g.chestHalf + 2} ${Y.armpit - 10}, ${cx + sh + 2} ${Y.shoulder + 26}, ${cx + sh} ${Y.shoulder + 14}
      Q ${cx + 26} ${Y.shoulder + 42} ${cx} ${Y.shoulder + 38}
      Q ${cx - 26} ${Y.shoulder + 42} ${cx - sh} ${Y.shoulder + 14} Z" class="g-tank"/>`;
  },

  brace: g => `<rect x="${g.cx - g.waistHalf - 7}" y="${g.Y.waist - 18}" width="${g.waistHalf * 2 + 14}" height="40" rx="10" class="g-brace"/>`,

  /* A V-shaped yoke — the shape the whole game is chasing. */
  mantle: g => {
    const { cx, Y, shoulderHalf: sh, neckHalf: nh } = g;
    return `<path d="M ${cx - sh - 6} ${Y.shoulder + 12}
      Q ${cx - sh * 0.5} ${Y.shoulder - 24} ${cx - nh - 6} ${Y.neck + 4}
      L ${cx + nh + 6} ${Y.neck + 4}
      Q ${cx + sh * 0.5} ${Y.shoulder - 24} ${cx + sh + 6} ${Y.shoulder + 12}
      L ${cx + sh * 0.5} ${Y.chest - 6}
      L ${cx} ${Y.chest + 30}
      L ${cx - sh * 0.5} ${Y.chest - 6} Z" class="g-mantle"/>`;
  },

  grace:    () => `<ellipse cx="200" cy="360" rx="200" ry="250" class="aura-grace"/>`,
  ember:    () => `<ellipse cx="200" cy="360" rx="205" ry="255" class="aura-ember"/>`,
  radiance: () => `<ellipse cx="200" cy="360" rx="215" ry="265" class="aura-radiance"/>`,
};

/* Layers that must sit BEHIND the body. */
const BEHIND = new Set(['cape', 'grace', 'ember', 'radiance']);
const AURAS  = new Set(['grace', 'ember', 'radiance']);

function renderAvatar(stats, equipped) {
  const g = avatarGeometry(stats.power, stats.frame.vShape);
  const worn = Object.values(equipped).filter(Boolean);
  const draw = ids => ids.map(id => (GEAR_ART[id] ? GEAR_ART[id](g) : '')).join('');

  const legs = [-1, 1].map(s => `<path d="${limbPath(legPts(g, s))}" class="skin"/>`).join('');
  const arms = [-1, 1].map(s => `<path d="${limbPath(armPts(g, s))}" class="skin"/>`).join('');

  /* One silhouette string, drawn three times: warm key light nudged up-left,
     cool fill nudged down-right, then the body itself on top. Only the
     crescents show, which is what sells it as lit rather than flat. */
  const silhouette = `
    ${legs}
    ${feet(g)}
    ${arms}
    <rect x="${g.cx - g.neckHalf}" y="${g.Y.head + 10}" width="${g.neckHalf * 2}" height="34" class="skin"/>
    <path d="${torsoPath(g)}" class="skin"/>
    ${head(g)}`;

  return `
<svg viewBox="0 0 400 760" class="avatar-svg" role="img"
     aria-label="Drew's avatar, ${Math.round(stats.power * 100)} percent grown">
  <defs>
    <linearGradient id="skin" gradientUnits="userSpaceOnUse" x1="96" y1="0" x2="306" y2="0">
      <stop offset="0%"   stop-color="#c9803f"/>
      <stop offset="18%"  stop-color="#a35f2b"/>
      <stop offset="42%"  stop-color="#71401d"/>
      <stop offset="68%"  stop-color="#472613"/>
      <stop offset="88%"  stop-color="#2e180c"/>
      <stop offset="100%" stop-color="#241208"/>
    </linearGradient>
    <radialGradient id="graceGrad">
      <stop offset="0%"   stop-color="rgba(255,206,138,0.16)"/>
      <stop offset="62%"  stop-color="rgba(255,192,118,0.06)"/>
      <stop offset="100%" stop-color="rgba(255,186,108,0)"/>
    </radialGradient>
    <radialGradient id="emberGrad">
      <stop offset="0%"   stop-color="rgba(255,136,46,0.30)"/>
      <stop offset="60%"  stop-color="rgba(255,118,38,0.11)"/>
      <stop offset="100%" stop-color="rgba(255,108,28,0)"/>
    </radialGradient>
    <radialGradient id="radGrad">
      <stop offset="0%"   stop-color="rgba(255,240,196,0.46)"/>
      <stop offset="55%"  stop-color="rgba(255,226,150,0.18)"/>
      <stop offset="100%" stop-color="rgba(255,220,140,0)"/>
    </radialGradient>
    <radialGradient id="standGrad">
      <stop offset="0%"   stop-color="rgba(232,163,75,0.34)"/>
      <stop offset="70%"  stop-color="rgba(232,163,75,0.08)"/>
      <stop offset="100%" stop-color="rgba(232,163,75,0)"/>
    </radialGradient>
    <radialGradient id="floorGrad">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.6)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>

  <g class="behind">${draw(worn.filter(id => BEHIND.has(id)).sort(a => AURAS.has(a) ? -1 : 1))}</g>

  <ellipse cx="${g.cx}" cy="${g.Y.floor + 2}" rx="150" ry="30" fill="url(#standGrad)"/>
  <ellipse cx="${g.cx}" cy="${g.Y.floor + 6}" rx="${g.ankleX + 60}" ry="15" fill="url(#floorGrad)"/>

  <g class="rim-cool" transform="translate(5,3)">${silhouette}</g>
  <g class="rim-warm" transform="translate(-5,-3)">${silhouette}</g>
  <g class="body">${silhouette}${definition(g)}</g>

  <g class="worn">${draw(worn.filter(id => !BEHIND.has(id)))}</g>
</svg>`;
}
