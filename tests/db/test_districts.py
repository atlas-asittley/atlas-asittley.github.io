"""Tests for district allocation: row-based starters + player-picked expansion.

Layout rules under test:
  * Each player reserves one row at signup; starter chunk is at (0, row).
  * Expansion candidates = orthogonally-adjacent unowned chunks, excluding
    other players' reserved rows.
  * expand_district takes the chosen chunk and validates it's a candidate.

We don't wipe the live DB's existing data — savepoint isolates each test,
and the FK from buildings → map_tiles prevents wholesale tile delete. Tests
verify allocator BEHAVIOR: each new player gets a fresh chunk that doesn't
overlap with any existing one, and expansions land where the player picks.
"""
import pytest
import psycopg2


def _expand_pick_first(cur):
    """Helper: fetch the first expansion candidate for the auth'd player and
    call expand_district on it. Returns the RPC's JSON result."""
    cur.execute("SELECT chunk_x, chunk_y FROM public.expansion_candidates(auth.uid()) LIMIT 1")
    row = cur.fetchone()
    assert row is not None, "no expansion candidates available"
    cx, cy = row
    cur.execute("SELECT public.expand_district(%s, %s)", (cx, cy))
    return cur.fetchone()[0]


def test_new_player_gets_unique_chunk(make_player, cur):
    """Each new player's chunk shouldn't collide with any existing one."""
    cur.execute("SELECT chunk_x, chunk_y FROM public.district_chunks")
    existing = set((r[0], r[1]) for r in cur.fetchall())

    p = make_player()
    cur.execute(
        "SELECT chunk_x, chunk_y FROM public.district_chunks WHERE owner_player_id = %s",
        (str(p['id']),)
    )
    new_chunks = set((r[0], r[1]) for r in cur.fetchall())

    assert len(new_chunks) == 1, "first chunk should be exactly one slot"
    assert new_chunks.isdisjoint(existing), "new chunk overlaps with existing"


def test_two_new_players_get_different_chunks(make_player, cur):
    """Sequential signups never collide. With row-based starters, each
    new player goes to the next free row going down."""
    p1 = make_player()
    p2 = make_player()

    cur.execute(
        "SELECT chunk_x, chunk_y FROM public.district_chunks WHERE owner_player_id = %s",
        (str(p1['id']),)
    )
    c1 = set((r[0], r[1]) for r in cur.fetchall())
    cur.execute(
        "SELECT chunk_x, chunk_y FROM public.district_chunks WHERE owner_player_id = %s",
        (str(p2['id']),)
    )
    c2 = set((r[0], r[1]) for r in cur.fetchall())

    assert c1.isdisjoint(c2), "two players were given the same chunk"


def test_new_player_starter_at_column_zero(make_player, cur):
    """Starters always land at chunk_x = 0 in their reserved row."""
    p = make_player()
    cur.execute(
        "SELECT chunk_x FROM public.district_chunks WHERE owner_player_id = %s",
        (str(p['id']),)
    )
    cx = cur.fetchone()[0]
    assert cx == 0, f"starter should be at column 0, got {cx}"


def test_new_player_reserves_a_row(make_player, cur):
    """Each player has a reserved_row set after signup."""
    p = make_player()
    cur.execute("SELECT reserved_row FROM public.player_profiles WHERE id = %s", (str(p['id']),))
    row = cur.fetchone()[0]
    assert row is not None, "reserved_row should be set"


def test_two_new_players_get_different_reserved_rows(make_player, cur):
    p1 = make_player()
    p2 = make_player()
    cur.execute("SELECT reserved_row FROM public.player_profiles WHERE id IN (%s, %s)",
                (str(p1['id']), str(p2['id'])))
    rows = [r[0] for r in cur.fetchall()]
    assert rows[0] != rows[1], "two players should reserve distinct rows"


def test_expansion_candidates_includes_own_row_edges(make_player, cur, as_user):
    """A player can always expand left or right within their reserved row,
    so the candidate set is never empty."""
    p = make_player()
    as_user(p['id'])
    cur.execute("SELECT chunk_x, chunk_y FROM public.expansion_candidates(%s)", (str(p['id']),))
    cands = [(r[0], r[1]) for r in cur.fetchall()]
    row = next(r[1] for r in cands if r[1] is not None) if cands else None
    # Starter is at (0, row). Both (1, row) and (-1, row) should be candidates.
    cur.execute("SELECT reserved_row FROM public.player_profiles WHERE id = %s", (str(p['id']),))
    pr = cur.fetchone()[0]
    assert (1, pr) in cands, f"missing right-edge candidate: cands={cands}"
    assert (-1, pr) in cands, f"missing left-edge candidate: cands={cands}"


def test_expansion_candidates_excludes_other_players_reserved_rows(make_player, cur, as_user):
    """A player cannot claim chunks in someone else's reserved row."""
    p1 = make_player()
    p2 = make_player()
    cur.execute("SELECT reserved_row FROM public.player_profiles WHERE id = %s", (str(p2['id']),))
    p2_row = cur.fetchone()[0]
    as_user(p1['id'])
    cur.execute("SELECT chunk_x, chunk_y FROM public.expansion_candidates(%s)", (str(p1['id']),))
    cands = [(r[0], r[1]) for r in cur.fetchall()]
    for cx, cy in cands:
        assert cy != p2_row, f"candidate {(cx, cy)} is in p2's reserved row {p2_row}"


def test_expand_district_costs_money(make_player, cur, as_user):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 10000 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    result = _expand_pick_first(cur)
    assert result['cost'] >= 500
    assert result['chunks_owned'] == 2
    cur.execute("SELECT money FROM public.player_profiles WHERE id = %s", (str(p['id']),))
    assert cur.fetchone()[0] == 10000 - result['cost']


def test_expand_district_cost_grows_quadratically(make_player, cur, as_user):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 1000000 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    costs = []
    for _ in range(3):
        result = _expand_pick_first(cur)
        costs.append(result['cost'])
    assert costs[1] > costs[0]
    assert costs[2] > costs[1]
    assert (costs[2] - costs[1]) > (costs[1] - costs[0])


def test_expand_fails_when_too_poor(make_player, cur, as_user):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 0 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    cur.execute("SELECT chunk_x, chunk_y FROM public.expansion_candidates(%s) LIMIT 1", (str(p['id']),))
    cx, cy = cur.fetchone()
    with pytest.raises(psycopg2.errors.RaiseException):
        cur.execute("SELECT public.expand_district(%s, %s)", (cx, cy))


def test_expand_rejects_non_candidate_chunk(make_player, cur, as_user):
    """Trying to claim a chunk that isn't an adjacent candidate must fail."""
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 1000000 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    # A chunk far from the player's district is not a valid candidate.
    with pytest.raises(psycopg2.errors.RaiseException):
        cur.execute("SELECT public.expand_district(%s, %s)", (50, 50))


def test_resources_are_clustered_in_new_chunks(make_player, cur, as_user):
    """New chunks seed resources in blob/forest shapes via random walk, so
    most resource tiles should have at least one resource neighbor. A
    uniform 8% sprinkle would put that fraction near 28%; clustering
    pushes it well above 50%."""
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 1000000 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    for _ in range(3):
        _expand_pick_first(cur)

    cur.execute("""
        WITH res AS (
          SELECT x, y FROM public.map_tiles
          WHERE owner_player_id = %s AND resource_node_key IS NOT NULL
        )
        SELECT
          (SELECT count(*) FROM res) AS total,
          (SELECT count(*) FROM res a
            WHERE EXISTS (
              SELECT 1 FROM res b
              WHERE (b.x = a.x+1 AND b.y = a.y)
                 OR (b.x = a.x-1 AND b.y = a.y)
                 OR (b.x = a.x   AND b.y = a.y+1)
                 OR (b.x = a.x   AND b.y = a.y-1)
            )) AS with_neighbor
    """, (str(p['id']),))
    total, with_neighbor = cur.fetchone()
    # Post-scarcity-pass: starter chunk has 2 industry + 1 food cluster,
    # subsequent chunks have 1 + 1. Across 4 chunks the typical sample
    # is in the high teens to mid-20s — enough for the cluster ratio
    # below to be meaningful.
    assert total >= 15, f"too few resources sampled: {total}"
    pct = with_neighbor / total
    assert pct > 0.5, f"resources don't look clustered: only {pct:.0%} have a neighbor"


def test_expansion_chunk_is_owned_by_player(make_player, cur, as_user):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 10000 WHERE id = %s",
        (str(p['id']),),
    )
    as_user(p['id'])
    result = _expand_pick_first(cur)
    cx, cy = result['chunk_x'], result['chunk_y']

    cur.execute(
        "SELECT owner_player_id FROM public.district_chunks WHERE chunk_x = %s AND chunk_y = %s",
        (cx, cy)
    )
    assert str(cur.fetchone()[0]) == str(p['id'])

    # Tiles in that chunk should also be owned by the player
    cur.execute("""
        SELECT COUNT(*) FROM public.map_tiles
        WHERE owner_player_id = %s
          AND x BETWEEN %s AND %s
          AND y BETWEEN %s AND %s
    """, (str(p['id']), cx * 15, cx * 15 + 14, cy * 15, cy * 15 + 14))
    assert cur.fetchone()[0] == 225, "expansion chunk should have 225 owned tiles"
