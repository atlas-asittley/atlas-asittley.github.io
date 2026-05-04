"""Tests for the housing food gate.

Tier 1+ housing requires "any food" in inventory (resources.is_food = true).
Today that's grain, flour, or bread. The check is presence-only — at least
one food resource must be > 0. Without food, tier 1+ housing won't evolve
and existing tier 1+ housing devolves.
"""


def _set_inventory(cur, player_id, **stocks):
    """Replace the player's inventory with the given stocks. Wipes everything else."""
    cur.execute("DELETE FROM public.inventories WHERE player_id = %s", (str(player_id),))
    for resource_key, qty in stocks.items():
        cur.execute("""
            INSERT INTO public.inventories (player_id, resource_key, quantity)
            VALUES (%s, %s, %s)
        """, (str(player_id), resource_key, qty))


def _backdate(cur, player_id, secs):
    cur.execute("""
        UPDATE public.buildings SET last_processed_at = now() - make_interval(secs => %s)
        WHERE player_id = %s
    """, (secs, str(player_id)))


def test_shanty_to_mud_hut_blocked_without_food(make_player, place, cur, clear_resources):
    """Tier 0 shanty cannot upgrade to tier 1 mud hut without any food."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']  # tier 0 by default
    _set_inventory(cur, p['id'])  # explicitly empty — no food
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0, "shanty upgraded to mud hut without food"


def test_shanty_to_mud_hut_succeeds_with_grain_only(make_player, place, cur, clear_resources):
    """Raw grain alone (no flour, no bread) is sufficient — any food works."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    _set_inventory(cur, p['id'], grain=5.0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 1, "shanty failed to upgrade with grain in stock"


def test_shanty_to_mud_hut_succeeds_with_bread_only(make_player, place, cur, clear_resources):
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    _set_inventory(cur, p['id'], bread=3.0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 1, "shanty failed to upgrade with bread in stock"


def test_non_food_resource_does_not_satisfy_food_gate(make_player, place, cur, clear_resources):
    """Stockpiles of non-food resources (lumber, brick, etc.) shouldn't count."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    _set_inventory(cur, p['id'], lumber=100.0, brick=100.0, statuary=50.0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0, "non-food resources should not satisfy the food gate"


def test_mud_hut_devolves_when_food_runs_out(make_player, place, cur, clear_resources):
    """A tier-1 mud hut with no food in stock should devolve to tier 0 shanty."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE id = %s", (house_id,))
    _set_inventory(cur, p['id'])  # no food
    _backdate(cur, p['id'], 120)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0, "mud hut should devolve when food runs out"


def test_shanty_does_not_need_food(make_player, place, cur, clear_resources):
    """Tier 0 shanty should NOT need food — it's the subsistence floor.
    A house already at tier 0 should not be flagged for any change just
    because food is absent.
    """
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    house_id = place('house', hx + 1, hy + 2)['building_id']
    # Tier 0 with no road, no well, no food — should stay at 0 (no devolve, no upgrade)
    _set_inventory(cur, p['id'])
    _backdate(cur, p['id'], 120)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 0, "shanty should remain at tier 0 with no food"
