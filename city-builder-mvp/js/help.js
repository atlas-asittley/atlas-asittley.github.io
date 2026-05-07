// ── Buildings reference modal ──
//
// Standalone help dialog accessible from a "?" button in the topbar.
// Lists every building in the game grouped by industry / role, with
// click-to-expand showing each building's inputs, output, worker cost,
// build cost, and unlock prereq. Read-only — does not depend on or
// affect the player's current selection / placement state.

import { state } from './state.js';
import { colors, spriteIcons } from './sprites.js';
import { expandDistrict } from './map.js';
import { doLogout, doReset } from './auth.js';
import { sb } from './config.js';
import { updateIdentity } from './ui.js';
import { addNotification } from './notifications.js';

var openOverlay = null;

function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function resName(key) {
  if (!key) return '';
  if (state.resources && state.resources[key]) return state.resources[key].name;
  return key;
}

function tierName(tier) {
  var cfg = state.housingTierConfig && state.housingTierConfig[tier];
  return (cfg && cfg.name) || ('Tier ' + tier);
}

// Buildings whose only purpose is to gate housing tiers — when a
// service has unlocks_at_housing_tier set, surface that prereq.
function unlockBlurb(bt) {
  if (bt.unlocks_at_housing_tier == null) return null;
  return 'Locked until you reach ' + tierName(bt.unlocks_at_housing_tier) + ' housing.';
}

// Find the smallest integer k such that every rate × k rounds to an
// integer. Used to integer-ize recipe ratios for display ("0.5 in →
// 0.25 out" → k=4 → "2 in per 4 min, 1 out per 4 min"). Caps at 60
// so the cycle time stays reasonable; rates that require k>60 are
// surfaced with their decimal form as a fallback.
function findRateScale(rates) {
  var nonzero = rates.filter(function (r) { return r > 0; });
  if (nonzero.length === 0) return 1;
  for (var k = 1; k <= 60; k++) {
    var ok = true;
    for (var i = 0; i < nonzero.length; i++) {
      if (Math.abs(nonzero[i] * k - Math.round(nonzero[i] * k)) > 0.001) { ok = false; break; }
    }
    if (ok) return k;
  }
  return 1;
}

// "Recipe-ize" a building's rates into integer in/out quantities and a
// cycle period. {input_q, input_q_2, output_q, period_min}.
function recipeOf(bt) {
  var rates = [bt.input_rate || 0, bt.input_rate_2 || 0, bt.output_rate || 0];
  var k = findRateScale(rates);
  return {
    input_q:    Math.round((bt.input_rate || 0) * k),
    input_q_2:  Math.round((bt.input_rate_2 || 0) * k),
    output_q:   Math.round((bt.output_rate || 0) * k),
    period_min: k
  };
}

// Format a quantity with its time period: "1/min" or "2 per 4 min".
function fmtPer(qty, period) {
  if (qty <= 0) return '';
  if (period === 1) return qty + '/min';
  return qty + ' per ' + period + ' min';
}

// Plain-language "what this building does for your city" line. Where
// the gameplay effect is just "produces X" we lean on the existing
// Output row; where it's a non-output effect (services, police,
// boosters), spell it out.
function benefitText(bt) {
  if (bt.category === 'road') {
    return 'Connects buildings to the city. Required for housing and most production.';
  }
  if (bt.category === 'housing') {
    return 'Houses citizens, contributing workers to your city. Evolves through nine tiers as services + food + luxuries become available.';
  }
  if (bt.category === 'extractor') {
    var r = resName(bt.output_resource_key).toLowerCase();
    return 'Your district’s source of ' + r + '. Place near a matching resource patch.';
  }
  if (bt.category === 'food_extractor') {
    var fr = resName(bt.output_resource_key).toLowerCase();
    return 'Produces ' + fr + ' to feed your population. Higher-tier housing requires food in stock.';
  }
  if (bt.category === 'processor') {
    var inText = resName(bt.input_resource_key).toLowerCase();
    if (bt.input_resource_key_2) inText += ' + ' + resName(bt.input_resource_key_2).toLowerCase();
    var outText = resName(bt.output_resource_key).toLowerCase();
    return 'Refines ' + inText + ' into ' + outText + '.';
  }
  if (bt.category === 'booster') {
    var pct = Math.round(((bt.boost_multiplier || 1) - 1) * 100);
    var target = bt.boost_target === 'food_extractor' ? 'food extractors' : 'extractors';
    return 'Boosts every ' + target + ' within ' + (bt.boost_range || 2) + ' tiles by +' + pct + '%. Stack one near each cluster.';
  }
  if (bt.category === 'service') {
    if (bt.key === 'well')      return 'Lets housing within 4 tiles upgrade past Shanty.';
    if (bt.key === 'tavern')    return 'Adds +10 worker capacity to the city while staffed. Consumes bread + pottery.';
    if (bt.key === 'bathhouse') return 'Stops nearby housing from devolving when conditions slip.';
    if (bt.key === 'school')    return 'Gates Townhouse (tier 3) evolution for any housing within 5 tiles.';
    if (bt.key === 'temple')    return 'Gates Villa (tier 4) evolution for any housing within 6 tiles.';
    return 'Service building.';
  }
  if (bt.category === 'tax') {
    return 'Generates $' + (bt.output_rate || 0) + '/min in tax revenue while staffed and road-connected.';
  }
  if (bt.category === 'police') {
    var radius = bt.coverage_radius || 0;
    return 'Reduces crime in housing within ' + radius + ' tiles. Crime over 50 starts to push citizens out.';
  }
  return null;
}

// Section assignment mirrors panels.js but split by industry so each
// player's chain is its own visual section. "Common" buildings are
// further split into Infrastructure (road/housing) vs Civic (services /
// tax / police) for readability.
function sectionFor(bt) {
  if (bt.category === 'road' || bt.category === 'housing') return 'infra';
  if (bt.industry_key === 'common') return 'civic';
  if (bt.industry_key === 'timber') return 'timber';
  if (bt.industry_key === 'stone')  return 'stone';
  if (bt.industry_key === 'clay')   return 'clay';
  if (bt.industry_key === 'iron')   return 'iron';
  return 'civic';
}

var SECTION_ORDER = ['infra', 'civic', 'timber', 'stone', 'clay', 'iron'];
var SECTION_TITLES = {
  infra:  'Infrastructure',
  civic:  'Civic & Services',
  timber: 'Timber Industry',
  stone:  'Stone Industry',
  clay:   'Clay Industry',
  iron:   'Iron Industry'
};
var CATEGORY_ORDER = {
  road: 0, housing: 1,
  extractor: 2, food_extractor: 3,
  processor: 4, booster: 5,
  service: 6, tax: 7, police: 8
};

function renderBuildingCard(bt) {
  var rows = '';

  // Recipe display: scale rates to integer quantities with a cycle
  // period so the player never sees "0.5 timber → 0.25 lumber".
  // Tax buildings stay in $/min (always integer-friendly).
  if (bt.category === 'tax' && bt.output_rate > 0) {
    rows += '<div class="help-row"><span class="help-label">Output</span><span class="help-value">$' + bt.output_rate + '/min</span></div>';
  } else if ((bt.input_resource_key && bt.input_rate > 0)
             || (bt.output_resource_key && bt.output_rate > 0)) {
    var r = recipeOf(bt);
    var inputParts = [];
    if (r.input_q > 0) {
      inputParts.push(r.input_q + ' ' + resName(bt.input_resource_key).toLowerCase());
    }
    if (r.input_q_2 > 0 && bt.input_resource_key_2) {
      inputParts.push(r.input_q_2 + ' ' + resName(bt.input_resource_key_2).toLowerCase());
    }
    if (inputParts.length) {
      var inputsLabel = inputParts.join(' + ');
      // Tavern's "output" is +10 worker capacity, not a tradeable
      // resource — handled separately in benefitText. Skip the row
      // here.
      var perCycle = r.period_min === 1 ? '/min' : ' per ' + r.period_min + ' min';
      rows += '<div class="help-row"><span class="help-label">Inputs</span><span class="help-value">' + escapeHtml(inputsLabel) + perCycle + '</span></div>';
    }
    if (r.output_q > 0 && bt.output_resource_key) {
      var outLabel = r.output_q + ' ' + resName(bt.output_resource_key).toLowerCase()
                   + (r.period_min === 1 ? '/min' : ' per ' + r.period_min + ' min');
      rows += '<div class="help-row"><span class="help-label">Output</span><span class="help-value">' + escapeHtml(outLabel) + '</span></div>';
    }
  }
  if (bt.category === 'booster') {
    var pct = Math.round(((bt.boost_multiplier || 1) - 1) * 100);
    var target = bt.boost_target === 'food_extractor' ? 'food extractors' : 'extractors';
    rows += '<div class="help-row"><span class="help-label">Effect</span><span class="help-value">+' + pct + '% to ' + target + ' within ' + (bt.boost_range || 2) + ' tiles</span></div>';
  }
  if (bt.category === 'police') {
    rows += '<div class="help-row"><span class="help-label">Coverage</span><span class="help-value">' + (bt.coverage_radius || 0) + ' tiles</span></div>';
    if (bt.upkeep_per_minute) {
      rows += '<div class="help-row"><span class="help-label">Upkeep</span><span class="help-value">$' + bt.upkeep_per_minute + '/min</span></div>';
    }
  }
  if (bt.placement_resource_node_key) {
    rows += '<div class="help-row"><span class="help-label">Tile</span><span class="help-value">place on ' + escapeHtml(resName(bt.placement_resource_node_key).toLowerCase()) + '</span></div>';
  }
  if (bt.category !== 'housing' && bt.category !== 'road') {
    rows += '<div class="help-row"><span class="help-label">Workers</span><span class="help-value">' + (bt.worker_cost || 0) + '</span></div>';
  }
  rows += '<div class="help-row"><span class="help-label">Build cost</span><span class="help-value">$' + (bt.build_cost || 0) + '</span></div>';
  if (bt.category !== 'road') {
    rows += '<div class="help-row"><span class="help-label">Road access</span><span class="help-value">required</span></div>';
  }
  var unlock = unlockBlurb(bt);
  if (unlock) {
    rows += '<div class="help-row help-row-warn"><span class="help-label">Unlock</span><span class="help-value">' + escapeHtml(unlock) + '</span></div>';
  }

  // Housing has its own detailed chain — call it out as a special case.
  var nameSuffix = '';
  if (bt.category !== 'housing' && bt.category !== 'road' && bt.tier) {
    nameSuffix = ' <small>T' + bt.tier + '</small>';
  }
  if (bt.category === 'housing') {
    rows =
      '<div class="help-row"><span class="help-label">Tiers</span><span class="help-value">Shanty → Mud Hut → Cottage → Townhouse → Villa → Manor → Mansion → Estate → Palace</span></div>' +
      '<div class="help-row"><span class="help-label">Workers / house</span><span class="help-value">Shanty 2 · Hut 6 · Cottage 10 · Townhouse 16 · Villa 24 · Manor 35 · Mansion 50 · Estate 70 · Palace 100</span></div>' +
      '<div class="help-row"><span class="help-label">Build cost</span><span class="help-value">$' + (bt.build_cost || 0) + ' (placed as Shanty; evolves automatically)</span></div>' +
      '<div class="help-row help-row-section"><span class="help-label">Tier prereqs</span><span class="help-value">' +
        '<b>Mud Hut</b>: any well in your district.<br>' +
        '<b>Cottage</b>: well within 4 tiles · food in stock.<br>' +
        '<b>Townhouse</b>: road-connected · school within 5 tiles.<br>' +
        '<b>Villa</b>: temple within 6 tiles.<br>' +
        '<b>Manor &amp; up</b>: tavern + bathhouse coverage, plus more food variety and luxuries the higher you go.<br>' +
        '<i>Click any house in your city to see its exact upgrade blockers.</i>' +
      '</span></div>' +
      '<div class="help-row help-row-section"><span class="help-label">Food drain</span><span class="help-value">' +
        'Houses past Mud Hut consume food every minute, drawn proportionally from whatever foods you have in stock. Run out and they devolve.<br>' +
        'Per house, per hour: Cottage ~14 · Townhouse 24 · Villa 36 · Manor 60 · Mansion 96 · Estate 144 · Palace 216.' +
      '</span></div>' +
      '<div class="help-row help-row-section"><span class="help-label">Lifestyle goods</span><span class="help-value">' +
        'Higher tiers need non-food luxuries in stock to upgrade <i>and</i> to keep from devolving. Goods stack — once your residents acquire a taste, they keep wanting it forever:<br>' +
        '<b>Cottage</b>: pottery.<br>' +
        '<b>Townhouse</b>: pottery + bread.<br>' +
        '<b>Villa</b>: pottery + bread + furniture.<br>' +
        '<b>Manor &amp; up</b>: pottery + bread + furniture + statuary.<br>' +
        'Per-house consumption scales with tier — a Manor uses ~2.5× as much pottery as a Cottage. Plan multiple production chains, or trade for what you can\'t make.' +
      '</span></div>';
  }

  // Icon: same inline-SVG sprite the build panel uses, scaled down.
  // Fallback to a colored swatch with the BLDG_LABELS abbreviation when
  // we don't have a sprite (none of the active buildings hit this in
  // practice, but it's harmless).
  var sprite = spriteIcons[bt.key];
  var bg = colors[bt.key] || '#4a4a6a';
  var iconHtml;
  if (sprite) {
    iconHtml = '<div class="help-building-icon" style="background-color:' + bg + ';background-image:url(&quot;' + sprite + '&quot;)"></div>';
  } else {
    iconHtml = '<div class="help-building-icon" style="background-color:' + bg + ';"></div>';
  }

  var benefit = benefitText(bt);
  var benefitRow = benefit
    ? '<div class="help-row help-row-benefit"><span class="help-label">Benefit</span><span class="help-value">' + escapeHtml(benefit) + '</span></div>'
    : '';

  return '<div class="help-building" data-key="' + escapeHtml(bt.key) + '">' +
           '<div class="help-building-header">' +
             iconHtml +
             '<span class="help-building-name">' + escapeHtml(bt.name) + nameSuffix + '</span>' +
             '<span class="help-building-chevron">▾</span>' +
           '</div>' +
           '<div class="help-building-body">' + benefitRow + rows + '</div>' +
         '</div>';
}

function renderHelpHtml() {
  var byCategory = state.buildingTypes || {};
  var buckets = {};
  Object.keys(byCategory).forEach(function (k) {
    var bt = byCategory[k];
    if (!bt || bt.is_active === false) return;
    var sect = sectionFor(bt);
    if (!buckets[sect]) buckets[sect] = [];
    buckets[sect].push(bt);
  });
  Object.keys(buckets).forEach(function (sect) {
    buckets[sect].sort(function (a, b) {
      var ca = CATEGORY_ORDER[a.category] != null ? CATEGORY_ORDER[a.category] : 9;
      var cb = CATEGORY_ORDER[b.category] != null ? CATEGORY_ORDER[b.category] : 9;
      if (ca !== cb) return ca - cb;
      if ((a.tier || 0) !== (b.tier || 0)) return (a.tier || 0) - (b.tier || 0);
      return a.name.localeCompare(b.name);
    });
  });

  var sectionsHtml = '';
  SECTION_ORDER.forEach(function (sect) {
    var list = buckets[sect];
    if (!list || list.length === 0) return;
    sectionsHtml += '<div class="help-section">';
    sectionsHtml += '<div class="help-section-title">' + escapeHtml(SECTION_TITLES[sect]) + '</div>';
    list.forEach(function (bt) { sectionsHtml += renderBuildingCard(bt); });
    sectionsHtml += '</div>';
  });

  return '<div class="help-modal" role="dialog" aria-modal="true">' +
           '<div class="help-header">' +
             '<span class="help-title">Buildings reference</span>' +
             '<button class="help-close" id="help-close" aria-label="Close">×</button>' +
           '</div>' +
           '<div class="help-body">' +
             '<div class="help-intro">Tap any building to see what it consumes, what it produces, and what it costs to run.</div>' +
             sectionsHtml +
           '</div>' +
         '</div>';
}

export function openHelpModal() {
  if (openOverlay) return;
  openOverlay = document.createElement('div');
  openOverlay.className = 'help-overlay';
  openOverlay.innerHTML = renderHelpHtml();
  document.body.appendChild(openOverlay);

  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  // Click outside the dialog body closes it.
  openOverlay.addEventListener('click', function (e) {
    if (e.target === openOverlay) closeHelpModal();
  });
  // Click a building header → toggle expanded.
  openOverlay.querySelectorAll('.help-building-header').forEach(function (h) {
    h.addEventListener('click', function () {
      h.parentElement.classList.toggle('expanded');
    });
  });
  // Escape key closes.
  document.addEventListener('keydown', escapeListener);
}

function closeHelpModal() {
  if (!openOverlay) return;
  openOverlay.remove();
  openOverlay = null;
  document.removeEventListener('keydown', escapeListener);
}

function escapeListener(e) {
  if (e.key === 'Escape') closeHelpModal();
}

// ── Per-stat info popups ──
//
// Tapping a topbar stat (workers / chunks / happiness / crime) opens
// a small dialog explaining what the metric measures, why it matters,
// and how to improve it. Money is intentionally skipped — its click
// handler is the triple-tap cheat (auth.js) and overloading single-
// tap with info popups would fire on every cheat tap too.
var STAT_INFO = {
  workers: {
    icon: '👷',
    title: 'Workers Employed',
    what: 'The number of citizens currently <b>working</b> at a building somewhere in your district. Compare against your population (👥 next to this) to see how many are idle.',
    why: 'When this equals your population, every citizen has a job — productive and content. When it\'s well below population, you have idle workers and need more production. When the city actively can\'t fill its jobs, a red <b>!</b> badge appears: that\'s a labor shortage and production stalls.',
    how: 'Want more workers employed? Build more production buildings (extractors, processors, services). Want to fix a shortage? Grow population — bigger / more-evolved houses raise the target, citizens move in when happiness is above 50. A <b>Tavern</b> directly boosts capacity while it\'s running.'
  },
  population: {
    icon: '👥',
    title: 'Population',
    what: 'Shown as <b>citizens / housing capacity</b>. The first number is the people currently living in your district; the second is how many you can hold. Capacity = a <b>baseline of 15</b> (a floor that exists even with no housing) <b>plus</b> the workers each of your active houses can hold (Shanty 2, Mud Hut 6, Cottage 10, Townhouse 16, etc.).',
    why: 'Population IS your worker pool — every staffed building draws from this number. The 15 baseline is the safety net that prevents a death spiral: even if you demolish every house, you keep 15 citizens to rebuild from. Beyond the baseline, housing capacity is what limits city size.',
    how: 'Citizens move in when <b>happiness ≥ 50</b>: food variety, service coverage, low crime. Below 50, they leave (down to the 15 floor). Faster growth comes from happier conditions — at happiness 100, immigration runs at ~4 per minute. Raise your ceiling by building more houses or letting them evolve to higher tiers (which hold more people each). Population can never exceed capacity, so housing is the gate on growth.'
  },
  parcels: {
    icon: '🗺',
    title: 'Parcels',
    what: 'A parcel is a 15×15 piece of land you\'ve claimed. Each gives ~225 buildable tiles plus a few resource patches in your industry. Multiple parcels stitched together make your district.',
    why: 'More parcels = more room to grow, but the cost scales steeply: <b>$10,000 × parcels²</b> for the next one — $10,000 for the 2nd, $40,000 for the 3rd, $90,000 for the 4th, $160,000 for the 5th. Expand faster than your economy and you\'ll go broke.',
    how: 'Use the <b>Expand district</b> button below. Highlighted parcels adjacent to your district become buyable; tap one to allocate it.'
  },
  happiness: {
    icon: '🙂',
    title: 'Happiness',
    what: 'How content your citizens are. ☹ unhappy / 😐 mediocre / 🙂 content / 😊 thriving — the icon at the top changes as conditions improve.',
    why: 'A happy city grows; an unhappy city loses citizens. Watch the migration arrow next to it — when happiness slips, you\'ll see the city start shrinking.',
    how: 'Build the <b>five service buildings</b> — well, tavern, bathhouse, school, temple — each covers a small radius around it. Stock a <b>variety of foods</b> in inventory (more types = bigger bonus). Don\'t over-tax — every Tax Office adds pressure. <b>Reduce crime</b> with police buildings.'
  },
  crime: {
    icon: '🚨',
    title: 'Crime',
    what: 'How dangerous your streets feel. <b>Lower is better.</b> Driven up by housing that no police are watching, by how much housing you have overall, and a bit by each Tavern (drinking attracts trouble).',
    why: 'High crime makes your citizens unhappy and they start leaving. A bad enough crime problem can undo all the work you\'re doing on services and food.',
    how: 'Build police: <b>Watch House</b> (radius 4), <b>Police Station</b> (radius 6, gated at Townhouse), <b>Constabulary</b> (radius 8, gated at Manor). Make sure they\'re <b>staffed</b> — unstaffed police don\'t reduce crime, even with road access. Police buildings cost upkeep every minute too, so plan their coverage.'
  },
  migration: {
    icon: '↕',
    title: 'Migration',
    what: 'Whether citizens are <b>moving in</b> (↑ green), <b>leaving</b> (↓ red), or the city is <b>steady</b> (→). The number is the rate of change per minute.',
    why: 'Tells you at a glance whether your city is growing, shrinking, or holding steady. A shrinking city won\'t fill new houses or staff new buildings — pay attention when it goes red.',
    how: 'Citizens move in when your city is <b>happy</b> and there\'s <b>empty housing</b> waiting for them. They start leaving when happiness drops too far. Improve happiness with services (well, tavern, bathhouse, school, temple), stock a variety of food, keep crime down, and don\'t over-tax. Build more housing to give new arrivals somewhere to live.'
  },
  productivity: {
    icon: '⚒',
    title: 'Productivity',
    what: 'A multiplier on every production building\'s output. <b>100%</b> is baseline. Above 100% your buildings produce more; below 100% they produce less. Same building, different output rate.',
    why: 'A city running at 110% productivity is meaningfully more profitable than one at 90%. The multiplier compounds across every extractor, processor, food building, and tax office at the same time.',
    how: 'Multiple levers feed the multiplier. <b>+ </b>: a staffed Tavern (+5%); a stockpile of <b>Tools</b> (+5% / +10%); active houses near a staffed <b>School</b> (up to +10%). <b>− </b>: high crime above 50 (down to −10%); no idle workers (−5% — keep a small buffer above what your buildings need).'
  }
};

function openStatInfo(key) {
  var info = STAT_INFO[key];
  if (!info || openOverlay) return;
  openOverlay = document.createElement('div');
  openOverlay.className = 'help-overlay';
  var actionHtml = '';
  if (key === 'parcels') {
    var owned = (state.profile && state.profile.chunks_owned) || 1;
    var nextCost = 10000 * owned * owned;
    var canAfford = (state.profile && state.profile.money || 0) >= nextCost;
    actionHtml =
      '<div class="stat-info-actions">' +
        '<button class="btn-primary" id="stat-expand-btn"' + (canAfford ? '' : ' disabled') + '>' +
          'Expand district — $' + nextCost.toLocaleString() +
        '</button>' +
        (canAfford ? '' : '<div class="stat-info-hint">You need $' + nextCost.toLocaleString() + ' for the next parcel.</div>') +
      '</div>';
  }
  openOverlay.innerHTML =
    '<div class="stat-info-modal" role="dialog" aria-modal="true">' +
      '<div class="help-header">' +
        '<span class="help-title">' + info.icon + ' ' + escapeHtml(info.title) + '</span>' +
        '<button class="help-close" id="help-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="help-body">' +
        '<div class="stat-info-section"><div class="stat-info-label">What it measures</div><div class="stat-info-text">' + info.what + '</div></div>' +
        '<div class="stat-info-section"><div class="stat-info-label">Why it matters</div><div class="stat-info-text">' + info.why + '</div></div>' +
        '<div class="stat-info-section"><div class="stat-info-label">How to improve it</div><div class="stat-info-text">' + info.how + '</div></div>' +
        actionHtml +
      '</div>' +
    '</div>';
  document.body.appendChild(openOverlay);
  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  openOverlay.addEventListener('click', function (e) {
    if (e.target === openOverlay) closeHelpModal();
  });
  if (key === 'parcels') {
    var btn = document.getElementById('stat-expand-btn');
    if (btn) btn.addEventListener('click', function () {
      closeHelpModal();
      expandDistrict();
    });
  }
  document.addEventListener('keydown', escapeListener);
}


// ── Settings modal ──
//
// Opened from the ⚙ topbar button. Holds destructive / session actions
// (Reset district, Log out) so they're not constantly visible.

function openSettingsModal() {
  if (openOverlay) return;
  openOverlay = document.createElement('div');
  openOverlay.className = 'help-overlay';
  var districtName = (state.profile && state.profile.district_name) || '—';
  var cityName = state.cityName || '—';
  openOverlay.innerHTML =
    '<div class="stat-info-modal" role="dialog" aria-modal="true">' +
      '<div class="help-header">' +
        '<span class="help-title">⚙ Settings</span>' +
        '<button class="help-close" id="help-close" aria-label="Close">×</button>' +
      '</div>' +
      '<div class="help-body">' +
        '<div class="settings-row">' +
          '<div class="settings-row-text">' +
            '<div class="settings-row-title">District name</div>' +
            '<div class="settings-row-sub">Currently: ' + escapeHtml(districtName) + '</div>' +
          '</div>' +
          '<button class="btn-secondary" id="settings-rename-district-btn">Rename</button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-text">' +
            '<div class="settings-row-title">City name</div>' +
            '<div class="settings-row-sub">Shared with every player. Currently: ' + escapeHtml(cityName) + '</div>' +
          '</div>' +
          '<button class="btn-secondary" id="settings-rename-city-btn">Rename</button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-text">' +
            '<div class="settings-row-title">Reset district</div>' +
            '<div class="settings-row-sub">Wipe every parcel, building, and resource and start over from industry selection. Cannot be undone.</div>' +
          '</div>' +
          '<button class="btn-danger" id="settings-reset-btn">Reset</button>' +
        '</div>' +
        '<div class="settings-row">' +
          '<div class="settings-row-text">' +
            '<div class="settings-row-title">Log out</div>' +
            '<div class="settings-row-sub">Sign out of this browser. Your district stays saved.</div>' +
          '</div>' +
          '<button class="btn-secondary" id="settings-logout-btn">Log out</button>' +
        '</div>' +
      '</div>' +
    '</div>';
  document.body.appendChild(openOverlay);
  document.getElementById('help-close').addEventListener('click', closeHelpModal);
  openOverlay.addEventListener('click', function (e) {
    if (e.target === openOverlay) closeHelpModal();
  });
  document.getElementById('settings-rename-district-btn').addEventListener('click', function () {
    var current = (state.profile && state.profile.district_name) || '';
    var name = prompt('Rename your district', current);
    if (name == null) return;
    name = name.trim();
    if (name.length < 2 || name.length > 40) {
      addNotification('error', 'District name must be 2–40 characters.');
      return;
    }
    sb.rpc('rename_district', { p_name: name }).then(function (r) {
      if (r.error) { addNotification('error', 'Rename failed: ' + r.error.message); return; }
      state.profile.district_name = r.data;
      updateIdentity();
      addNotification('success', 'District renamed to ' + r.data + '.');
    });
    closeHelpModal();
  });
  document.getElementById('settings-rename-city-btn').addEventListener('click', function () {
    var current = state.cityName || '';
    var name = prompt('Rename the city (shared with every player)', current);
    if (name == null) return;
    name = name.trim();
    if (name.length < 2 || name.length > 40) {
      addNotification('error', 'City name must be 2–40 characters.');
      return;
    }
    sb.rpc('rename_city', { p_name: name }).then(function (r) {
      if (r.error) { addNotification('error', 'Rename failed: ' + r.error.message); return; }
      state.cityName = r.data;
      updateIdentity();
      addNotification('success', 'City renamed to ' + r.data + '.');
    });
    closeHelpModal();
  });
  document.getElementById('settings-reset-btn').addEventListener('click', function () {
    closeHelpModal();
    doReset();
  });
  document.getElementById('settings-logout-btn').addEventListener('click', function () {
    closeHelpModal();
    doLogout();
  });
  document.addEventListener('keydown', escapeListener);
}

export function initHelp() {
  var btn = document.getElementById('g-help');
  if (btn) btn.addEventListener('click', openHelpModal);

  // Wire each stat indicator to its info popup. Workers/chunks attach
  // to the inner value span; happiness/crime have their own outer
  // .stat IDs already.
  var wireStat = function (elId, infoKey) {
    var el = document.getElementById(elId);
    if (!el) return;
    el.style.cursor = 'pointer';
    el.addEventListener('click', function () { openStatInfo(infoKey); });
  };
  wireStat('g-workers-stat', 'workers');
  wireStat('g-population-stat', 'population');
  wireStat('g-parcels-stat', 'parcels');
  wireStat('g-happiness-stat', 'happiness');
  wireStat('g-crime-stat', 'crime');
  wireStat('g-migration-stat', 'migration');
  wireStat('g-productivity-stat', 'productivity');

  var settingsBtn = document.getElementById('g-settings');
  if (settingsBtn) settingsBtn.addEventListener('click', openSettingsModal);
}
