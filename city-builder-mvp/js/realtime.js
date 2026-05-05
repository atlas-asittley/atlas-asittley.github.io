// ── Supabase realtime subscription ──
import { sb } from './config.js';
import { state, computeLaborAllocation } from './state.js';
import { showToast } from './ui.js';
import { renderMap } from './map.js';
import { onTradeOfferChange } from './players.js';

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
          // Mark every footprint tile as occupied. For 1x1 buildings
          // this is just the anchor; for 2x2 buildings (school / temple
          // / tax_man) all four tiles need to know they're part of the
          // building so renderMap renders them as multi-tile-interior
          // and the anchor's .bldg.footprint-2x2 visually covers them.
          var bt = state.buildingTypes[r.data.building_type_key];
          var fw = (bt && bt.footprint_w) || 1;
          var fh = (bt && bt.footprint_h) || 1;
          for (var dx = 0; dx < fw; dx++) {
            for (var dy = 0; dy < fh; dy++) {
              var t = state.tileMap[(r.data.x + dx) + ',' + (r.data.y + dy)];
              if (t) t.occupied_building_id = r.data.id;
            }
          }
          computeLaborAllocation();
          renderMap();
          var btName = bt ? bt.name : r.data.building_type_key;
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
        // Clear every footprint tile, not just the anchor.
        var bt = state.buildingTypes[removed.building_type_key];
        var fw = (bt && bt.footprint_w) || 1;
        var fh = (bt && bt.footprint_h) || 1;
        for (var dx = 0; dx < fw; dx++) {
          for (var dy = 0; dy < fh; dy++) {
            var t = state.tileMap[(removed.x + dx) + ',' + (removed.y + dy)];
            if (t) t.occupied_building_id = null;
          }
        }
        computeLaborAllocation();
        renderMap();
      }
    })
    .on('postgres_changes', {
      event: '*', schema: 'public', table: 'player_trade_offers'
    }, function (payload) {
      var row = payload.new || payload.old;
      if (!row) return;
      // Only react to offers we're a party to.
      if (row.from_player_id !== state.currentUser.id
          && row.to_player_id !== state.currentUser.id) return;
      onTradeOfferChange();
    })
    .subscribe();
}
