/* ============================================================
   Ascend — gear
   The ONLY things earned in the game. Never strength — strength
   is real life's job. Gear comes from showing up and from
   milestones that actually happened.
   ============================================================ */

const EQUIP_KEY = 'ascend.equipped.v1';

const GEAR = [
  /* ---- head ---- */
  { id: 'sweatband', slot: 'head', name: 'Sweatband',
    how: 'Complete 10 sessions',
    test: (st) => st.consistency.totalSessions >= 10 },
  { id: 'circlet', slot: 'head', name: 'Iron Circlet',
    how: 'Complete 40 sessions',
    test: (st) => st.consistency.totalSessions >= 40 },
  { id: 'crown', slot: 'head', name: 'Crown of the Faithful',
    how: 'Beat Rise Unaided',
    test: (st, bosses) => bosses.find(b => b.id === 'rise')?.beaten },

  /* ---- back ---- */
  { id: 'towel', slot: 'back', name: 'Gym Towel',
    how: 'Complete 5 sessions',
    test: (st) => st.consistency.totalSessions >= 5 },
  { id: 'pelt', slot: 'back', name: 'Wolf Pelt',
    how: 'Train 5+ times in one week',
    test: (st) => st.consistency.bestWeek >= 5 },
  { id: 'cape', slot: 'back', name: 'Ascendant Cape',
    how: 'Beat Gravity',
    test: (st, bosses) => bosses.find(b => b.id === 'gravity')?.beaten },

  /* ---- hands ---- */
  { id: 'straps', slot: 'hands', name: 'Lifting Straps',
    how: 'Shrug 110 lb',
    test: (st) => st.lift.shrug.current >= 110 },
  { id: 'chalk', slot: 'hands', name: 'Chalk of the Hinge',
    how: 'Trap-bar 195 lb',
    test: (st) => st.lift.trapbar.current >= 195 },
  { id: 'gauntlets', slot: 'hands', name: 'Gauntlets of the Eighty',
    how: 'Beat The Eighty',
    test: (st, bosses) => bosses.find(b => b.id === 'eighty')?.beaten },

  /* ---- torso ---- */
  { id: 'tank', slot: 'torso', name: 'Park West Tank',
    how: 'Complete 20 sessions',
    test: (st) => st.consistency.totalSessions >= 20 },
  { id: 'brace', slot: 'torso', name: 'Rehab Brace',
    how: '10 rehab/mobility days',
    test: (st) => st.consistency.rehabLast28 >= 6 || st.consistency.totalSessions >= 30 },
  { id: 'mantle', slot: 'torso', name: 'Mantle of the V',
    how: 'Beat The Taper',
    test: (st, bosses) => bosses.find(b => b.id === 'taper')?.beaten },

  /* ---- aura ---- */
  { id: 'grace', slot: 'aura', name: 'Grace',
    how: 'Always yours. Nothing to earn.',
    test: () => true },
  { id: 'ember', slot: 'aura', name: 'Ember',
    how: 'Beat any boss',
    test: (st, bosses) => bosses.some(b => b.beaten) },
  { id: 'radiance', slot: 'aura', name: 'Radiance',
    how: 'Beat every boss',
    test: (st, bosses) => bosses.every(b => b.beaten) },
];

const SLOTS = ['head', 'back', 'torso', 'hands', 'aura'];

function evaluateGear(st, bosses) {
  return GEAR.map(g => ({ ...g, unlocked: !!g.test(st, bosses) }));
}

function loadEquipped() {
  let eq;
  try { eq = JSON.parse(localStorage.getItem(EQUIP_KEY)); } catch (e) {}
  return eq || { head: null, back: null, torso: null, hands: null, aura: 'grace' };
}
function saveEquipped(eq) {
  localStorage.setItem(EQUIP_KEY, JSON.stringify(eq));
}
