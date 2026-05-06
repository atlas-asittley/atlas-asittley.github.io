// ── Buildings reference modal ──
//
// Standalone help dialog accessible from a "?" button in the topbar.
// Lists every building in the game grouped by industry / role, with
// click-to-expand showing each building's inputs, output, worker cost,
// build cost, and unlock prereq. Read-only — does not depend on or
// affect the player's current selection / placement state.

import { state } from './state.js';
import { colors, spriteIcons } from './sprites.js';

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
  var inputs = [];
  if (bt.input_resource_key && bt.input_rate > 0) {
    inputs.push(bt.input_rate + ' ' + resName(bt.input_resource_key).toLowerCase());
  }
  if (bt.input_resource_key_2 && (bt.input_rate_2 || bt.input_rate) > 0) {
    inputs.push((bt.input_rate_2 || bt.input_rate) + ' ' + resName(bt.input_resource_key_2).toLowerCase());
  }
  var outputLine = '';
  if (bt.output_resource_key && bt.output_rate > 0) {
    outputLine = bt.output_rate + ' ' + resName(bt.output_resource_key).toLowerCase() + '/min';
  } else if (bt.category === 'tax' && bt.output_rate > 0) {
    outputLine = '$' + bt.output_rate + '/min';
  }

  var rows = '';
  if (inputs.length) {
    rows += '<div class="help-row"><span class="help-label">Inputs</span><span class="help-value">' + escapeHtml(inputs.join(' + ')) + '/min</span></div>';
  }
  if (outputLine) {
    rows += '<div class="help-row"><span class="help-label">Output</span><span class="help-value">' + escapeHtml(outputLine) + '</span></div>';
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
    rows = '<div class="help-row"><span class="help-label">Tiers</span><span class="help-value">Shanty → Hut → Cottage → Townhouse → Villa → Manor → Mansion → Estate → Palace</span></div>' +
           '<div class="help-row"><span class="help-label">Workers</span><span class="help-value">2 to 100, evolves with conditions</span></div>' +
           '<div class="help-row"><span class="help-label">Prereqs</span><span class="help-value">T1 well, T2 food, T3 road, T4 school, T5 temple, T6+ luxury foods, T8 industrial luxuries</span></div>' +
           '<div class="help-row"><span class="help-label">Build cost</span><span class="help-value">$' + (bt.build_cost || 0) + '</span></div>';
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

export function initHelp() {
  var btn = document.getElementById('g-help');
  if (btn) btn.addEventListener('click', openHelpModal);
}
