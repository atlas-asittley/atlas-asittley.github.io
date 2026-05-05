"""Tests for the four citizen-service buildings (tavern, bathhouse, school, temple).

Each consumes a unique pair of resources while staffed, and each provides a
different effect when "operating" (staffed AND both inputs available).
"""
import pytest


def _stock(cur, player_id, resource_key, qty):
    """Set a player's inventory for one resource."""
    cur.execute("""
        INSERT INTO public.inventories (player_id, resource_key, quantity)
        VALUES (%s, %s, %s)
        ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = EXCLUDED.quantity
    """, (str(player_id), resource_key, qty))


def _backdate(cur, player_id, secs):
    cur.execute("""
        UPDATE public.buildings SET last_processed_at = now() - make_interval(secs => %s)
        WHERE player_id = %s
    """, (secs, str(player_id)))


def _give_lots_of_workers(cur, player_id):
    """Bypass housing-driven worker supply for tests that just want enough workers."""
    cur.execute("UPDATE public.player_profiles SET worker_capacity = 100 WHERE id = %s",
                (str(player_id),))


def _give_money(cur, player_id, amount=5000):
    cur.execute("UPDATE public.player_profiles SET money = %s WHERE id = %s",
                (amount, str(player_id)))


# ── multi-input charging ────────────────────────────────────────

def test_tavern_consumes_both_inputs(make_player, place, cur, clear_resources):
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('road', hx + 1, hy + 1)
    place('tavern', hx + 1, hy + 2)
    _give_lots_of_workers(cur, p['id'])
    _stock(cur, p['id'], 'bread', 5.0)
    _stock(cur, p['id'], 'pottery', 5.0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")

    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'bread'",
                (str(p['id']),))
    bread_after = float(cur.fetchone()[0])
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'pottery'",
                (str(p['id']),))
    pottery_after = float(cur.fetchone()[0])
    # input_rate = 0.5/min, elapsed = 60s, so charge ≈ 0.5
    assert 4.4 < bread_after < 4.6, f"bread should drop ~0.5, got {bread_after}"
    assert 4.4 < pottery_after < 4.6, f"pottery should drop ~0.5, got {pottery_after}"


def test_tavern_consumes_nothing_when_one_input_missing(make_player, place, cur, clear_resources):
    """If only one of the two inputs is available, the tavern stays idle and
    consumes neither — preventing waste of the partial input."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('road', hx + 1, hy + 1)
    place('tavern', hx + 1, hy + 2)
    _give_lots_of_workers(cur, p['id'])
    _stock(cur, p['id'], 'bread', 5.0)
    _stock(cur, p['id'], 'pottery', 0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")

    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'bread'",
                (str(p['id']),))
    bread_after = float(cur.fetchone()[0])
    assert bread_after == 5.0, f"bread should not drop when pottery is missing, got {bread_after}"


# ── tavern worker bonus ─────────────────────────────────────────

def test_tavern_bonus_actually_buys_staffing_slots(make_player, place, cur, clear_resources):
    """Regression for the previously-decorative tavern bonus.

    Setup: base capacity (5) + a tavern (5w cost, +10 bonus when fed) +
    an extractor (10w cost). Total need = 15.

    Old code: tavern bonus was added AFTER the staffing loop, so
    capacity at staffing time was 5 (base alone). Tavern got the 5
    workers, extractor stayed unstaffed (unstaffed_count=1). Tavern
    bonus then inflated the displayed capacity to 15 — purely
    cosmetic.

    New code: tavern bonus is pre-computed before staffing → capacity
    is 15 going into the loop → both buildings staff (unstaffed_count=0).
    """
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('tavern', hx + 1, hy + 2)
    place('timber_camp', hx + 2, hy + 1)

    # Tavern needs bread + pottery to qualify for the bonus
    cur.execute("""INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES
                   (%s, 'bread', 5.0), (%s, 'pottery', 5.0)
                   ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = EXCLUDED.quantity""",
                (str(p['id']), str(p['id'])))
    cur.execute("""UPDATE public.buildings
                   SET last_processed_at = now() - interval '60 seconds'
                   WHERE player_id = %s""", (str(p['id']),))

    cur.execute("SELECT (public.process_production()->>'unstaffed_count')::int")
    assert cur.fetchone()[0] == 0, \
        "fed tavern's bonus should have brought capacity to 15, staffing both buildings"


def test_tavern_bonus_does_not_apply_when_unfed(make_player, place, cur, clear_resources):
    """Inverse of the fix-pin test: with no inputs in stock, the tavern
    bonus must NOT pre-boost capacity. The extractor stays unstaffed."""
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('tavern', hx + 1, hy + 2)
    place('timber_camp', hx + 2, hy + 1)
    # No bread / pottery → tavern doesn't qualify for the bonus

    cur.execute("""UPDATE public.buildings
                   SET last_processed_at = now() - interval '60 seconds'
                   WHERE player_id = %s""", (str(p['id']),))
    cur.execute("SELECT (public.process_production()->>'unstaffed_count')::int")
    assert cur.fetchone()[0] >= 1, \
        "unfed tavern shouldn't boost capacity; extractor should be unstaffed"


def test_tavern_adds_worker_capacity_when_fed(make_player, place, cur, clear_resources):
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('road', hx + 1, hy + 1)
    place('tavern', hx + 1, hy + 2)
    _give_lots_of_workers(cur, p['id'])  # ensure tavern itself is staffed
    _stock(cur, p['id'], 'bread', 5.0)
    _stock(cur, p['id'], 'pottery', 5.0)
    _backdate(cur, p['id'], 60)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT worker_capacity FROM public.player_profiles WHERE id = %s",
                (str(p['id']),))
    cap_with = cur.fetchone()[0]

    # Now drain the inputs so the tavern stops operating.
    _stock(cur, p['id'], 'bread', 0)
    _stock(cur, p['id'], 'pottery', 0)
    _give_lots_of_workers(cur, p['id'])
    _backdate(cur, p['id'], 60)
    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT worker_capacity FROM public.player_profiles WHERE id = %s",
                (str(p['id']),))
    cap_without = cur.fetchone()[0]

    assert cap_with - cap_without == 10, \
        f"tavern should add exactly 10 worker capacity when fed (with={cap_with}, without={cap_without})"


# ── school gates townhouse (tier 3) ─────────────────────────────

def test_school_required_for_tier_4_evolution(make_player, place, cur, clear_resources):
    """A townhouse (tier 3) cannot upgrade to villa (tier 4) without an
    operating school within 5 tiles. With a fed school, it can. (School
    moved from the tier-3 gate to the tier-4 gate as part of the slow-
    steady upgrade ladder: T3 adds road, T4 adds school.)
    """
    p = make_player()
    clear_resources(p['id'])
    _give_money(cur, p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 3 WHERE id = %s", (house_id,))
    _give_lots_of_workers(cur, p['id'])
    _stock(cur, p['id'], 'grain', 10.0)
    _backdate(cur, p['id'], 240)

    # No school yet → should stay at tier 3.
    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 3, "townhouse upgraded past tier 3 without a school"

    # Place + feed a school in range.
    place('school', hx + 1, hy + 3)
    _give_lots_of_workers(cur, p['id'])
    _stock(cur, p['id'], 'lumber', 5.0)
    _stock(cur, p['id'], 'flour', 5.0)
    _stock(cur, p['id'], 'grain', 10.0)
    _backdate(cur, p['id'], 240)
    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 4, "townhouse failed to upgrade with school in range"


def test_unfed_school_does_not_unlock_tier_4(make_player, place, cur, clear_resources):
    """A school that's been built but has no inputs in stock should NOT
    qualify housing for the tier-4 gate (even though it's staffed and on
    a road). School moved from T3 → T4."""
    p = make_player()
    clear_resources(p['id'])
    _give_money(cur, p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('well', hx + 2, hy + 1)
    house_id = place('house', hx + 1, hy + 2)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 3 WHERE id = %s", (house_id,))
    place('school', hx + 1, hy + 3)
    _give_lots_of_workers(cur, p['id'])
    _stock(cur, p['id'], 'lumber', 0)
    _stock(cur, p['id'], 'flour', 0)
    # Stock food so the food gate passes — the test isolates the school feed.
    _stock(cur, p['id'], 'grain', 10.0)
    _backdate(cur, p['id'], 240)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 3, "unfed school should not unlock tier 4"


# ── bathhouse blocks devolve ────────────────────────────────────

def _bathhouse_layout(make_player, place, cur, clear_resources):
    """Shared setup for the bathhouse devolve-blocking tests.

    Layout (highway runs through (hx, *) and (*, hy)):
      provider  (hx-1, hy-1) tier-2 cottage; via highway, well within 4 → stays
                              staffed regardless of pauses, supplies 10 workers
      well      (hx-1, hy+2) via highway, gates both houses at tier 1+
      bathhouse (hx+1, hy+3) via highway, distance 2 from test house
      road1     (hx+2, hy+1) the only road giving the test house access
      house     (hx+2, hy+2) tier-1; off-highway; loses road when road1 is paused
    """
    p = make_player()
    clear_resources(p['id'])
    _give_money(cur, p['id'])
    hx, hy = p['home_x'], p['home_y']
    provider_id = place('house', hx - 1, hy - 1)['building_id']
    cur.execute("UPDATE public.buildings SET housing_tier = 2 WHERE id = %s", (provider_id,))
    place('road', hx + 2, hy + 1)
    place('well', hx - 1, hy + 2)
    place('bathhouse', hx + 1, hy + 3)
    house_id = place('house', hx + 2, hy + 2)['building_id']
    # Use tier 3 (Townhouse) since that's the lowest tier that requires
    # road access — pausing road1 then triggers a road-loss devolve.
    cur.execute("UPDATE public.buildings SET housing_tier = 3 WHERE id = %s", (house_id,))
    return p, hx, hy, house_id


def test_bathhouse_blocks_devolve(make_player, place, cur, clear_resources):
    """A house that loses its road access would normally devolve. With a
    fed bathhouse in range, the devolve is blocked."""
    p, hx, hy, house_id = _bathhouse_layout(make_player, place, cur, clear_resources)
    _stock(cur, p['id'], 'brick', 5.0)
    _stock(cur, p['id'], 'clay', 5.0)
    cur.execute("""
        UPDATE public.buildings SET status = 'paused'
        WHERE player_id = %s AND building_type_key = 'road' AND x = %s AND y = %s
    """, (str(p['id']), hx + 2, hy + 1))
    _backdate(cur, p['id'], 120)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 3, "bathhouse should have prevented devolve"


def test_unfed_bathhouse_does_not_block_devolve(make_player, place, cur, clear_resources):
    """Same layout as above, but no inputs in stock → bathhouse not operating
    → house should devolve normally."""
    p, hx, hy, house_id = _bathhouse_layout(make_player, place, cur, clear_resources)
    _stock(cur, p['id'], 'brick', 0)
    _stock(cur, p['id'], 'clay', 0)
    cur.execute("""
        UPDATE public.buildings SET status = 'paused'
        WHERE player_id = %s AND building_type_key = 'road' AND x = %s AND y = %s
    """, (str(p['id']), hx + 2, hy + 1))
    _backdate(cur, p['id'], 120)

    cur.execute("SELECT public.process_production()")
    cur.execute("SELECT housing_tier FROM public.buildings WHERE id = %s", (house_id,))
    assert cur.fetchone()[0] == 2, "unfed bathhouse should not have prevented devolve from 3 to 2"
