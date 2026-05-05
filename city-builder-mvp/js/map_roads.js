// ── Road tile autotile + placement-time connectivity helpers ──
//
// Extracted from map.js. Two responsibilities:
//   1. Render a road tile as an SVG given its 4 neighbor flags
//      (autotile across 16 NSEW variants).
//   2. Maintain a placement cache of "where the player's roads are"
//      so click + drag placement can validate connectivity in O(1).
//
// The walker module has its own road graph (`rebuildRoadSet` in walkers.js)
// for pathfinding — that's a separate concern and lives there.

import { state } from './state.js';

// ── Autotile SVGs for the 16 NSEW road variants ──
//
// Indexed by NSEW bitfield: (n?8:0) | (s?4:0) | (e?2:0) | (w?1:0).
// Each SVG renders grass background, shaped road surface, edge borders,
// directional wheel ruts, pebbles, and grass tufts.
var ROAD_TILE_SVGS = (function () {
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
    p.push('<rect x="' + L + '" y="' + L + '" width="' + RW + '" height="' + RW + '" fill="#6b5436"/>');
    if (n) p.push('<rect x="' + L + '" y="0" width="' + RW + '" height="' + L + '" fill="#6b5436"/>');
    if (s) p.push('<rect x="' + L + '" y="' + R + '" width="' + RW + '" height="' + (T - R) + '" fill="#6b5436"/>');
    if (e) p.push('<rect x="' + R + '" y="' + L + '" width="' + (T - R) + '" height="' + RW + '" fill="#6b5436"/>');
    if (w) p.push('<rect x="0" y="' + L + '" width="' + L + '" height="' + RW + '" fill="#6b5436"/>');
    if (n && w) p.push('<rect x="0" y="0" width="' + L + '" height="' + L + '" fill="#6b5436"/>');
    if (n && e) p.push('<rect x="' + R + '" y="0" width="' + (T - R) + '" height="' + L + '" fill="#6b5436"/>');
    if (s && w) p.push('<rect x="0" y="' + R + '" width="' + L + '" height="' + (T - R) + '" fill="#6b5436"/>');
    if (s && e) p.push('<rect x="' + R + '" y="' + R + '" width="' + (T - R) + '" height="' + (T - R) + '" fill="#6b5436"/>');

    // 3. Worn center track (lighter, narrower strip following road direction)
    var CL = 9, CR = 25, CW = CR - CL;
    p.push('<rect x="' + CL + '" y="' + CL + '" width="' + CW + '" height="' + CW + '" fill="#7a6848" opacity="0.22"/>');
    if (n) p.push('<rect x="' + CL + '" y="0" width="' + CW + '" height="' + CL + '" fill="#7a6848" opacity="0.22"/>');
    if (s) p.push('<rect x="' + CL + '" y="' + CR + '" width="' + CW + '" height="' + (T - CR) + '" fill="#7a6848" opacity="0.22"/>');
    if (e) p.push('<rect x="' + CR + '" y="' + CL + '" width="' + (T - CR) + '" height="' + CW + '" fill="#7a6848" opacity="0.22"/>');
    if (w) p.push('<rect x="0" y="' + CL + '" width="' + CL + '" height="' + CW + '" fill="#7a6848" opacity="0.22"/>');

    // 4. Grass-to-dirt transition strips (soften road edges)
    var ew = 2, tc = '#3a4830', to = '0.28';
    if (!n) p.push('<rect x="' + L + '" y="' + L + '" width="' + RW + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (!s) p.push('<rect x="' + L + '" y="' + (R - ew) + '" width="' + RW + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (!w) p.push('<rect x="' + L + '" y="' + L + '" width="' + ew + '" height="' + RW + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (!e) p.push('<rect x="' + (R - ew) + '" y="' + L + '" width="' + ew + '" height="' + RW + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (n && !w) p.push('<rect x="' + L + '" y="0" width="' + ew + '" height="' + L + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (n && !e) p.push('<rect x="' + (R - ew) + '" y="0" width="' + ew + '" height="' + L + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (s && !w) p.push('<rect x="' + L + '" y="' + R + '" width="' + ew + '" height="' + (T - R) + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (s && !e) p.push('<rect x="' + (R - ew) + '" y="' + R + '" width="' + ew + '" height="' + (T - R) + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (e && !n) p.push('<rect x="' + R + '" y="' + L + '" width="' + (T - R) + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (e && !s) p.push('<rect x="' + R + '" y="' + (R - ew) + '" width="' + (T - R) + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (w && !n) p.push('<rect x="0" y="' + L + '" width="' + L + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');
    if (w && !s) p.push('<rect x="0" y="' + (R - ew) + '" width="' + L + '" height="' + ew + '" fill="' + tc + '" opacity="' + to + '"/>');

    // 5. Edge border lines (dark, defines road boundary)
    var eg = '<g stroke="#3a2818" stroke-width="1" opacity="0.45">';
    if (!n) eg += '<line x1="' + L + '" y1="' + L + '" x2="' + R + '" y2="' + L + '"/>';
    if (!s) eg += '<line x1="' + L + '" y1="' + R + '" x2="' + R + '" y2="' + R + '"/>';
    if (!w) eg += '<line x1="' + L + '" y1="' + L + '" x2="' + L + '" y2="' + R + '"/>';
    if (!e) eg += '<line x1="' + R + '" y1="' + L + '" x2="' + R + '" y2="' + R + '"/>';
    if (n && !w) eg += '<line x1="' + L + '" y1="0" x2="' + L + '" y2="' + L + '"/>';
    if (n && !e) eg += '<line x1="' + R + '" y1="0" x2="' + R + '" y2="' + L + '"/>';
    if (s && !w) eg += '<line x1="' + L + '" y1="' + R + '" x2="' + L + '" y2="' + T + '"/>';
    if (s && !e) eg += '<line x1="' + R + '" y1="' + R + '" x2="' + R + '" y2="' + T + '"/>';
    if (e && !n) eg += '<line x1="' + R + '" y1="' + L + '" x2="' + T + '" y2="' + L + '"/>';
    if (e && !s) eg += '<line x1="' + R + '" y1="' + R + '" x2="' + T + '" y2="' + R + '"/>';
    if (w && !n) eg += '<line x1="0" y1="' + L + '" x2="' + L + '" y2="' + L + '"/>';
    if (w && !s) eg += '<line x1="0" y1="' + R + '" x2="' + L + '" y2="' + R + '"/>';
    eg += '</g>';
    p.push(eg);

    // 6. Inner highlight along edges (raised border effect)
    var hl = '<g stroke="#9a8a6a" stroke-width="0.5" opacity="0.18">';
    if (!n) hl += '<line x1="' + (L + 1) + '" y1="' + (L + 1) + '" x2="' + (R - 1) + '" y2="' + (L + 1) + '"/>';
    if (!s) hl += '<line x1="' + (L + 1) + '" y1="' + (R - 1) + '" x2="' + (R - 1) + '" y2="' + (R - 1) + '"/>';
    if (!w) hl += '<line x1="' + (L + 1) + '" y1="' + (L + 1) + '" x2="' + (L + 1) + '" y2="' + (R - 1) + '"/>';
    if (!e) hl += '<line x1="' + (R - 1) + '" y1="' + (L + 1) + '" x2="' + (R - 1) + '" y2="' + (R - 1) + '"/>';
    hl += '</g>';
    p.push(hl);

    // 7. Wheel ruts (directional wear marks)
    var r1 = 13, r2 = 21;
    var rg = '<g stroke="#523e28" stroke-width="0.9" opacity="0.18">';
    if (n || s) {
      var vy1 = n ? 0 : L, vy2 = s ? T : R;
      rg += '<line x1="' + r1 + '" y1="' + vy1 + '" x2="' + r1 + '" y2="' + vy2 + '"/>';
      rg += '<line x1="' + r2 + '" y1="' + vy1 + '" x2="' + r2 + '" y2="' + vy2 + '"/>';
    }
    if (e || w) {
      var hx1 = w ? 0 : L, hx2 = e ? T : R;
      rg += '<line x1="' + hx1 + '" y1="' + r1 + '" x2="' + hx2 + '" y2="' + r1 + '"/>';
      rg += '<line x1="' + hx1 + '" y1="' + r2 + '" x2="' + hx2 + '" y2="' + r2 + '"/>';
    }
    if (!n && !s && !e && !w) {
      rg += '<line x1="' + r1 + '" y1="' + L + '" x2="' + r1 + '" y2="' + R + '"/>';
      rg += '<line x1="' + r2 + '" y1="' + L + '" x2="' + r2 + '" y2="' + R + '"/>';
    }
    rg += '</g>';
    p.push(rg);

    // 8. Gravel scatter (small surface texture dots)
    var gx = [12, 18, 24, 10, 20, 15, 8, 26, 14, 22, 16, 11, 25, 9, 19, 23];
    var gy = [8, 14, 20, 24, 10, 28, 16, 12, 30, 6, 18, 26, 4, 22, 32, 2];
    var gg = '<g fill="#8a7a60" opacity="0.22">';
    for (var i = 0; i < 10; i++) {
      var gpx = gx[(i + key * 3) % 16], gpy = gy[(i + key * 5 + 3) % 16];
      if (onRoad(gpx, gpy, n, s, e, w)) gg += '<circle cx="' + gpx + '" cy="' + gpy + '" r="0.7"/>';
    }
    gg += '</g>';
    p.push(gg);

    // 9. Larger pebbles
    var pbx = [16, 22, 11, 25, 14, 20, 8, 27];
    var pby = [11, 23, 19, 15, 27, 7, 14, 21];
    var pg = '<g fill="#6a6050" opacity="0.28">';
    for (var j = 0; j < 3; j++) {
      var ppx = pbx[(j + key * 2) % 8], ppy = pby[(j + key * 3 + 1) % 8];
      if (onRoad(ppx, ppy, n, s, e, w)) pg += '<circle cx="' + ppx + '" cy="' + ppy + '" r="1.0"/>';
    }
    pg += '</g>';
    p.push(pg);

    // 10. Grass tufts at road edges (organic grass blades)
    var tg = '<g stroke="#2a5028" stroke-width="0.6" opacity="0.4">';
    if (!n) {
      tg += '<line x1="10" y1="' + L + '" x2="9" y2="' + (L - 3) + '"/>';
      tg += '<line x1="11" y1="' + L + '" x2="12" y2="' + (L - 3) + '"/>';
      tg += '<line x1="23" y1="' + L + '" x2="22" y2="' + (L - 4) + '"/>';
      tg += '<line x1="24" y1="' + L + '" x2="25" y2="' + (L - 3) + '"/>';
    }
    if (!s) {
      tg += '<line x1="12" y1="' + R + '" x2="11" y2="' + (R + 3) + '"/>';
      tg += '<line x1="13" y1="' + R + '" x2="14" y2="' + (R + 4) + '"/>';
      tg += '<line x1="21" y1="' + R + '" x2="20" y2="' + (R + 3) + '"/>';
      tg += '<line x1="22" y1="' + R + '" x2="23" y2="' + (R + 3) + '"/>';
    }
    if (!w) {
      tg += '<line x1="' + L + '" y1="10" x2="' + (L - 3) + '" y2="9"/>';
      tg += '<line x1="' + L + '" y1="11" x2="' + (L - 4) + '" y2="12"/>';
      tg += '<line x1="' + L + '" y1="22" x2="' + (L - 3) + '" y2="21"/>';
      tg += '<line x1="' + L + '" y1="23" x2="' + (L - 3) + '" y2="24"/>';
    }
    if (!e) {
      tg += '<line x1="' + R + '" y1="12" x2="' + (R + 3) + '" y2="11"/>';
      tg += '<line x1="' + R + '" y1="13" x2="' + (R + 4) + '" y2="14"/>';
      tg += '<line x1="' + R + '" y1="21" x2="' + (R + 3) + '" y2="20"/>';
      tg += '<line x1="' + R + '" y1="22" x2="' + (R + 3) + '" y2="23"/>';
    }
    if (n && !w) {
      tg += '<line x1="' + L + '" y1="2" x2="' + (L - 3) + '" y2="1"/>';
      tg += '<line x1="' + L + '" y1="3" x2="' + (L - 2) + '" y2="4"/>';
    }
    if (n && !e) {
      tg += '<line x1="' + R + '" y1="2" x2="' + (R + 3) + '" y2="1"/>';
      tg += '<line x1="' + R + '" y1="3" x2="' + (R + 2) + '" y2="4"/>';
    }
    if (s && !w) {
      tg += '<line x1="' + L + '" y1="32" x2="' + (L - 3) + '" y2="33"/>';
      tg += '<line x1="' + L + '" y1="31" x2="' + (L - 2) + '" y2="30"/>';
    }
    if (s && !e) {
      tg += '<line x1="' + R + '" y1="32" x2="' + (R + 3) + '" y2="33"/>';
      tg += '<line x1="' + R + '" y1="31" x2="' + (R + 2) + '" y2="30"/>';
    }
    if (e && !n) tg += '<line x1="32" y1="' + L + '" x2="33" y2="' + (L - 3) + '"/>';
    if (e && !s) tg += '<line x1="32" y1="' + R + '" x2="33" y2="' + (R + 3) + '"/>';
    if (w && !n) tg += '<line x1="2" y1="' + L + '" x2="1" y2="' + (L - 3) + '"/>';
    if (w && !s) tg += '<line x1="2" y1="' + R + '" x2="1" y2="' + (R + 3) + '"/>';
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

export function getRoadTileSVG(n, s, e, w) {
  return ROAD_TILE_SVGS[(n ? 8 : 0) | (s ? 4 : 0) | (e ? 2 : 0) | (w ? 1 : 0)];
}

// ── Placement-time road-connectivity cache ──
//
// O(1) lookup of "is there a road at (x,y)?" used during placement validation
// (click-to-place + drag-to-paint-roads). Repopulated from state.allBuildings
// each render via rebuildPlacementRoadSet.

var roadTileSet = {};

export function rebuildPlacementRoadSet() {
  roadTileSet = {};
  state.allBuildings.forEach(function (b) {
    var bt = state.buildingTypes[b.building_type_key];
    if (bt && bt.category === 'road' && b.status === 'active') {
      roadTileSet[b.x + ',' + b.y] = true;
    }
  });
}

export function isRoadPlacementConnected(tile, pendingSet) {
  if (!tile) return false;
  var x = tile.x, y = tile.y;
  if (roadTileSet[(x - 1) + ',' + y] || roadTileSet[(x + 1) + ',' + y]
    || roadTileSet[x + ',' + (y - 1)] || roadTileSet[x + ',' + (y + 1)]) {
    return true;
  }
  // Adjacent to pending drag road (mid-drag continuation).
  if (pendingSet) {
    return !!(pendingSet[(x - 1) + ',' + y]
      || pendingSet[(x + 1) + ',' + y]
      || pendingSet[x + ',' + (y - 1)]
      || pendingSet[x + ',' + (y + 1)]);
  }
  return false;
}

// ── Autotile neighbor flags for renderMap ──

function isRoadBuilding(building) {
  if (!building) return false;
  var bt = state.buildingTypes[building.building_type_key];
  return !!(bt && bt.category === 'road');
}

export function roadNeighborFlags(x, y, buildingAt) {
  return {
    n: isRoadBuilding(buildingAt[x + ',' + (y - 1)]),
    s: isRoadBuilding(buildingAt[x + ',' + (y + 1)]),
    e: isRoadBuilding(buildingAt[(x + 1) + ',' + y]),
    w: isRoadBuilding(buildingAt[(x - 1) + ',' + y])
  };
}
