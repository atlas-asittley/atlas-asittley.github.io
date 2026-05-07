// ── Inspector Core (state machine + DOM lifecycle) ──
// Owns the "what's currently inspected" state — at most one of
// {building, tile, walker} is active at a time. Each open* function
// clears the other modes' state before setting its own. Mode renderers
// read the active target via the getters and write into the inspector
// DOM (#inspector-title / #inspector-body / #inspector-actions).
//
// Public API (re-exported by inspector.js for back-compat):
//   openInspector(building)        — building inspector
//   openResourceInspector(tile)    — resource-tile inspector
//   openWalkerInspector(info)      — walker inspector
//   closeInspector()               — hide panel + clear all state
//   initInspector()                — wire DOM listeners; call once on boot
//
// Mode-internal getters (used by mode modules to read state):
//   getInspectedBuilding()
//   getInspectedTile()

import { state, inspectedBuildingHolder } from './state.js';
import { renderMap } from './map.js';
import { setWalkerClickHandler } from './walkers.js';
import { renderBuildingInspector } from './inspector_building.js';
import { renderResourceInspector } from './inspector_tile.js';
import { renderWalkerInspector } from './inspector_walker.js';

var inspectedBuilding = null;
var inspectedTile = null;

export function getInspectedBuilding() { return inspectedBuilding; }
export function getInspectedTile() { return inspectedTile; }

export function openInspector(building) {
  if (!building) return;
  inspectedTile = null;
  inspectedBuilding = building;
  inspectedBuildingHolder.value = building;
  renderBuildingInspector();
  document.getElementById('inspector-overlay').classList.add('active');
  // Add scroll-room below the map so a building at the bottom can be
  // pushed up into view above the inspector. CSS handles the padding
  // via this class.
  document.body.classList.add('inspector-open');
  renderMap();  // re-render so map can highlight the inspected extractor's target
  ensureInspectionVisible(building);
}

export function openResourceInspector(tile) {
  if (!tile || !tile.resource_node_key) return;
  // Mutually exclusive modes — clear building state on tile open.
  inspectedBuilding = null;
  inspectedBuildingHolder.value = null;
  inspectedTile = tile;
  renderResourceInspector();
  document.getElementById('inspector-overlay').classList.add('active');
  document.body.classList.add('inspector-open');
  renderMap();
}

export function openWalkerInspector(walkerInfo) {
  // Walker inspector clears both other modes; it's a transient flavor
  // panel and the same DOM is reused.
  inspectedBuilding = null;
  inspectedTile = null;
  inspectedBuildingHolder.value = null;
  renderWalkerInspector(walkerInfo);
  document.getElementById('inspector-overlay').classList.add('active');
}

export function closeInspector() {
  inspectedBuilding = null;
  inspectedTile = null;
  inspectedBuildingHolder.value = null;
  document.getElementById('inspector-overlay').classList.remove('active');
  document.body.classList.remove('inspector-open');
  renderMap();  // re-render to clear the target highlight
}

// Scroll the map so BOTH the inspected building AND, if present, its
// target resource tile are visible in the space above the inspector
// panel. If they can't both fit, prioritize the building itself (the
// thing the player just tapped). No-op when neither is on the map.
function ensureInspectionVisible(building) {
  // Wait for the inspector's slide-up animation (~200ms) before
  // measuring.
  setTimeout(function () {
    var bldgCell = document.querySelector(
      '.cell[data-x="' + building.x + '"][data-y="' + building.y + '"]'
    );
    var targetCell = (building.target_x !== null && building.target_x !== undefined)
      ? document.querySelector(
          '.cell[data-x="' + building.target_x + '"][data-y="' + building.target_y + '"]'
        )
      : null;
    var viewport = document.getElementById('map-viewport');
    var panel = document.getElementById('inspector-panel');
    if (!bldgCell || !viewport || !panel) return;

    var bRect = bldgCell.getBoundingClientRect();
    var tRect = targetCell ? targetCell.getBoundingClientRect() : null;
    var panelRect = panel.getBoundingClientRect();
    var vpRect = viewport.getBoundingClientRect();

    var visibleTop = vpRect.top;
    var visibleBottom = Math.min(vpRect.bottom, panelRect.top);
    var visibleHeight = visibleBottom - visibleTop;
    if (visibleHeight < 60) return;

    var bboxTop = bRect.top, bboxBottom = bRect.bottom;
    var bboxLeft = bRect.left, bboxRight = bRect.right;
    if (tRect) {
      bboxTop = Math.min(bboxTop, tRect.top);
      bboxBottom = Math.max(bboxBottom, tRect.bottom);
      bboxLeft = Math.min(bboxLeft, tRect.left);
      bboxRight = Math.max(bboxRight, tRect.right);
    }
    var bboxHeight = bboxBottom - bboxTop;

    var anchorCenterY, anchorCenterX;
    if (bboxHeight + 30 <= visibleHeight) {
      anchorCenterY = (bboxTop + bboxBottom) / 2;
      anchorCenterX = (bboxLeft + bboxRight) / 2;
    } else {
      anchorCenterY = bRect.top + bRect.height / 2;
      anchorCenterX = bRect.left + bRect.width / 2;
    }

    var visibleCenterY = visibleTop + visibleHeight / 2;
    var visibleCenterX = vpRect.left + vpRect.width / 2;
    var deltaY = anchorCenterY - visibleCenterY;
    var deltaX = anchorCenterX - visibleCenterX;

    if (Math.abs(deltaY) < 8 && Math.abs(deltaX) < 8) return;
    viewport.scrollBy({ top: deltaY, left: deltaX, behavior: 'smooth' });
  }, 220);
}

export function initInspector() {
  document.getElementById('inspector-close').addEventListener('click', closeInspector);
  document.getElementById('inspector-overlay').addEventListener('click', function (e) {
    if (e.target === this) closeInspector();
  });
  document.getElementById('inspector-mini').addEventListener('click', function () {
    var panel = document.getElementById('inspector-panel');
    panel.classList.toggle('minimized');
    // Re-run the visibility scroll after the height transition settles,
    // so the previously-covered cells are pulled into the freshly
    // enlarged visible strip.
    if (inspectedBuilding) {
      setTimeout(function () { ensureInspectionVisible(inspectedBuilding); }, 220);
    }
  });
  // Wire walker click → walker inspector.
  setWalkerClickHandler(function (walkerInfo) {
    openWalkerInspector(walkerInfo);
  });
}
