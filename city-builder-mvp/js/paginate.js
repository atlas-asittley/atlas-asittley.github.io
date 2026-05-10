// Paginated fetcher that loops over Supabase's server-side
// `db-max-rows=1000` cap. Any client `.range(0, big)` is silently
// trimmed to the first 1000 rows, so we instead loop in 1000-row
// chunks until a short page comes back.
//
// Use any time the query targets a player-shared or growing table
// (map_tiles, buildings, trade_transactions, player_trade_offers).
// Per-player filtered queries with bounded row counts (e.g. inventories
// for one player) don't need this.
//
// Pass a *factory* function that builds a fresh query each call —
// PostgREST builders accumulate state, so reusing one is unsafe.
//
//     fetchAllPaged(function () {
//       return sb.from('map_tiles').select('*').order('y');
//     }).then(function (r) { /* r.data has all rows */ });

export function fetchAllPaged(buildQuery, pageSize) {
  pageSize = pageSize || 1000;
  var rows = [];
  function nextPage(start) {
    return buildQuery().range(start, start + pageSize - 1).then(function (r) {
      if (r.error) throw r.error;
      var batch = r.data || [];
      rows = rows.concat(batch);
      if (batch.length < pageSize) return { data: rows, error: null };
      return nextPage(start + pageSize);
    });
  }
  return nextPage(0);
}
