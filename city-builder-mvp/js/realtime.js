// ── Supabase realtime subscription ──
import { sb } from './config.js';
import { state } from './state.js';
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
    .subscribe();
}
