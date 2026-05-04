"""Tests for food-tile placement rules.

Food extractors must now be placed on a matching food tile:
  orchard      → orchard_grove
  fishing_pier → pond
  garden       → garden_plot
  grain_farm   → farmland

The trigger reject_build_on_resource lets the matching food extractor
through; everything else is still rejected on any resource tile. The
food tile is *not* consumed at placement — the resource_node_key stays
set under the building. clear_resource_tile additionally rejects tiles
that already have a building on top.

Cluster seeding adds 2 small clusters of the player's industry-matching
food tile per chunk in addition to the existing 4 ore clusters.
"""
import psycopg2
import pytest


FOOD_TILE_BY_INDUSTRY = {
    'timber': 'orchard_grove',
    'stone':  'pond',
    'clay':   'garden_plot',
    'iron':   'farmland',
}
FOOD_BUILDING_BY_INDUSTRY = {
    'timber': 'orchard',
    'stone':  'fishing_pier',
    'clay':   'garden',
    'iron':   'grain_farm',
}


def _stamp_food_tile(cur, x, y, key):
    cur.execute(
        "UPDATE public.map_tiles SET resource_node_key = %s WHERE x = %s AND y = %s",
        (key, x, y),
    )


def _clear_resource_at(cur, x, y):
    cur.execute(
        "UPDATE public.map_tiles SET resource_node_key = NULL WHERE x = %s AND y = %s",
        (x, y),
    )


# ── Schema sanity ──

def test_terrain_resources_present(cur):
    cur.execute("SELECT key FROM public.resources WHERE kind = 'terrain' ORDER BY key")
    assert [r[0] for r in cur.fetchall()] == ['farmland', 'garden_plot', 'orchard_grove', 'pond']


def test_food_extractors_have_placement_key(cur):
    cur.execute("""SELECT key, placement_resource_node_key FROM public.building_types
                   WHERE category = 'food_extractor' ORDER BY key""")
    rows = dict(cur.fetchall())
    assert rows['orchard']      == 'orchard_grove'
    assert rows['fishing_pier'] == 'pond'
    assert rows['garden']       == 'garden_plot'
    assert rows['grain_farm']   == 'farmland'


# ── Placement rules ──

@pytest.mark.parametrize("industry", ['timber', 'stone', 'clay', 'iron'])
def test_food_extractor_requires_matching_tile(industry, make_player, place, cur, clear_resources):
    """Placing a food extractor on plain ground must be rejected."""
    p = make_player(industry=industry)
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    bkey = FOOD_BUILDING_BY_INDUSTRY[industry]
    with pytest.raises(psycopg2.errors.RaiseException):
        place(bkey, hx + 1, hy + 2)


@pytest.mark.parametrize("industry", ['timber', 'stone', 'clay', 'iron'])
def test_food_extractor_succeeds_on_matching_tile(industry, make_player, place, cur, clear_resources):
    p = make_player(industry=industry)
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    fkey = FOOD_TILE_BY_INDUSTRY[industry]
    bkey = FOOD_BUILDING_BY_INDUSTRY[industry]
    _stamp_food_tile(cur, hx + 1, hy + 2, fkey)
    result = place(bkey, hx + 1, hy + 2)
    assert 'building_id' in result


def test_food_extractor_rejected_on_wrong_food_tile(make_player, place, cur, clear_resources):
    """An iron player's grain_farm cannot place on a pond, even though
    pond is also a food tile (industry-locking still applies, but more
    fundamentally the placement tile mismatch trigger fires too)."""
    # iron + farmland is the legitimate combo; trying to seed pond will
    # also fail the industry guard before the trigger, so we use timber's
    # orchard_grove vs an iron player's grain_farm to exercise the
    # placement_resource_node_key branch specifically. Set the tile to
    # 'farmland' and try a non-grain_farm food extractor — but the
    # industry guard would catch that first.
    #
    # Cleanest: same industry, wrong food tile via direct resource_node_key
    # stamp. timber player + 'pond' tile + orchard.
    p = make_player(industry='timber')
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'pond')
    with pytest.raises(psycopg2.errors.RaiseException):
        place('orchard', hx + 1, hy + 2)


def test_non_food_building_rejected_on_food_tile(make_player, place, cur, clear_resources):
    """A regular building (e.g., a road) must not be placeable on any
    resource tile, including food tiles."""
    p = make_player(industry='stone')
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'pond')
    with pytest.raises(psycopg2.errors.RaiseException):
        place('road', hx + 1, hy + 2)


def test_extractor_rejected_on_food_tile(make_player, place, cur, clear_resources):
    p = make_player(industry='stone')
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'pond')
    with pytest.raises(psycopg2.errors.RaiseException):
        place('stone_quarry', hx + 1, hy + 2)


# ── Tile is NOT consumed on placement ──

def test_food_tile_persists_under_building(make_player, place, cur, clear_resources):
    """After placing a food extractor on a food tile, the tile's
    resource_node_key remains set (so demolish reveals the tile again)."""
    p = make_player(industry='stone')
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'pond')
    place('fishing_pier', hx + 1, hy + 2)
    cur.execute("SELECT resource_node_key FROM public.map_tiles WHERE x = %s AND y = %s",
                (hx + 1, hy + 2))
    assert cur.fetchone()[0] == 'pond', 'food tile should not be consumed at placement'


# ── clear_resource_tile rules ──

def test_clear_resource_tile_blocked_when_occupied(make_player, place, cur, clear_resources):
    """Can't clear a food tile while a food extractor sits on it."""
    p = make_player(industry='stone')
    clear_resources(p['id'])
    cur.execute("UPDATE public.player_profiles SET money = 50000 WHERE id = %s", (str(p['id']),))
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'pond')
    place('fishing_pier', hx + 1, hy + 2)
    cur.execute("SELECT id FROM public.map_tiles WHERE x = %s AND y = %s", (hx + 1, hy + 2))
    tid = cur.fetchone()[0]
    with pytest.raises(psycopg2.errors.RaiseException):
        cur.execute("SELECT public.clear_resource_tile(%s)", (str(tid),))


def test_clear_resource_tile_works_on_empty_food_tile(make_player, cur, clear_resources):
    """Clearing an unoccupied food tile leaves plain grass."""
    p = make_player(industry='clay')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    _stamp_food_tile(cur, hx + 1, hy + 2, 'garden_plot')
    cur.execute("SELECT id FROM public.map_tiles WHERE x = %s AND y = %s", (hx + 1, hy + 2))
    tid = cur.fetchone()[0]
    cur.execute("SELECT public.clear_resource_tile(%s)", (str(tid),))
    cur.execute("SELECT resource_node_key FROM public.map_tiles WHERE id = %s", (str(tid),))
    assert cur.fetchone()[0] is None


# ── Cluster seeding ──

@pytest.mark.parametrize("industry", ['timber', 'stone', 'clay', 'iron'])
def test_chunk_allocation_seeds_food_clusters(industry, make_player, cur):
    """Each fresh chunk contains ≥1 food tile of the player's matching
    type. Cluster sizes are random, so we only assert a non-zero floor —
    unlikely the seeder produces zero across 2 clusters of 4-8 walks."""
    p = make_player(industry=industry)
    fkey = FOOD_TILE_BY_INDUSTRY[industry]
    cur.execute("""SELECT count(*) FROM public.map_tiles
                   WHERE owner_player_id = %s AND resource_node_key = %s""",
                (str(p['id']), fkey))
    n = cur.fetchone()[0]
    assert n >= 1, f'expected at least 1 {fkey} tile in a fresh {industry} chunk, got {n}'
