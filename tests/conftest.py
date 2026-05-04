"""Shared pytest fixtures for the City Builder test suite.

Tests run against the live Supabase database read via ~/.citybuilder_db_url.
Each test gets a savepoint + automatic ROLLBACK TO SAVEPOINT, so nothing
persists. The outer transaction is also rolled back at session end as a
defense in depth.

Auth simulation: we run as the postgres role (which bypasses RLS) but set
`request.jwt.claims` to fake a logged-in Supabase user. The Supabase
`auth.uid()` reads from that GUC, so RPCs work as if the user is signed in.
"""
import os
import uuid
import pytest
import psycopg2
import psycopg2.extras


# ───────────────────────────────────────────────────────────
# Connection (one per test session)
# ───────────────────────────────────────────────────────────

@pytest.fixture(scope="session")
def conn():
    url_path = os.path.expanduser('~/.citybuilder_db_url')
    if not os.path.exists(url_path):
        pytest.skip(f"DB URL file not found at {url_path}")
    url = open(url_path).read().strip()
    c = psycopg2.connect(url)
    c.autocommit = False
    yield c
    c.rollback()
    c.close()


# ───────────────────────────────────────────────────────────
# Per-test isolation via SAVEPOINT
# ───────────────────────────────────────────────────────────

@pytest.fixture
def cur(conn, request):
    """Yield a cursor wrapped in a savepoint. Auto-rollback after test."""
    sp_name = "sp_" + request.node.name.replace('-', '_').replace('[', '_').replace(']', '_').replace(' ', '_')
    sp_name = ''.join(c if c.isalnum() or c == '_' else '_' for c in sp_name)[:60]
    c = conn.cursor()
    c.execute(f"SAVEPOINT {sp_name}")
    try:
        yield c
    finally:
        try:
            c.execute(f"ROLLBACK TO SAVEPOINT {sp_name}")
        except psycopg2.Error:
            conn.rollback()  # if savepoint somehow vanished, nuke everything
        c.close()


# ───────────────────────────────────────────────────────────
# Test user helpers
# ───────────────────────────────────────────────────────────

def _create_auth_user(cur, email):
    """Insert a row into auth.users for FK purposes. Rolled back with savepoint."""
    uid = uuid.uuid4()
    cur.execute("""
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password,
            email_confirmed_at, created_at, updated_at,
            raw_app_meta_data, raw_user_meta_data,
            is_super_admin, is_anonymous
        ) VALUES (
            %s, '00000000-0000-0000-0000-000000000000',
            'authenticated', 'authenticated',
            %s, '$2a$10$dummy.hash.value.for.tests.only',
            now(), now(), now(),
            '{}'::jsonb, '{}'::jsonb,
            false, false
        )
    """, (str(uid), email))
    return uid


def _set_auth(cur, user_id):
    """Make auth.uid() return the given UUID for this connection."""
    cur.execute(
        "SELECT set_config('request.jwt.claims', %s, true)",
        ('{"sub": "%s", "role": "authenticated"}' % user_id,)
    )


@pytest.fixture
def make_player(cur):
    """Factory: creates an auth user + invokes choose_industry to set up
    a fresh player with a starting district. Returns the player UUID."""
    counter = {'n': 0}
    def _make(industry='timber', display_name=None):
        counter['n'] += 1
        suffix = uuid.uuid4().hex[:8]
        email = f"test-{counter['n']}-{suffix}@citybuilder.test"
        name = display_name or f"Tester{counter['n']}"
        uid = _create_auth_user(cur, email)
        _set_auth(cur, uid)
        cur.execute("SELECT public.choose_industry(%s, %s)", (name, industry))
        cur.execute("SELECT id, industry_key, money, chunks_owned, home_x, home_y FROM public.player_profiles WHERE id = %s", (str(uid),))
        row = cur.fetchone()
        assert row, f"choose_industry didn't create player_profile for {uid}"
        return {
            'id': uid,
            'industry_key': row[1],
            'money': row[2],
            'chunks_owned': row[3],
            'home_x': row[4],
            'home_y': row[5],
        }
    return _make


@pytest.fixture
def as_user(cur):
    """Switch the current connection's auth context to the given user."""
    def _as(user_id):
        _set_auth(cur, user_id if isinstance(user_id, str) else str(user_id))
    return _as


# ───────────────────────────────────────────────────────────
# Tile / building helpers
# ───────────────────────────────────────────────────────────

@pytest.fixture
def tile_id_at(cur):
    """Resolve (x, y) -> tile_id."""
    def _at(x, y):
        cur.execute("SELECT id FROM public.map_tiles WHERE x = %s AND y = %s", (x, y))
        row = cur.fetchone()
        return row[0] if row else None
    return _at


@pytest.fixture
def clear_resources(cur):
    """Wipe any random resource clusters from a player's district. Tests
    that build at known coordinates near home need this because the
    reject_build_on_resource trigger blocks building on a resource tile,
    and clustering may seed a resource right where the test wants to build."""
    def _clear(player_id):
        cur.execute(
            "UPDATE public.map_tiles SET resource_node_key = NULL WHERE owner_player_id = %s",
            (str(player_id),),
        )
    return _clear


@pytest.fixture
def place(cur, tile_id_at):
    """Place a building via RPC. Returns the JSON result.

    Auto-resolves (x, y) to tile_id and asserts the tile exists.
    """
    def _place(building_type_key, x, y):
        tid = tile_id_at(x, y)
        assert tid is not None, f"No tile at ({x}, {y}) — make sure the player's district covers it"
        cur.execute("SELECT public.place_building(%s, %s)", (tid, building_type_key))
        return cur.fetchone()[0]
    return _place
