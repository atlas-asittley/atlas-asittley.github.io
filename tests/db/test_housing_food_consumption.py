"""Tests for per-tick housing food consumption.

Active tier-1+ houses drain food from inventory at htc.food_per_minute per
house per minute. Drain is proportional across all is_food resources
(single multiplier on every food row). When food runs out, v_has_food
flips false and the existing devolve gate fires.
"""


def _stock(cur, player_id, **kv):
    for resource_key, qty in kv.items():
        cur.execute("""INSERT INTO public.inventories (player_id, resource_key, quantity)
                       VALUES (%s, %s, %s)
                       ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = EXCLUDED.quantity""",
                    (str(player_id), resource_key, qty))


def _backdate_food_tick(cur, player_id, secs):
    cur.execute("""UPDATE public.player_profiles
                   SET last_food_tick_at = now() - make_interval(secs => %s)
                   WHERE id = %s""", (secs, str(player_id)))


def _make_tier_1_house(cur, place, p, hx, hy):
    """Place a house, set it to tier 1. Stocks food first so the
    process_production tick doesn't immediately devolve it."""
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 1 WHERE id = %s", (house_id,))
    return house_id


# ── consumption per tier ─────────────────────────────────────

def test_tier_0_house_drains_no_food(make_player, place, cur, clear_resources):
    """Shanty (tier 0) shouldn't drain food."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('house', hx + 1, hy + 2)  # default tier 0
    _stock(cur, p['id'], grain=10.0)
    _backdate_food_tick(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    assert float(cur.fetchone()[0]) == 10.0, "shanty should not drain food"


def test_tier_1_house_does_not_drain_food(make_player, place, cur, clear_resources):
    """Mud hut is now water-only — no food consumption (food_per_minute = 0).
    Food drain begins at tier 2 (Cottage)."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    _make_tier_1_house(cur, place, p, hx, hy)
    _stock(cur, p['id'], grain=10.0)
    _backdate_food_tick(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    grain = float(cur.fetchone()[0])
    assert grain == 10.0, f"mud hut should not drain food, got {grain}"


def test_tier_2_house_drains_food(make_player, place, cur, clear_resources):
    """Cottage at 0.06/min should drain ~0.06 food over 60s."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    house_id = _make_tier_1_house(cur, place, p, hx, hy)
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id = %s", (house_id,))
    _stock(cur, p['id'], grain=10.0)
    _backdate_food_tick(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    grain = float(cur.fetchone()[0])
    # 0.06/min × 1 min = 0.06 drained
    assert 9.92 < grain < 9.96, f"expected ~9.94 grain after 0.06 drain, got {grain}"


# ── multi-food drain ─────────────────────────────────────────

def test_drain_proportional_across_food_resources(make_player, place, cur, clear_resources):
    """Drain should be proportional. With 60 grain + 30 flour + 10 bread
    (total 100) and a need of 1.0, drain ~0.6 grain, ~0.3 flour, ~0.1 bread."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    house_id = _make_tier_1_house(cur, place, p, hx, hy)
    cur.execute("UPDATE public.buildings SET housing_tier = 5 WHERE id = %s", (house_id,))
    # tier 5 = 0.25/min, over 240s = 1.0 food needed
    _stock(cur, p['id'], grain=60.0, flour=30.0, bread=10.0)
    _backdate_food_tick(cur, p['id'], 240)

    cur.execute("SELECT public.process_production()")
    cur.execute("""SELECT resource_key, quantity FROM public.inventories
                   WHERE player_id = %s AND resource_key IN ('grain', 'flour', 'bread')
                   ORDER BY resource_key""", (str(p['id']),))
    rows = {r[0]: float(r[1]) for r in cur.fetchall()}
    # Total drain = 1.0; drain proportions: 0.6, 0.3, 0.1
    assert 59.3 < rows['grain'] < 59.5, f"grain expected ~59.4, got {rows['grain']}"
    assert 29.6 < rows['flour'] < 29.8, f"flour expected ~29.7, got {rows['flour']}"
    assert 9.85 < rows['bread'] < 9.95, f"bread expected ~9.9, got {rows['bread']}"


# ── starvation devolve ───────────────────────────────────────

def test_house_devolves_when_drain_empties_food(make_player, place, cur, clear_resources):
    """A tier-2 cottage with barely-enough food drains it in one tick,
    fails the food gate next housing eval, and devolves to tier 1
    (mud hut, which doesn't need food)."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    house_id = _make_tier_1_house(cur, place, p, hx, hy)
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id = %s", (house_id,))
    # 0.06 grain / min, give exactly enough for 60s = 0.06
    _stock(cur, p['id'], grain=0.06)
    _backdate_food_tick(cur, p['id'], 60)
    cur.execute("""UPDATE public.buildings
                   SET last_processed_at = now() - interval '120 seconds'
                   WHERE id = %s""", (house_id,))

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    tier = cur.fetchone()[0]
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    grain = float(cur.fetchone()[0])
    assert grain < 0.01, f"food should be drained to ~0, got {grain}"
    assert tier == 1, f"cottage should have devolved from 2 to 1, got tier {tier}"


# ── rate scales with house count ─────────────────────────────

def test_drain_scales_with_house_count(make_player, place, cur, clear_resources):
    """Two tier-2 cottages should drain twice as much as one."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    h1 = place('house', hx + 1, hy + 2)['building_id']
    h2 = place('house', hx + 3, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id IN (%s, %s)", (h1, h2))
    _stock(cur, p['id'], grain=10.0)
    _backdate_food_tick(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    grain = float(cur.fetchone()[0])
    # 2 houses × 0.06 = 0.12 drained
    assert 9.85 < grain < 9.91, f"expected ~9.88 grain after 2-house drain, got {grain}"


# ── last_food_tick_at updates ────────────────────────────────

def test_last_food_tick_advances(make_player, place, cur, clear_resources):
    """last_food_tick_at should be set to v_now after each process_production."""
    p = make_player()
    clear_resources(p['id'])
    _backdate_food_tick(cur, p['id'], 60)
    cur.execute("SELECT public.process_production()")
    cur.execute("""SELECT EXTRACT(EPOCH FROM (now() - last_food_tick_at))
                   FROM public.player_profiles WHERE id = %s""", (str(p['id']),))
    secs = float(cur.fetchone()[0])
    assert secs < 1, f"last_food_tick_at should have just been updated, but it's {secs}s ago"


# ── paused house doesn't drain ───────────────────────────────

def test_paused_house_drains_no_food(make_player, place, cur, clear_resources):
    """Paused buildings drop out of every loop, including the food drain."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    house_id = _make_tier_1_house(cur, place, p, hx, hy)
    cur.execute("UPDATE public.buildings SET status = 'paused' WHERE id = %s", (house_id,))
    _stock(cur, p['id'], grain=10.0)
    _backdate_food_tick(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'grain'",
                (str(p['id']),))
    grain = float(cur.fetchone()[0])
    assert grain == 10.0, f"paused house should not drain food, got {grain}"
