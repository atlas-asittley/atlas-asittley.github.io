// ── Inspector module (barrel) ──
// The inspector panel had grown to 1000+ lines covering three distinct
// modes (building / resource tile / walker) plus a heap of housing
// upgrade-blocker logic and a demolition flow. It's now split:
//
//   inspector_core.js     — state machine, panel lifecycle, mode dispatch
//   inspector_helpers.js  — pure helpers shared across modes (lookups,
//                           housing tier-requirement gates, issue compute)
//   inspector_building.js — building-mode renderer + action handlers
//   inspector_tile.js     — resource-tile renderer + clear-tile flow
//   inspector_walker.js   — walker-mode renderer
//
// This file re-exports the public API so existing callers
// (map.js, game.js) keep working without import-path changes.

export {
  openInspector,
  openResourceInspector,
  openWalkerInspector,
  closeInspector,
  initInspector
} from './inspector_core.js';
