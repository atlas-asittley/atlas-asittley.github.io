// ── Map rendering, placement logic, drag-to-paint roads, and map expansion ──
import { sb } from './config.js';
import { fetchAllPaged } from './paginate.js';
import { state, CITY_CENTER_X, CITY_CENTER_Y, getHomeX, getHomeY, isMyTile, isWildernessTile, inspectedBuildingHolder, computeLaborAllocation, computeGridBounds } from './state.js';
import { showToast, updateMoney, updateWorkers, updateTutorialBanner, updateCityRunway } from './ui.js';
import { renderBuildPanel } from './panels.js';
import { rebuildRoadSet, renderWalkers, snapWalkersToZoom, syncCollectorWalkers } from './walkers.js';
import { openInspector, openResourceInspector } from './inspector.js';
import { getRoadTileSVG, rebuildPlacementRoadSet, isRoadPlacementConnected, roadNeighborFlags } from './map_roads.js';
import { spriteIcons } from './sprites.js';

export var BLDG_LABELS = {
  timber_camp: 'TC', sawmill: 'SM',
  stone_quarry: 'SQ', mason_workshop: 'MW',
  grain_farm: 'GF', mill: 'ML',
  clay_pit: 'CP', pottery_kiln: 'PK',
  bakery: 'BK', woodcarver: 'WC', sculptor: 'SC',
  house: 'H', road: 'R',
  well: 'W', tax_man: 'TX',
  tavern: 'TV', bathhouse: 'BH', school: 'SCH', temple: 'TMP',
  orchard: 'OR', fishing_pier: 'FP', garden: 'GD',
  iron_mine: 'IM', smelter: 'SL', toolmaker: 'TK', tile_maker: 'TI',
  winery: 'WN', smokehouse: 'SH', cannery: 'CN',
  foresters_office: 'FO', foreman_office: 'FrO', clay_master_hut: 'CMH', mine_office: 'MO',
  apiary: 'AP', hatchery: 'HT', compost_heap: 'CH', irrigation_channel: 'IC',
  distillery: 'DT', curing_house: 'CHo', spicery: 'SP', brewery: 'BR',
  charcoal_kiln: 'CK', lime_kiln: 'LK', glassworks: 'GW', nail_forge: 'NF',
  cabinetmaker: 'CB', architect: 'AR', mosaic_workshop: 'MW', engineer_workshop: 'EW',
  watch_house: 'WH', police_station: 'PS', constabulary: 'CON',
  park: 'PK', tree_grove: 'TG'
};

// Housing tier label overrides (keyed by tier number)
var HOUSING_TIER_LABELS = { 0: 'S', 1: 'H', 2: 'C', 3: 'T', 4: 'V', 5: 'M', 6: 'Mn', 7: 'E', 8: 'P' };
var CELL_BASE_SIZE = 520 / 15;  // px per cell at 1x zoom (original 520px / 15 cols)

// Deterministic hash for per-tile visual variation (grass details, noise seeds)
function tileHash(x, y) {
  return ((x * 2654435761 + y * 2246822519) >>> 0);
}
// MAP_MIN_ZOOM is a *cap* on the static minimum — used for small maps
// that fit easily. As the district grows, the dynamic minimum (see
// computeMinZoom) can drop below this so the whole map fits on screen.
// MAP_MIN_ZOOM_FLOOR is the absolute lower bound — tiles past this start
// to get unreadably small.
var MAP_MIN_ZOOM = 0.5;
var MAP_MIN_ZOOM_FLOOR = 0.05;
var MAP_MAX_ZOOM = 3;
var MAP_ZOOM_STEP = 0.25;
var EXPAND_THRESHOLD = 2;  // tiles from edge to trigger expansion
var EXPAND_AMOUNT = 5;     // tiles added per expansion direction

// Drag-to-paint state (roads only)
var dragState = {
  active: false,
  planned: [],      // [{x, y, tileId}, ...]
  plannedSet: {},   // "x,y" -> true
  suppressClick: 0  // timestamp: suppress click events until this time
};

// Drag cost counter element reference
var dragCostEl = null;

// ── Placement validation ──

export function isPlacementValid(btKey, tile) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return false;
  // Multi-tile buildings: the click target is the anchor (top-left).
  // Every tile in the w×h footprint must satisfy the same per-tile rules.
  var fw = bt.footprint_w || 1;
  var fh = bt.footprint_h || 1;
  for (var dx = 0; dx < fw; dx++) {
    for (var dy = 0; dy < fh; dy++) {
      var t = state.tileMap[(tile.x + dx) + ',' + (tile.y + dy)];
      if (!t) return false;
      if (!t.buildable) return false;
      if (t.occupied_building_id) return false;
      if (bt.placement_resource_node_key) {
        // Building requires a specific terrain tile (food extractors).
        if (t.resource_node_key !== bt.placement_resource_node_key) return false;
      } else if (t.resource_node_key) {
        // Building doesn't take a terrain — any resource tile blocks placement.
        return false;
      }
      if (!isMyTile(t)) return false;
    }
  }

  if (bt.category === 'extractor') {
    return true;
  }
  if (bt.category === 'road') {
    return isRoadPlacementConnected(tile, null);
  }
  return true;
}

// ── Zoom ──

// Dynamic minimum zoom: as the district grows the player should still be
// able to fit the whole map in the viewport, so the floor drops with the
// grid size. For small maps it stays at MAP_MIN_ZOOM (existing behavior).
function computeMinZoom() {
  var vp = document.getElementById('map-viewport');
  if (!vp) return MAP_MIN_ZOOM;
  var rect = vp.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return MAP_MIN_ZOOM;
  var fitW = rect.width / (CELL_BASE_SIZE * Math.max(1, state.gridCols));
  var fitH = rect.height / (CELL_BASE_SIZE * Math.max(1, state.gridRows));
  // Use 90% of fit so the player can still zoom out *past* "exactly fits"
  // for a little visual buffer around the edges.
  var fit = Math.min(fitW, fitH) * 0.9;
  return Math.max(MAP_MIN_ZOOM_FLOOR, Math.min(MAP_MIN_ZOOM, fit));
}

var lastAppliedMapWidth = null;
export function applyMapZoom() {
  var grid = document.getElementById('map-grid');
  if (!grid) return;
  var mapWidth = Math.round(CELL_BASE_SIZE * state.gridCols * state.mapZoom);
  grid.style.width = mapWidth + 'px';
  // Only snap walkers when the map width actually changed (zoom or grid
  // bounds shifted). Calling snapWalkersToZoom() on every renderMap was
  // teleporting every walker to its destination tile-center on every
  // click / close / place / build-type select.
  if (mapWidth !== lastAppliedMapWidth) {
    lastAppliedMapWidth = mapWidth;
    snapWalkersToZoom();
  }
  updateZoomButtonStates();
}

// Disable +/- when state.mapZoom is at the corresponding limit so the
// player gets visual feedback that the click did nothing. Min zoom is
// dynamic (computeMinZoom — depends on viewport size and grid size),
// so this updates on every applyMapZoom rather than once at init.
function updateZoomButtonStates() {
  var inBtn = document.getElementById('zoom-in');
  var outBtn = document.getElementById('zoom-out');
  if (inBtn) inBtn.disabled = state.mapZoom >= MAP_MAX_ZOOM;
  if (outBtn) outBtn.disabled = state.mapZoom <= computeMinZoom() + 0.001;
}

function setMapZoom(nextZoom) {
  var clamped = Math.max(computeMinZoom(), Math.min(MAP_MAX_ZOOM, nextZoom));
  state.mapZoom = Math.round(clamped * 100) / 100;
  applyMapZoom();
  scheduleSaveMapView();
}

// ── Map-view persistence ────────────────────────────────
// Saves scroll + zoom per player to localStorage so reopening the game
// returns to the last spot the player was looking at — otherwise they
// land on (0,0) which can be wilderness for an established city or sit
// far from another player's district.
var VIEW_STORAGE_KEY_PREFIX = 'city_map_view_';
var saveDebounce = null;

function viewStorageKey() {
  var uid = state.currentUser && state.currentUser.id;
  return uid ? VIEW_STORAGE_KEY_PREFIX + uid : null;
}

function saveMapView() {
  var key = viewStorageKey();
  if (!key) return;
  var vp = document.getElementById('map-viewport');
  if (!vp) return;
  try {
    localStorage.setItem(key, JSON.stringify({
      scrollLeft: vp.scrollLeft,
      scrollTop: vp.scrollTop,
      mapZoom: state.mapZoom
    }));
  } catch (e) { /* storage full / disabled — silent. */ }
}

function scheduleSaveMapView() {
  if (saveDebounce) clearTimeout(saveDebounce);
  saveDebounce = setTimeout(saveMapView, 400);
}

// Center the viewport on a tile coordinate at the current zoom.
function scrollToTile(tx, ty) {
  var vp = document.getElementById('map-viewport');
  if (!vp) return;
  var cellPx = CELL_BASE_SIZE * state.mapZoom;
  var pxX = (tx - state.gridMinX + 0.5) * cellPx;
  var pxY = (ty - state.gridMinY + 0.5) * cellPx;
  vp.scrollLeft = Math.max(0, pxX - vp.clientWidth / 2);
  vp.scrollTop  = Math.max(0, pxY - vp.clientHeight / 2);
}

// Restore the saved view (scroll + zoom). Falls back to centering on
// the player's home tile if there's nothing saved yet.
export function restoreMapView() {
  var vp = document.getElementById('map-viewport');
  if (!vp) return;
  var key = viewStorageKey();
  var saved = null;
  if (key) {
    try {
      var raw = localStorage.getItem(key);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }
  }
  if (saved && typeof saved.scrollLeft === 'number' && typeof saved.scrollTop === 'number') {
    if (typeof saved.mapZoom === 'number' && saved.mapZoom > 0) {
      // setMapZoom clamps to the current dynamic minimum, so a saved
      // zoom from a smaller district adapts gracefully.
      setMapZoom(saved.mapZoom);
    }
    // Clamp to the actual scrollable range. If grid bounds have shrunk
    // since the save (district reset, building demolished off the
    // border), saved.scrollLeft can exceed scrollWidth-clientWidth and
    // the browser silently clamps — but doing it explicitly here
    // documents the intent and keeps behavior predictable.
    var maxX = Math.max(0, vp.scrollWidth - vp.clientWidth);
    var maxY = Math.max(0, vp.scrollHeight - vp.clientHeight);
    vp.scrollLeft = Math.max(0, Math.min(saved.scrollLeft, maxX));
    vp.scrollTop  = Math.max(0, Math.min(saved.scrollTop,  maxY));
  } else {
    scrollToTile(getHomeX(), getHomeY());
  }
}

function setMapZoomAtPoint(nextZoom, clientX, clientY) {
  var viewport = document.getElementById('map-viewport');
  var grid = document.getElementById('map-grid');
  if (!viewport || !grid) {
    setMapZoom(nextZoom);
    return;
  }

  var oldZoom = state.mapZoom;
  var clamped = Math.max(computeMinZoom(), Math.min(MAP_MAX_ZOOM, nextZoom));
  var newZoom = Math.round(clamped * 100) / 100;
  if (newZoom === oldZoom) return;

  var rect = viewport.getBoundingClientRect();
  // Grid's left/top edge in viewport content coordinates. The grid sits
  // inside `.map-canvas` which has a 20/28px margin (also responsive on
  // small screens) — that offset doesn't scale with zoom, so it has to
  // be subtracted before computing the unzoomed pixel offset INTO the
  // grid, and added back after. Without this the visible center drifts
  // ~`margin × (1 - newZoom/oldZoom)` per zoom click.
  var gridRect = grid.getBoundingClientRect();
  var gridContentX = (gridRect.left - rect.left) + viewport.scrollLeft;
  var gridContentY = (gridRect.top - rect.top) + viewport.scrollTop;
  var clickContentX = (clientX - rect.left) + viewport.scrollLeft;
  var clickContentY = (clientY - rect.top) + viewport.scrollTop;
  var worldX = (clickContentX - gridContentX) / oldZoom;
  var worldY = (clickContentY - gridContentY) / oldZoom;

  state.mapZoom = newZoom;
  applyMapZoom();

  // The grid's content-X anchor (.map-canvas margin) is zoom-invariant
  // for the current inline-block layout, so reuse gridContentX. The
  // new content-X of the same world point is gridContentX + worldX*newZoom.
  var newClickContentX = gridContentX + worldX * newZoom;
  var newClickContentY = gridContentY + worldY * newZoom;
  viewport.scrollLeft = Math.max(0, newClickContentX - (clientX - rect.left));
  viewport.scrollTop = Math.max(0, newClickContentY - (clientY - rect.top));
  scheduleSaveMapView();
}

// ── Map rendering ──

// renderMap is called from 15+ places. Multiple state changes within
// the same animation frame (e.g. inspector close → renderMap, then
// state.selectedBuildType update → renderMap) used to trigger two
// full innerHTML rebuilds of the grid. Coalesce them via rAF so we
// only do the actual rebuild once per frame.
var _renderMapPending = false;
export function renderMap(immediate) {
  // Initial render in enterGame passes immediate=true so restoreMapView
  // (which reads the rendered grid) sees a populated DOM. All other
  // call sites just want "render whenever's convenient" — debounce via
  // rAF so multiple state changes in the same frame coalesce.
  if (immediate) { _doRenderMap(); return; }
  if (_renderMapPending) return;
  _renderMapPending = true;
  requestAnimationFrame(function () {
    _renderMapPending = false;
    _doRenderMap();
  });
}

// Area-of-effect range + kind for a building that has gameplay coverage.
// Used to highlight the affected cells when the inspector opens. Returns
// null for buildings without an AoE (housing, extractors, roads, etc.).
//
// Ranges match the server-side gate checks in `_pp_evolve_housing` for
// services and the building_types columns for police / park / booster.
function getBuildingAoeRange(b, bt) {
  if (!bt) return null;
  if (bt.category === 'police' && bt.coverage_radius > 0) {
    return { range: bt.coverage_radius, kind: 'police' };
  }
  if (bt.category === 'park' && bt.pollution_radius > 0) {
    return { range: bt.pollution_radius, kind: 'park' };
  }
  if (bt.category === 'booster' && bt.boost_range > 0) {
    return { range: bt.boost_range, kind: 'booster' };
  }
  if (bt.category === 'service') {
    if (bt.key === 'well')      return { range: 4, kind: 'well' };
    if (bt.key === 'school')    return { range: 5, kind: 'school' };
    if (bt.key === 'temple')    return { range: 6, kind: 'temple' };
    if (bt.key === 'bathhouse') return { range: 4, kind: 'bathhouse' };
  }
  return null;
}

function _doRenderMap() {
  var grid = document.getElementById('map-grid');
  rebuildPlacementRoadSet();
  // buildingAt: anchor (top-left) tile of each building. For multi-tile
  // buildings only the anchor renders the .bldg sprite; interior tiles
  // are detected via tile.occupied_building_id and render no sprite.
  var buildingAt = {};
  state.allBuildings.forEach(function (b) { buildingAt[b.x + ',' + b.y] = b; });
  // buildingById: lookup so an interior tile can still find its parent building.
  var buildingById = {};
  state.allBuildings.forEach(function (b) { buildingById[b.id] = b; });

  // Police coverage for the crime-risk heatmap: precompute the set of
  // (x,y) keys covered by any of THIS player's staffed police buildings.
  // Only computed in crime mode — cheap (a few police × small radius²).
  var policeCovered = {};
  if (state.heatmapMode === 'crime' && state.currentUser) {
    state.allBuildings.forEach(function (b) {
      if (b.player_id !== state.currentUser.id) return;
      if (b.status !== 'active' || !b.is_staffed) return;
      var bt = state.buildingTypes[b.building_type_key];
      if (!bt || bt.category !== 'police') return;
      var r = bt.coverage_radius || 0;
      for (var dx = -r; dx <= r; dx++) {
        for (var dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) + Math.abs(dy) <= r) {
            policeCovered[(b.x + dx) + ',' + (b.y + dy)] = true;
          }
        }
      }
    });
  }

  // Well coverage for the housing-placement preview: precompute the set
  // of (x,y) keys within Manhattan-distance 4 of any of THIS player's
  // active wells. Only computed when the player has selected housing
  // from the build panel — surfaces "good house spots" before they
  // place. Same idea as the crime heatmap above, smaller radius.
  var wellCovered = {};
  if (state.selectedBuildType && state.currentUser) {
    var sbt0 = state.buildingTypes[state.selectedBuildType];
    if (sbt0 && (sbt0.category === 'housing' || state.selectedBuildType === 'well')) {
      var WELL_RADIUS = 4;
      state.allBuildings.forEach(function (b) {
        if (b.player_id !== state.currentUser.id) return;
        if (b.status !== 'active' || b.building_type_key !== 'well') return;
        for (var dx = -WELL_RADIUS; dx <= WELL_RADIUS; dx++) {
          for (var dy = -WELL_RADIUS; dy <= WELL_RADIUS; dy++) {
            if (Math.abs(dx) + Math.abs(dy) <= WELL_RADIUS) {
              wellCovered[(b.x + dx) + ',' + (b.y + dy)] = true;
            }
          }
        }
      });
    }
  }

  // Inspected building's area-of-effect highlight. When the player taps
  // a service / police / booster / park, paint every cell within its
  // gameplay range so the AoE is visible at a glance — same idea as
  // the pollution heatmap but scoped to the one building.
  var inspectedAoeCovered = {};
  var inspectedAoeKind = null;
  var ibAoe = inspectedBuildingHolder.value;
  if (ibAoe) {
    var ibtAoe = state.buildingTypes[ibAoe.building_type_key];
    var aoe = getBuildingAoeRange(ibAoe, ibtAoe);
    if (aoe) {
      inspectedAoeKind = aoe.kind;
      var rAoe = aoe.range;
      for (var aDx = -rAoe; aDx <= rAoe; aDx++) {
        for (var aDy = -rAoe; aDy <= rAoe; aDy++) {
          if (Math.abs(aDx) + Math.abs(aDy) <= rAoe) {
            inspectedAoeCovered[(ibAoe.x + aDx) + ',' + (ibAoe.y + aDy)] = true;
          }
        }
      }
    }
  }

  // Dynamic grid columns based on current bounds
  grid.style.gridTemplateColumns = 'repeat(' + state.gridCols + ', 1fr)';

  var html = '';
  for (var y = state.gridMinY; y <= state.gridMaxY; y++) {
    for (var x = state.gridMinX; x <= state.gridMaxX; x++) {
      var tile = state.tileMap[x + ',' + y];
      var building = buildingAt[x + ',' + y];
      var classes = ['cell'];

      if (!tile) {
        var emptyClasses = ['cell', 'empty-cell'];
        if (isInExpansionCandidate(x, y)) emptyClasses.push('expansion-candidate');
        html += '<div class="' + emptyClasses.join(' ') + '" data-x="' + x + '" data-y="' + y + '"></div>';
        continue;
      }

      // M1: District-ownership shading for the cell
      if (isMyTile(tile)) {
        classes.push('owned-mine');
      } else if (isWildernessTile(tile)) {
        classes.push('wilderness');
      } else {
        classes.push('owned-other');
      }

      // Highlight the inspected building's anchor cell + its claimed
      // resource tile. The pair gets the same gold ring so they read
      // as linked. We tag the cell rather than .bldg because .cell
      // has `contain: paint` set — any box-shadow on a child element
      // (.bldg) gets clipped to the cell boundary and never renders
      // outward, but a box-shadow on the .cell itself paints fine.
      var ib = inspectedBuildingHolder.value;
      if (ib && ib.target_x === x && ib.target_y === y) {
        classes.push('inspected-target');
      }
      // Single-tile buildings: highlight the .cell (because .cell has
      // `contain: paint` which would clip a .bldg child shadow). Multi-
      // tile buildings: skip the cell highlight on the anchor — the
      // .bldg.inspected-bldg outset shadow works fine on multi-tile
      // anchor cells (which have `contain: none`) and naturally wraps
      // the entire footprint in one clean rectangle.
      if (ib && ib.x === x && ib.y === y) {
        var ibt = state.buildingTypes[ib.building_type_key];
        var fw = (ibt && ibt.footprint_w) || 1;
        var fh = (ibt && ibt.footprint_h) || 1;
        if (fw === 1 && fh === 1) {
          classes.push('inspected-source');
        }
      }

      // Area-of-effect tint for the inspected building. Cells inside
      // the AoE get a per-kind colored overlay so the player can see
      // exactly what gameplay area the building affects.
      if (inspectedAoeKind && inspectedAoeCovered[x + ',' + y]) {
        classes.push('aoe-highlight');
        classes.push('aoe-' + inspectedAoeKind);
      }

      // While placing an extractor, soft-pulse all unclaimed matching resource
      // tiles in the player's district as "potential targets". The exact
      // tile picked is determined by the server's BFS at placement time.
      if (state.selectedBuildType && state.profile) {
        var sbt = state.buildingTypes[state.selectedBuildType];
        if (sbt && sbt.category === 'extractor'
            && tile.resource_node_key === sbt.output_resource_key
            && !tile.claimed_by_building_id
            && !tile.occupied_building_id
            && isMyTile(tile)) {
          classes.push('potential-target');
        }
      }

      // A tile can be the interior of a multi-tile building — same
      // visual treatment as an occupied tile, but no .bldg renders here
      // (the anchor's .bldg covers it via absolute positioning).
      var interiorBuilding = (!building && tile.occupied_building_id)
        ? buildingById[tile.occupied_building_id] : null;

      if (tile.resource_node_key) {
        classes.push('res-' + tile.resource_node_key);
      } else {
        // Grass detail variations for plain ground tiles. Variety comes
        // exclusively from the gv decorations — small localized sprites
        // (flowers, dirt patches, etc.) that don't create tile-boundary
        // seams. Per-tile noise/color variants were removed because they
        // made the grid read as patchwork (adjacent tiles never matched
        // at their shared edge). Coverage is ~85% — most tiles show
        // something, ~15% are pure grass for visual rest.
        if (!building && !interiorBuilding) {
          var h = tileHash(x, y);
          var showDeco = ((h >>> 8) & 7) !== 0;  // 7/8 of tiles
          if (showDeco) {
            var dv = (h >>> 2) & 15;             // 0..15
            classes.push('gv' + dv);
          }
        }
      }

      // Add per-building cell classes for layering/render behavior
      var buildingBt = building ? state.buildingTypes[building.building_type_key] : null;
      if (building && buildingBt && buildingBt.category === 'road') {
        classes.push('road-tile');
      }
      if (building && buildingBt && buildingBt.category === 'housing') {
        classes.push('has-house');
        if (policeCovered[x + ',' + y]) classes.push('police-covered');
      }
      // Multi-tile anchor: lift the cell's z-index so the .bldg's
      // overflow into adjacent cells paints ABOVE those cells'
      // backgrounds. Without this, sibling cells (later in document
      // order) cover the overflow.
      if (building && buildingBt
          && ((buildingBt.footprint_w || 1) > 1 || (buildingBt.footprint_h || 1) > 1)) {
        classes.push('multi-tile-anchor');
      }

      if (state.selectedBuildType && !building && isPlacementValid(state.selectedBuildType, tile)) {
        classes.push('valid-placement');
      }

      // Well-coverage preview: when placing housing or another well,
      // tiles within 4 manhattan of an active well get a subtle
      // green tint so the player can see "good house spots" before
      // committing. Tier-1 huts technically only need ANY well in
      // district per the post-2026-05-07 balance change, but tier 2+
      // still need positional coverage — surfacing this radius
      // remains useful for growth planning.
      if (wellCovered[x + ',' + y]) {
        classes.push('well-covered');
      }

      // Interior tiles of a multi-tile building inherit the anchor's
      // class for click handling — clicking them opens the inspector
      // for the parent building.
      var dataAnchor = '';
      if (interiorBuilding) {
        classes.push('multi-tile-interior');
        dataAnchor = ' data-anchor-x="' + interiorBuilding.x + '" data-anchor-y="' + interiorBuilding.y + '"';
      }
      // Inline metric custom properties so heatmap CSS can scale tints
      // per tile. Skip emitting on default values to keep the HTML lean.
      var styleParts = [];
      if (tile.pollution && tile.pollution > 0) {
        classes.push('pollution-tinted');
        styleParts.push('--pollution:' + tile.pollution);
      }
      if (tile.desirability !== undefined && tile.desirability !== null) {
        styleParts.push('--desirability:' + tile.desirability);
      }
      var inlineStyle = styleParts.length ? ' style="' + styleParts.join(';') + '"' : '';
      html += '<div class="' + classes.join(' ') + '" data-x="' + x + '" data-y="' + y + '" data-tile-id="' + tile.id + '"' + dataAnchor + inlineStyle + '>';

      if (building) {
        var mine = building.player_id === state.currentUser.id;
        var btk = building.building_type_key;

        // Roads render as clipped surface — shape computed from neighbor connections
        if (buildingBt && buildingBt.category === 'road') {
          var rf = roadNeighborFlags(x, y, buildingAt);
          var roadClasses = 'road-surface' + (mine ? ' mine' : '');
          html += '<div class="' + roadClasses + '">' + getRoadTileSVG(rf.n, rf.s, rf.e, rf.w) + '</div>';
        } else {
          var label = BLDG_LABELS[btk] || '?';
          var titleText = (buildingBt ? buildingBt.name : btk);

          // Housing tier display
          var housingTierClass = '';
          if (buildingBt && buildingBt.category === 'housing') {
            var hTier = building.housing_tier !== undefined ? building.housing_tier : 1;
            var tierCfg = state.housingTierConfig[hTier];
            if (tierCfg) {
              label = tierCfg.label || HOUSING_TIER_LABELS[hTier] || label;
              titleText = tierCfg.name + ' (Tier ' + hTier + ')';
            } else {
              label = HOUSING_TIER_LABELS[hTier] || label;
            }
            housingTierClass = ' house-t' + hTier;
          }

          if (!mine && building.player_profiles) {
            titleText += ' (' + building.player_profiles.display_name + ')';
          }
          var isPaused = building.status === 'paused';
          var isUnstaffed = mine && !isPaused && state.laborInfo.unstaffedIds[building.id];
          var isDisconnected = mine && !isPaused && state.noRoadAccessIds[building.id];
          // Buildings only animate when they're actually doing their job:
          // staffed, road-connected, not paused, AND (for input-consuming
          // buildings like processors / services) every required input is
          // in stock. Roads and housing don't carry the producing class —
          // both have other indicators (road glow / housing tier).
          // hasInputs: the building has fuel to run this tick. Snapshot
          // inventory alone is misleading — a balanced chain (e.g. 3
          // clay_pits feeding 3 pottery_kilns) consumes inputs as fast
          // as they're produced, so the snapshot is ~0 every tick even
          // though production is healthy. So count an input as
          // satisfied if EITHER the player has stock OR they're
          // actively producing it (any staffed building outputs it).
          var hasInputs = true;
          if (mine && (buildingBt.input_resource_key || buildingBt.input_resource_key_2)) {
            function inputOK(rk) {
              if (!rk) return true;
              if ((state.inventory[rk] || 0) > 0) return true;
              // Flow-through check: any of player's other staffed buildings
              // output this resource?
              return state.allBuildings.some(function (b2) {
                if (b2.player_id !== state.currentUser.id) return false;
                if (b2.status !== 'active') return false;
                if (state.laborInfo && state.laborInfo.unstaffedIds && state.laborInfo.unstaffedIds[b2.id]) return false;
                var bt2 = state.buildingTypes[b2.building_type_key];
                return bt2 && bt2.output_resource_key === rk;
              });
            }
            if (!inputOK(buildingBt.input_resource_key)) hasInputs = false;
            if (!inputOK(buildingBt.input_resource_key_2)) hasInputs = false;
          }
          var isFunctionalCategory = buildingBt.category === 'extractor'
            || buildingBt.category === 'food_extractor'
            || buildingBt.category === 'processor'
            || buildingBt.category === 'service'
            || buildingBt.category === 'tax'
            || buildingBt.category === 'booster';
          var isProducing = !isPaused && !isUnstaffed && !isDisconnected
            && hasInputs && isFunctionalCategory;
          // Idle = functional building that's currently NOT producing for
          // any reason at all (paused, unstaffed, no-road, or missing
          // inputs). All four cases get a grayed-out, static sprite.
          var isIdle = isFunctionalCategory && !isProducing;
          if (isPaused) titleText += ' (paused)';
          else if (isDisconnected) titleText += ' (no road)';
          else if (isUnstaffed) titleText += ' (unstaffed)';
          else if (isIdle) titleText += ' (no inputs)';
          var fw = (buildingBt && buildingBt.footprint_w) || 1;
          var fh = (buildingBt && buildingBt.footprint_h) || 1;
          var footprintClass = (fw !== 1 || fh !== 1) ? ' footprint-' + fw + 'x' + fh : '';
          var isInspected = ib && ib.x === x && ib.y === y && ib.id === building.id;
          var bldgClasses = 'bldg ' + btk + housingTierClass + footprintClass + (mine ? ' mine' : '') + (isPaused ? ' paused' : '') + (isUnstaffed ? ' unstaffed' : '') + (isDisconnected ? ' disconnected' : '') + (isIdle ? ' idle' : '') + (isProducing ? ' producing' : '') + (isInspected ? ' inspected-bldg' : '');
          var pausedBadge = isPaused ? '<span class="paused-overlay">⏸</span>' : '';
          // Sprite from JS is the single source of truth (commits/notes
          // refer to this as "single-source-of-truth refactor"). The CSS
          // file used to duplicate every building's data: URI in a
          // .bldg.<key> rule; now spriteIcons[btk] feeds --bldg-sprite
          // and one base CSS rule renders all of them. New buildings
          // only need their entry in sprites.js.
          var spriteUrl = spriteIcons[btk];
          var styleAttr = spriteUrl
            ? ' style="--bldg-sprite: url(&quot;' + spriteUrl + '&quot;);"'
            : '';
          html += '<div class="' + bldgClasses + '" title="' + titleText + '"' + styleAttr + '>' + label + pausedBadge + '</div>';
        }
      } else if (tile.resource_node_key) {
        html += '<div class="res-dot"></div>';
      }

      html += '</div>';
    }
  }
  grid.innerHTML = html;
  applyMapZoom();
  observeBuildings();
  // Sync walker system with new road + extractor layout
  rebuildRoadSet();
  syncCollectorWalkers();
  renderWalkers();
}

// IntersectionObserver flips .bldg-offscreen on each building tile when
// it scrolls out of the map viewport. CSS hides the decorative ::before
// / ::after pseudo-elements (smoke, glow, figure overlays) for those —
// the building itself stays visible, but its animated pseudo-elements
// stop driving the compositor every frame. Mobile Safari spends most of
// its battery on filter/opacity animations off the visible viewport;
// this is the highest-leverage CPU win for phones.
//
// We use display: none rather than animation-play-state: paused because
// pause freezes the pseudo-element mid-cycle and resumes glitchy when
// the user zooms or scrolls back. display: none means animations
// restart cleanly from t=0 on re-entry.
var _bldgObserver = null;
function ensureBuildingObserver() {
  if (_bldgObserver) return _bldgObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  var root = document.getElementById('map-viewport');
  if (!root) return null;
  _bldgObserver = new IntersectionObserver(function (entries) {
    for (var i = 0; i < entries.length; i++) {
      var e = entries[i];
      if (e.isIntersecting) e.target.classList.remove('bldg-offscreen');
      else e.target.classList.add('bldg-offscreen');
    }
  }, { root: root, rootMargin: '80px', threshold: 0 });
  return _bldgObserver;
}

function observeBuildings() {
  var obs = ensureBuildingObserver();
  if (!obs) return;
  // grid.innerHTML rebuild dropped all old .bldg nodes — observer
  // entries for those are auto-released. Re-observe the new ones.
  var nodes = document.querySelectorAll('#grid .bldg');
  for (var i = 0; i < nodes.length; i++) {
    obs.observe(nodes[i]);
  }
}

// Diagnostic exposed on the global window for Safari Web Inspector
// console use. Lets Jill (or anyone) verify perf #1 is active without
// guessing — `__perfStatus()` returns {total, paused, ratio}. If
// paused > 0 while scrolled away from the building cluster, the
// IntersectionObserver pause is working.
if (typeof window !== 'undefined') {
  window.__perfStatus = function () {
    var total = document.querySelectorAll('#grid .bldg').length;
    var paused = document.querySelectorAll('#grid .bldg.bldg-offscreen').length;
    return {
      total: total,
      paused: paused,
      ratio: total ? Math.round(paused / total * 100) + '%' : '0%'
    };
  };
}

// ── Placement ──

export function cancelPlacement() {
  state.selectedBuildType = null;
  clearDragState();
  document.getElementById('placement-bar').classList.remove('active');
  renderMap();
  renderBuildPanel();
}


// Refresh tutorial_step + trade_unlocked from the server. Called after
// every successful place_building so the AFTER INSERT trigger's update
// to player_profiles is reflected in the UI immediately. Lightweight
// — selects only the two columns. If the step advances, re-render the
// banner and build panel so the next instruction shows.
function refreshTutorialState() {
  if (!state.currentUser || !state.profile) return;
  sb.from('player_profiles')
    .select('tutorial_step, trade_unlocked')
    .eq('id', state.currentUser.id)
    .maybeSingle()
    .then(function (r) {
      if (!r.data || !state.profile) return;
      var prevStep = state.profile.tutorial_step;
      state.profile.tutorial_step = r.data.tutorial_step;
      state.profile.trade_unlocked = r.data.trade_unlocked;
      updateTutorialBanner();
      if (r.data.tutorial_step !== prevStep) {
        renderBuildPanel();
        if (r.data.tutorial_step >= 4 && (prevStep || 0) < 4) {
          showToast('Tutorial complete! Trade is now open in the Trade tab.', 'success');
        }
      }
    });
}

function reloadMapData() {
  return Promise.all([
    fetchAllPaged(function () { return sb.from('buildings').select('*, player_profiles(display_name, color_hex)').order('id'); }),
    fetchAllPaged(function () { return sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true }); })
  ]).then(function (results) {
    state.allBuildings = results[0].data || [];
    state.tiles = results[1].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });
    computeGridBounds();
    computeLaborAllocation();
    renderMap();
    renderBuildPanel();
  });
}

function placeBuilding(tileId, btKey) {
  var bt = state.buildingTypes[btKey];
  if (!bt) return;
  if (state.profile.money < bt.build_cost) {
    alert('Not enough money (need $' + bt.build_cost + ')');
    return;
  }

  sb.rpc('place_building', { p_tile_id: tileId, p_building_type_key: btKey })
    .then(function (r) {
      if (r.error) {
        alert(r.error.message);
        return;
      }
      var data = r.data;
      state.profile.money = data.money;
      state.profile.workers_used = data.workers_used;
      state.profile.worker_capacity = data.worker_capacity;

      if (data.workers_needed !== undefined) {
        state.laborInfo.workerSupply = data.worker_capacity;
        state.laborInfo.workersNeeded = data.workers_needed;
        state.laborInfo.workersUsed = data.workers_used;
        state.laborInfo.workersIdle = Math.max(0, data.worker_capacity - data.workers_needed);
        state.laborInfo.laborShortage = !!data.labor_shortage;
      }

      updateMoney();
      updateWorkers();
      updateCityRunway();

      var msg = bt.name + ' placed!';
      if (data.labor_shortage) msg += ' (labor shortage — build housing!)';
      showToast(msg, data.labor_shortage ? 'info' : 'success');
      cancelPlacement();

      reloadMapData();
      // place_building may have deducted resources for this building.
      // Refetch the player's inventory so the build-menu material chips
      // and the City → Resources panel show the new totals.
      sb.from('inventories').select('resource_key, quantity').eq('player_id', state.currentUser.id).then(function (q) {
        state.inventory = {};
        (q.data || []).forEach(function (row) { state.inventory[row.resource_key] = row.quantity; });
        renderBuildPanel();
      });
      // The AFTER INSERT trigger may have advanced tutorial_step /
      // flipped trade_unlocked. Refetch those two so the banner +
      // build panel + trade gate see the new state immediately.
      refreshTutorialState();
    })
    .catch(function (err) {
      alert(err.message || 'Placement failed');
    });
}

// ── Drag-to-paint roads ──

function clearDragState() {
  document.querySelectorAll('.drag-preview').forEach(function (el) {
    el.classList.remove('drag-preview');
  });
  dragState.active = false;
  dragState.planned = [];
  dragState.plannedSet = {};
  hideDragCost();
}

function showDragCost() {
  if (!dragCostEl) {
    dragCostEl = document.getElementById('drag-cost-counter');
  }
  if (!dragCostEl) return;
  var bt = state.buildingTypes[state.selectedBuildType];
  if (!bt) return;
  var count = dragState.planned.length;
  var cost = count * bt.build_cost;
  var affordable = Math.floor(state.profile.money / bt.build_cost);
  var overBudget = count > affordable;
  dragCostEl.textContent = count + ' road' + (count !== 1 ? 's' : '') + ' — $' + cost;
  dragCostEl.className = 'drag-cost-counter active' + (overBudget ? ' over-budget' : '');
}

function hideDragCost() {
  if (!dragCostEl) {
    dragCostEl = document.getElementById('drag-cost-counter');
  }
  if (dragCostEl) {
    dragCostEl.classList.remove('active');
  }
}

function getCellFromPoint(clientX, clientY) {
  var el = document.elementFromPoint(clientX, clientY);
  if (!el) return null;
  return el.closest('.cell');
}

function isSelectedBuildRoad() {
  if (!state.selectedBuildType) return false;
  var bt = state.buildingTypes[state.selectedBuildType];
  return bt && bt.category === 'road';
}

function tryAddDragTile(cell) {
  if (!cell) return false;
  var x = parseInt(cell.dataset.x);
  var y = parseInt(cell.dataset.y);
  var key = x + ',' + y;

  // Backtracking: if cursor moves to the second-to-last tile, remove the last one
  if (dragState.planned.length >= 2) {
    var prev = dragState.planned[dragState.planned.length - 2];
    if (prev.x === x && prev.y === y) {
      var removed = dragState.planned.pop();
      delete dragState.plannedSet[removed.x + ',' + removed.y];
      var removedCell = document.querySelector('.cell[data-x="' + removed.x + '"][data-y="' + removed.y + '"]');
      if (removedCell) removedCell.classList.remove('drag-preview');
      showDragCost();
      return true;
    }
  }

  // Already planned
  if (dragState.plannedSet[key]) return false;

  var tile = state.tileMap[key];
  if (!tile || !tile.buildable || tile.occupied_building_id) return false;

  // Must connect to road network (including pending tiles)
  if (!isRoadPlacementConnected(tile, dragState.plannedSet)) return false;

  // Must be adjacent to last planned tile (continuous path), or be the first tile
  if (dragState.planned.length > 0) {
    var last = dragState.planned[dragState.planned.length - 1];
    if (Math.abs(last.x - x) + Math.abs(last.y - y) !== 1) return false;
  }

  dragState.planned.push({ x: x, y: y, tileId: tile.id });
  dragState.plannedSet[key] = true;
  cell.classList.add('drag-preview');
  showDragCost();
  return true;
}

function executeDragPlacements() {
  var tiles = dragState.planned.slice();
  clearDragState();

  if (tiles.length === 0) return;

  // Single tile: use normal placement flow (cancels placement mode)
  if (tiles.length === 1) {
    placeBuilding(tiles[0].tileId, state.selectedBuildType);
    return;
  }

  var btKey = state.selectedBuildType;
  var bt = state.buildingTypes[btKey];
  if (!bt) return;

  // Check affordability
  var affordable = Math.floor(state.profile.money / bt.build_cost);
  if (affordable === 0) {
    alert('Not enough money');
    return;
  }
  if (affordable < tiles.length) {
    tiles = tiles.slice(0, affordable);
    showToast('Can only afford ' + affordable + ' road' + (affordable > 1 ? 's' : ''), 'info');
  }

  // Chain placement RPCs sequentially
  var chain = Promise.resolve();
  var placed = 0;
  tiles.forEach(function (t) {
    chain = chain.then(function () {
      return sb.rpc('place_building', { p_tile_id: t.tileId, p_building_type_key: btKey })
        .then(function (r) {
          if (r.error) throw new Error(r.error.message);
          placed++;
          var data = r.data;
          state.profile.money = data.money;
          state.profile.workers_used = data.workers_used;
          state.profile.worker_capacity = data.worker_capacity;
          if (data.workers_needed !== undefined) {
            state.laborInfo.workerSupply = data.worker_capacity;
            state.laborInfo.workersNeeded = data.workers_needed;
            state.laborInfo.workersUsed = data.workers_used;
            state.laborInfo.workersIdle = Math.max(0, data.worker_capacity - data.workers_needed);
            state.laborInfo.laborShortage = !!data.labor_shortage;
          }
        });
    });
  });

  chain.then(function () {
    updateMoney();
    updateWorkers();
    updateCityRunway();
    if (placed > 0) {
      showToast(placed + ' road' + (placed > 1 ? 's' : '') + ' placed!', 'success');
    }
    // Reload data but keep placement mode active for continued painting
    return reloadMapData();
  }).catch(function (err) {
    alert(err.message || 'Some placements failed');
    reloadMapData();
  });
}

// ── District expansion ──
// Player taps "+ Expand", server returns the chunks orthogonally adjacent
// to their district that they're allowed to claim (i.e., not in another
// player's reserved row). Those chunks render as buyable territory; the
// player taps one to allocate it.

function isInExpansionCandidate(x, y) {
  if (!state.expansionCandidates.length) return false;
  var cx = Math.floor(x / 15);
  var cy = Math.floor(y / 15);
  for (var i = 0; i < state.expansionCandidates.length; i++) {
    var c = state.expansionCandidates[i];
    if (c.chunk_x === cx && c.chunk_y === cy) return true;
  }
  return false;
}

export function expandDistrict() {
  if (!state.profile) return Promise.resolve(null);
  var chunksOwned = state.profile.chunks_owned || 1;
  var cost = 1000 * chunksOwned * chunksOwned;
  if ((state.profile.money || 0) < cost) {
    alert('Need $' + cost + ' to expand district');
    return Promise.resolve(null);
  }
  if (state.selectedBuildType) cancelPlacement();
  return sb.rpc('expansion_candidates', { p_player_id: state.currentUser.id }).then(function (r) {
    if (r.error) {
      alert('Could not load expansion options: ' + r.error.message);
      return null;
    }
    var candidates = (r.data || []).map(function (row) {
      return { chunk_x: row.chunk_x, chunk_y: row.chunk_y };
    });
    if (candidates.length === 0) {
      alert('No adjacent parcels available to claim');
      return null;
    }
    state.expansionCandidates = candidates;
    state.expansionCost = cost;
    computeGridBounds();
    renderMap();
    var bar = document.getElementById('expansion-bar');
    bar.querySelector('#expansion-text').textContent = 'Tap a highlighted parcel to claim it ($' + cost + ')';
    bar.classList.add('active');
    return null;
  }).catch(function (err) {
    alert('Could not load expansion options: ' + (err.message || err));
  });
}

export function cancelExpansion() {
  state.expansionCandidates = [];
  state.expansionCost = 0;
  document.getElementById('expansion-bar').classList.remove('active');
  computeGridBounds();
  renderMap();
}

function selectExpansionChunk(cx, cy) {
  return sb.rpc('expand_district', { p_chunk_x: cx, p_chunk_y: cy }).then(function (r) {
    if (r.error) {
      alert('Expand failed: ' + r.error.message);
      return null;
    }
    var data = r.data;
    state.profile.money = data.money;
    state.profile.chunks_owned = data.chunks_owned;
    updateMoney();
    showToast('District expanded — claimed a new parcel.', 'success');
    state.expansionCandidates = [];
    state.expansionCost = 0;
    document.getElementById('expansion-bar').classList.remove('active');
    return reloadMapData();
  }).catch(function (err) {
    alert('Expand failed: ' + (err.message || err));
  });
}

// ── Events ──

export function initMapEvents() {
  var grid = document.getElementById('map-grid');
  var viewport = document.getElementById('map-viewport');

  // Persist scroll position (covers manual scroll, programmatic scroll
  // from setMapZoomAtPoint, and clamps when the grid resizes).
  viewport.addEventListener('scroll', scheduleSaveMapView, { passive: true });

  // Single-click: inspect existing buildings OR place new ones
  grid.addEventListener('click', function (e) {
    if (Date.now() < dragState.suppressClick) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;

    var x = parseInt(cell.dataset.x);
    var y = parseInt(cell.dataset.y);

    // Expansion picker mode: tapping a highlighted candidate chunk claims it.
    if (state.expansionCandidates.length > 0 && cell.classList.contains('expansion-candidate')) {
      selectExpansionChunk(Math.floor(x / 15), Math.floor(y / 15));
      return;
    }
    // Roads use drag system exclusively; other build types still support tap/click placement.
    if (state.selectedBuildType && isSelectedBuildRoad()) return;

    // Always check for existing building first — tapping a building opens the inspector
    // even in placement mode. This makes inspect/demolish discoverable.
    // For multi-tile buildings, tapping ANY footprint tile opens the inspector
    // (via the data-anchor-x/y on interior cells, or via direct (x,y) match on
    // the anchor cell).
    var ax = x, ay = y;
    if (cell.dataset.anchorX !== undefined && cell.dataset.anchorX !== '') {
      ax = parseInt(cell.dataset.anchorX);
      ay = parseInt(cell.dataset.anchorY);
    }
    var building = state.allBuildings.find(function (b) {
      return b.x === ax && b.y === ay;
    });
    if (building) {
      openInspector(building);
      return;
    }

    // Resource tile (no building on it) — open the resource inspector
    // with role description + Demolish action. Only on owned tiles.
    var tile = state.tileMap[x + ',' + y];
    if (tile && tile.resource_node_key && isMyTile(tile) && !state.selectedBuildType) {
      openResourceInspector(tile);
      return;
    }

// Placement mode: try to place building on empty tile
    if (state.selectedBuildType) {
      var tileId = cell.dataset.tileId;
      if (!tileId) return;
      if (!tile || !isPlacementValid(state.selectedBuildType, tile)) {
        var sbt = state.buildingTypes[state.selectedBuildType];
        if (sbt && sbt.placement_resource_node_key && (!tile || tile.resource_node_key !== sbt.placement_resource_node_key)) {
          var rname = state.resources && state.resources[sbt.placement_resource_node_key]
            ? state.resources[sbt.placement_resource_node_key].name
            : sbt.placement_resource_node_key;
          alert('Place on a ' + rname + ' tile');
        } else if (tile && tile.resource_node_key) {
          var rk = tile.resource_node_key;
          var rn = state.resources && state.resources[rk] ? state.resources[rk].name : rk;
          alert('Clear the ' + rn + ' first');
        } else {
          alert('Cannot place here');
        }
        return;
      }
      placeBuilding(tileId, state.selectedBuildType);
      return;
    }
  });

  // ── Drag-to-paint: mouse events ──

  grid.addEventListener('mousedown', function (e) {
    if (e.button !== 0) return;
    if (!isSelectedBuildRoad()) return;
    e.preventDefault();
    clearDragState();
    dragState.active = true;
    var cell = e.target.closest('.cell');
    if (cell) tryAddDragTile(cell);
  });

  document.addEventListener('mousemove', function (e) {
    if (!dragState.active) return;
    var cell = getCellFromPoint(e.clientX, e.clientY);
    if (cell) tryAddDragTile(cell);
  });

  document.addEventListener('mouseup', function () {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.suppressClick = Date.now() + 200;
    executeDragPlacements();
  });

  // ── Drag-to-paint: touch events (single finger) ──

  grid.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) {
      // Multi-touch: cancel any drag. Pinch zoom is gone — zoom uses
      // the +/− buttons. The viewport-level touchstart below also
      // preventDefaults a 2-finger gesture to keep iOS Safari from
      // running its native page-zoom on top of the app.
      if (dragState.active) clearDragState();
      return;
    }
    if (!isSelectedBuildRoad()) return;
    clearDragState();
    dragState.active = true;
    var touch = e.touches[0];
    var cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell) tryAddDragTile(cell);
  }, { passive: true });

  grid.addEventListener('touchmove', function (e) {
    if (!dragState.active) return;
    if (e.touches.length !== 1) {
      clearDragState();
      return;
    }
    var touch = e.touches[0];
    var cell = getCellFromPoint(touch.clientX, touch.clientY);
    if (cell) {
      tryAddDragTile(cell);
      // Prevent viewport scroll while drag-painting
      if (dragState.planned.length > 0) e.preventDefault();
    }
  }, { passive: false });

  grid.addEventListener('touchend', function () {
    if (!dragState.active) return;
    dragState.active = false;
    dragState.suppressClick = Date.now() + 300;
    executeDragPlacements();
  });

  // ── Cancel buttons ──
  document.getElementById('placement-cancel').addEventListener('click', cancelPlacement);
  document.getElementById('expansion-cancel').addEventListener('click', cancelExpansion);

  // ── Escape key cancels active placement / expansion ──
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (state.expansionCandidates.length > 0) cancelExpansion();
    else if (state.selectedBuildType) cancelPlacement();
  });

  // ── Optional zoom controls (desktop/dev only if present) ──
  var zoomInBtn = document.getElementById('zoom-in');
  var zoomOutBtn = document.getElementById('zoom-out');
  var zoomResetBtn = document.getElementById('zoom-reset');
  if (zoomInBtn) {
    zoomInBtn.addEventListener('click', function () {
      var rect = viewport.getBoundingClientRect();
      setMapZoomAtPoint(state.mapZoom + MAP_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }
  if (zoomOutBtn) {
    zoomOutBtn.addEventListener('click', function () {
      var rect = viewport.getBoundingClientRect();
      setMapZoomAtPoint(state.mapZoom - MAP_ZOOM_STEP, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }
  if (zoomResetBtn) {
    zoomResetBtn.addEventListener('click', function () {
      var rect = viewport.getBoundingClientRect();
      setMapZoomAtPoint(1, rect.left + rect.width / 2, rect.top + rect.height / 2);
    });
  }

  // ── Heatmap mode toggle ──
  // Click the button → small popup lists the available overlays. Picking
  // one applies a `body.heatmap-<mode>` class; CSS gates the right
  // visualization (yellow tint for pollution, red for crime risk, red
  // outline for unstaffed/idle buildings, etc.). One mode at a time so
  // the colors don't fight. Persisted across reloads.
  var heatmapBtn = document.getElementById('heatmap-toggle');
  var heatmapPopup = document.getElementById('heatmap-popup');
  var HEATMAP_MODES = ['none', 'pollution', 'crime', 'issues', 'desirability'];

  function applyHeatmapMode(mode) {
    HEATMAP_MODES.forEach(function (m) {
      document.body.classList.toggle('heatmap-' + m, m === mode && m !== 'none');
    });
    if (heatmapBtn) heatmapBtn.classList.toggle('active', mode !== 'none');
    if (heatmapPopup) {
      heatmapPopup.querySelectorAll('.heatmap-option').forEach(function (opt) {
        opt.classList.toggle('active', opt.dataset.mode === mode);
      });
    }
    state.heatmapMode = mode;
    try { localStorage.setItem('city_heatmap_mode', mode); } catch (e) {}
    // Re-render the map so police-cover class + bldg.idle markers
    // reflect the new mode (CSS-only modes don't strictly need this,
    // but crime mode does for the .police-covered class).
    if (mode === 'crime') renderMap();
  }

  if (heatmapBtn && heatmapPopup) {
    var savedMode;
    try { savedMode = localStorage.getItem('city_heatmap_mode'); } catch (e) {}
    if (HEATMAP_MODES.indexOf(savedMode) === -1) savedMode = 'none';
    applyHeatmapMode(savedMode);

    heatmapBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      heatmapPopup.classList.toggle('show');
    });
    heatmapPopup.addEventListener('click', function (e) {
      e.stopPropagation();
      var opt = e.target.closest('.heatmap-option');
      if (!opt) return;
      applyHeatmapMode(opt.dataset.mode);
      heatmapPopup.classList.remove('show');
    });
    document.addEventListener('click', function (e) {
      if (!heatmapPopup.classList.contains('show')) return;
      if (heatmapPopup.contains(e.target) || heatmapBtn.contains(e.target)) return;
      heatmapPopup.classList.remove('show');
    });
  }

  // ── Block Safari's native pinch-zoom ──
  // We don't do app-level pinch zoom anymore (the +/− buttons are the
  // zoom UI) but iOS Safari ignores `user-scalable=no` on the viewport
  // meta and will run its own page-level pinch-zoom. Without these
  // blocks the canvas would scale via Safari while walkers / sprites
  // stay in their app-coordinate positions, causing visible drift.
  // preventDefault on the proprietary `gesture*` events plus a 2-finger
  // touchstart catch covers both code paths Safari uses.
  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) e.preventDefault();
  }, { passive: false });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach(function (evt) {
    document.addEventListener(evt, function (e) { e.preventDefault(); }, { passive: false });
  });
}
