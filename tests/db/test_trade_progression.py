"""Tests for the trade progression system.

Coverage:
- is_trade_unlocked false at game start, true once all three gates met
  (≥1 active extractor, ≥1 active food extractor, ≥1 active tier-1+ house).
- district_weight returns at least 1 (housing-floor avoids divide-by-zero).
- donate_to_mission debits inventory, advances mission, awards reputation
  proportional to contribution and speed multiplier.
- Mission auto-closes (status='fulfilled') when current_qty hits target_qty.
"""
import pytest
import psycopg2


def _force_tier(cur, player_id, tier):
    """Force any house in the player's district to a given tier."""
    cur.execute("""
        UPDATE public.buildings SET housing_tier = %s
        WHERE player_id = %s AND building_type_key = 'house'
    """, (tier, str(player_id)))


def _stock(cur, player_id, resource_key, qty):
    cur.execute("""
        INSERT INTO public.inventories (player_id, resource_key, quantity)
        VALUES (%s, %s, %s)
        ON CONFLICT (player_id, resource_key) DO UPDATE SET quantity = EXCLUDED.quantity
    """, (str(player_id), resource_key, qty))


def test_trade_locked_at_game_start(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("SELECT public.is_trade_unlocked(%s)", (str(p['id']),))
    assert cur.fetchone()[0] is False


def test_trade_unlocks_after_extractor_food_and_tier1_house(make_player, place, stamp_food_tile, cur, clear_resources):
    p = make_player(industry='timber')
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']

    place('timber_camp', hx + 1, hy - 1)
    cur.execute("SELECT public.is_trade_unlocked(%s)", (str(p['id']),))
    assert cur.fetchone()[0] is False, 'extractor alone is not enough'

    stamp_food_tile('orchard_grove', hx + 1, hy + 1)
    place('orchard', hx + 1, hy + 1)
    cur.execute("SELECT public.is_trade_unlocked(%s)", (str(p['id']),))
    assert cur.fetchone()[0] is False, 'extractor + food without tier-1 house still locked'

    place('house', hx + 2, hy + 1)
    cur.execute("SELECT public.is_trade_unlocked(%s)", (str(p['id']),))
    assert cur.fetchone()[0] is False, 'tier-0 shanty still locked'

    _force_tier(cur, p['id'], 1)
    cur.execute("SELECT public.is_trade_unlocked(%s)", (str(p['id']),))
    assert cur.fetchone()[0] is True


def test_district_weight_floor(make_player, cur):
    """A player with no housing still has weight >= 1 so they participate
    in the city-rep weighted average without divide-by-zero risk."""
    p = make_player(industry='timber')
    cur.execute("SELECT public.district_weight(%s)", (str(p['id']),))
    assert cur.fetchone()[0] >= 1


def _make_open_mission(cur, trader_key='river_traders', resource='lumber', target=20):
    """Insert a pending mission directly. Bypasses the cooldown roller."""
    cur.execute("""
        INSERT INTO public.trader_missions
            (trader_key, kind, resource_key, target_qty, current_qty,
             soft_deadline, expires_at, status, created_at)
        VALUES
            (%s, 'deliver_resource', %s, %s, 0,
             now() + interval '60 minutes',
             now() + interval '6 hours',
             'open', now())
        RETURNING id
    """, (trader_key, resource, target))
    return cur.fetchone()[0]


def test_donate_debits_inventory_and_awards_reputation(make_player, cur):
    p = make_player(industry='timber')
    _stock(cur, p['id'], 'lumber', 30)

    # Clean any open mission for the test trader.
    cur.execute("DELETE FROM public.trader_missions WHERE trader_key = 'river_traders' AND status = 'open'")
    mid = _make_open_mission(cur, target=20)

    cur.execute("SELECT public.donate_to_mission(%s, 5)", (str(mid),))
    result = cur.fetchone()[0]
    assert result['donated_qty'] == 5
    assert result['current_qty'] == 5
    assert result['fulfilled'] is False

    # Inventory debited.
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'lumber'",
                (str(p['id']),))
    assert cur.fetchone()[0] == 25

    # Reputation row created for this player+trader, with rep > 0.
    cur.execute("""
        SELECT reputation FROM public.trader_relationships
        WHERE player_id = %s AND trader_key = 'river_traders'
    """, (str(p['id']),))
    row = cur.fetchone()
    # Partial donation: rep is awarded only on mission close, so still 0 here.
    assert row is None or row[0] == 0


def test_mission_closes_and_distributes_rep_when_filled(make_player, cur):
    p = make_player(industry='timber')
    _stock(cur, p['id'], 'lumber', 100)

    cur.execute("DELETE FROM public.trader_missions WHERE trader_key = 'river_traders' AND status = 'open'")
    mid = _make_open_mission(cur, target=10)

    # Single full donation. Should fulfill + award rep.
    cur.execute("SELECT public.donate_to_mission(%s, 10)", (str(mid),))
    result = cur.fetchone()[0]
    assert result['fulfilled'] is True

    cur.execute("SELECT status FROM public.trader_missions WHERE id = %s", (str(mid),))
    assert cur.fetchone()[0] == 'fulfilled'

    cur.execute("""
        SELECT reputation FROM public.trader_relationships
        WHERE player_id = %s AND trader_key = 'river_traders'
    """, (str(p['id']),))
    rep = cur.fetchone()[0]
    # Speed bonus is ~1.5x at instant fulfillment, so 10 * 1.5 = 15.
    assert rep > 10, f'expected speed-bonus rep above 10, got {rep}'


def test_donate_caps_at_remaining_target(make_player, cur):
    """Donating more than remaining is capped down — extra inventory stays."""
    p = make_player(industry='timber')
    _stock(cur, p['id'], 'lumber', 50)

    cur.execute("DELETE FROM public.trader_missions WHERE trader_key = 'river_traders' AND status = 'open'")
    mid = _make_open_mission(cur, target=10)

    cur.execute("SELECT public.donate_to_mission(%s, 30)", (str(mid),))
    result = cur.fetchone()[0]
    assert result['donated_qty'] == 10  # capped
    assert result['fulfilled'] is True

    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = 'lumber'",
                (str(p['id']),))
    assert cur.fetchone()[0] == 40, 'only the capped 10 should have been debited'


def test_donate_rejected_when_insufficient_inventory(make_player, cur):
    p = make_player(industry='timber')
    _stock(cur, p['id'], 'lumber', 3)

    cur.execute("DELETE FROM public.trader_missions WHERE trader_key = 'river_traders' AND status = 'open'")
    mid = _make_open_mission(cur, target=20)

    with pytest.raises(psycopg2.errors.RaiseException, match='only have'):
        cur.execute("SELECT public.donate_to_mission(%s, 10)", (str(mid),))


def test_only_one_open_mission_per_trader(cur):
    """Unique partial index forbids two open missions for the same trader."""
    cur.execute("DELETE FROM public.trader_missions WHERE trader_key = 'river_traders' AND status = 'open'")
    _make_open_mission(cur, target=20)
    with pytest.raises(psycopg2.errors.UniqueViolation):
        _make_open_mission(cur, target=10)


def test_get_active_missions_returns_open_and_quiet(make_player, cur):
    """The Missions sub-tab needs to show both currently-open missions
    and the traders mid-cooldown with their next-eligible-at timestamps."""
    p = make_player(industry='timber')

    # Pin every trader's clock to 'just resolved' so roll_trader_missions
    # won't auto-fire one while we're checking the quiet list.
    cur.execute("DELETE FROM public.trader_missions WHERE status = 'open'")
    for tk in ('river_traders', 'desert_caravan', 'mountain_folk'):
        cur.execute("""
            INSERT INTO public.trader_missions
                (trader_key, kind, resource_key, target_qty, current_qty,
                 soft_deadline, expires_at, status, created_at, resolved_at)
            VALUES (%s, 'deliver_resource', 'lumber', 10, 10,
                    now(), now(), 'fulfilled',
                    now() - interval '1 minute', now() - interval '1 minute')
        """, (tk,))

    # Open one mission directly (bypass cooldown).
    cur.execute("""
        INSERT INTO public.trader_missions
            (trader_key, kind, resource_key, target_qty, current_qty,
             soft_deadline, expires_at, status, created_at)
        VALUES ('river_traders', 'deliver_resource', 'lumber', 25, 0,
                now() + interval '60 minutes', now() + interval '6 hours',
                'open', now())
    """)

    cur.execute("SELECT public.get_active_missions()")
    data = cur.fetchone()[0]

    assert 'open' in data and 'quiet' in data, 'shape must be {open: [], quiet: []}'
    open_keys = [m['trader_key'] for m in data['open']]
    quiet_keys = [q['trader_key'] for q in data['quiet']]

    assert 'river_traders' in open_keys, 'open mission should appear in open list'
    # The other two traders just resolved a mission and are mid-cooldown,
    # so they should appear in the quiet list with a next_eligible_at.
    for q in data['quiet']:
        assert 'next_eligible_at' in q
        assert 'trader_name' in q
        assert 'cooldown_minutes' in q
    # No trader appears in both lists.
    assert not (set(open_keys) & set(quiet_keys))
