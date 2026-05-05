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


def test_population_snaps_up_to_housing_capacity(make_player, place, stamp_food_tile, cur, clear_resources):
    """When housing capacity exceeds current population, citizens fill
    the empty homes immediately on the next tick. Happiness is purely
    an emigration force in the asymmetric model — immigration is
    independent of it."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']

    # Tier-1 housing requires a well within range. Tier-1 = 6 workers,
    # so target population becomes 5 (base) + 6 = 11.
    place('timber_camp', hx + 1, hy - 1)
    stamp_food_tile('orchard_grove', hx + 1, hy + 1)
    place('orchard', hx + 1, hy + 1)
    place('well', hx + 3, hy + 1)
    place('house', hx + 2, hy + 1)
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE player_id = %s AND building_type_key = 'house'",
                (str(p['id']),))

    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]
    assert result['population'] == 11, (
        f"population should snap from 5 → housing-capacity 11 in one tick; "
        f"got {result['population']}"
    )


def test_population_clamps_down_when_above_target(make_player, cur, clear_resources):
    """If population is somehow above the housing-capacity target (e.g.
    housing devolved or was demolished), the next tick clamps it back
    down to target. Verifies the LEAST(target, ...) branch."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    # No housing → target = 5. Force population artificially high.
    # last_population_tick_at = now so no emigration drift this call.
    cur.execute("""
        UPDATE public.player_profiles
        SET population = 20, last_population_tick_at = now()
        WHERE id = %s
    """, (str(p['id']),))
    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]
    assert result['population'] == 5, (
        f"pop above no-housing target (5) should clamp; got {result['population']}"
    )


def test_happiness_staffing_ratio_uses_capacity_vs_need(make_player, place, stamp_food_tile, cur, clear_resources):
    """Regression for the staffing-ratio computation in compute_happiness:
    earlier versions overwrote v_staffed and ended up measuring road
    connectivity, not staffing health. The contribution should track
    worker_capacity / workers_needed instead."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']

    # No worker buildings yet → v_workers_needed=0 → staffing ratio = 1.0 → +20.
    cur.execute("SELECT public.compute_happiness(%s)", (str(p['id']),))
    base_breakdown = cur.fetchone()[0]['breakdown']
    assert base_breakdown['workers_needed'] == 0
    assert base_breakdown['staffing_ratio'] == 1.0

    # Place an extractor + food extractor (both have worker_cost > 0).
    place('timber_camp', hx + 1, hy - 1)
    stamp_food_tile('orchard_grove', hx + 1, hy + 1)
    place('orchard', hx + 1, hy + 1)
    cur.execute("SELECT public.compute_happiness(%s)", (str(p['id']),))
    bk = cur.fetchone()[0]['breakdown']
    assert bk['workers_needed'] > 0
    # Default starting capacity is 5 (population floor); workers_needed
    # for two extractors is 20 (2 × 10). Ratio should be 5/20 = 0.25.
    expected = bk['worker_capacity'] / bk['workers_needed']
    assert abs(float(bk['staffing_ratio']) - min(1.0, expected)) < 0.01, (
        f"staffing_ratio={bk['staffing_ratio']} expected≈{expected}"
    )


def test_worker_capacity_uses_floor_population(make_player, cur):
    """worker_capacity = floor(population) + tavern_bonus.
    Player with no tavern → worker_capacity should equal floor(population)."""
    p = make_player(industry='timber')
    cur.execute("SELECT public.process_production()")
    result = cur.fetchone()[0]
    assert result['worker_supply'] == int(result['population']), (
        f"worker_supply ({result['worker_supply']}) should == floor(population) ({result['population']})"
    )
