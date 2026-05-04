"""Tests for district allocation and the spiral chunk allocator.

We don't wipe the live DB's existing data — the savepoint protects
against persistent changes, but the FK from buildings → map_tiles
prevents us from deleting tiles that have buildings on them. Instead,
we verify allocator BEHAVIOR: each new player gets a fresh chunk
that doesn't overlap with any existing one.
"""
import pytest
import psycopg2


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
    """Sequential signups never collide."""
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


def test_expand_district_costs_money(make_player, cur):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 10000 WHERE id = %s",
        (str(p['id']),),
    )
    cur.execute("SELECT public.expand_district()")
    result = cur.fetchone()[0]
    assert result['cost'] >= 500
    assert result['chunks_owned'] == 2
    cur.execute("SELECT money FROM public.player_profiles WHERE id = %s", (str(p['id']),))
    assert cur.fetchone()[0] == 10000 - result['cost']


def test_expand_district_cost_grows_quadratically(make_player, cur):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 1000000 WHERE id = %s",
        (str(p['id']),),
    )
    costs = []
    for _ in range(3):
        cur.execute("SELECT public.expand_district()")
        result = cur.fetchone()[0]
        costs.append(result['cost'])
    # Quadratic growth: chunks_owned at time of call is 1, 2, 3 → costs 500, 2000, 4500
    assert costs[1] > costs[0]
    assert costs[2] > costs[1]
    # Difference should grow (quadratic, not linear)
    assert (costs[2] - costs[1]) > (costs[1] - costs[0])


def test_expand_fails_when_too_poor(make_player, cur):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 0 WHERE id = %s",
        (str(p['id']),),
    )
    with pytest.raises(psycopg2.errors.RaiseException):
        cur.execute("SELECT public.expand_district()")


def test_resources_are_clustered_in_new_chunks(make_player, cur):
    """New chunks seed resources in blob/forest shapes via random walk, so
    most resource tiles should have at least one resource neighbor. A
    uniform 8% sprinkle would put that fraction near 28%; clustering
    pushes it well above 50%. We sample multiple chunks for a stable
    enough signal across random seeds."""
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 1000000 WHERE id = %s",
        (str(p['id']),),
    )
    for _ in range(3):
        cur.execute("SELECT public.expand_district()")

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
    assert total >= 30, f"too few resources sampled: {total}"
    pct = with_neighbor / total
    assert pct > 0.5, f"resources don't look clustered: only {pct:.0%} have a neighbor"


def test_expansion_chunk_is_owned_by_player(make_player, cur):
    p = make_player()
    cur.execute(
        "UPDATE public.player_profiles SET money = 10000 WHERE id = %s",
        (str(p['id']),),
    )
    cur.execute("SELECT public.expand_district()")
    result = cur.fetchone()[0]
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
