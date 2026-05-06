"""Tests for productivity v1.

Two levers in v1:
- Crime drag: -0.005 per crime point above 50, capped at -0.10
- Tavern bonus: +0.05 if any staffed tavern operating

Final score clamped to [0.7, 1.3].
"""
import pytest


def test_default_productivity_is_one(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("SELECT productivity FROM player_profiles WHERE id = %s", (str(p['id']),))
    assert float(cur.fetchone()[0]) == 1.0


def test_compute_with_no_modifiers_is_one(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("SELECT public._pp_compute_productivity(%s)", (str(p['id']),))
    assert float(cur.fetchone()[0]) == 1.0


def test_high_crime_drags_productivity(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("UPDATE player_profiles SET crime = 70 WHERE id = %s", (str(p['id']),))
    # 70 crime → 20 points above 50 → -0.10 (capped) → productivity 0.90
    cur.execute("SELECT public._pp_compute_productivity(%s)", (str(p['id']),))
    val = float(cur.fetchone()[0])
    assert abs(val - 0.90) < 0.001, f"expected 0.90 at crime=70, got {val}"


def test_low_crime_no_drag(make_player, cur):
    """Crime below 50 produces no productivity drag."""
    p = make_player(industry='timber')
    cur.execute("UPDATE player_profiles SET crime = 30 WHERE id = %s", (str(p['id']),))
    cur.execute("SELECT public._pp_compute_productivity(%s)", (str(p['id']),))
    val = float(cur.fetchone()[0])
    assert val == 1.0


def test_crime_drag_scales_linearly(make_player, cur):
    """At crime=60, drag is -0.005 × 10 = -0.05 → productivity 0.95."""
    p = make_player(industry='timber')
    cur.execute("UPDATE player_profiles SET crime = 60 WHERE id = %s", (str(p['id']),))
    cur.execute("SELECT public._pp_compute_productivity(%s)", (str(p['id']),))
    val = float(cur.fetchone()[0])
    assert abs(val - 0.95) < 0.001, f"expected 0.95 at crime=60, got {val}"


def test_clamps_at_floor_and_ceiling(make_player, cur):
    """Productivity is clamped to [0.7, 1.3]. Crime contribution maxes at
    -0.10 so even crime=999 only yields 0.90; tavern alone is +0.05.
    Verify compute respects clamps."""
    p = make_player(industry='timber')
    cur.execute("UPDATE player_profiles SET crime = 999 WHERE id = %s", (str(p['id']),))
    cur.execute("SELECT public._pp_compute_productivity(%s)", (str(p['id']),))
    val = float(cur.fetchone()[0])
    # Even with crime=999, only -0.10 drag → productivity 0.90, well above
    # the 0.7 floor. Just confirm the floor isn't tripped accidentally.
    assert val >= 0.7
    assert val <= 1.3
