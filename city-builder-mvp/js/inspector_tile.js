// ── Resource Tile Inspector ──
// Opens the same inspector panel chrome but with resource-role text
// and a Demolish button that clears the tile (calls clear_resource_tile
// on the server). Used when the player taps an unbuilt resource tile.

import { sb } from './config.js';
import { fetchAllPaged } from './paginate.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast } from './ui.js';
import { renderMap } from './map.js';
import { renderBuildPanel } from './panels.js';
import { closeInspector, getInspectedTile } from './inspector_core.js';
import {
  resName,
  isTerrainResource,
  findExtractorFor,
  findProcessorConsuming,
  findBuilderRequiringTile
} from './inspector_helpers.js';

export function renderResourceInspector() {
  var inspectedTile = getInspectedTile();
  if (!inspectedTile) return;
  var titleEl = document.getElementById('inspector-title');
  var bodyEl = document.getElementById('inspector-body');
  var actionsEl = document.getElementById('inspector-actions');
  var rkey = inspectedTile.resource_node_key;
  var rName = resName(rkey);
  var isTerrain = isTerrainResource(rkey);
  var ext = findExtractorFor(rkey);
  var proc = findProcessorConsuming(rkey);
  var builder = findBuilderRequiringTile(rkey);

  titleEl.textContent = isTerrain ? rName : rName + ' deposit';

  var rows = '';
  rows += '<div class="insp-row"><span class="insp-label">' + (isTerrain ? 'Terrain' : 'Resource') + '</span><span class="insp-value">' + rName + '</span></div>';
  if (builder) {
    rows += '<div class="insp-row"><span class="insp-label">Build here</span><span class="insp-value">' + builder.name + ' → ' + resName(builder.output_resource_key) + '</span></div>';
  }
  if (ext) {
    rows += '<div class="insp-row"><span class="insp-label">Harvested by</span><span class="insp-value">' + ext.name + '</span></div>';
  }
  if (proc) {
    rows += '<div class="insp-row"><span class="insp-label">Processed by</span><span class="insp-value">' + proc.name + ' → ' + resName(proc.output_resource_key) + '</span></div>';
    var proc2 = findProcessorConsuming(proc.output_resource_key);
    if (proc2) {
      rows += '<div class="insp-row"><span class="insp-label">Then</span><span class="insp-value">' + proc2.name + ' → ' + resName(proc2.output_resource_key) + '</span></div>';
    }
  }
  bodyEl.innerHTML = rows;

  // Block demolition while an extractor still claims this tile —
  // matches the server-side rule in clear_resource_tile.
  var claimed = !!inspectedTile.claimed_by_building_id;
  var actHtml = '<div class="demolish-info">';
  if (claimed) {
    actHtml += '<span class="demolish-warning">An extractor is targeting this tile — demolish that first.</span>';
  } else {
    actHtml += '<span class="demolish-refund">' + (isTerrain ? 'Removes the terrain so you can build anything here.' : 'Removes the deposit so you can build here.') + '</span>';
  }
  actHtml += '</div>';
  actHtml += '<button class="btn-demolish' + (claimed ? ' btn-demolish-disabled' : '') + '" id="btn-demolish-tile"' + (claimed ? ' disabled' : '') + '>Demolish</button>';
  actionsEl.innerHTML = actHtml;

  if (!claimed) {
    document.getElementById('btn-demolish-tile').addEventListener('click', demolishInspectedTile);
  }
}

function demolishInspectedTile() {
  var inspectedTile = getInspectedTile();
  if (!inspectedTile) return;
  var btn = document.getElementById('btn-demolish-tile');
  if (btn) { btn.disabled = true; btn.textContent = 'Demolishing…'; }
  var label = resName(inspectedTile.resource_node_key);
  sb.rpc('clear_resource_tile', { p_tile_id: inspectedTile.id }).then(function (r) {
    if (r.error) {
      alert('Cannot clear: ' + r.error.message);
      if (btn) { btn.disabled = false; btn.textContent = 'Demolish'; }
      return;
    }
    showToast(label + ' cleared', 'success');
    closeInspector();
    return reloadAfterTileChange();
  }).catch(function (err) {
    alert('Clear failed: ' + (err.message || err));
    if (btn) { btn.disabled = false; btn.textContent = 'Demolish'; }
  });
}

// Reload tiles + buildings after a tile-level change. Kept local to
// the tile inspector so the inspector module doesn't pull in map.js's
// whole reloadMapData export.
function reloadAfterTileChange() {
  return Promise.all([
    fetchAllPaged(function () { return sb.from('buildings').select('*, player_profiles(display_name, color_hex)').order('id'); }),
    fetchAllPaged(function () { return sb.from('map_tiles').select('*').order('y', { ascending: true }).order('x', { ascending: true }); })
  ]).then(function (results) {
    state.allBuildings = results[0].data || [];
    state.tiles = results[1].data || [];
    state.tileMap = {};
    state.tiles.forEach(function (t) { state.tileMap[t.x + ',' + t.y] = t; });
    computeLaborAllocation();
    renderMap();
    renderBuildPanel();
  });
}
