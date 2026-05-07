"""Tests for the desirability v2 housing tier gate.

These tests explicitly RESET the `city.skip_desirability_gate` GUC
that conftest sets at session scope, so the gate is active for them.
Verifies:
  - upgrade is blocked when desirability is below the next tier's threshold
  - upgrade succeeds when desirability meets the threshold
  - devolve fires when desirability drops far below current tier's
    threshold (cur_tier.min_desirability − 30)
  - existing housing on borderline-low desirability is NOT immediately
    devolved (the wide hysteresis is the safeguard)
"""
import pytest


def _enable_gate(cur):
    cur.execute("RESET \"city.skip_desirability_gate\"")


def _backdate_house(cur, player_id, house_id, secs):
    cur.execute("""UPDATE public.buildings
                   SET last_processed_at = now() - make_interval(secs => %s)
                   WHERE id = %s""", (secs, str(house_id)))


def _stamp_desirability(cur, player_id, value):
    """Stamp every owned tile to the given desirability and disable the
    auto-recompute for THIS PLAYER by adding a signal that
    _pp_update_desirability respects... actually simpler: just stamp,
    accept that process_production will recompute, and call the gate
    via a manual evolve. For these tests we stamp pre-eval and skip
    process_production entirely, calling _pp_evolve_housing directly."""
    cur.execute("""UPDATE public.map_tiles SET desirability = %s
                   WHERE owner_player_id = %s""",
                (value, str(player_id)))


def _eval_housing(cur, player_id, operating_services_array='ARRAY[]::uuid[]'):
    """Run housing eval directly without going through process_production
    (which would re-derive desirability and overwrite our stamp)."""
    cur.execute(f"SELECT public._pp_evolve_housing(%s::uuid, {operating_services_array})",
                (str(player_id),))


def _set_money(cur, player_id, money):
    cur.execute("UPDATE public.player_profiles SET money = %s WHERE id = %s",
                (money, str(player_id)))


def test_upgrade_blocked_below_threshold(make_player, place, cur, clear_resources):
    """Tier 2 (Cottage) requires desirability ≥ 40. Pin to 30 → upgrade
    should NOT fire even when all other prereqs are met."""
    _enable_gate(cur)
    p = make_player(industry='timber')
    clear_resources(p['id'])
    _set_money(cur, p['id'], 50000)
    hx, hy = p['home_x'], p['home_y']

    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE id = %s", (house_id,))
    cur.execute("INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES (%s, 'berries', 5) ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = 5", (str(p['id']),))
    _backdate_house(cur, p['id'], house_id, 240)

    _stamp_desirability(cur, p['id'], 30)  # below tier-2 threshold of 40
    _eval_housing(cur, p['id'])

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 1, 'should not upgrade past Mud Hut at desirability 30'


def test_upgrade_succeeds_at_threshold(make_player, place, cur, clear_resources):
    """Same setup, desirability pinned at 50 (≥ tier-2 threshold of 40)
    → Mud Hut should upgrade to Cottage."""
    _enable_gate(cur)
    p = make_player(industry='timber')
    clear_resources(p['id'])
    _set_money(cur, p['id'], 50000)
    hx, hy = p['home_x'], p['home_y']

    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE id = %s", (house_id,))
    cur.execute("INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES (%s, 'berries', 5) ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = 5", (str(p['id']),))
    # Cottage (T2) requires pottery as a lifestyle demand.
    cur.execute("INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES (%s, 'pottery', 5) ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = 5", (str(p['id']),))
    _backdate_house(cur, p['id'], house_id, 240)

    _stamp_desirability(cur, p['id'], 50)  # ≥ tier-2 threshold
    _eval_housing(cur, p['id'])

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 2, 'should upgrade to Cottage at desirability 50'


def test_devolve_fires_when_far_below_threshold(make_player, place, cur, clear_resources):
    """Cottage (tier 2) min desirability is 40. Hysteresis is 30 — devolves
    when desirability < 10. Pin to 5 → should devolve back to Mud Hut."""
    _enable_gate(cur)
    p = make_player(industry='timber')
    clear_resources(p['id'])
    _set_money(cur, p['id'], 50000)
    hx, hy = p['home_x'], p['home_y']

    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id = %s", (house_id,))
    _backdate_house(cur, p['id'], house_id, 240)

    _stamp_desirability(cur, p['id'], 5)
    _eval_housing(cur, p['id'])

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 1, 'should devolve to Mud Hut at desirability 5'


def test_devolve_does_not_fire_in_hysteresis_band(make_player, place, cur, clear_resources):
    """Hysteresis safeguard: a Cottage (min_desirability 40) on a tile at
    desirability 25 should NOT devolve, since 25 ≥ (40 − 30 = 10).
    Real-world: protects existing housing when v2 gate flipped on, even
    if their tile's desirability is below the current tier's threshold."""
    _enable_gate(cur)
    p = make_player(industry='timber')
    clear_resources(p['id'])
    _set_money(cur, p['id'], 50000)
    hx, hy = p['home_x'], p['home_y']

    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id = %s", (house_id,))
    cur.execute("INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES (%s, 'berries', 5) ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = 5", (str(p['id']),))
    # Cottage (T2) requires pottery to maintain its tier.
    cur.execute("INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES (%s, 'pottery', 5) ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = 5", (str(p['id']),))
    _backdate_house(cur, p['id'], house_id, 240)

    _stamp_desirability(cur, p['id'], 25)
    _eval_housing(cur, p['id'])

    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 2, 'should NOT devolve in hysteresis band (25 ≥ 40-30)'
