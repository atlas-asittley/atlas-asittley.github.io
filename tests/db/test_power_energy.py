"""Regression tests for power_energy.sql (Civic Metrics Expansion — Phase 2).

Power layers on top of waste, and neither is on the live DB yet, so this module
applies BOTH migrations (waste first, then power) into the session's outer
transaction once. conftest's session `conn` rolls everything back at the end, so
the live DB is never mutated. Idempotent once they're live.
"""
import os
import re
import pytest

WASTE = os.path.expanduser("~/citybuilder/city-builder-mvp/migration_patches/waste_management.sql")
POWER = os.path.expanduser("~/citybuilder/city-builder-mvp/migration_patches/power_energy.sql")


@pytest.fixture(scope="module", autouse=True)
def _apply_migrations(conn):
    c = conn.cursor()
    for path in (WASTE, POWER):   # order matters: power redefines _pp_for_uid on top of waste
        sql = re.sub(r'(?im)^\s*(BEGIN|COMMIT)\s*;\s*$', '', open(path).read())
        c.execute(sql)
    c.close()
    yield


def _profile(cur, uid, col):
    cur.execute(f"SELECT {col} FROM public.player_profiles WHERE id = %s", (str(uid),))
    return float(cur.fetchone()[0])


def _qty(cur, uid, res):
    cur.execute("SELECT quantity FROM public.inventories WHERE player_id = %s AND resource_key = %s",
                (str(uid), res))
    row = cur.fetchone()
    return float(row[0]) if row else 0.0


# ───────────────────────────────────────────────────────────
# Schema / catalog
# ───────────────────────────────────────────────────────────

def test_schema_and_buildings_exist(cur):
    for col in ('power_capacity', 'power_demand'):
        cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name='player_profiles' AND column_name=%s", (col,))
        assert cur.fetchone(), f"player_profiles.{col} missing"
    for col in ('power_output', 'power_load'):
        cur.execute("SELECT 1 FROM information_schema.columns WHERE table_name='building_types' AND column_name=%s", (col,))
        assert cur.fetchone(), f"building_types.{col} missing"

    cur.execute("""SELECT key, category, power_output FROM public.building_types
                   WHERE key IN ('watermill','windmill','powerhouse') ORDER BY key""")
    rows = {r[0]: (r[1], float(r[2])) for r in cur.fetchall()}
    assert set(rows) == {'watermill', 'windmill', 'powerhouse'}
    assert all(v[0] == 'power' for v in rows.values())
    assert rows['powerhouse'][1] == 80 and rows['watermill'][1] == 20


# ───────────────────────────────────────────────────────────
# Demand + capacity
# ───────────────────────────────────────────────────────────

def test_staffed_processor_adds_demand(cur, make_player, place, clear_resources):
    p = make_player(industry='timber', population=100)
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_demand') == 0

    place('sawmill', hx + 1, hy + 1)   # timber processor, power_load 3
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_demand') == 3, "staffed processor should draw 3 power"


def test_fuel_free_mill_adds_capacity(cur, make_player, place, clear_resources):
    p = make_player(industry='timber', population=100)
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('watermill', hx + 1, hy + 1)
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_capacity') == 20, "staffed watermill should supply 20"


def test_powerhouse_burns_charcoal_for_capacity(cur, make_player, place, clear_resources):
    p = make_player(industry='timber', population=100)
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('powerhouse', hx + 1, hy + 1)   # 2x2; place fixture tops up the machinery cost

    # Fuelled: contributes 80 and burns 0.5 charcoal.
    cur.execute("""INSERT INTO public.inventories (player_id, resource_key, quantity)
                   VALUES (%s,'charcoal',100) ON CONFLICT (player_id,resource_key)
                   DO UPDATE SET quantity = 100""", (str(p['id']),))
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_capacity') == 80, "fuelled powerhouse should supply 80"
    assert _qty(cur, p['id'], 'charcoal') < 100, "powerhouse should burn charcoal"

    # Unfuelled: contributes nothing.
    cur.execute("UPDATE public.inventories SET quantity = 0 WHERE player_id=%s AND resource_key='charcoal'",
                (str(p['id']),))
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_capacity') == 0, "unfuelled powerhouse should supply 0"


def test_powerhouse_costs_machinery(cur, make_player, clear_resources, tile_id_at):
    p = make_player(industry='iron', population=100)
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    cur.execute("""SELECT quantity FROM public.building_type_resource_costs
                   WHERE building_type_key='powerhouse' AND resource_key='machinery'""")
    row = cur.fetchone()
    assert row and row[0] == 1, "powerhouse should cost 1 machinery"

    tid = tile_id_at(hx + 1, hy + 1)
    cur.execute("SAVEPOINT no_mach")
    failed = False
    try:
        cur.execute("SELECT public.place_building(%s, 'powerhouse')", (tid,))
        res = cur.fetchone()[0]
        if isinstance(res, dict) and res.get('error'):
            failed = True
    except Exception:
        failed = True
    cur.execute("ROLLBACK TO SAVEPOINT no_mach")
    assert failed, "powerhouse placed without machinery — sink not enforced"


def test_process_production_returns_power(cur, make_player, clear_resources):
    p = make_player(industry='timber', population=50)
    clear_resources(p['id'])
    cur.execute("SELECT public.process_production()")
    payload = cur.fetchone()[0]
    assert 'power_capacity' in payload and 'power_demand' in payload


# ───────────────────────────────────────────────────────────
# Toothless: the brownout penalty is intentionally NOT wired yet
# ───────────────────────────────────────────────────────────

def test_power_shortage_does_not_yet_hurt_productivity(cur, make_player, place, clear_resources):
    """A city with demand and zero capacity must NOT be brownout-penalised yet
    (ship visible-but-toothless). If a brownout were active, productivity would
    be scaled toward the 0.6 floor; here it stays in the normal range."""
    p = make_player(industry='timber', population=100)
    clear_resources(p['id'])
    hx, hy = p['home_x'], p['home_y']
    place('sawmill', hx + 1, hy + 1)
    cur.execute("SELECT public.process_production()")
    assert _profile(cur, p['id'], 'power_demand') >= 3      # real shortage (demand>0)
    assert _profile(cur, p['id'], 'power_capacity') == 0
    assert _profile(cur, p['id'], 'productivity') >= 0.9, \
        "productivity should not be brownout-penalised while power is toothless"
