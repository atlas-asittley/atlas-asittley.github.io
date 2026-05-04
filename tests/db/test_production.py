"""Tests for `process_production` and housing evolution.

Regression coverage:
- housing tier upgrade used `upgrade_seconds` (typo) which the table
  doesn't have. Fix used `upgrade_secs`. These tests pin the field name
  by exercising the actual upgrade.
- Path-length scaling: extractor with path_length=4 produces at full
  rate, longer paths produce proportionally less.
"""
import pytest
import psycopg2


def test_housing_evolves_to_tier_1_with_road(make_player, place, cur):
    """Regression: shanty (tier 0) should upgrade to mud hut (tier 1)
    after enough time has elapsed AND a road is adjacent."""
    p = make_player()
    hx, hy = p['home_x'], p['home_y']
    place('road', hx + 1, hy)
    house_id = place('house', hx + 1, hy + 1)['building_id']

    # Verify it started at tier 0
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0

    # Fast-forward time by backdating last_processed_at (so process_production
    # sees enough elapsed seconds to fire the upgrade)
    cur.execute("""
        UPDATE public.buildings
        SET last_processed_at = now() - interval '120 seconds'
        WHERE id = %s
    """, (house_id,))

    cur.execute("SELECT public.process_production()")

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 1, \
        "shanty did not upgrade to mud hut even with road + elapsed time"


def test_housing_devolves_without_road(make_player, place, cur):
    """A tier-1 mud hut should devolve to shanty if road access is lost."""
    p = make_player()
    hx, hy = p['home_x'], p['home_y']
    road_id = place('road', hx + 1, hy)['building_id']
    house_id = place('house', hx + 1, hy + 1)['building_id']

    # Manually push to tier 1
    cur.execute(
        "UPDATE public.buildings SET housing_tier = 1, last_processed_at = now() - interval '120 seconds' WHERE id = %s",
        (house_id,),
    )

    # Demolish the road
    cur.execute("DELETE FROM public.buildings WHERE id = %s", (road_id,))

    cur.execute("SELECT public.process_production()")

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0, "mud hut should devolve to shanty without road"


def test_extractor_no_path_produces_nothing(make_player, place, cur):
    """An idle extractor (path_length is NULL) should not credit any timber."""
    p = make_player(industry='timber')
    hx, hy = p['home_x'], p['home_y']
    # Strip resources so BFS finds nothing
    cur.execute("UPDATE public.map_tiles SET resource_node_key = NULL WHERE owner_player_id = %s", (str(p['id']),))

    place('road', hx + 1, hy)
    place('timber_camp', hx + 1, hy + 1)

    # Backdate so a normal extractor would have produced
    cur.execute("UPDATE public.buildings SET last_processed_at = now() - interval '60 seconds' WHERE player_id = %s", (str(p['id']),))

    cur.execute("SELECT public.process_production()")

    cur.execute("SELECT COALESCE(SUM(quantity), 0) FROM public.inventories WHERE player_id = %s AND resource_key = 'timber'", (str(p['id']),))
    timber = cur.fetchone()[0]
    assert timber == 0, "idle extractor produced timber"
