// ── Integer-ratio recipe formatting ──
//
// Atlas rule (2026-05-08): "I don't want the user to think in
// decimals. 1 of X makes 0.5 of Y should display as 2 X make 1 Y."
//
// These helpers scale a building's input/output rates so every quantity
// is an integer, and surface the cycle period explicitly. A sawmill
// (1 timber/min → 0.5 lumber/min) prints as "2 timber → 1 lumber
// (per 2 min)" instead of "1 timber → 0.5 lumber/min."
//
// Used by help.js (Buildings reference card) and inspector_building.js
// (per-building inspector). Pure math, no state dependencies.

import { state } from './state.js';

// Find the smallest integer k (1..60) such that every supplied rate ×
// k rounds to an integer. The cap of 60 keeps the cycle period
// reasonable even for rates with awkward fractional parts; if the
// caller hits the cap they can fall back to decimal display.
export function findRateScale(rates) {
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

// Recipe-ize a building's rates. Returns
//   { input_q, input_q_2, output_q, period_min }
// where the qty fields are integers and period_min is the cycle.
export function recipeOf(bt) {
  var rates = [bt.input_rate || 0, bt.input_rate_2 || 0, bt.output_rate || 0];
  var k = findRateScale(rates.map(Number));
  return {
    input_q:    Math.round((bt.input_rate   || 0) * k),
    input_q_2:  Math.round((bt.input_rate_2 || 0) * k),
    output_q:   Math.round((bt.output_rate  || 0) * k),
    period_min: k
  };
}

// Helper: human-readable period suffix. period_min=1 → "/min";
// otherwise → " per N min".
export function periodSuffix(period_min) {
  return period_min === 1 ? '/min' : ' per ' + period_min + ' min';
}

// Format a quantity + period as a single string. e.g. "2 timber/min"
// or "3 clay per 2 min".
export function fmtQtyPer(qty, resourceName, period_min) {
  return qty + ' ' + resourceName + periodSuffix(period_min);
}

// Resource display name lookup, falling back to the resource key.
export function resourceName(key) {
  if (!key) return '';
  if (state.resources && state.resources[key]) return state.resources[key].name;
  return key.charAt(0).toUpperCase() + key.slice(1);
}
