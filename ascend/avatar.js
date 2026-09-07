/* ============================================================
   Ascend — the avatar
   A stylized figure whose SIZE comes from Drew's lifts and whose
   SHAPE comes from his tape measure. Nothing here is decorative
   guesswork: change a real number, the body changes.
   ============================================================ */

function avatarGeometry(mass, v) {
  const cx = 200;
  const Y = { head: 84, neck: 122, shoulder: 146, chest: 212, waist: 306,
              hip: 350, knee: 514, ankle: 660, floor: 688 };

  const upperArm = 12 + mass * 10;
  const thigh = 21 + mass * 13;
  const calf = 14.5 + mass * 8;

  const g = {
    cx, Y, mass, v,
    headR: 30 + mass * 2,
    neckHalf: 14 + mass * 6,
    shoulderHalf: 52 + mass * 18 + v * 30,
    waistHalf: 38 + mass * 7 - v * 6,
    hipHalf: 45 + mass * 8,
    upperArm, foreArm: 9.5 + mass * 6, thigh, calf,
    delt: upperArm + 2
  };

  /* Joint positions. Legs are spaced off the THIGH width so they never
     fuse into one slab as he grows. */
  g.hipX = thigh + 4;
  g.kneeX = thigh * 0.82 + 4;
  g.ankleX = calf + 6;
  g.shoulderJointX = g.shoulderHalf - g.delt * 0.3;
  g.shoulderJointY = Y.shoulder + g.delt * 0.5;
  g.elbowX = g.shoulderHalf + g.upperArm * 0.2;
  g.elbowY = Y.waist + 6;
  g.handX = g.elbowX + 2;
  g.handY = Y.hip + 96;
  return g;
}

function torsoPath(g) {
  const { cx, Y, shoulderHalf: sh, waistHalf: wh, hipHalf: hh } = g;
  return `
    M ${cx - sh} ${Y.shoulder}
    C ${cx - sh - 4} ${Y.chest - 30}, ${cx - sh + 8} ${Y.chest + 30}, ${cx - wh} ${Y.waist}
    C ${cx - wh - 2} ${Y.waist + 22}, ${cx - hh} ${Y.hip - 22}, ${cx - hh} ${Y.hip + 6}
    L ${cx + hh} ${Y.hip + 6}
    C ${cx + hh} ${Y.hip - 22}, ${cx + wh + 2} ${Y.waist + 22}, ${cx + wh} ${Y.waist}
    C ${cx + sh - 8} ${Y.chest + 30}, ${cx + sh + 4} ${Y.chest - 30}, ${cx + sh} ${Y.shoulder}
    Z`;
}

/* Trapezius — Drew's priority muscle, so it gets its own shape that
   visibly thickens the neck-to-shoulder line as he grows. */
function trapPath(g) {
  const { cx, Y, shoulderHalf: sh, neckHalf: nh, mass } = g;
  const rise = 8 + mass * 22;
  return `
    M ${cx - sh + 6} ${Y.shoulder + 6}
    Q ${cx - nh - 10} ${Y.neck - rise}, ${cx - nh - 1} ${Y.neck - 6}
    L ${cx + nh + 1} ${Y.neck - 6}
    Q ${cx + nh + 10} ${Y.neck - rise}, ${cx + sh - 6} ${Y.shoulder + 6}
    Z`;
}

function armsSvg(g) {
  const { cx, Y } = g;
  const upper = s => `M ${cx + s * g.shoulderJointX} ${g.shoulderJointY}
      Q ${cx + s * (g.shoulderHalf + 4)} ${Y.chest + 24} ${cx + s * g.elbowX} ${g.elbowY}`;
  const fore = s => `M ${cx + s * g.elbowX} ${g.elbowY} L ${cx + s * g.handX} ${g.handY}`;

  return [-1, 1].map(s => `
    <circle cx="${cx + s * g.shoulderJointX}" cy="${g.shoulderJointY}" r="${g.delt}" class="skin"/>
    <path d="${upper(s)}" stroke-width="${g.upperArm * 2 + 4}" class="limb-out"/>
    <path d="${fore(s)}"  stroke-width="${g.foreArm * 2 + 4}"  class="limb-out"/>
    <path d="${upper(s)}" stroke-width="${g.upperArm * 2}" class="limb"/>
    <path d="${fore(s)}"  stroke-width="${g.foreArm * 2}"  class="limb"/>
    <ellipse cx="${cx + s * g.handX}" cy="${g.handY + g.foreArm}" rx="${g.foreArm + 1.5}"
             ry="${g.foreArm + 4}" class="skin"/>`).join('');
}

function legsSvg(g) {
  const { cx, Y } = g;
  const thighP = s => `M ${cx + s * g.hipX} ${Y.hip - 10} L ${cx + s * g.kneeX} ${Y.knee}`;
  const calfP  = s => `M ${cx + s * g.kneeX} ${Y.knee} L ${cx + s * g.ankleX} ${Y.ankle}`;

  return [-1, 1].map(s => `
    <path d="${thighP(s)}" stroke-width="${g.thigh * 2 + 4}" class="limb-out"/>
    <path d="${calfP(s)}"  stroke-width="${g.calf * 2 + 4}"  class="limb-out"/>
    <path d="${thighP(s)}" stroke-width="${g.thigh * 2}" class="limb"/>
    <path d="${calfP(s)}"  stroke-width="${g.calf * 2}"  class="limb"/>
    <path d="M ${cx + s * (g.ankleX - g.calf)} ${Y.floor}
             L ${cx + s * (g.ankleX + g.calf * 0.6)} ${Y.floor}
             Q ${cx + s * (g.ankleX + g.calf * 1.7)} ${Y.floor} ${cx + s * (g.ankleX + g.calf * 1.7)} ${Y.floor - 9}
             L ${cx + s * (g.ankleX + g.calf * 0.4)} ${Y.ankle - 4}
             L ${cx + s * (g.ankleX - g.calf)} ${Y.ankle - 4} Z" class="skin"/>`).join('');
}

/* Chest and abs fade in as he gets stronger — a quiet reward for real
   work, driven by `mass`, never by playing. */
function definition(g) {
  const { cx, Y, mass, shoulderHalf: sh, waistHalf: wh } = g;
  const pecW = sh * 0.72, pecTop = Y.chest - 30, pecBot = Y.chest + 30;
  /* Pec underline rather than a filled block — a shaded slab reads as a
     box on a flat figure. Two curves say "chest" far better. */
  const pec = s => `M ${cx + s * 3} ${pecBot}
    Q ${cx + s * pecW * 0.75} ${pecBot + 6} ${cx + s * pecW} ${pecTop + 12}`;

  return `
    <g class="detail" opacity="${(0.3 + mass * 0.55).toFixed(2)}">
      <path d="M ${cx} ${pecTop - 2} L ${cx} ${pecBot - 2}"/>
      <path d="${pec(-1)}"/>
      <path d="${pec(1)}"/>
      <path d="M ${cx} ${pecBot + 14} L ${cx} ${Y.waist + 10}"/>
      <path d="M ${cx - wh * 0.5} ${pecBot + 24} L ${cx + wh * 0.5} ${pecBot + 24}"/>
      <path d="M ${cx - wh * 0.46} ${pecBot + 50} L ${cx + wh * 0.46} ${pecBot + 50}"/>
      <path d="M ${cx - wh * 0.4} ${pecBot + 74} L ${cx + wh * 0.4} ${pecBot + 74}"/>
    </g>`;
}

/* ---------------- gear art ----------------
   Every piece is positioned from the SAME joint geometry the body uses,
   so gear keeps fitting as Drew grows instead of sliding off him. */

/* A point fraction `t` down the forearm, for wrist-height items. */
function foreArmAt(g, s, t) {
  return { x: g.cx + s * (g.elbowX + (g.handX - g.elbowX) * t),
           y: g.elbowY + (g.handY - g.elbowY) * t };
}

/* A scalloped bottom edge, for anything meant to read as fur. */
function scallop(x1, x2, y, n, depth) {
  const step = (x2 - x1) / n;
  let d = '';
  for (let i = 0; i < n; i++) {
    d += ` q ${step / 2} ${depth} ${step} 0`;
  }
  return d;
}

const GEAR_ART = {
  sweatband: g => `<rect x="${g.cx - g.headR - 1}" y="${g.Y.head - 17}" width="${g.headR * 2 + 2}" height="13" rx="4" class="g-band"/>`,

  circlet: g => `
    <path d="M ${g.cx - g.headR - 1} ${g.Y.head - 9} Q ${g.cx} ${g.Y.head - 27} ${g.cx + g.headR + 1} ${g.Y.head - 9}"
          class="g-metal" fill="none" stroke-width="6"/>
    <circle cx="${g.cx}" cy="${g.Y.head - 19}" r="4.5" class="g-gem"/>`,

  crown: g => `
    <path d="M ${g.cx - 28} ${g.Y.head - 13} L ${g.cx - 28} ${g.Y.head - 35} L ${g.cx - 14} ${g.Y.head - 22}
             L ${g.cx} ${g.Y.head - 42} L ${g.cx + 14} ${g.Y.head - 22} L ${g.cx + 28} ${g.Y.head - 35}
             L ${g.cx + 28} ${g.Y.head - 13} Z" class="g-gold"/>
    <circle cx="${g.cx}" cy="${g.Y.head - 23}" r="3.5" class="g-gem"/>`,

  /* Slung over the left shoulder, hanging down the chest. */
  towel: g => {
    const x = g.cx - g.shoulderJointX + 7, y = g.Y.shoulder - 2;
    return `<path d="M ${x - 12} ${y} q 12 -11 24 0 l 5 80 q -15 7 -29 0 Z" class="g-cloth"/>`;
  },

  /* A fur drape across the shoulders — worn over the back, visible from
     the front, with a ragged hem. */
  pelt: g => {
    const { cx, Y, shoulderHalf: sh } = g;
    const L = cx - sh - 14, R = cx + sh + 14, hem = Y.chest + 4;
    return `<path d="M ${L} ${Y.shoulder + 10}
      Q ${cx} ${Y.shoulder - 34} ${R} ${Y.shoulder + 10}
      L ${R - 4} ${hem}${scallop(R - 4, L + 4, hem, 7, 16)}
      L ${L} ${Y.shoulder + 10} Z" class="g-fur"/>`;
  },

  cape: g => {
    const { cx, Y, shoulderHalf: sh } = g;
    return `<path d="M ${cx - sh + 8} ${Y.shoulder - 4}
      C ${cx - sh - 44} ${Y.chest + 90}, ${cx - sh - 74} ${Y.knee + 70}, ${cx - sh - 56} ${Y.floor - 4}
      Q ${cx} ${Y.ankle + 16} ${cx + sh + 56} ${Y.floor - 4}
      C ${cx + sh + 74} ${Y.knee + 70}, ${cx + sh + 44} ${Y.chest + 90}, ${cx + sh - 8} ${Y.shoulder - 4}
      Z" class="g-cape"/>`;
  },

  /* Wrist wraps, sitting on the forearm just above the hand. */
  straps: g => [-1, 1].map(s => {
    const p = foreArmAt(g, s, 0.82), w = g.foreArm + 4;
    return `<rect x="${p.x - w}" y="${p.y - 7}" width="${w * 2}" height="14" rx="3" class="g-cloth"/>`;
  }).join(''),

  chalk: g => [-1, 1].map(s => `
    <circle cx="${g.cx + s * g.handX}" cy="${g.handY + g.foreArm}" r="${g.foreArm + 6}" class="g-chalk"/>
    <circle cx="${g.cx + s * (g.handX + g.foreArm)}" cy="${g.handY + g.foreArm * 2}" r="4" class="g-chalk"/>`).join(''),

  /* Forearm plates — the lower half of the forearm only, so the elbow
     still reads. */
  gauntlets: g => [-1, 1].map(s => {
    const a = foreArmAt(g, s, 0.38), b = foreArmAt(g, s, 1);
    return `<path d="M ${a.x} ${a.y} L ${b.x} ${b.y}"
             stroke-width="${g.foreArm * 2 + 5}" class="g-plate"/>`;
  }).join(''),

  /* Follows the torso outline, inset — so it stays a tank top at every size. */
  tank: g => {
    const { cx, Y, shoulderHalf: sh, waistHalf: wh, hipHalf: hh } = g;
    const s = sh - 6, w = wh - 1, h = hh - 3;
    return `<path d="M ${cx - s} ${Y.shoulder + 10}
      C ${cx - s - 4} ${Y.chest - 26}, ${cx - s + 8} ${Y.chest + 30}, ${cx - w} ${Y.waist + 4}
      C ${cx - w - 2} ${Y.waist + 24}, ${cx - h} ${Y.hip - 18}, ${cx - h} ${Y.hip + 4}
      L ${cx + h} ${Y.hip + 4}
      C ${cx + h} ${Y.hip - 18}, ${cx + w + 2} ${Y.waist + 24}, ${cx + w} ${Y.waist + 4}
      C ${cx + s - 8} ${Y.chest + 30}, ${cx + s + 4} ${Y.chest - 26}, ${cx + s} ${Y.shoulder + 10}
      Q ${cx + 24} ${Y.shoulder + 40} ${cx} ${Y.shoulder + 36}
      Q ${cx - 24} ${Y.shoulder + 40} ${cx - s} ${Y.shoulder + 10} Z" class="g-tank"/>`;
  },

  brace: g => `<rect x="${g.cx - g.waistHalf - 6}" y="${g.Y.waist - 20}" width="${g.waistHalf * 2 + 12}" height="38" rx="10" class="g-brace"/>`,

  mantle: g => {
    const { cx, Y, shoulderHalf: sh, neckHalf: nh } = g;
    return `<path d="M ${cx - sh - 8} ${Y.shoulder + 16}
      Q ${cx - sh * 0.5} ${Y.shoulder - 18} ${cx - nh - 5} ${Y.neck + 2}
      L ${cx + nh + 5} ${Y.neck + 2}
      Q ${cx + sh * 0.5} ${Y.shoulder - 18} ${cx + sh + 8} ${Y.shoulder + 16}
      L ${cx + sh * 0.55} ${Y.chest + 14}
      L ${cx} ${Y.chest + 54}
      L ${cx - sh * 0.55} ${Y.chest + 14} Z" class="g-mantle"/>`;
  },

  grace:    () => `<circle cx="200" cy="330" r="210" class="aura-grace"/>`,
  ember:    () => `<circle cx="200" cy="330" r="215" class="aura-ember"/>`,
  radiance: () => `<circle cx="200" cy="330" r="225" class="aura-radiance"/>`,
};

/* Layers that must sit BEHIND the body. */
const BEHIND = new Set(['cape', 'grace', 'ember', 'radiance']);

function renderAvatar(stats, equipped) {
  const g = avatarGeometry(stats.power, stats.frame.vShape);
  const worn = Object.values(equipped).filter(Boolean);
  const draw = ids => ids.map(id => (GEAR_ART[id] ? GEAR_ART[id](g) : '')).join('');

  return `
<svg viewBox="0 0 400 720" class="avatar-svg" role="img"
     aria-label="Drew's avatar, ${Math.round(stats.power * 100)} percent grown">
  <defs>
    <linearGradient id="skin" gradientUnits="userSpaceOnUse" x1="112" y1="0" x2="292" y2="0">
      <stop offset="0%"   stop-color="#8a5330"/>
      <stop offset="40%"  stop-color="#c9884f"/>
      <stop offset="72%"  stop-color="#e2ab6e"/>
      <stop offset="100%" stop-color="#844f2d"/>
    </linearGradient>
    <radialGradient id="graceGrad">
      <stop offset="0%"   stop-color="rgba(255,208,140,0.13)"/>
      <stop offset="65%"  stop-color="rgba(255,196,120,0.05)"/>
      <stop offset="100%" stop-color="rgba(255,190,110,0)"/>
    </radialGradient>
    <radialGradient id="emberGrad">
      <stop offset="0%"   stop-color="rgba(255,138,48,0.26)"/>
      <stop offset="60%"  stop-color="rgba(255,120,40,0.10)"/>
      <stop offset="100%" stop-color="rgba(255,110,30,0)"/>
    </radialGradient>
    <radialGradient id="radGrad">
      <stop offset="0%"   stop-color="rgba(255,240,196,0.42)"/>
      <stop offset="55%"  stop-color="rgba(255,226,150,0.16)"/>
      <stop offset="100%" stop-color="rgba(255,220,140,0)"/>
    </radialGradient>
    <radialGradient id="floorGrad">
      <stop offset="0%"   stop-color="rgba(0,0,0,0.55)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0)"/>
    </radialGradient>
  </defs>

  <g class="behind">${draw(worn.filter(id => BEHIND.has(id)))}</g>
  <ellipse cx="${g.cx}" cy="${g.Y.floor + 6}" rx="${g.hipX + g.thigh + 26}" ry="16" fill="url(#floorGrad)"/>

  <g class="body">
    ${legsSvg(g)}
    <rect x="${g.cx - g.neckHalf}" y="${g.Y.head + 14}" width="${g.neckHalf * 2}" height="30" class="skin"/>
    <path d="${torsoPath(g)}" class="skin"/>
    ${definition(g)}
    <path d="${trapPath(g)}" class="skin"/>
    ${armsSvg(g)}
    <circle cx="${g.cx}" cy="${g.Y.head}" r="${g.headR}" class="skin"/>
  </g>

  <g class="worn">${draw(worn.filter(id => !BEHIND.has(id)))}</g>
</svg>`;
}
