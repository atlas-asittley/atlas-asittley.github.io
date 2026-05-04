"""Tests for the `choose_industry` RPC.

Regression coverage: this RPC originally only allowed 'timber' and
'stone' even though grain and clay industries existed. M1's migration
fixed the validator to accept all four. These tests pin that behavior.
"""
import pytest
import psycopg2


def test_creates_player_with_district(make_player):
    p = make_player(industry='timber')
    assert p['industry_key'] == 'timber'
    assert p['money'] == 500
    assert p['chunks_owned'] == 1
    assert p['home_x'] is not None
    assert p['home_y'] is not None


def test_starting_chunk_has_resource_tiles(make_player, cur):
    p = make_player(industry='timber')
    cur.execute("""
        SELECT COUNT(*) FROM public.map_tiles
        WHERE owner_player_id = %s AND resource_node_key = 'timber'
    """, (str(p['id']),))
    n = cur.fetchone()[0]
    # Random ~8% of 224 tiles (city center is excluded) = ~18, with variance
    assert 5 <= n <= 35, f"unexpected resource tile count: {n}"


def test_total_tiles_in_chunk_is_225(make_player, cur):
    p = make_player()
    cur.execute(
        "SELECT COUNT(*) FROM public.map_tiles WHERE owner_player_id = %s",
        (str(p['id']),),
    )
    assert cur.fetchone()[0] == 225


@pytest.mark.parametrize("industry", ['timber', 'stone', 'grain', 'clay'])
def test_accepts_all_four_industries(make_player, industry):
    """Regression: choose_industry used to only accept ('timber', 'stone')."""
    p = make_player(industry=industry)
    assert p['industry_key'] == industry


def test_rejects_unknown_industry(make_player):
    with pytest.raises(psycopg2.errors.RaiseException):
        make_player(industry='nonsense')


def test_rejects_short_display_name(make_player):
    with pytest.raises(psycopg2.errors.RaiseException):
        make_player(display_name='x')
