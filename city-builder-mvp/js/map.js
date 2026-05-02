// ── Map rendering, placement logic, drag-to-paint roads, and map expansion ──
import { sb } from './config.js';
import { state, CITY_CENTER_X, CITY_CENTER_Y, computeLaborAllocation, computeGridBounds } from './state.js';
import { showToast, updateMoney, updateWorkers } from './ui.js';
import { renderBuildPanel } from './panels.js';
import { rebuildRoadSet, renderWalkers, snapWalkersToZoom } from './walkers.js';
import { openInspector } from './inspector.js';

export var BLDG_LABELS = {
  timber_camp: 'TC', sawmill: 'SM',
  stone_quarry: 'SQ', mason_workshop: 'MW',
  grain_farm: 'GF', mill: 'ML',
  clay_pit: 'CP', pottery_kiln: 'PK',
  bakery: 'BK', woodcarver: 'WC', sculptor: 'SC',
  house: 'H', road: 'R'
};

// Housing tier label overrides (keyed by tier number)
var HOUSING_TIER_LABELS = { 0: 'S', 1: 'H', 2: 'C', 3: 'T', 4: 'V', 5: 'M' };
var CELL_BASE_SIZE = 520 / 15;  // px per cell at 1x zoom (original 520px / 15 cols)

// Deterministic hash for per-tile visual variation (grass details, noise seeds)
function tileHash(x, y) {
  return ((x * 2654435761 + y * 2246822519) >>> 0);
}
var MAP_MIN_ZOOM = 0.5;
var MAP_MAX_ZOOM = 3;
var MAP_ZOOM_STEP = 0.25;
var EXPAND_THRESHOLD = 2;  // tiles from edge to trigger expansion
var EXPAND_AMOUNT = 5;     // tiles added per expansion direction

// Pinch zoom state
var pinchStartDistance = null;
var pinchStartZoom = 1;
var pinchStartCenter = null;
var pinchSuppressClickUntil = 0;
var pinchGestureActive = false;

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
  if (!tile.buildable) return false;
  if (tile.occupied_building_id) return false;

  if (bt.category === 'extractor') {
    return tile.resource_node_key === bt.output_resource_key;
  }
  if (bt.category === 'road') {
    return isRoadPlacementConnected(tile, null);
  }
  return true;
}

function isRoadBuilding(building) {
  if (!building) return false;
  var bt = state.buildingTypes[building.building_type_key];
  return !!(bt && bt.category === 'road');
}

function isRoadOrCenter(x, y, buildingAt) {
  if (x === CITY_CENTER_X && y === CITY_CENTER_Y) return true;
  return isRoadBuilding(buildingAt[x + ',' + y]);
}

function roadNeighborFlags(x, y, buildingAt) {
  return {
    n: isRoadOrCenter(x, y - 1, buildingAt),
    s: isRoadOrCenter(x, y + 1, buildingAt),
    e: isRoadOrCenter(x + 1, y, buildingAt),
    w: isRoadOrCenter(x - 1, y, buildingAt)
  };
}

// Pre-generated road tile inline SVGs for all 16 autotile variants.
// Each SVG renders a complete road tile with grass background, shaped road
// surface, edge borders, directional wheel ruts, pebbles, and grass tufts.
var ROAD_TILE_SVGS = (function() {
  var L = 5, R = 29, T = 34;

  function onRoad(px, py, n, s, e, w) {
    if (px >= L && px <= R && py >= L && py <= R) return true;
    if (n && px >= L && px <= R && py < L) return true;
    if (s && px >= L && px <= R && py > R) return true;
    if (e && px > R && py >= L && py <= R) return true;
    if (w && px < L && py >= L && py <= R) return true;
    if (n && w && px < L && py < L) return true;
    if (n && e && px > R && py < L) return true;
    if (s && w && px < L && py > R) return true;
    if (s && e && px > R && py > R) return true;
    return false;
  }

  function gen(key, n, s, e, w) {
    var p = [];
    var RW = R - L; // road width (24)

    // 1. Grass background
    p.push('<rect width="34" height="34" fill="#223322"/>');

    // 2. Road surface (center + arms + corners)
    p.push('<rect x="'+L+'" y="'+L+'" width="'+RW+'" height="'+RW+'" fill="#6b5436"/>');
    if (n) p.push('<rect x="'+L+'" y="0" width="'+RW+'" height="'+L+'" fill="#6b5436"/>');
    if (s) p.push('<rect x="'+L+'" y="'+R+'" width="'+RW+'" height="'+(T-R)+'" fill="#6b5436"/>');
    if (e) p.push('<rect x="'+R+'" y="'+L+'" width="'+(T-R)+'" height="'+RW+'" fill="#6b5436"/>');
    if (w) p.push('<rect x="0" y="'+L+'" width="'+L+'" height="'+RW+'" fill="#6b5436"/>');
    if (n&&w) p.push('<rect x="0" y="0" width="'+L+'" height="'+L+'" fill="#6b5436"/>');
    if (n&&e) p.push('<rect x="'+R+'" y="0" width="'+(T-R)+'" height="'+L+'" fill="#6b5436"/>');
    if (s&&w) p.push('<rect x="0" y="'+R+'" width="'+L+'" height="'+(T-R)+'" fill="#6b5436"/>');
    if (s&&e) p.push('<rect x="'+R+'" y="'+R+'" width="'+(T-R)+'" height="'+(T-R)+'" fill="#6b5436"/>');

    // 3. Worn center track (lighter, narrower strip following road direction)
    var CL = 9, CR = 25, CW = CR - CL;
    p.push('<rect x="'+CL+'" y="'+CL+'" width="'+CW+'" height="'+CW+'" fill="#7a6848" opacity="0.22"/>');
    if (n) p.push('<rect x="'+CL+'" y="0" width="'+CW+'" height="'+CL+'" fill="#7a6848" opacity="0.22"/>');
    if (s) p.push('<rect x="'+CL+'" y="'+CR+'" width="'+CW+'" height="'+(T-CR)+'" fill="#7a6848" opacity="0.22"/>');
    if (e) p.push('<rect x="'+CR+'" y="'+CL+'" width="'+(T-CR)+'" height="'+CW+'" fill="#7a6848" opacity="0.22"/>');
    if (w) p.push('<rect x="0" y="'+CL+'" width="'+CL+'" height="'+CW+'" fill="#7a6848" opacity="0.22"/>');

    // 4. Grass-to-dirt transition strips (soften road edges)
    var ew = 2, tc = '#3a4830', to = '0.28';
    if (!n) p.push('<rect x="'+L+'" y="'+L+'" width="'+RW+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (!s) p.push('<rect x="'+L+'" y="'+(R-ew)+'" width="'+RW+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (!w) p.push('<rect x="'+L+'" y="'+L+'" width="'+ew+'" height="'+RW+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (!e) p.push('<rect x="'+(R-ew)+'" y="'+L+'" width="'+ew+'" height="'+RW+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (n&&!w) p.push('<rect x="'+L+'" y="0" width="'+ew+'" height="'+L+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (n&&!e) p.push('<rect x="'+(R-ew)+'" y="0" width="'+ew+'" height="'+L+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (s&&!w) p.push('<rect x="'+L+'" y="'+R+'" width="'+ew+'" height="'+(T-R)+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (s&&!e) p.push('<rect x="'+(R-ew)+'" y="'+R+'" width="'+ew+'" height="'+(T-R)+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (e&&!n) p.push('<rect x="'+R+'" y="'+L+'" width="'+(T-R)+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (e&&!s) p.push('<rect x="'+R+'" y="'+(R-ew)+'" width="'+(T-R)+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (w&&!n) p.push('<rect x="0" y="'+L+'" width="'+L+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');
    if (w&&!s) p.push('<rect x="0" y="'+(R-ew)+'" width="'+L+'" height="'+ew+'" fill="'+tc+'" opacity="'+to+'"/>');

    // 5. Edge border lines (dark, defines road boundary)
    var eg = '<g stroke="#3a2818" stroke-width="1" opacity="0.45">';
    if (!n) eg += '<line x1="'+L+'" y1="'+L+'" x2="'+R+'" y2="'+L+'"/>';
    if (!s) eg += '<line x1="'+L+'" y1="'+R+'" x2="'+R+'" y2="'+R+'"/>';
    if (!w) eg += '<line x1="'+L+'" y1="'+L+'" x2="'+L+'" y2="'+R+'"/>';
    if (!e) eg += '<line x1="'+R+'" y1="'+L+'" x2="'+R+'" y2="'+R+'"/>';
    if (n&&!w) eg += '<line x1="'+L+'" y1="0" x2="'+L+'" y2="'+L+'"/>';
    if (n&&!e) eg += '<line x1="'+R+'" y1="0" x2="'+R+'" y2="'+L+'"/>';
    if (s&&!w) eg += '<line x1="'+L+'" y1="'+R+'" x2="'+L+'" y2="'+T+'"/>';
    if (s&&!e) eg += '<line x1="'+R+'" y1="'+R+'" x2="'+R+'" y2="'+T+'"/>';
    if (e&&!n) eg += '<line x1="'+R+'" y1="'+L+'" x2="'+T+'" y2="'+L+'"/>';
    if (e&&!s) eg += '<line x1="'+R+'" y1="'+R+'" x2="'+T+'" y2="'+R+'"/>';
    if (w&&!n) eg += '<line x1="0" y1="'+L+'" x2="'+L+'" y2="'+L+'"/>';
    if (w&&!s) eg += '<line x1="0" y1="'+R+'" x2="'+L+'" y2="'+R+'"/>';
    eg += '</g>';
    p.push(eg);

    // 6. Inner highlight along edges (raised border effect)
    var hl = '<g stroke="#9a8a6a" stroke-width="0.5" opacity="0.18">';
    if (!n) hl += '<line x1="'+(L+1)+'" y1="'+(L+1)+'" x2="'+(R-1)+'" y2="'+(L+1)+'"/>';
    if (!s) hl += '<line x1="'+(L+1)+'" y1="'+(R-1)+'" x2="'+(R-1)+'" y2="'+(R-1)+'"/>';
    if (!w) hl += '<line x1="'+(L+1)+'" y1="'+(L+1)+'" x2="'+(L+1)+'" y2="'+(R-1)+'"/>';
    if (!e) hl += '<line x1="'+(R-1)+'" y1="'+(L+1)+'" x2="'+(R-1)+'" y2="'+(R-1)+'"/>';
    hl += '</g>';
    p.push(hl);

    // 7. Wheel ruts (directional wear marks)
    var r1 = 13, r2 = 21;
    var rg = '<g stroke="#523e28" stroke-width="0.9" opacity="0.18">';
    if (n || s) {
      var vy1 = n ? 0 : L, vy2 = s ? T : R;
      rg += '<line x1="'+r1+'" y1="'+vy1+'" x2="'+r1+'" y2="'+vy2+'"/>';
      rg += '<line x1="'+r2+'" y1="'+vy1+'" x2="'+r2+'" y2="'+vy2+'"/>';
    }
    if (e || w) {
      var hx1 = w ? 0 : L, hx2 = e ? T : R;
      rg += '<line x1="'+hx1+'" y1="'+r1+'" x2="'+hx2+'" y2="'+r1+'"/>';
      rg += '<line x1="'+hx1+'" y1="'+r2+'" x2="'+hx2+'" y2="'+r2+'"/>';
    }
    if (!n && !s && !e && !w) {
      rg += '<line x1="'+r1+'" y1="'+L+'" x2="'+r1+'" y2="'+R+'"/>';
      rg += '<line x1="'+r2+'" y1="'+L+'" x2="'+r2+'" y2="'+R+'"/>';
    }
    rg += '</g>';
    p.push(rg);

    // 8. Gravel scatter (small surface texture dots)
    var gx = [12,18,24,10,20,15,8,26,14,22,16,11,25,9,19,23];
    var gy = [8,14,20,24,10,28,16,12,30,6,18,26,4,22,32,2];
    var gg = '<g fill="#8a7a60" opacity="0.22">';
    for (var i = 0; i < 10; i++) {
      var gpx = gx[(i + key * 3) % 16], gpy = gy[(i + key * 5 + 3) % 16];
      if (onRoad(gpx, gpy, n, s, e, w)) gg += '<circle cx="'+gpx+'" cy="'+gpy+'" r="0.7"/>';
    }
    gg += '</g>';
    p.push(gg);

    // 9. Larger pebbles
    var pbx = [16,22,11,25,14,20,8,27];
    var pby = [11,23,19,15,27,7,14,21];
    var pg = '<g fill="#6a6050" opacity="0.28">';
    for (var j = 0; j < 3; j++) {
      var ppx = pbx[(j + key * 2) % 8], ppy = pby[(j + key * 3 + 1) % 8];
      if (onRoad(ppx, ppy, n, s, e, w)) pg += '<circle cx="'+ppx+'" cy="'+ppy+'" r="1.0"/>';
    }
    pg += '</g>';
    p.push(pg);

    // 10. Grass tufts at road edges (organic grass blades)
    var tg = '<g stroke="#2a5028" stroke-width="0.6" opacity="0.4">';
    if (!n) {
      tg += '<line x1="10" y1="'+L+'" x2="9" y2="'+(L-3)+'"/>';
      tg += '<line x1="11" y1="'+L+'" x2="12" y2="'+(L-3)+'"/>';
      tg += '<line x1="23" y1="'+L+'" x2="22" y2="'+(L-4)+'"/>';
      tg += '<line x1="24" y1="'+L+'" x2="25" y2="'+(L-3)+'"/>';
    }
    if (!s) {
      tg += '<line x1="12" y1="'+R+'" x2="11" y2="'+(R+3)+'"/>';
      tg += '<line x1="13" y1="'+R+'" x2="14" y2="'+(R+4)+'"/>';
      tg += '<line x1="21" y1="'+R+'" x2="20" y2="'+(R+3)+'"/>';
      tg += '<line x1="22" y1="'+R+'" x2="23" y2="'+(R+3)+'"/>';
    }
    if (!w) {
      tg += '<line x1="'+L+'" y1="10" x2="'+(L-3)+'" y2="9"/>';
      tg += '<line x1="'+L+'" y1="11" x2="'+(L-4)+'" y2="12"/>';
      tg += '<line x1="'+L+'" y1="22" x2="'+(L-3)+'" y2="21"/>';
      tg += '<line x1="'+L+'" y1="23" x2="'+(L-3)+'" y2="24"/>';
    }
    if (!e) {
      tg += '<line x1="'+R+'" y1="12" x2="'+(R+3)+'" y2="11"/>';
      tg += '<line x1="'+R+'" y1="13" x2="'+(R+4)+'" y2="14"/>';
      tg += '<line x1="'+R+'" y1="21" x2="'+(R+3)+'" y2="20"/>';
      tg += '<line x1="'+R+'" y1="22" x2="'+(R+3)+'" y2="23"/>';
    }
    if (n&&!w) {
      tg += '<line x1="'+L+'" y1="2" x2="'+(L-3)+'" y2="1"/>';
      tg += '<line x1="'+L+'" y1="3" x2="'+(L-2)+'" y2="4"/>';
    }
    if (n&&!e) {
      tg += '<line x1="'+R+'" y1="2" x2="'+(R+3)+'" y2="1"/>';
      tg += '<line x1="'+R+'" y1="3" x2="'+(R+2)+'" y2="4"/>';
    }
    if (s&&!w) {
      tg += '<line x1="'+L+'" y1="32" x2="'+(L-3)+'" y2="33"/>';
      tg += '<line x1="'+L+'" y1="31" x2="'+(L-2)+'" y2="30"/>';
    }
    if (s&&!e) {
      tg += '<line x1="'+R+'" y1="32" x2="'+(R+3)+'" y2="33"/>';
      tg += '<line x1="'+R+'" y1="31" x2="'+(R+2)+'" y2="30"/>';
    }
    if (e&&!n) tg += '<line x1="32" y1="'+L+'" x2="33" y2="'+(L-3)+'"/>';
    if (e&&!s) tg += '<line x1="32" y1="'+R+'" x2="33" y2="'+(R+3)+'"/>';
    if (w&&!n) tg += '<line x1="2" y1="'+L+'" x2="1" y2="'+(L-3)+'"/>';
    if (w&&!s) tg += '<line x1="2" y1="'+R+'" x2="1" y2="'+(R+3)+'"/>';
    tg += '</g>';
    p.push(tg);

    return '<svg viewBox="0 0 34 34" xmlns="http://www.w3.org/2000/svg">' + p.join('') + '</svg>';
  }

  var svgs = [];
  for (var k = 0; k < 16; k++) {
    svgs[k] = gen(k, !!(k & 8), !!(k & 4), !!(k & 2), !!(k & 1));
  }
  return svgs;
})();

function getRoadTileSVG(n, s, e, w) {
  return ROAD_TILE_SVGS[(n?8:0) | (s?4:0) | (e?2:0) | (w?1:0)];
}

// Cached road tile set for O(1) connectivity lookups during placement/drag
var roadTileSet = {};

function rebuildPlacementRoadSet() {
  roadTileSet = {};
  state.allBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'road' && b.status === 'active') {
      roadTileSet[b.x + ',' + b.y] = true;
    }
  });
}

function isRoadPlacementConnected(tile, pendingSet) {
  if (!tile) return false;
  var x = tile.x, y = tile.y;
  // Adjacent to city center
  if ((Math.abs(x - CITY_CENTER_X) + Math.abs(y - CITY_CENTER_Y)) === 1) return true;
  // Adjacent to existing road (O(1) set lookup)
  if (roadTileSet[(x - 1) + ',' + y] || roadTileSet[(x + 1) + ',' + y]
    || roadTileSet[x + ',' + (y - 1)] || roadTileSet[x + ',' + (y + 1)]) {
    return true;
  }
  // Adjacent to pending drag road
  if (pendingSet) {
    return !!(pendingSet[(x - 1) + ',' + y]
      || pendingSet[(x + 1) + ',' + y]
      || pendingSet[x + ',' + (y - 1)]
      || pendingSet[x + ',' + (y + 1)]);
  }
  return false;
}

// ── Zoom ──

export function applyMapZoom() {
  var grid = document.getElementById('map-grid');
  var label = document.getElementById('zoom-label');
  if (!grid) return;
  var mapWidth = Math.round(CELL_BASE_SIZE * state.gridCols * state.mapZoom);
  grid.style.width = mapWidth + 'px';
  if (label) label.textContent = Math.round(state.mapZoom * 100) + '%';
  snapWalkersToZoom();
}

function setMapZoom(nextZoom) {
  var clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom));
  state.mapZoom = Math.round(clamped * 100) / 100;
  applyMapZoom();
}

function setMapZoomAtPoint(nextZoom, clientX, clientY) {
  var viewport = document.getElementById('map-viewport');
  var grid = document.getElementById('map-grid');
  if (!viewport || !grid) {
    setMapZoom(nextZoom);
    return;
  }

  var oldZoom = state.mapZoom;
  var clamped = Math.max(MAP_MIN_ZOOM, Math.min(MAP_MAX_ZOOM, nextZoom));
  var newZoom = Math.round(clamped * 100) / 100;
  if (newZoom === oldZoom) return;

  var rect = viewport.getBoundingClientRect();
  var localX = clientX - rect.left + viewport.scrollLeft;
  var localY = clientY - rect.top + viewport.scrollTop;
  var worldX = localX / oldZoom;
  var worldY = localY / oldZoom;

  state.mapZoom = newZoom;
  applyMapZoom();

  viewport.scrollLeft = Math.max(0, worldX * newZoom - (clientX - rect.left));
  viewport.scrollTop = Math.max(0, worldY * newZoom - (clientY - rect.top));
}

function touchDistance(touches) {
  if (!touches || touches.length < 2) return 0;
  var dx = touches[0].clientX - touches[1].clientX;
  var dy = touches[0].clientY - touches[1].clientY;
  return Math.sqrt(dx * dx + dy * dy);
}

function touchCenter(touches) {
  if (!touches || touches.length < 2) return null;
  return {
    x: (touches[0].clientX + touches[1].clientX) / 2,
    y: (touches[0].clientY + touches[1].clientY) / 2
  };
}

// ── Map rendering ──

export function renderMap() {
  var grid = document.getElementById('map-grid');
  rebuildPlacementRoadSet();
  var buildingAt = {};
  state.allBuildings.forEach(function (b) { buildingAt[b.x + ',' + b.y] = b; });

  // Dynamic grid columns based on current bounds
  grid.style.gridTemplateColumns = 'repeat(' + state.gridCols + ', 1fr)';

  var html = '';
  for (var y = state.gridMinY; y <= state.gridMaxY; y++) {
    for (var x = state.gridMinX; x <= state.gridMaxX; x++) {
      var tile = state.tileMap[x + ',' + y];
      var building = buildingAt[x + ',' + y];
      var classes = ['cell'];

      if (!tile) {
        html += '<div class="cell empty-cell" data-x="' + x + '" data-y="' + y + '"></div>';
        continue;
      }

      if (x === CITY_CENTER_X && y === CITY_CENTER_Y) {
        classes.push('city-center');
      } else if (tile.resource_node_key) {
        classes.push('res-' + tile.resource_node_key);
      } else {
        // Grass detail variations for plain ground tiles
        var h = tileHash(x, y);
        classes.push('nv' + (h & 3));          // noise seed variant (0-3)
        if (!building) {
          var dv = (h >>> 2) & 15;             // decoration variant (0-15)
          if (dv < 8) classes.push('gv' + dv); // ~50% of tiles get a decoration
        }
      }

      // Add per-building cell classes for layering/render behavior
      var buildingBt = building ? state.buildingTypes[building.building_type_key] : null;
      if (building && buildingBt && buildingBt.category === 'road') {
        classes.push('road-tile');
      }
      if (building && buildingBt && buildingBt.category === 'housing') {
        classes.push('has-house');
      }

      if (state.selectedBuildType && !building && isPlacementValid(state.selectedBuildType, tile)) {
        classes.push('valid-placement');
      }

      html += '<div class="' + classes.join(' ') + '" data-x="' + x + '" data-y="' + y + '" data-tile-id="' + tile.id + '">';

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
          var isUnstaffed = mine && state.laborInfo.unstaffedIds[building.id];
          var isDisconnected = mine && state.noRoadAccessIds[building.id];
          var isProducing = !isUnstaffed && !isDisconnected && buildingBt.category !== 'housing' && buildingBt.category !== 'road';
          if (isDisconnected) titleText += ' (no road)';
          else if (isUnstaffed) titleText += ' (unstaffed)';
          var bldgClasses = 'bldg ' + btk + housingTierClass + (mine ? ' mine' : '') + (isUnstaffed ? ' unstaffed' : '') + (isDisconnected ? ' disconnected' : '') + (isProducing ? ' producing' : '');
          html += '<div class="' + bldgClasses + '" title="' + titleText + '">' + label + '</div>';
        }
      } else if (x === CITY_CENTER_X && y === CITY_CENTER_Y) {
        // Show road surface from city center toward adjacent roads
        var hqN = isRoadBuilding(buildingAt[CITY_CENTER_X + ',' + (CITY_CENTER_Y - 1)]);
        var hqS = isRoadBuilding(buildingAt[CITY_CENTER_X + ',' + (CITY_CENTER_Y + 1)]);
        var hqE = isRoadBuilding(buildingAt[(CITY_CENTER_X + 1) + ',' + CITY_CENTER_Y]);
        var hqW = isRoadBuilding(buildingAt[(CITY_CENTER_X - 1) + ',' + CITY_CENTER_Y]);
        if (hqN || hqS || hqE || hqW) {
          html += '<div class="road-surface hq-road">' + getRoadTileSVG(hqN, hqS, hqE, hqW) + '</div>';
        }
        html += '<span class="hq-label">HQ</span>';
      } else if (tile.resource_node_key) {
        html += '<div class="res-dot"></div>';
      }

      html += '</div>';
    }
  }
  grid.innerHTML = html;
  applyMapZoom();
  // Sync walker system with new road layout
  rebuildRoadSet();
  renderWalkers();
}

// ── Placement ──

export function cancelPlacement() {
  state.selectedBuildType = null;
  clearDragState();
  document.getElementById('placement-bar').classList.remove('active');
  renderMap();
  renderBuildPanel();
}


function reloadMapData() {
  return Promise.all([
    sb.from('buildings').select('*, player_profiles(display_name, color_hex)'),
    sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true })
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
    showToast('Not enough money (need $' + bt.build_cost + ')', 'error');
    return;
  }

  showToast('Placing...', '');
  sb.rpc('place_building', { p_tile_id: tileId, p_building_type_key: btKey })
    .then(function (r) {
      if (r.error) {
        showToast(r.error.message, 'error');
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

      var msg = bt.name + ' placed!';
      if (data.labor_shortage) msg += ' (labor shortage — build housing!)';
      showToast(msg, data.labor_shortage ? 'info' : 'success');
      cancelPlacement();

      reloadMapData().then(function () {
        expandMapIfNeeded();
      });
    })
    .catch(function (err) {
      showToast(err.message || 'Placement failed', 'error');
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
    showToast('Not enough money', 'error');
    return;
  }
  if (affordable < tiles.length) {
    tiles = tiles.slice(0, affordable);
    showToast('Can only afford ' + affordable + ' road' + (affordable > 1 ? 's' : ''), 'info');
  }

  showToast('Placing ' + tiles.length + ' roads...', '');

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
    if (placed > 0) {
      showToast(placed + ' road' + (placed > 1 ? 's' : '') + ' placed!', 'success');
    }
    // Reload data but keep placement mode active for continued painting
    return reloadMapData();
  }).then(function () {
    expandMapIfNeeded();
  }).catch(function (err) {
    showToast(err.message || 'Some placements failed', 'error');
    reloadMapData();
  });
}

// ── Map expansion ──

// Guard: prevent concurrent expansion calls from racing
var expandInProgress = false;

export function expandMapIfNeeded() {
  if (expandInProgress) return;

  var expandLeft = false, expandRight = false, expandUp = false, expandDown = false;

  state.allBuildings.forEach(function (b) {
    if (b.x <= state.gridMinX + EXPAND_THRESHOLD) expandLeft = true;
    if (b.x >= state.gridMaxX - EXPAND_THRESHOLD) expandRight = true;
    if (b.y <= state.gridMinY + EXPAND_THRESHOLD) expandUp = true;
    if (b.y >= state.gridMaxY - EXPAND_THRESHOLD) expandDown = true;
  });

  if (!expandLeft && !expandRight && !expandUp && !expandDown) return;

  var newMinX = expandLeft ? state.gridMinX - EXPAND_AMOUNT : state.gridMinX;
  var newMaxX = expandRight ? state.gridMaxX + EXPAND_AMOUNT : state.gridMaxX;
  var newMinY = expandUp ? state.gridMinY - EXPAND_AMOUNT : state.gridMinY;
  var newMaxY = expandDown ? state.gridMaxY + EXPAND_AMOUNT : state.gridMaxY;

  var newTiles = [];
  for (var y = newMinY; y <= newMaxY; y++) {
    for (var x = newMinX; x <= newMaxX; x++) {
      if (state.tileMap[x + ',' + y]) continue;
      newTiles.push({
        x: x, y: y,
        terrain_type: 'ground',
        resource_node_key: null,
        buildable: true,
        occupied_building_id: null
      });
    }
  }

  if (newTiles.length === 0) return;

  expandInProgress = true;

  function addLocalFallbackTiles() {
    newTiles.forEach(function (t) {
      // Skip if tile was already added (e.g. by another player's expansion)
      if (state.tileMap[t.x + ',' + t.y]) return;
      t.id = 'local-' + t.x + '-' + t.y;
      // Mark local-only tiles as unbuildable — they have no server-side ID for RPC
      t.buildable = false;
      state.tiles.push(t);
      state.tileMap[t.x + ',' + t.y] = t;
    });
    computeGridBounds();
    renderMap();
  }

  sb.from('map_tiles').insert(newTiles).select('*').then(function (r) {
    expandInProgress = false;
    if (r.error) {
      console.warn('Map expansion DB insert failed:', r.error.message);
      addLocalFallbackTiles();
      return;
    }
    if (r.data) {
      r.data.forEach(function (t) {
        // Deduplicate: skip if already present (race with another client)
        if (state.tileMap[t.x + ',' + t.y]) return;
        state.tiles.push(t);
        state.tileMap[t.x + ',' + t.y] = t;
      });
    }
    computeGridBounds();
    renderMap();
    showToast('New land discovered!', 'info');
  }).catch(function (err) {
    expandInProgress = false;
    console.warn('Map expansion error:', err);
    addLocalFallbackTiles();
  });
}

// ── Events ──

export function initMapEvents() {
  var grid = document.getElementById('map-grid');
  var viewport = document.getElementById('map-viewport');

  // Single-click: inspect existing buildings OR place new ones
  grid.addEventListener('click', function (e) {
    if (Date.now() < pinchSuppressClickUntil) return;
    if (Date.now() < dragState.suppressClick) return;
    var cell = e.target.closest('.cell');
    if (!cell) return;
    // Roads use drag system exclusively; other build types still support tap/click placement.
    if (state.selectedBuildType && isSelectedBuildRoad()) return;

    var x = parseInt(cell.dataset.x);
    var y = parseInt(cell.dataset.y);

    // Always check for existing building first — tapping a building opens the inspector
    // even in placement mode. This makes inspect/demolish discoverable.
    var building = state.allBuildings.find(function (b) {
      return b.x === x && b.y === y;
    });
    if (building) {
      openInspector(building);
      return;
    }

    // Placement mode: try to place building on empty tile
    if (state.selectedBuildType) {
      var tileId = cell.dataset.tileId;
      if (!tileId) return;
      var tile = state.tileMap[x + ',' + y];
      if (!tile || !isPlacementValid(state.selectedBuildType, tile)) {
        showToast('Cannot place here', 'error');
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
      // Multi-touch: cancel any drag, let pinch zoom handle it
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
    pinchSuppressClickUntil = Date.now() + 300;
    executeDragPlacements();
  });

  // ── Cancel button ──
  document.getElementById('placement-cancel').addEventListener('click', cancelPlacement);

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

  // ── Pinch zoom ──
  viewport.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      if (dragState.active) clearDragState();
      pinchGestureActive = true;
      pinchStartDistance = touchDistance(e.touches);
      pinchStartZoom = state.mapZoom;
      pinchStartCenter = touchCenter(e.touches);
      pinchSuppressClickUntil = Date.now() + 400;
    }
  }, { passive: true });

  viewport.addEventListener('touchmove', function (e) {
    if (e.touches.length !== 2 || !pinchStartDistance) return;
    var nextDistance = touchDistance(e.touches);
    var center = touchCenter(e.touches) || pinchStartCenter;
    if (!nextDistance || !center) return;
    e.preventDefault();
    setMapZoomAtPoint(pinchStartZoom * (nextDistance / pinchStartDistance), center.x, center.y);
    pinchSuppressClickUntil = Date.now() + 400;
  }, { passive: false });

  viewport.addEventListener('touchend', function (e) {
    if (e.touches.length < 2) {
      pinchStartDistance = null;
      pinchStartZoom = state.mapZoom;
      pinchStartCenter = null;
      if (pinchGestureActive) pinchSuppressClickUntil = Date.now() + 250;
      pinchGestureActive = false;
    }
  });
}
