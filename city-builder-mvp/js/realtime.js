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
    // UPDATE on buildings — primarily so other players' housing
    // tier changes (devolves, upgrades) propagate without needing
    // a full tick refetch. Server-side INSERT events already push
    // for new placements, DELETE for demolish. UPDATE was missing —
    // the client's state.allBuildings would go stale until ITS
    // OWN tick had an evolution event, leaving the inspector
    // showing wrong tiers + missing last_devolve_reason for other
    // players' houses. Atlas 2026-05-11 spotted Jill's manor
    // devolves with this exact gap.
    .on('postgres_changes', {
      event: 'UPDATE', schema: 'public', table: 'buildings'
    }, function (payload) {
      var newB = payload.new;
      if (!newB || !newB.id) return;
      // Skip OUR own UPDATEs — they're handled by the action that
      // caused them (upgrade_house RPC handler, etc.) and a
      // duplicate refetch would just clobber in-flight state.
      if (newB.player_id === state.currentUser.id) return;

      // Compare against the local copy to decide whether the change
      // affects rendering. Cron ticks update last_processed_at on
      // EVERY building every minute — hundreds of events per minute
      // for a multiplayer city — and re-rendering the whole grid on
      // each one causes layout thrash heavy enough to make the
      // Android nav bar flicker (Atlas 2026-05-11). Patch state
      // always, but only renderMap when something visually changed.
      var idx = -1;
      for (var i = 0; i < state.allBuildings.length; i++) {
        if (state.allBuildings[i].id === newB.id) { idx = i; break; }
      }
      if (idx === -1) return;
      var oldB = state.allBuildings[idx];
      var visuallyChanged = (
        oldB.housing_tier !== newB.housing_tier ||
        oldB.status !== newB.status ||
        oldB.expansion_level !== newB.expansion_level ||
        (!!oldB.evolution_eligible_at) !== (!!newB.evolution_eligible_at) ||
        oldB.is_staffed !== newB.is_staffed
      );

      // Preserve the joined player_profiles relation (the realtime
      // payload doesn't include the JOIN).
      var pp = oldB.player_profiles;
      state.allBuildings[idx] = newB;
      state.allBuildings[idx].player_profiles = pp;

      if (visuallyChanged) renderMap();
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
