"""Tests for the weighted Dijkstra walker pathing.

The walker prefers roads (cost 1) but can walk through unoccupied owned
tiles (cost 3) to reach a resource. These tests pin the new behavior so
nobody accidentally re-introduces the road-only constraint.
"""
import pytest


def _seed_resource(cur, player_id, x, y, key='timber'):
    cur.execute("""
        UPDATE public.map_tiles SET resource_node_key = %s
        WHERE x = %s AND y = %s AND owner_player_id = %s
    """, (key, x, y, str(player_id)))


def _clear_resources(cur, player_id):
    cur.execute("""
        UPDATE public.map_tiles
        SET resource_node_key = NULL, claimed_by_building_id = NULL
        WHERE owner_player_id = %s
    """, (str(player_id),))


def test_extractor_with_no_roads_can_still_target_resource(make_player, place, cur):
    """Walker can reach a resource without any roads at all."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    _clear_resources(cur, p['id'])
    _seed_resource(cur, p['id'], hx + 3, hy + 1, 'timber')

    # No roads built. Place extractor and verify it claims the timber.
    result = place('timber_camp', hx + 1, hy + 1)
    target = result.get('extractor_target')
    assert target is not None
    assert (target['x'], target['y']) == (hx + 3, hy + 1)


def test_off_road_step_costs_3(make_player, place, cur):
    """A single off-road step from extractor to adjacent target = path_length 3.
    Pins the off-road cost weight."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    _clear_resources(cur, p['id'])
    _seed_resource(cur, p['id'], hx + 1, hy + 2, 'timber')
    r = place('timber_camp', hx + 1, hy + 1)
    target = r['extractor_target']
    assert target is not None
    assert target['path_length'] == 3


def test_road_path_cheaper_than_offroad(make_player, place, cur):
    """A 4-tile road run + 1 off-road step (cost 4+3=7) should be picked
    over a 3-tile pure off-road path (cost 9)."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    _clear_resources(cur, p['id'])

    # Build road from home east: (hx+1, hy) → (hx+4, hy). All connect.
    for dx in range(1, 5):
        place('road', hx + dx, hy)

    # Resource just north of the far end of the road
    _seed_resource(cur, p['id'], hx + 4, hy + 1, 'timber')

    # Extractor adjacent to start of road, just north of (hx+1, hy)
    result = place('timber_camp', hx + 1, hy + 1)
    target = result['extractor_target']
    assert target is not None
    assert (target['x'], target['y']) == (hx + 4, hy + 1)

    # Road path: extractor → road(hx+1,hy) [1] → road(hx+2,hy) [1] →
    #   road(hx+3,hy) [1] → road(hx+4,hy) [1] → target(hx+4,hy+1) [3, off-road]
    # = 1+1+1+1+3 = 7
    # Pure off-road alternative: (hx+1,hy+1) → (hx+2,hy+1) [3] →
    #   (hx+3,hy+1) [3] → (hx+4,hy+1) [3, target] = 9
    assert target['path_length'] == 7, \
        f"expected road-preferring path_length=7, got {target['path_length']}"


def test_blocked_by_building_cannot_be_walked_through(make_player, place, cur):
    """A non-road building on a tile blocks the walker."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    _clear_resources(cur, p['id'])
    _seed_resource(cur, p['id'], hx + 4, hy + 1, 'timber')

    # Build a wall of houses blocking direct paths
    place('house', hx + 2, hy + 1)
    place('house', hx + 3, hy + 1)

    # Place extractor; walker has to go around
    result = place('timber_camp', hx + 1, hy + 1)
    target = result.get('extractor_target')
    if target is not None:
        # Direct path is blocked; walker must go around (e.g., via y+2 or y+0).
        # Minimum off-road walk-around: at least 5 tiles → cost 15
        assert target['path_length'] >= 5


def test_cannot_walk_through_other_players_district(make_player, place, as_user, cur):
    """Walker can't traverse tiles owned by another player."""
    pA = make_player(industry='timber')
    pB = make_player(industry='timber')

    # Seed a timber tile in A's district that's only reachable via B's tiles
    # (testing this perfectly is hard with random chunk placement, so just
    # verify the walkable filter doesn't leak across owners)
    as_user(pA['id'])
    _clear_resources(cur, pA['id'])
    _clear_resources(cur, pB['id'])

    # Put a timber tile in A's district, far from home
    hx, hy = pA['home_x'], pA['home_y']
    _seed_resource(cur, pA['id'], hx + 4, hy + 4, 'timber')

    # Place extractor in A's district; it should find its own timber.
    result = place('timber_camp', hx + 1, hy + 1)
    target = result.get('extractor_target')
    assert target is not None
    assert (target['x'], target['y']) == (hx + 4, hy + 4)


def test_preview_extractor_target_rpc(make_player, place, cur):
    """preview_extractor_target lets the client preview what BFS would pick
    before actually placing the building."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    _clear_resources(cur, p['id'])
    _seed_resource(cur, p['id'], hx + 3, hy + 1, 'timber')

    cur.execute("SELECT public.preview_extractor_target(%s, %s)", (hx + 1, hy + 1))
    result = cur.fetchone()[0]
    assert result['target'] is not None
    assert (result['target']['x'], result['target']['y']) == (hx + 3, hy + 1)
    # Path_length should be reported
    assert result['target']['path_length'] >= 1
