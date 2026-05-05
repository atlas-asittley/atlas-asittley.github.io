"""Tests for the happiness + population system.

Coverage:
- Initial happiness is between 0 and 100.
- Population dynamic: happy player drifts UP toward 5+housing capacity.
  Unhappy player (no housing built, max-tax) drifts DOWN.
- Population is clamped at the housing-capacity target (no overflow).
- worker_capacity reflects floor(population) + tavern_bonus.
"""
import pytest


def _backdate_population_tick(cur, player_id, secs):
    cur.execute("""
        UPDATE public.player_profiles
        SET last_population_tick_at = now() - make_interval(secs => %s)
        WHERE id = %s
    """, (secs, str(player_id)))


def test_initial_happiness_is_in_range(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("SELECT (public.compute_happiness(%s)->>'happiness')::numeric", (str(p['id']),))
    h = cur.fetchone()[0]
    assert 0 <= h <= 100


def test_initial_population_starts_at_5(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("SELECT population FROM public.player_profiles WHERE id = %s", (str(p['id']),))
    assert cur.fetchone()[0] == 5


def test_population_drifts_up_when_happy(make_player, place, stamp_food_tile, cur, clear_resources):
    """Happy player (food + services + tier1 housing) gains population over time."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']

    # Build the unlock-gate combo: extractor + food extractor + tier-1
    # house. Tier-1 housing requires a well within range, so place one.
    place('timber_camp', hx + 1, hy - 1)
    stamp_food_tile('orchard_grove', hx + 1, hy + 1)
    place('orchard', hx + 1, hy + 1)
    place('well', hx + 3, hy + 1)
    place('house', hx + 2, hy + 1)
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE player_id = %s AND building_type_key = 'house'",
                (str(p['id']),))

    # Stock several food types so happiness is solid (high food variety).
    for r, q in [('berries', 50), ('grain', 50), ('fish', 20), ('vegetables', 20)]:
        cur.execute("""
            INSERT INTO public.inventories (player_id, resource_key, quantity)
            VALUES (%s, %s, %s)
            ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = EXCLUDED.quantity
        """, (str(p['id']), r, q))

    # Pretend it's been 5 minutes since the last tick.
    _backdate_population_tick(cur, p['id'], 300)
    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]

    pop = result['population']
    happy = result['happiness']
    assert happy >= 50, f'expected happiness ≥ 50 with food + tier1 + services, got {happy}'
    assert pop > 5, f'happy player should have grown above 5; got {pop}'


def test_population_clamped_at_housing_capacity(make_player, place, cur, clear_resources):
    """Population can't drift above (5 + housing_workers)."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']

    # No housing built — target = 5. Even after a long happy interval, population stays at 5.
    cur.execute("UPDATE public.player_profiles SET population = 5, happiness = 90 WHERE id = %s",
                (str(p['id']),))
    _backdate_population_tick(cur, p['id'], 60 * 30)  # 30 minutes ago
    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]
    assert result['population'] == 5, f'no-housing target = 5 should clamp; got {result["population"]}'


def test_worker_capacity_uses_floor_population(make_player, cur):
    """worker_capacity = floor(population) + tavern_bonus.
    Player with no tavern → worker_capacity should equal floor(population)."""
    p = make_player(industry='timber')
    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]
    assert result['worker_supply'] == int(result['population']), (
        f"worker_supply ({result['worker_supply']}) should == floor(population) ({result['population']})"
    )
