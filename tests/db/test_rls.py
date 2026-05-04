"""Tests for Row Level Security policies.

Regression coverage:
- buildings DELETE policy: original mvp_schema enabled RLS but never
  added a DELETE policy, silently rejecting every demolish. Fix added
  buildings_delete_self.
- Cannot delete other players' buildings.
- Inventories are private per player.
"""
import pytest
import psycopg2


def test_delete_policy_exists(cur):
    cur.execute("""
        SELECT polcmd FROM pg_policy
        WHERE polrelid = 'public.buildings'::regclass
          AND polname = 'buildings_delete_self'
    """)
    assert cur.fetchone() == ('d',), "buildings_delete_self DELETE policy is missing"


def test_owner_can_delete_own_building(make_player, place, cur, clear_resources):
    """Regression: demolish silently failed for years before this policy."""
    p = make_player()
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    result = place('road', hx + 1, hy)
    bid = result['building_id']

    # We're the postgres role with auth.uid() set to the player; RLS still applies
    cur.execute("SET LOCAL ROLE authenticated")
    try:
        cur.execute("DELETE FROM public.buildings WHERE id = %s", (bid,))
        # No error. Now confirm the row is actually gone.
        cur.execute("SELECT COUNT(*) FROM public.buildings WHERE id = %s", (bid,))
        assert cur.fetchone()[0] == 0
    finally:
        cur.execute("RESET ROLE")


def test_cannot_delete_other_players_building(make_player, place, as_user, cur, clear_resources):
    pA = make_player()
    clear_resources(pA['id'])
    hx, hy = pA['home_x'], pA['home_y']
    result = place('road', hx + 1, hy)
    bid = result['building_id']

    pB = make_player()
    as_user(pB['id'])

    cur.execute("SET LOCAL ROLE authenticated")
    try:
        cur.execute("DELETE FROM public.buildings WHERE id = %s", (bid,))
        # Either RLS blocked silently (0 rows) or threw — either way the row should still exist
    finally:
        cur.execute("RESET ROLE")
    cur.execute("SELECT COUNT(*) FROM public.buildings WHERE id = %s", (bid,))
    assert cur.fetchone()[0] == 1, "B was able to delete A's building"


def test_inventory_select_is_self_only(make_player, as_user, cur):
    pA = make_player()
    pB = make_player()
    # Both have inventories. As B, we should see only B's.
    as_user(pB['id'])
    cur.execute("SET LOCAL ROLE authenticated")
    try:
        cur.execute("SELECT DISTINCT player_id FROM public.inventories")
        rows = cur.fetchall()
    finally:
        cur.execute("RESET ROLE")
    if rows:
        # Could be empty if no inventory rows exist; if present, all should be B
        for (pid,) in rows:
            assert str(pid) == str(pB['id']), \
                f"B saw inventory row for {pid}; RLS isn't isolating"
