// ── Supabase realtime subscription ──
import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast } from './ui.js';
import { renderMap } from './map.js';

export function subscribeRealtime() {
  if (state.channel) sb.removeChannel(state.channel);

  state.channel = sb.channel('city-realtime')
    .on('postgres_changes', {
      event: 'INSERT', schema: 'public', table: 'buildings'
    }, function (payload) {
      var newB = payload.new;
      if (newB.player_id === state.currentUser.id) return;

      sb.from('buildings')
        .select('*, player_profiles(display_name, color_hex)')
        .eq('id', newB.id)
        .maybeSingle()
        .then(function (r) {
          if (!r.data) return;
          state.allBuildings.push(r.data);
          var tile = state.tileMap[r.data.x + ',' + r.data.y];
          if (tile) tile.occupied_building_id = r.data.id;
          computeLaborAllocation();
          renderMap();
          var btName = state.buildingTypes[r.data.building_type_key]
            ? state.buildingTypes[r.data.building_type_key].name
            : r.data.building_type_key;
          var pName = r.data.player_profiles
            ? r.data.player_profiles.display_name
            : 'Someone';
          showToast(pName + ' built a ' + btName + '!', '');
        });
    })
    .on('postgres_changes', {
      event: 'DELETE', schema: 'public', table: 'buildings'
    }, function (payload) {
      var oldB = payload.old;
      if (!oldB || !oldB.id) return;
      // Skip if it's our own demolition (already handled locally)
      if (oldB.player_id === state.currentUser.id) return;

      // Remove from local state
      var removed = null;
      state.allBuildings = state.allBuildings.filter(function (b) {
        if (b.id === oldB.id) { removed = b; return false; }
        return true;
      });
      if (removed) {
        var tile = state.tileMap[removed.x + ',' + removed.y];
        if (tile) tile.occupied_building_id = null;
        computeLaborAllocation();
        renderMap();
      }
    })
    .subscribe();
}
