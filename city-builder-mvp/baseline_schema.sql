-- ============================================================
-- City Builder — Baseline Schema (consolidated)
-- ============================================================
-- Generated from the live database. This single file brings a
-- fresh Supabase project to the same schema state as production:
-- tables, indexes, RLS policies, functions, triggers, and the
-- catalog seed data (resources, building types, traders, etc.).
--
-- Replaces the layered set of migrations under city-builder-mvp/
-- which redefined functions like place_building 8 times. Old
-- migration files are kept in city-builder-mvp/migrations-archive/
-- for historical context.
--
-- DO NOT run this on the existing live database — it would drop
-- everything. This file is for spinning up fresh projects.
-- ============================================================

-- Drop any pre-existing public objects so re-runs are idempotent.
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO public;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ────────────────────────────────────────────────────────────
-- 1. TABLES
-- ────────────────────────────────────────────────────────────

CREATE TABLE public.resources (
  key text NOT NULL,
  name text NOT NULL,
  kind text NOT NULL,
  industry_key text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  PRIMARY KEY (key),
  CONSTRAINT resources_kind_check CHECK ((kind = ANY (ARRAY['raw'::text, 'processed'::text])))
);

CREATE TABLE public.building_types (
  key text NOT NULL,
  name text NOT NULL,
  tier integer NOT NULL,
  industry_key text NOT NULL,
  category text NOT NULL,
  build_cost integer NOT NULL,
  worker_cost integer NOT NULL DEFAULT 1,
  input_resource_key text,
  input_rate numeric NOT NULL DEFAULT 0,
  output_resource_key text,
  output_rate numeric NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  workers_provided integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key),
  CONSTRAINT building_types_category_check CHECK ((category = ANY (ARRAY['extractor'::text, 'processor'::text, 'housing'::text, 'road'::text]))),
  CONSTRAINT building_types_tier_check CHECK ((tier = ANY (ARRAY[1, 2, 3])))
);

CREATE TABLE public.player_profiles (
  id uuid NOT NULL,
  display_name text NOT NULL,
  industry_key text NOT NULL,
  money integer NOT NULL DEFAULT 500,
  worker_capacity integer NOT NULL DEFAULT 5,
  workers_used integer NOT NULL DEFAULT 0,
  color_hex text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  chunks_owned integer NOT NULL DEFAULT 0,
  home_x integer,
  home_y integer,
  reserved_row integer,
  PRIMARY KEY (id)
);

CREATE UNIQUE INDEX player_profiles_reserved_row_key
  ON public.player_profiles (reserved_row)
  WHERE reserved_row IS NOT NULL;

CREATE TABLE public.map_tiles (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  x integer NOT NULL,
  y integer NOT NULL,
  terrain_type text NOT NULL DEFAULT 'ground'::text,
  resource_node_key text,
  buildable boolean NOT NULL DEFAULT true,
  occupied_building_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  owner_player_id uuid,
  claimed_by_building_id uuid,
  PRIMARY KEY (id),
  CONSTRAINT map_tiles_occupied_building_id_key UNIQUE (occupied_building_id),
  CONSTRAINT map_tiles_x_y_key UNIQUE (x, y)
);

CREATE TABLE public.buildings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  building_type_key text NOT NULL,
  tile_id uuid NOT NULL,
  x integer NOT NULL,
  y integer NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  stored_input numeric NOT NULL DEFAULT 0,
  stored_output numeric NOT NULL DEFAULT 0,
  last_processed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  housing_tier integer NOT NULL DEFAULT 1,
  evolution_eligible_at timestamptz,
  target_x integer,
  target_y integer,
  path_length integer,
  PRIMARY KEY (id),
  CONSTRAINT buildings_tile_id_key UNIQUE (tile_id),
  CONSTRAINT buildings_status_check CHECK ((status = ANY (ARRAY['active'::text, 'paused'::text])))
);

CREATE TABLE public.counter (
  id integer NOT NULL DEFAULT 1,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  CONSTRAINT counter_id_check CHECK ((id = 1))
);

CREATE TABLE public.district_chunks (
  chunk_x integer NOT NULL,
  chunk_y integer NOT NULL,
  owner_player_id uuid NOT NULL,
  allocated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (chunk_x, chunk_y)
);

CREATE TABLE public.external_trade_partners (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL,
  name text NOT NULL,
  description text,
  buy_catalog jsonb NOT NULL DEFAULT '{}'::jsonb,
  sell_catalog jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.housing_tier_config (
  tier integer NOT NULL,
  name text NOT NULL,
  label text NOT NULL DEFAULT '?'::text,
  workers integer NOT NULL DEFAULT 0,
  needs_road boolean NOT NULL DEFAULT false,
  upgrade_secs integer NOT NULL DEFAULT 30,
  devolve_secs integer NOT NULL DEFAULT 60,
  PRIMARY KEY (tier)
);

CREATE TABLE public.inventories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  resource_key text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT inventories_player_id_resource_key_key UNIQUE (player_id, resource_key)
);

CREATE TABLE public.player_notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  kind text NOT NULL,
  title text NOT NULL,
  body text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

CREATE TABLE public.player_trade_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL,
  seller_id uuid NOT NULL,
  seller_name text,
  resource_key text NOT NULL,
  amount integer NOT NULL,
  price_per_unit integer NOT NULL,
  total_gold integer NOT NULL,
  status text NOT NULL DEFAULT 'open'::text,
  buyer_id uuid,
  fulfilled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT player_trade_offers_amount_check CHECK ((amount > 0)),
  CONSTRAINT player_trade_offers_price_per_unit_check CHECK ((price_per_unit > 0)),
  CONSTRAINT player_trade_offers_status_check CHECK ((status = ANY (ARRAY['open'::text, 'fulfilled'::text, 'cancelled'::text]))),
  CONSTRAINT player_trade_offers_total_gold_check CHECK ((total_gold > 0))
);

CREATE TABLE public.trade_offers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  world_id uuid NOT NULL,
  from_player_id uuid NOT NULL,
  to_player_id uuid,
  offer_resource_key text NOT NULL,
  offer_amount numeric NOT NULL,
  want_resource_key text,
  want_amount numeric,
  ask_gold integer,
  status text NOT NULL DEFAULT 'open'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  PRIMARY KEY (id),
  CONSTRAINT trade_offers_ask_gold_check CHECK (((ask_gold IS NULL) OR (ask_gold >= 0))),
  CONSTRAINT trade_offers_offer_amount_check CHECK ((offer_amount > (0)::numeric)),
  CONSTRAINT trade_offers_status_check CHECK ((status = ANY (ARRAY['open'::text, 'accepted'::text, 'cancelled'::text, 'expired'::text, 'rejected'::text]))),
  CONSTRAINT trade_offers_want_amount_check CHECK (((want_amount IS NULL) OR (want_amount > (0)::numeric)))
);

CREATE TABLE public.trade_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  resource_key text NOT NULL,
  mode text NOT NULL DEFAULT 'keep'::text,
  reserve_target integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT trade_policies_player_id_resource_key_key UNIQUE (player_id, resource_key),
  CONSTRAINT trade_policies_mode_check CHECK ((mode = ANY (ARRAY['keep'::text, 'sell_surplus'::text, 'buy_to_reserve'::text])))
);

CREATE TABLE public.traders (
  key text NOT NULL,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  visit_capacity integer NOT NULL DEFAULT 20,
  visit_interval_minutes integer NOT NULL DEFAULT 10,
  display_order integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key)
);

CREATE TABLE public.trade_transactions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  player_id uuid NOT NULL,
  trader_key text NOT NULL,
  resource_key text NOT NULL,
  quantity numeric NOT NULL,
  unit_price integer NOT NULL,
  total_price integer NOT NULL,
  transaction_type text NOT NULL DEFAULT 'sell'::text,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id),
  CONSTRAINT trade_transactions_transaction_type_check CHECK ((transaction_type = ANY (ARRAY['sell'::text, 'buy'::text])))
);

CREATE TABLE public.trader_prices (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trader_key text NOT NULL,
  resource_key text NOT NULL,
  buy_price integer,
  is_active boolean NOT NULL DEFAULT true,
  sell_price integer,
  PRIMARY KEY (id),
  CONSTRAINT trader_prices_trader_key_resource_key_key UNIQUE (trader_key, resource_key)
);

CREATE TABLE public.trader_visits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  trader_key text NOT NULL,
  player_id uuid NOT NULL,
  visited_at timestamptz NOT NULL DEFAULT now(),
  capacity_total integer NOT NULL,
  capacity_used integer NOT NULL DEFAULT 0,
  summary jsonb NOT NULL DEFAULT '[]'::jsonb,
  PRIMARY KEY (id)
);

-- ────────────────────────────────────────────────────────────
-- 2. FOREIGN KEYS
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.building_types ADD CONSTRAINT building_types_input_resource_key_fkey FOREIGN KEY (input_resource_key) REFERENCES resources(key);
ALTER TABLE public.building_types ADD CONSTRAINT building_types_output_resource_key_fkey FOREIGN KEY (output_resource_key) REFERENCES resources(key);
ALTER TABLE public.buildings ADD CONSTRAINT buildings_building_type_key_fkey FOREIGN KEY (building_type_key) REFERENCES building_types(key);
ALTER TABLE public.buildings ADD CONSTRAINT buildings_player_id_fkey FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.buildings ADD CONSTRAINT buildings_tile_id_fkey FOREIGN KEY (tile_id) REFERENCES map_tiles(id) ON DELETE RESTRICT;
ALTER TABLE public.district_chunks ADD CONSTRAINT district_chunks_owner_player_id_fkey FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.inventories ADD CONSTRAINT inventories_player_id_fkey FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.inventories ADD CONSTRAINT inventories_resource_key_fkey FOREIGN KEY (resource_key) REFERENCES resources(key);
ALTER TABLE public.map_tiles ADD CONSTRAINT map_tiles_claimed_by_building_fkey FOREIGN KEY (claimed_by_building_id) REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE public.map_tiles ADD CONSTRAINT map_tiles_occupied_building_id_fkey FOREIGN KEY (occupied_building_id) REFERENCES buildings(id) ON DELETE SET NULL;
ALTER TABLE public.map_tiles ADD CONSTRAINT map_tiles_owner_player_id_fkey FOREIGN KEY (owner_player_id) REFERENCES player_profiles(id) ON DELETE SET NULL;
ALTER TABLE public.map_tiles ADD CONSTRAINT map_tiles_resource_node_key_fkey FOREIGN KEY (resource_node_key) REFERENCES resources(key);
ALTER TABLE public.player_profiles ADD CONSTRAINT player_profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.trade_policies ADD CONSTRAINT trade_policies_player_id_fkey FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.trade_policies ADD CONSTRAINT trade_policies_resource_key_fkey FOREIGN KEY (resource_key) REFERENCES resources(key);
ALTER TABLE public.trade_transactions ADD CONSTRAINT trade_transactions_player_id_fkey FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.trade_transactions ADD CONSTRAINT trade_transactions_resource_key_fkey FOREIGN KEY (resource_key) REFERENCES resources(key);
ALTER TABLE public.trade_transactions ADD CONSTRAINT trade_transactions_trader_key_fkey FOREIGN KEY (trader_key) REFERENCES traders(key);
ALTER TABLE public.trader_prices ADD CONSTRAINT trader_prices_resource_key_fkey FOREIGN KEY (resource_key) REFERENCES resources(key);
ALTER TABLE public.trader_prices ADD CONSTRAINT trader_prices_trader_key_fkey FOREIGN KEY (trader_key) REFERENCES traders(key) ON DELETE CASCADE;
ALTER TABLE public.trader_visits ADD CONSTRAINT trader_visits_player_id_fkey FOREIGN KEY (player_id) REFERENCES player_profiles(id) ON DELETE CASCADE;
ALTER TABLE public.trader_visits ADD CONSTRAINT trader_visits_trader_key_fkey FOREIGN KEY (trader_key) REFERENCES traders(key);

-- ────────────────────────────────────────────────────────────
-- 3. INDEXES
-- ────────────────────────────────────────────────────────────

CREATE INDEX idx_buildings_player_id ON public.buildings USING btree (player_id);
CREATE INDEX idx_buildings_target_xy ON public.buildings USING btree (target_x, target_y) WHERE (target_x IS NOT NULL);
CREATE INDEX idx_buildings_tile_id ON public.buildings USING btree (tile_id);
CREATE INDEX idx_district_chunks_owner ON public.district_chunks USING btree (owner_player_id);
CREATE INDEX idx_inventories_player_id ON public.inventories USING btree (player_id);
CREATE UNIQUE INDEX idx_map_tiles_claimed_by ON public.map_tiles USING btree (claimed_by_building_id) WHERE (claimed_by_building_id IS NOT NULL);
CREATE INDEX idx_map_tiles_owner ON public.map_tiles USING btree (owner_player_id) WHERE (owner_player_id IS NOT NULL);
CREATE INDEX idx_map_tiles_xy ON public.map_tiles USING btree (x, y);
CREATE INDEX idx_notifications_player_id_created_at ON public.player_notifications USING btree (player_id, created_at DESC);
CREATE INDEX idx_pto_open ON public.player_trade_offers USING btree (world_id, status) WHERE (status = 'open'::text);
CREATE INDEX idx_trade_offers_from_player_id ON public.trade_offers USING btree (from_player_id);
CREATE INDEX idx_trade_offers_to_player_id ON public.trade_offers USING btree (to_player_id);
CREATE INDEX idx_trade_offers_world_id ON public.trade_offers USING btree (world_id);
CREATE INDEX idx_trade_policies_player ON public.trade_policies USING btree (player_id);
CREATE INDEX idx_trade_transactions_player_id ON public.trade_transactions USING btree (player_id);
CREATE INDEX idx_trader_visits_player ON public.trader_visits USING btree (player_id);
CREATE INDEX idx_trader_visits_visited_at ON public.trader_visits USING btree (player_id, visited_at DESC);

-- ────────────────────────────────────────────────────────────
-- 4. ROW LEVEL SECURITY
-- ────────────────────────────────────────────────────────────

ALTER TABLE public.building_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.buildings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.district_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.external_trade_partners ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.housing_tier_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_tiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.player_trade_offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trade_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trader_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.traders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "building_types_read_all" ON public.building_types FOR SELECT USING (true);
CREATE POLICY "buildings_delete_self" ON public.buildings FOR DELETE USING ((auth.uid() = player_id));
CREATE POLICY "buildings_insert_self" ON public.buildings FOR INSERT WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "buildings_read_all" ON public.buildings FOR SELECT USING (true);
CREATE POLICY "buildings_update_self" ON public.buildings FOR UPDATE USING ((auth.uid() = player_id)) WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "district_chunks_read_all" ON public.district_chunks FOR SELECT USING (true);
CREATE POLICY "trade_partners_read" ON public.external_trade_partners FOR SELECT USING (true);
CREATE POLICY "Anyone can read housing tier config" ON public.housing_tier_config FOR SELECT USING (true);
CREATE POLICY "inventories_insert_self" ON public.inventories FOR INSERT WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "inventories_select_self" ON public.inventories FOR SELECT USING ((auth.uid() = player_id));
CREATE POLICY "inventories_update_self" ON public.inventories FOR UPDATE USING ((auth.uid() = player_id)) WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "map_tiles_read_all" ON public.map_tiles FOR SELECT USING (true);
CREATE POLICY "player_profiles_insert_self" ON public.player_profiles FOR INSERT WITH CHECK ((auth.uid() = id));
CREATE POLICY "player_profiles_select_all" ON public.player_profiles FOR SELECT USING (true);
CREATE POLICY "player_profiles_update_self" ON public.player_profiles FOR UPDATE USING ((auth.uid() = id)) WITH CHECK ((auth.uid() = id));
CREATE POLICY "pto_read" ON public.player_trade_offers FOR SELECT USING (true);
CREATE POLICY "resources_read_all" ON public.resources FOR SELECT USING (true);
CREATE POLICY "trade_policies_insert_self" ON public.trade_policies FOR INSERT WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "trade_policies_select_self" ON public.trade_policies FOR SELECT USING ((auth.uid() = player_id));
CREATE POLICY "trade_policies_update_self" ON public.trade_policies FOR UPDATE USING ((auth.uid() = player_id)) WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "trade_transactions_insert_self" ON public.trade_transactions FOR INSERT WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "trade_transactions_select_self" ON public.trade_transactions FOR SELECT USING ((auth.uid() = player_id));
CREATE POLICY "trader_prices_read_all" ON public.trader_prices FOR SELECT USING (true);
CREATE POLICY "trader_visits_insert_self" ON public.trader_visits FOR INSERT WITH CHECK ((auth.uid() = player_id));
CREATE POLICY "trader_visits_select_self" ON public.trader_visits FOR SELECT USING ((auth.uid() = player_id));
CREATE POLICY "traders_read_all" ON public.traders FOR SELECT USING (true);

-- ────────────────────────────────────────────────────────────
-- 5. FUNCTIONS
-- ────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.allocate_district_chunk(p_player_id uuid, p_chunk_x integer, p_chunk_y integer)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_player record;
  v_x_start integer := p_chunk_x * 15;
  v_y_start integer := p_chunk_y * 15;
  v_dx integer;
  v_dy integer;
  v_resource_key text;
  v_resource_count integer;
  v_is_first_chunk boolean;

  -- Cluster generator state
  v_cluster_count constant integer := 4;
  v_cluster_idx integer;
  v_walk_steps integer;
  v_step_idx integer;
  v_seed_dx integer;
  v_seed_dy integer;
  v_curr_dx integer;
  v_curr_dy integer;
  v_new_dx integer;
  v_new_dy integer;
  v_dir integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.district_chunks
    WHERE chunk_x = p_chunk_x AND chunk_y = p_chunk_y
  ) THEN
    RAISE EXCEPTION 'Chunk (%, %) is already allocated', p_chunk_x, p_chunk_y;
  END IF;

  SELECT * INTO v_player FROM public.player_profiles WHERE id = p_player_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;

  v_resource_key := v_player.industry_key;
  v_is_first_chunk := (v_player.chunks_owned = 0);

  -- Lay down all 225 ground tiles with no resource. Cluster seeding fills
  -- them in below. Upsert preserves any pre-existing resource on a tile.
  FOR v_dx IN 0..14 LOOP
    FOR v_dy IN 0..14 LOOP
      INSERT INTO public.map_tiles (
        x, y, terrain_type, resource_node_key, buildable, owner_player_id
      ) VALUES (
        v_x_start + v_dx,
        v_y_start + v_dy,
        'ground',
        NULL,
        true,
        p_player_id
      )
      ON CONFLICT (x, y) DO UPDATE SET
        owner_player_id = p_player_id,
        terrain_type = 'ground',
        buildable = true;
    END LOOP;
  END LOOP;

  -- Drop N cluster seeds at random points and random-walk each one out
  -- 6-15 steps. Out-of-chunk steps rewind to the seed so clusters stay
  -- in-chunk. Revisits are no-ops, so actual cluster sizes are organic.
  FOR v_cluster_idx IN 1..v_cluster_count LOOP
    v_seed_dx := floor(random() * 15)::integer;
    v_seed_dy := floor(random() * 15)::integer;
    v_walk_steps := 6 + floor(random() * 10)::integer;
    v_curr_dx := v_seed_dx;
    v_curr_dy := v_seed_dy;

    UPDATE public.map_tiles
    SET resource_node_key = v_resource_key
    WHERE x = v_x_start + v_curr_dx
      AND y = v_y_start + v_curr_dy
      AND resource_node_key IS NULL;

    FOR v_step_idx IN 1..v_walk_steps LOOP
      v_dir := floor(random() * 4)::integer;
      v_new_dx := v_curr_dx
                  + CASE v_dir WHEN 0 THEN 1 WHEN 1 THEN -1 ELSE 0 END;
      v_new_dy := v_curr_dy
                  + CASE v_dir WHEN 2 THEN 1 WHEN 3 THEN -1 ELSE 0 END;
      IF v_new_dx < 0 OR v_new_dx > 14
         OR v_new_dy < 0 OR v_new_dy > 14 THEN
        v_curr_dx := v_seed_dx;
        v_curr_dy := v_seed_dy;
        CONTINUE;
      END IF;
      UPDATE public.map_tiles
      SET resource_node_key = v_resource_key
      WHERE x = v_x_start + v_new_dx
        AND y = v_y_start + v_new_dy
        AND resource_node_key IS NULL;
      v_curr_dx := v_new_dx;
      v_curr_dy := v_new_dy;
    END LOOP;
  END LOOP;

  -- Curving highways: horizontal walks (0,7) → (14,7) and vertical walks
  -- (7,0) → (7,14). The four edge endpoints are fixed so chunks always
  -- match across borders; in between, the path can drift up to ±3 tiles
  -- off the centerline before being forced back. mark_highway_tile()
  -- updates one cell at a time and clears any resource cluster that
  -- happened to seed onto the path.
  DECLARE
    v_axis_pos integer;
    v_cur_off integer;
    v_steps_left integer;
    v_can_drift boolean;
    v_drift_dir integer;
  BEGIN
    -- Horizontal pass
    v_axis_pos := 0;
    v_cur_off := 0;
    PERFORM public.mark_highway_tile(p_player_id, v_x_start + 0, v_y_start + 7);
    WHILE v_axis_pos < 14 LOOP
      v_steps_left := 14 - v_axis_pos;
      v_can_drift := abs(v_cur_off) + 1 < v_steps_left;
      IF v_can_drift AND random() < 0.35 THEN
        IF v_cur_off > 0 THEN
          v_drift_dir := CASE WHEN random() < 0.65 THEN -1 ELSE 1 END;
        ELSIF v_cur_off < 0 THEN
          v_drift_dir := CASE WHEN random() < 0.65 THEN 1 ELSE -1 END;
        ELSE
          v_drift_dir := CASE WHEN random() < 0.5 THEN 1 ELSE -1 END;
        END IF;
        IF abs(v_cur_off + v_drift_dir) > 3 THEN
          v_drift_dir := -v_drift_dir;
        END IF;
        v_cur_off := v_cur_off + v_drift_dir;
        PERFORM public.mark_highway_tile(p_player_id,
          v_x_start + v_axis_pos, v_y_start + 7 + v_cur_off);
      ELSE
        IF NOT v_can_drift AND v_cur_off != 0 THEN
          v_cur_off := v_cur_off - sign(v_cur_off);
          PERFORM public.mark_highway_tile(p_player_id,
            v_x_start + v_axis_pos, v_y_start + 7 + v_cur_off);
        ELSE
          v_axis_pos := v_axis_pos + 1;
          PERFORM public.mark_highway_tile(p_player_id,
            v_x_start + v_axis_pos, v_y_start + 7 + v_cur_off);
        END IF;
      END IF;
    END LOOP;
    WHILE v_cur_off != 0 LOOP
      v_cur_off := v_cur_off - sign(v_cur_off);
      PERFORM public.mark_highway_tile(p_player_id,
        v_x_start + 14, v_y_start + 7 + v_cur_off);
    END LOOP;

    -- Vertical pass (transposed)
    v_axis_pos := 0;
    v_cur_off := 0;
    PERFORM public.mark_highway_tile(p_player_id, v_x_start + 7, v_y_start + 0);
    WHILE v_axis_pos < 14 LOOP
      v_steps_left := 14 - v_axis_pos;
      v_can_drift := abs(v_cur_off) + 1 < v_steps_left;
      IF v_can_drift AND random() < 0.35 THEN
        IF v_cur_off > 0 THEN
          v_drift_dir := CASE WHEN random() < 0.65 THEN -1 ELSE 1 END;
        ELSIF v_cur_off < 0 THEN
          v_drift_dir := CASE WHEN random() < 0.65 THEN 1 ELSE -1 END;
        ELSE
          v_drift_dir := CASE WHEN random() < 0.5 THEN 1 ELSE -1 END;
        END IF;
        IF abs(v_cur_off + v_drift_dir) > 3 THEN
          v_drift_dir := -v_drift_dir;
        END IF;
        v_cur_off := v_cur_off + v_drift_dir;
        PERFORM public.mark_highway_tile(p_player_id,
          v_x_start + 7 + v_cur_off, v_y_start + v_axis_pos);
      ELSE
        IF NOT v_can_drift AND v_cur_off != 0 THEN
          v_cur_off := v_cur_off - sign(v_cur_off);
          PERFORM public.mark_highway_tile(p_player_id,
            v_x_start + 7 + v_cur_off, v_y_start + v_axis_pos);
        ELSE
          v_axis_pos := v_axis_pos + 1;
          PERFORM public.mark_highway_tile(p_player_id,
            v_x_start + 7 + v_cur_off, v_y_start + v_axis_pos);
        END IF;
      END IF;
    END LOOP;
    WHILE v_cur_off != 0 LOOP
      v_cur_off := v_cur_off - sign(v_cur_off);
      PERFORM public.mark_highway_tile(p_player_id,
        v_x_start + 7 + v_cur_off, v_y_start + 14);
    END LOOP;
  END;

  IF v_is_first_chunk THEN
    UPDATE public.player_profiles
    SET home_x = v_x_start + 7, home_y = v_y_start + 7
    WHERE id = p_player_id;
  END IF;

  INSERT INTO public.district_chunks (chunk_x, chunk_y, owner_player_id)
  VALUES (p_chunk_x, p_chunk_y, p_player_id);

  UPDATE public.player_profiles
  SET chunks_owned = chunks_owned + 1
  WHERE id = p_player_id;

  SELECT COUNT(*) INTO v_resource_count
  FROM public.map_tiles
  WHERE owner_player_id = p_player_id
    AND x >= v_x_start AND x < v_x_start + 15
    AND y >= v_y_start AND y < v_y_start + 15
    AND resource_node_key IS NOT NULL;

  RETURN json_build_object(
    'chunk_x', p_chunk_x,
    'chunk_y', p_chunk_y,
    'tile_x_start', v_x_start,
    'tile_y_start', v_y_start,
    'resource_tiles', v_resource_count,
    'is_first_chunk', v_is_first_chunk
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.black_market_trade(p_resource_key text, p_quantity integer, p_direction text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_buy_from_player integer;
  v_sell_to_player integer;
  v_unit_price integer;
  v_total integer;
  v_available numeric;
  v_player_money integer;
  v_new_money integer;
BEGIN
  IF p_direction NOT IN ('buy', 'sell') THEN
    RAISE EXCEPTION 'Invalid direction: %. Must be buy or sell.', p_direction;
  END IF;
  IF p_quantity < 1 THEN
    RAISE EXCEPTION 'Quantity must be at least 1';
  END IF;

  PERFORM public.process_production();

  SELECT
    CASE p_resource_key
      WHEN 'timber'    THEN 2
      WHEN 'stone'     THEN 2
      WHEN 'lumber'    THEN 5
      WHEN 'brick'     THEN 6
      WHEN 'grain'     THEN 2
      WHEN 'flour'     THEN 5
      WHEN 'clay'      THEN 2
      WHEN 'pottery'   THEN 5
      WHEN 'bread'     THEN 8
      WHEN 'furniture' THEN 10
      WHEN 'statuary'  THEN 10
      ELSE NULL
    END,
    CASE p_resource_key
      WHEN 'timber'    THEN 10
      WHEN 'stone'     THEN 11
      WHEN 'lumber'    THEN 18
      WHEN 'brick'     THEN 20
      WHEN 'grain'     THEN 9
      WHEN 'flour'     THEN 16
      WHEN 'clay'      THEN 8
      WHEN 'pottery'   THEN 15
      WHEN 'bread'     THEN 22
      WHEN 'furniture' THEN 28
      WHEN 'statuary'  THEN 30
      ELSE NULL
    END
  INTO v_buy_from_player, v_sell_to_player;

  IF v_buy_from_player IS NULL THEN
    RAISE EXCEPTION 'Resource not available on black market: %', p_resource_key;
  END IF;

  IF p_direction = 'sell' THEN
    v_unit_price := v_buy_from_player;
    v_total := v_unit_price * p_quantity;

    SELECT COALESCE(quantity, 0) INTO v_available
    FROM public.inventories
    WHERE player_id = v_uid AND resource_key = p_resource_key;

    IF v_available IS NULL OR v_available < p_quantity THEN
      RAISE EXCEPTION 'Not enough % (have %, need %)', p_resource_key, COALESCE(v_available, 0), p_quantity;
    END IF;

    UPDATE public.inventories
    SET quantity = quantity - p_quantity, updated_at = now()
    WHERE player_id = v_uid AND resource_key = p_resource_key;

    UPDATE public.player_profiles
    SET money = money + v_total
    WHERE id = v_uid
    RETURNING money INTO v_new_money;

    INSERT INTO public.trade_transactions (player_id, trader_key, resource_key, quantity, unit_price, total_price, transaction_type)
    VALUES (v_uid, 'black_market', p_resource_key, p_quantity, v_unit_price, v_total, 'sell');

  ELSE
    v_unit_price := v_sell_to_player;
    v_total := v_unit_price * p_quantity;

    SELECT money INTO v_player_money
    FROM public.player_profiles WHERE id = v_uid;

    IF v_player_money < v_total THEN
      RAISE EXCEPTION 'Not enough money (have $%, need $%)', v_player_money, v_total;
    END IF;

    UPDATE public.player_profiles
    SET money = money - v_total
    WHERE id = v_uid
    RETURNING money INTO v_new_money;

    INSERT INTO public.inventories (player_id, resource_key, quantity)
    VALUES (v_uid, p_resource_key, p_quantity)
    ON CONFLICT (player_id, resource_key)
    DO UPDATE SET quantity = inventories.quantity + p_quantity, updated_at = now();

    INSERT INTO public.trade_transactions (player_id, trader_key, resource_key, quantity, unit_price, total_price, transaction_type)
    VALUES (v_uid, 'black_market', p_resource_key, p_quantity, v_unit_price, v_total, 'buy');
  END IF;

  RETURN json_build_object(
    'direction', p_direction,
    'resource', p_resource_key,
    'quantity', p_quantity,
    'unit_price', v_unit_price,
    'total_price', v_total,
    'money', v_new_money,
    'inventory', COALESCE(
      (SELECT json_object_agg(resource_key, quantity)
       FROM public.inventories WHERE player_id = v_uid),
      '{}'::json
    )
  );
END;
$function$


-- Helper for allocate_district_chunk's curving-highway pass: stamp one
-- highway tile on an owned ground tile. Idempotent; clears any resource
-- cluster that happened to seed onto the path.
CREATE OR REPLACE FUNCTION public.mark_highway_tile(
  p_player_id uuid, p_x integer, p_y integer
) RETURNS void
LANGUAGE sql
AS $function$
  UPDATE public.map_tiles
  SET terrain_type = 'highway',
      buildable = false,
      resource_node_key = NULL
  WHERE owner_player_id = p_player_id
    AND x = p_x AND y = p_y;
$function$;


-- Trigger fn: reject inserting a building on a tile that still has a
-- resource_node_key. The player must clear the resource first.
CREATE OR REPLACE FUNCTION public.reject_build_on_resource()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_resource text;
BEGIN
  SELECT mt.resource_node_key INTO v_resource
  FROM public.map_tiles mt WHERE mt.id = NEW.tile_id;
  IF v_resource IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot build on a resource tile — clear the % resource first', v_resource;
  END IF;
  RETURN NEW;
END;
$function$;


-- Player action: clear a resource on an owned tile so the tile can be
-- built on. Free for now. Rejects if the tile is claimed by an extractor
-- (the player should demolish the extractor first so the dependency is
-- explicit, rather than silently re-targeting).
CREATE OR REPLACE FUNCTION public.clear_resource_tile(p_tile_id uuid)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tile record;
BEGIN
  SELECT * INTO v_tile FROM public.map_tiles WHERE id = p_tile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tile not found'; END IF;
  IF v_tile.owner_player_id IS NULL OR v_tile.owner_player_id <> v_uid THEN
    RAISE EXCEPTION 'Cannot clear a resource tile you do not own';
  END IF;
  IF v_tile.resource_node_key IS NULL THEN
    RAISE EXCEPTION 'Tile has no resource to clear';
  END IF;
  IF v_tile.claimed_by_building_id IS NOT NULL THEN
    RAISE EXCEPTION 'Demolish the extractor targeting this tile before clearing it';
  END IF;
  UPDATE public.map_tiles
  SET resource_node_key = NULL
  WHERE id = p_tile_id;
  RETURN json_build_object(
    'tile_id', p_tile_id,
    'cleared_resource', v_tile.resource_node_key,
    'x', v_tile.x,
    'y', v_tile.y
  );
END;
$function$;


CREATE OR REPLACE FUNCTION public.choose_industry(p_display_name text, p_industry_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_profile record;
  v_chunks_owned integer;
  v_row integer;
BEGIN
  IF p_industry_key NOT IN ('timber', 'stone', 'grain', 'clay') THEN
    RAISE EXCEPTION 'Invalid industry. Choose timber, stone, grain, or clay.';
  END IF;
  IF length(trim(p_display_name)) < 2 THEN
    RAISE EXCEPTION 'Display name must be at least 2 characters.';
  END IF;

  INSERT INTO public.player_profiles (
    id, display_name, industry_key, money, worker_capacity, workers_used, chunks_owned
  ) VALUES (
    v_uid, trim(p_display_name), p_industry_key, 500, 5, 0, 0
  )
  ON CONFLICT (id) DO UPDATE SET
    display_name = trim(EXCLUDED.display_name),
    industry_key = EXCLUDED.industry_key,
    updated_at = now();

  -- Seed inventory rows for every known resource (zero quantity).
  -- Idempotent — won't clobber existing balances.
  INSERT INTO public.inventories (player_id, resource_key, quantity) VALUES
    (v_uid, 'timber', 0), (v_uid, 'lumber', 0),
    (v_uid, 'stone', 0),  (v_uid, 'brick', 0),
    (v_uid, 'grain', 0),  (v_uid, 'flour', 0),
    (v_uid, 'clay', 0),   (v_uid, 'pottery', 0),
    (v_uid, 'bread', 0),  (v_uid, 'furniture', 0),
    (v_uid, 'statuary', 0)
  ON CONFLICT (player_id, resource_key) DO NOTHING;

  -- Allocate first chunk on a fresh reserved row going down.
  SELECT chunks_owned INTO v_chunks_owned
  FROM public.player_profiles WHERE id = v_uid;

  IF v_chunks_owned = 0 THEN
    v_row := public.next_starter_row();
    UPDATE public.player_profiles SET reserved_row = v_row WHERE id = v_uid;
    PERFORM public.allocate_district_chunk(v_uid, 0, v_row);
  END IF;

  SELECT * INTO v_profile FROM public.player_profiles WHERE id = v_uid;

  RETURN json_build_object(
    'id', v_profile.id,
    'display_name', v_profile.display_name,
    'industry_key', v_profile.industry_key,
    'money', v_profile.money,
    'worker_capacity', v_profile.worker_capacity,
    'workers_used', v_profile.workers_used,
    'chunks_owned', v_profile.chunks_owned,
    'home_x', v_profile.home_x,
    'home_y', v_profile.home_y,
    'reserved_row', v_profile.reserved_row
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.complete_onboarding(p_display_name text, p_specialization_key text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_player_id uuid;
  v_world_id uuid;
  v_district_id uuid;
  v_email text;
  v_district_slot record;
begin
  v_player_id := auth.uid();
  if v_player_id is null then
    raise exception 'Not authenticated';
  end if;

  if p_display_name is null or length(trim(p_display_name)) < 2 then
    raise exception 'Display name must be at least 2 characters';
  end if;
  if length(trim(p_display_name)) > 24 then
    raise exception 'Display name must be 24 characters or fewer';
  end if;

  if p_specialization_key not in ('timber', 'stone', 'grain', 'clay', 'iron_ore') then
    raise exception 'Invalid specialization. Must be timber, stone, grain, clay, or iron_ore.';
  end if;

  if exists (
    select 1 from public.player_profiles
    where id = v_player_id and specialization_key is not null
  ) then
    raise exception 'Player has already completed onboarding';
  end if;

  select id into v_world_id
  from public.worlds
  where slug = 'alpha-world' and status = 'active'
  limit 1;

  if v_world_id is null then
    raise exception 'No active world found';
  end if;

  select email into v_email
  from auth.users
  where id = v_player_id;

  -- Upsert player profile first (needed before district FK)
  insert into public.player_profiles (id, email, display_name, specialization_key, home_world_id, home_district_id)
  values (v_player_id, v_email, trim(p_display_name), p_specialization_key, v_world_id, null)
  on conflict (id) do update set
    display_name = trim(p_display_name),
    specialization_key = p_specialization_key,
    home_world_id = v_world_id;

  -- Auto-create a Tier 1 district
  select
    (s.slot_index % 4) * 8 as ox,
    (s.slot_index / 4) * 8 as oy
  into v_district_slot
  from generate_series(0, 15) as s(slot_index)
  where not exists (
    select 1 from public.districts d
    where d.world_id = v_world_id
      and d.origin_x = (s.slot_index % 4) * 8
      and d.origin_y = (s.slot_index / 4) * 8
  )
  order by s.slot_index
  limit 1;

  if v_district_slot is null then
    raise exception 'No district slots available in the world';
  end if;

  insert into public.districts (world_id, owner_player_id, name, origin_x, origin_y, width, height, tier, status)
  values (v_world_id, v_player_id, trim(p_display_name) || '''s District', v_district_slot.ox, v_district_slot.oy, 8, 8, 1, 'active')
  returning id into v_district_id;

  -- Link district back to profile
  update public.player_profiles
  set home_district_id = v_district_id
  where id = v_player_id;

  -- Create treasury
  insert into public.player_treasuries (player_id, gold, income_per_tick, expenses_per_tick)
  values (v_player_id, 500, 0, 0)
  on conflict (player_id) do nothing;

  -- Create inventory rows for all 15 v1 goods
  insert into public.player_inventories (player_id, resource_key, amount)
  values
    (v_player_id, 'timber', 0),
    (v_player_id, 'stone', 0),
    (v_player_id, 'grain', 0),
    (v_player_id, 'clay', 0),
    (v_player_id, 'iron_ore', 0),
    (v_player_id, 'wood_planks', 0),
    (v_player_id, 'cut_stone', 0),
    (v_player_id, 'bricks', 0),
    (v_player_id, 'iron_bars', 0),
    (v_player_id, 'flour', 0),
    (v_player_id, 'bread', 0),
    (v_player_id, 'tools', 0),
    (v_player_id, 'pottery', 0),
    (v_player_id, 'furniture', 0),
    (v_player_id, 'fine_goods', 0)
  on conflict (player_id, resource_key) do nothing;

  -- Create population state
  insert into public.population_state (player_id, district_id, total_population, housed_population, employed_population, unhoused_population, happiness)
  values (v_player_id, v_district_id, 0, 0, 0, 0, 50)
  on conflict (player_id) do nothing;

  -- Seed district tiles with resource distribution
  perform public.seed_district_tiles(v_district_id, p_specialization_key);

  return jsonb_build_object(
    'success', true,
    'player_id', v_player_id,
    'display_name', trim(p_display_name),
    'specialization', p_specialization_key,
    'world_id', v_world_id,
    'district_id', v_district_id,
    'district_tier', 1
  );
end;
$function$


CREATE OR REPLACE FUNCTION public.expand_district(p_chunk_x integer, p_chunk_y integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_player record;
  v_cost integer;
  v_alloc json;
  v_base_cost integer := 500;
  v_is_candidate boolean;
BEGIN
  SELECT * INTO v_player FROM public.player_profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;

  v_cost := v_base_cost * v_player.chunks_owned * v_player.chunks_owned;

  IF v_player.money < v_cost THEN
    RAISE EXCEPTION 'Not enough money to expand (need %, have %)',
      v_cost, v_player.money;
  END IF;

  -- Validate the player picked a chunk that's in their candidate set.
  SELECT EXISTS (
    SELECT 1 FROM public.expansion_candidates(v_uid) ec
    WHERE ec.chunk_x = p_chunk_x AND ec.chunk_y = p_chunk_y
  ) INTO v_is_candidate;
  IF NOT v_is_candidate THEN
    RAISE EXCEPTION 'Chunk (%, %) is not a valid expansion candidate', p_chunk_x, p_chunk_y;
  END IF;

  v_alloc := public.allocate_district_chunk(v_uid, p_chunk_x, p_chunk_y);

  UPDATE public.player_profiles
  SET money = money - v_cost
  WHERE id = v_uid
  RETURNING * INTO v_player;

  RETURN json_build_object(
    'chunk_x', p_chunk_x,
    'chunk_y', p_chunk_y,
    'cost', v_cost,
    'money', v_player.money,
    'chunks_owned', v_player.chunks_owned,
    'allocation', v_alloc
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.find_nearest_unclaimed_resource(p_player_id uuid, p_ex integer, p_ey integer)
 RETURNS TABLE(target_x integer, target_y integer, path_length integer)
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_player record;
  v_resource_key text;
  v_state jsonb := '{}'::jsonb;
  v_cur_key text;
  v_cur_dist integer;
  v_cur_x integer;
  v_cur_y integer;
  v_neighbor_x integer;
  v_neighbor_y integer;
  v_neighbor_key text;
  v_neighbor_cost integer;
  v_existing_dist integer;
  v_is_road boolean;
  v_is_highway boolean;
  v_neighbor_walkable boolean;
  v_is_resource boolean;
  v_dx int[] := ARRAY[-1, 1, 0, 0];
  v_dy int[] := ARRAY[0, 0, -1, 1];
  v_i integer;
  v_iters integer := 0;
  v_road_cost constant integer := 1;
  v_offroad_cost constant integer := 3;
BEGIN
  SELECT * INTO v_player FROM public.player_profiles WHERE id = p_player_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_resource_key := v_player.industry_key;

  -- Seed: extractor's own tile at distance 0 (we never claim it as target)
  v_state := jsonb_build_object(
    p_ex || ',' || p_ey,
    jsonb_build_object('x', p_ex, 'y', p_ey, 'd', 0, 'v', false)
  );

  -- Dijkstra: pop min-distance unvisited, expand neighbors with weighted cost
  WHILE v_iters < 2000 LOOP
    v_iters := v_iters + 1;

    SELECT key, (value->>'x')::int, (value->>'y')::int, (value->>'d')::int
    INTO v_cur_key, v_cur_x, v_cur_y, v_cur_dist
    FROM jsonb_each(v_state)
    WHERE (value->>'v')::boolean = false
    ORDER BY (value->>'d')::int ASC
    LIMIT 1;

    IF v_cur_key IS NULL THEN RETURN; END IF;

    v_state := jsonb_set(v_state, ARRAY[v_cur_key, 'v'], 'true'::jsonb);

    IF NOT (v_cur_x = p_ex AND v_cur_y = p_ey) THEN
      SELECT EXISTS (
        SELECT 1 FROM public.map_tiles mt
        WHERE mt.x = v_cur_x AND mt.y = v_cur_y
          AND mt.owner_player_id = p_player_id
          AND mt.resource_node_key = v_resource_key
          AND mt.claimed_by_building_id IS NULL
          AND mt.occupied_building_id IS NULL
      ) INTO v_is_resource;
      IF v_is_resource THEN
        target_x := v_cur_x;
        target_y := v_cur_y;
        path_length := v_cur_dist;
        RETURN NEXT;
        RETURN;
      END IF;
    END IF;

    -- Expand 4 neighbors. Walkable at cost 1 if highway tile (any owner,
    -- shared infrastructure) or player-owned road. Off-road = owned by
    -- player + no building on it, cost 3.
    FOR v_i IN 1..4 LOOP
      v_neighbor_x := v_cur_x + v_dx[v_i];
      v_neighbor_y := v_cur_y + v_dy[v_i];
      v_neighbor_key := v_neighbor_x || ',' || v_neighbor_y;

      SELECT EXISTS (
        SELECT 1 FROM public.map_tiles mt
        WHERE mt.x = v_neighbor_x AND mt.y = v_neighbor_y
          AND mt.terrain_type = 'highway'
      ) INTO v_is_highway;

      IF v_is_highway THEN
        v_neighbor_cost := v_road_cost;
        v_neighbor_walkable := true;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.buildings b
          JOIN public.building_types bt ON bt.key = b.building_type_key
          WHERE b.x = v_neighbor_x AND b.y = v_neighbor_y
            AND bt.category = 'road' AND b.status = 'active'
            AND b.player_id = p_player_id
        ) INTO v_is_road;

        IF v_is_road THEN
          v_neighbor_cost := v_road_cost;
          v_neighbor_walkable := true;
        ELSE
          SELECT EXISTS (
            SELECT 1 FROM public.map_tiles mt
            WHERE mt.x = v_neighbor_x AND mt.y = v_neighbor_y
              AND mt.owner_player_id = p_player_id
              AND mt.occupied_building_id IS NULL
          ) INTO v_neighbor_walkable;
          v_neighbor_cost := v_offroad_cost;
        END IF;
      END IF;

      IF NOT v_neighbor_walkable THEN CONTINUE; END IF;

      -- Add or relax
      IF v_state ? v_neighbor_key THEN
        IF NOT ((v_state->v_neighbor_key->>'v')::boolean) THEN
          v_existing_dist := (v_state->v_neighbor_key->>'d')::int;
          IF v_cur_dist + v_neighbor_cost < v_existing_dist THEN
            v_state := jsonb_set(
              v_state, ARRAY[v_neighbor_key, 'd'],
              to_jsonb(v_cur_dist + v_neighbor_cost)
            );
          END IF;
        END IF;
      ELSE
        v_state := v_state || jsonb_build_object(
          v_neighbor_key,
          jsonb_build_object(
            'x', v_neighbor_x, 'y', v_neighbor_y,
            'd', v_cur_dist + v_neighbor_cost, 'v', false
          )
        );
      END IF;
    END LOOP;
  END LOOP;
  RETURN;
END;
$function$


CREATE OR REPLACE FUNCTION public.handle_building_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_bt record;
BEGIN
  IF TG_OP = 'DELETE' THEN
    SELECT * INTO v_bt FROM public.building_types WHERE key = OLD.building_type_key;
    IF v_bt.category = 'road' THEN
      PERFORM public.recompute_extractor_paths(OLD.player_id);
    END IF;
    -- Extractor demolition releases its claim automatically via
    -- ON DELETE SET NULL on map_tiles.claimed_by_building_id.
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$function$


-- A tile counts as having road access if an orthogonal neighbor is
-- either a player-owned road building OR a highway tile (shared
-- infrastructure threading every chunk).
CREATE OR REPLACE FUNCTION public.has_road_access(p_x integer, p_y integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE bt.category = 'road' AND b.status = 'active'
      AND ((b.x = p_x - 1 AND b.y = p_y) OR (b.x = p_x + 1 AND b.y = p_y)
           OR (b.x = p_x AND b.y = p_y - 1) OR (b.x = p_x AND b.y = p_y + 1))
  ) OR EXISTS (
    SELECT 1 FROM public.map_tiles mt
    WHERE mt.terrain_type = 'highway'
      AND ((mt.x = p_x - 1 AND mt.y = p_y) OR (mt.x = p_x + 1 AND mt.y = p_y)
           OR (mt.x = p_x AND mt.y = p_y - 1) OR (mt.x = p_x AND mt.y = p_y + 1))
  );
$function$


CREATE OR REPLACE FUNCTION public.has_road_access(p_player_id uuid, p_x integer, p_y integer)
 RETURNS boolean
 LANGUAGE sql
 STABLE
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE bt.category = 'road' AND b.status = 'active'
      AND b.player_id = p_player_id
      AND ((b.x = p_x - 1 AND b.y = p_y) OR (b.x = p_x + 1 AND b.y = p_y)
           OR (b.x = p_x AND b.y = p_y - 1) OR (b.x = p_x AND b.y = p_y + 1))
  ) OR EXISTS (
    SELECT 1 FROM public.map_tiles mt
    WHERE mt.terrain_type = 'highway'
      AND ((mt.x = p_x - 1 AND mt.y = p_y) OR (mt.x = p_x + 1 AND mt.y = p_y)
           OR (mt.x = p_x AND mt.y = p_y - 1) OR (mt.x = p_x AND mt.y = p_y + 1))
  );
$function$


-- Starter allocator: each new player gets a fresh row going down. Their
-- starter chunk is at (0, reserved_row).
CREATE OR REPLACE FUNCTION public.next_starter_row()
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_max_row integer;
BEGIN
  SELECT max(pp.reserved_row) INTO v_max_row
  FROM public.player_profiles pp
  WHERE pp.reserved_row IS NOT NULL;
  RETURN COALESCE(v_max_row + 1, 0);
END;
$function$;


-- Expansion candidate enumerator. Returns every unowned chunk
-- orthogonally adjacent to the player's district, EXCLUDING chunks in
-- another player's reserved row. By design the left and right edges of
-- the player's own reserved row are always present, so an empty
-- candidate set is impossible — players can never be trapped.
CREATE OR REPLACE FUNCTION public.expansion_candidates(p_player_id uuid)
 RETURNS TABLE(chunk_x integer, chunk_y integer)
 LANGUAGE plpgsql
AS $function$
BEGIN
  RETURN QUERY
  WITH neighbors AS (
    SELECT DISTINCT cand_x, cand_y FROM (
      SELECT dc.chunk_x + 1 AS cand_x, dc.chunk_y AS cand_y FROM public.district_chunks dc WHERE dc.owner_player_id = p_player_id
      UNION ALL
      SELECT dc.chunk_x - 1, dc.chunk_y FROM public.district_chunks dc WHERE dc.owner_player_id = p_player_id
      UNION ALL
      SELECT dc.chunk_x, dc.chunk_y + 1 FROM public.district_chunks dc WHERE dc.owner_player_id = p_player_id
      UNION ALL
      SELECT dc.chunk_x, dc.chunk_y - 1 FROM public.district_chunks dc WHERE dc.owner_player_id = p_player_id
    ) raw
  ),
  reserved_rows AS (
    SELECT pp.reserved_row AS row
    FROM public.player_profiles pp
    WHERE pp.reserved_row IS NOT NULL AND pp.id <> p_player_id
  )
  SELECT n.cand_x, n.cand_y
  FROM neighbors n
  WHERE NOT EXISTS (
    SELECT 1 FROM public.district_chunks dc2
    WHERE dc2.chunk_x = n.cand_x AND dc2.chunk_y = n.cand_y
  )
  AND NOT EXISTS (
    SELECT 1 FROM reserved_rows rr WHERE rr.row = n.cand_y
  )
  ORDER BY n.cand_y, n.cand_x;
END;
$function$


CREATE OR REPLACE FUNCTION public.place_building(p_tile_id uuid, p_building_type_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_bt record;
  v_tile record;
  v_player record;
  v_building_id uuid;
  v_worker_supply integer;
  v_workers_needed integer;
  v_road_connected boolean;
  v_path record;
BEGIN
  -- Pre-init v_path so the RETURN's CASE expression is safe for non-extractor placements
  SELECT NULL::integer AS target_x,
         NULL::integer AS target_y,
         NULL::integer AS path_length
  INTO v_path;

  SELECT * INTO v_bt FROM public.building_types
  WHERE key = p_building_type_key AND is_active;
  IF NOT FOUND THEN RAISE EXCEPTION 'Unknown building type'; END IF;

  SELECT * INTO v_player FROM public.player_profiles WHERE id = v_uid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Player not found'; END IF;

  IF v_bt.industry_key <> 'common' AND v_bt.industry_key <> v_player.industry_key THEN
    RAISE EXCEPTION 'You can only place buildings for your chosen industry';
  END IF;

  IF v_player.money < v_bt.build_cost THEN
    RAISE EXCEPTION 'Not enough money (need %, have %)',
      v_bt.build_cost, v_player.money;
  END IF;

  SELECT * INTO v_tile FROM public.map_tiles WHERE id = p_tile_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Tile not found'; END IF;

  IF v_tile.owner_player_id IS NULL THEN
    RAISE EXCEPTION 'Cannot build on wilderness — expand your district first';
  END IF;
  IF v_tile.owner_player_id <> v_uid THEN
    RAISE EXCEPTION 'Cannot build on another player''s district';
  END IF;

  IF NOT v_tile.buildable THEN RAISE EXCEPTION 'Tile is not buildable'; END IF;
  IF v_tile.occupied_building_id IS NOT NULL THEN
    RAISE EXCEPTION 'Tile already occupied';
  END IF;

  -- Extractors: anywhere in the district, no road-adjacency required.
  -- The walker uses weighted Dijkstra over walkable tiles (roads + open),
  -- so an extractor placed in the middle of empty land still has a path,
  -- just slower (off-road steps cost more, so production scales down).

  IF v_bt.category = 'road' THEN
    SELECT (
      EXISTS (
        SELECT 1 FROM public.map_tiles mt
        WHERE mt.terrain_type = 'highway'
          AND ((mt.x = v_tile.x - 1 AND mt.y = v_tile.y)
               OR (mt.x = v_tile.x + 1 AND mt.y = v_tile.y)
               OR (mt.x = v_tile.x AND mt.y = v_tile.y - 1)
               OR (mt.x = v_tile.x AND mt.y = v_tile.y + 1))
      )
      OR EXISTS (
        SELECT 1
        FROM public.buildings b2
        JOIN public.building_types bt2 ON bt2.key = b2.building_type_key
        WHERE bt2.category = 'road'
          AND b2.status = 'active'
          AND b2.player_id = v_uid
          AND (
            (b2.x = v_tile.x - 1 AND b2.y = v_tile.y)
            OR (b2.x = v_tile.x + 1 AND b2.y = v_tile.y)
            OR (b2.x = v_tile.x AND b2.y = v_tile.y - 1)
            OR (b2.x = v_tile.x AND b2.y = v_tile.y + 1)
          )
      )
    ) INTO v_road_connected;
    IF NOT v_road_connected THEN
      RAISE EXCEPTION 'Roads must connect to the highway or another of your roads';
    END IF;
  END IF;

  IF v_bt.category = 'housing' THEN
    INSERT INTO public.buildings (player_id, building_type_key, tile_id, x, y, housing_tier)
    VALUES (v_uid, p_building_type_key, p_tile_id, v_tile.x, v_tile.y, 0)
    RETURNING id INTO v_building_id;
  ELSE
    INSERT INTO public.buildings (player_id, building_type_key, tile_id, x, y)
    VALUES (v_uid, p_building_type_key, p_tile_id, v_tile.x, v_tile.y)
    RETURNING id INTO v_building_id;
  END IF;

  UPDATE public.map_tiles SET occupied_building_id = v_building_id WHERE id = p_tile_id;

  IF v_bt.category = 'extractor' THEN
    SELECT * INTO v_path
    FROM public.find_nearest_unclaimed_resource(v_uid, v_tile.x, v_tile.y);
    IF v_path.path_length IS NOT NULL THEN
      UPDATE public.buildings
      SET target_x = v_path.target_x,
          target_y = v_path.target_y,
          path_length = v_path.path_length
      WHERE id = v_building_id;
      UPDATE public.map_tiles
      SET claimed_by_building_id = v_building_id
      WHERE x = v_path.target_x AND y = v_path.target_y;
    END IF;
  END IF;

  IF v_bt.category = 'road' THEN
    PERFORM public.recompute_extractor_paths(v_uid);
  END IF;

  SELECT 5 + COALESCE(SUM(htc.workers), 0) INTO v_worker_supply
  FROM public.buildings b2
  JOIN public.building_types bt2 ON bt2.key = b2.building_type_key
  JOIN public.housing_tier_config htc ON htc.tier = b2.housing_tier
  WHERE b2.player_id = v_uid
    AND b2.status = 'active'
    AND bt2.category = 'housing'
    AND (NOT htc.needs_road OR public.has_road_access(v_uid, b2.x, b2.y));

  SELECT COALESCE(SUM(bt2.worker_cost), 0) INTO v_workers_needed
  FROM public.buildings b2
  JOIN public.building_types bt2 ON bt2.key = b2.building_type_key
  WHERE b2.player_id = v_uid
    AND b2.status = 'active'
    AND (
      bt2.category = 'extractor'
      OR (bt2.category = 'processor' AND public.has_road_access(v_uid, b2.x, b2.y))
    );

  UPDATE public.player_profiles
  SET money = money - v_bt.build_cost,
      worker_capacity = v_worker_supply,
      workers_used = LEAST(v_worker_supply, v_workers_needed)
  WHERE id = v_uid
  RETURNING * INTO v_player;

  RETURN json_build_object(
    'building_id', v_building_id,
    'money', v_player.money,
    'workers_used', v_player.workers_used,
    'worker_capacity', v_player.worker_capacity,
    'workers_needed', v_workers_needed,
    'labor_shortage', v_workers_needed > v_worker_supply,
    'extractor_target', CASE WHEN v_path.path_length IS NOT NULL
      THEN json_build_object('x', v_path.target_x, 'y', v_path.target_y, 'path_length', v_path.path_length)
      ELSE NULL END
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.preview_extractor_target(p_x integer, p_y integer)
 RETURNS json
 LANGUAGE plpgsql
 STABLE
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_path record;
BEGIN
  IF v_uid IS NULL THEN RETURN NULL; END IF;
  SELECT * INTO v_path FROM public.find_nearest_unclaimed_resource(v_uid, p_x, p_y);
  IF v_path.path_length IS NULL THEN
    RETURN json_build_object('target', NULL);
  END IF;
  RETURN json_build_object(
    'target', json_build_object(
      'x', v_path.target_x, 'y', v_path.target_y,
      'path_length', v_path.path_length
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.process_production()
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_base_workers integer := 5;
  v_housing_workers integer;
  v_worker_supply integer;
  v_workers_remaining integer;
  v_workers_needed integer := 0;
  v_staffed_ids uuid[];
  v_unstaffed_count integer := 0;
  v_building record;
  v_elapsed_min numeric;
  v_produced numeric;
  v_consumed numeric;
  v_available numeric;
  v_actual_min numeric;
  v_total_produced numeric := 0;
  v_player record;
  v_house record;
  v_has_road boolean;
  v_cur_tier record;
  v_next_tier record;
  v_prev_tier record;
  v_elapsed_secs numeric;
  v_evolution_events json[] := ARRAY[]::json[];
  v_should_upgrade boolean;
  v_should_devolve boolean;
  v_canonical_path integer := 4;  -- M2: path-length sweet spot
  v_path_factor numeric;
BEGIN
  -- ── LABOR ALLOCATION ─────────────────────────────────
  SELECT COALESCE(SUM(htc.workers), 0) INTO v_housing_workers
  FROM public.buildings b
  JOIN public.building_types bt ON bt.key = b.building_type_key
  JOIN public.housing_tier_config htc ON htc.tier = b.housing_tier
  WHERE b.player_id = v_uid AND b.status = 'active' AND bt.category = 'housing'
    AND (NOT htc.needs_road OR public.has_road_access(v_uid, b.x, b.y));

  v_worker_supply := v_base_workers + v_housing_workers;
  v_workers_remaining := v_worker_supply;
  v_staffed_ids := ARRAY[]::uuid[];

  FOR v_building IN
    SELECT b.id, bt.worker_cost
    FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE b.player_id = v_uid AND b.status = 'active'
      AND (
        bt.category = 'extractor'
        OR (bt.category = 'processor' AND public.has_road_access(v_uid, b.x, b.y))
      )
    ORDER BY b.created_at ASC
  LOOP
    v_workers_needed := v_workers_needed + v_building.worker_cost;
    IF v_workers_remaining >= v_building.worker_cost THEN
      v_staffed_ids := v_staffed_ids || v_building.id;
      v_workers_remaining := v_workers_remaining - v_building.worker_cost;
    ELSE
      v_unstaffed_count := v_unstaffed_count + 1;
    END IF;
  END LOOP;

  -- ── PRODUCTION: extractors (staffed AND has-path-to-resource) ──
  FOR v_building IN
    SELECT b.id, b.last_processed_at, b.path_length,
           bt.output_resource_key, bt.output_rate
    FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE b.player_id = v_uid AND b.status = 'active' AND bt.category = 'extractor'
      AND b.id = ANY(v_staffed_ids)
    FOR UPDATE OF b
  LOOP
    -- M2: skip if no path
    IF v_building.path_length IS NULL THEN
      UPDATE public.buildings SET last_processed_at = now() WHERE id = v_building.id;
      CONTINUE;
    END IF;

    v_elapsed_min := EXTRACT(EPOCH FROM (now() - v_building.last_processed_at)) / 60.0;
    IF v_elapsed_min < 0.1 THEN CONTINUE; END IF;

    -- Path scaling: min(1, canonical / path_length)
    v_path_factor := LEAST(1.0, v_canonical_path::numeric / GREATEST(v_building.path_length, 1));
    v_produced := FLOOR(v_elapsed_min * v_building.output_rate * v_path_factor);
    IF v_produced > 0 THEN
      INSERT INTO public.inventories (player_id, resource_key, quantity)
      VALUES (v_uid, v_building.output_resource_key, v_produced)
      ON CONFLICT (player_id, resource_key)
      DO UPDATE SET quantity = inventories.quantity + v_produced, updated_at = now();
      v_total_produced := v_total_produced + v_produced;
    END IF;
    UPDATE public.buildings SET last_processed_at = now() WHERE id = v_building.id;
  END LOOP;

  UPDATE public.buildings b SET last_processed_at = now()
  FROM public.building_types bt
  WHERE bt.key = b.building_type_key
    AND b.player_id = v_uid AND b.status = 'active' AND bt.category = 'extractor'
    AND NOT (b.id = ANY(v_staffed_ids));

  -- ── PRODUCTION: processors (staffed AND road-connected) ──
  FOR v_building IN
    SELECT b.id, b.last_processed_at,
           bt.input_resource_key, bt.input_rate,
           bt.output_resource_key, bt.output_rate
    FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE b.player_id = v_uid AND b.status = 'active' AND bt.category = 'processor'
      AND b.id = ANY(v_staffed_ids)
    FOR UPDATE OF b
  LOOP
    v_elapsed_min := EXTRACT(EPOCH FROM (now() - v_building.last_processed_at)) / 60.0;
    IF v_elapsed_min < 0.1 THEN CONTINUE; END IF;

    SELECT COALESCE(quantity, 0) INTO v_available
    FROM public.inventories
    WHERE player_id = v_uid AND resource_key = v_building.input_resource_key;
    IF v_available IS NULL THEN v_available := 0; END IF;

    IF v_building.input_rate > 0 THEN
      v_actual_min := LEAST(v_elapsed_min, v_available / v_building.input_rate);
    ELSE
      v_actual_min := v_elapsed_min;
    END IF;

    v_consumed := FLOOR(v_actual_min * v_building.input_rate);
    v_produced := FLOOR(v_actual_min * v_building.output_rate);

    IF v_consumed > 0 AND v_produced > 0 THEN
      UPDATE public.inventories
      SET quantity = quantity - v_consumed, updated_at = now()
      WHERE player_id = v_uid AND resource_key = v_building.input_resource_key;

      INSERT INTO public.inventories (player_id, resource_key, quantity)
      VALUES (v_uid, v_building.output_resource_key, v_produced)
      ON CONFLICT (player_id, resource_key)
      DO UPDATE SET quantity = inventories.quantity + v_produced, updated_at = now();
      v_total_produced := v_total_produced + v_produced;
    END IF;
    UPDATE public.buildings SET last_processed_at = now() WHERE id = v_building.id;
  END LOOP;

  -- ── HOUSING EVOLUTION ─────────────────────────────────
  FOR v_house IN
    SELECT b.id, b.x, b.y, b.housing_tier, b.last_processed_at
    FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE b.player_id = v_uid AND b.status = 'active' AND bt.category = 'housing'
    FOR UPDATE OF b
  LOOP
    v_has_road := public.has_road_access(v_uid, v_house.x, v_house.y);
    SELECT * INTO v_cur_tier FROM public.housing_tier_config WHERE tier = v_house.housing_tier;
    SELECT * INTO v_next_tier FROM public.housing_tier_config WHERE tier = v_house.housing_tier + 1;
    SELECT * INTO v_prev_tier FROM public.housing_tier_config WHERE tier = v_house.housing_tier - 1;
    v_elapsed_secs := EXTRACT(EPOCH FROM (now() - v_house.last_processed_at));

    v_should_upgrade := v_next_tier IS NOT NULL
      AND v_has_road
      AND (NOT v_next_tier.needs_road OR v_has_road)
      AND v_elapsed_secs >= COALESCE(v_cur_tier.upgrade_secs, 60);
    v_should_devolve := v_cur_tier IS NOT NULL
      AND v_cur_tier.needs_road
      AND NOT v_has_road
      AND v_elapsed_secs >= COALESCE(v_cur_tier.devolve_secs, 30);

    IF v_should_upgrade THEN
      UPDATE public.buildings
      SET housing_tier = housing_tier + 1, last_processed_at = now()
      WHERE id = v_house.id;
      v_evolution_events := v_evolution_events || jsonb_build_object(
        'building_id', v_house.id, 'event', 'upgrade',
        'from_tier', v_house.housing_tier, 'to_tier', v_house.housing_tier + 1
      )::json;
    ELSIF v_should_devolve THEN
      UPDATE public.buildings
      SET housing_tier = housing_tier - 1, last_processed_at = now()
      WHERE id = v_house.id;
      v_evolution_events := v_evolution_events || jsonb_build_object(
        'building_id', v_house.id, 'event', 'devolve',
        'from_tier', v_house.housing_tier, 'to_tier', v_house.housing_tier - 1
      )::json;
    END IF;
  END LOOP;

  -- ── FINAL UPDATE ──────────────────────────────────────
  SELECT 5 + COALESCE(SUM(htc.workers), 0) INTO v_worker_supply
  FROM public.buildings b
  JOIN public.building_types bt ON bt.key = b.building_type_key
  JOIN public.housing_tier_config htc ON htc.tier = b.housing_tier
  WHERE b.player_id = v_uid AND b.status = 'active' AND bt.category = 'housing'
    AND (NOT htc.needs_road OR public.has_road_access(v_uid, b.x, b.y));

  SELECT COALESCE(SUM(bt.worker_cost), 0) INTO v_workers_needed
  FROM public.buildings b
  JOIN public.building_types bt ON bt.key = b.building_type_key
  WHERE b.player_id = v_uid AND b.status = 'active'
    AND (
      bt.category = 'extractor'
      OR (bt.category = 'processor' AND public.has_road_access(v_uid, b.x, b.y))
    );

  UPDATE public.player_profiles
  SET worker_capacity = v_worker_supply,
      workers_used = LEAST(v_worker_supply, v_workers_needed)
  WHERE id = v_uid
  RETURNING money, workers_used, worker_capacity INTO v_player;

  RETURN json_build_object(
    'total_produced', v_total_produced,
    'money', v_player.money,
    'workers_used', v_player.workers_used,
    'worker_capacity', v_player.worker_capacity,
    'workers_needed', v_workers_needed,
    'labor_shortage', v_workers_needed > v_worker_supply,
    'unstaffed_count', v_unstaffed_count,
    'evolution_events', array_to_json(v_evolution_events),
    'inventory', COALESCE(
      (SELECT json_object_agg(resource_key, quantity)
       FROM public.inventories WHERE player_id = v_uid),
      '{}'::json
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.recompute_extractor_paths(p_player_id uuid)
 RETURNS json
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_extractor record;
  v_path record;
  v_verify integer;
  v_recomputed integer := 0;
  v_idle integer := 0;
BEGIN
  FOR v_extractor IN
    SELECT b.id, b.x, b.y, b.target_x, b.target_y
    FROM public.buildings b
    JOIN public.building_types bt ON bt.key = b.building_type_key
    WHERE b.player_id = p_player_id
      AND bt.category = 'extractor'
      AND b.status = 'active'
  LOOP
    IF v_extractor.target_x IS NOT NULL THEN
      -- Verify current path
      v_verify := public.verify_extractor_path(
        p_player_id, v_extractor.x, v_extractor.y,
        v_extractor.target_x, v_extractor.target_y
      );
      IF v_verify IS NOT NULL THEN
        -- Path still valid; refresh path_length in case roads were optimized
        UPDATE public.buildings SET path_length = v_verify WHERE id = v_extractor.id;
        v_recomputed := v_recomputed + 1;
        CONTINUE;
      END IF;
      -- Path broken — release claim
      UPDATE public.map_tiles
      SET claimed_by_building_id = NULL
      WHERE claimed_by_building_id = v_extractor.id;
      UPDATE public.buildings
      SET target_x = NULL, target_y = NULL, path_length = NULL
      WHERE id = v_extractor.id;
    END IF;

    -- Try to find a new target
    SELECT * INTO v_path
    FROM public.find_nearest_unclaimed_resource(
      p_player_id, v_extractor.x, v_extractor.y
    );
    IF v_path IS NOT NULL AND v_path.path_length IS NOT NULL THEN
      UPDATE public.buildings
      SET target_x = v_path.target_x,
          target_y = v_path.target_y,
          path_length = v_path.path_length
      WHERE id = v_extractor.id;
      UPDATE public.map_tiles
      SET claimed_by_building_id = v_extractor.id
      WHERE x = v_path.target_x AND y = v_path.target_y;
      v_recomputed := v_recomputed + 1;
    ELSE
      v_idle := v_idle + 1;
    END IF;
  END LOOP;

  RETURN json_build_object('recomputed', v_recomputed, 'idle', v_idle);
END;
$function$


CREATE OR REPLACE FUNCTION public.resolve_trader_visit(p_trader_key text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_trader record;
  v_last_visit timestamptz;
  v_interval interval;
  v_capacity_remaining integer;
  v_policy record;
  v_inventory numeric;
  v_surplus integer;
  v_needed integer;
  v_sell_amt integer;
  v_buy_amt integer;
  v_buy_price integer;
  v_sell_price integer;
  v_total_earned integer := 0;
  v_total_spent integer := 0;
  v_player_money integer;
  v_summary jsonb := '[]'::jsonb;
  v_visit_id uuid;
  v_next_visit_at timestamptz;
BEGIN
  -- Catch up production first
  PERFORM public.process_production();

  -- Load trader info
  SELECT * INTO v_trader FROM public.traders WHERE key = p_trader_key AND is_active;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Trader not found: %', p_trader_key;
  END IF;

  v_interval := (v_trader.visit_interval_minutes::text || ' minutes')::interval;

  -- Find last visit time for this player + trader
  SELECT visited_at INTO v_last_visit
  FROM public.trader_visits
  WHERE player_id = v_uid AND trader_key = p_trader_key
  ORDER BY visited_at DESC
  LIMIT 1;

  -- If no previous visit, use profile creation time
  IF v_last_visit IS NULL THEN
    SELECT created_at INTO v_last_visit FROM public.player_profiles WHERE id = v_uid;
  END IF;

  -- Check if a visit is due
  v_next_visit_at := v_last_visit + v_interval;
  IF now() < v_next_visit_at THEN
    RETURN json_build_object(
      'visit_resolved', false,
      'next_visit_at', v_next_visit_at,
      'trader_key', p_trader_key,
      'reason', 'not_due'
    );
  END IF;

  -- A visit is due! Resolve it.
  v_capacity_remaining := v_trader.visit_capacity;

  -- Get player money
  SELECT money INTO v_player_money FROM public.player_profiles WHERE id = v_uid;

  -- ── PHASE 1: Process sells ──
  FOR v_policy IN
    SELECT tp.resource_key, tp.mode, tp.reserve_target
    FROM public.trade_policies tp
    WHERE tp.player_id = v_uid AND tp.mode = 'sell_surplus'
  LOOP
    IF v_capacity_remaining <= 0 THEN EXIT; END IF;

    -- Get buy_price (what trader pays player) — skip if NULL or not found
    SELECT buy_price INTO v_buy_price
    FROM public.trader_prices
    WHERE trader_key = p_trader_key AND resource_key = v_policy.resource_key AND is_active;
    IF NOT FOUND OR v_buy_price IS NULL THEN CONTINUE; END IF;

    -- Get current inventory
    SELECT COALESCE(quantity, 0) INTO v_inventory
    FROM public.inventories
    WHERE player_id = v_uid AND resource_key = v_policy.resource_key;
    IF v_inventory IS NULL THEN v_inventory := 0; END IF;

    -- Calculate surplus
    v_surplus := GREATEST(0, FLOOR(v_inventory) - v_policy.reserve_target);
    IF v_surplus <= 0 THEN CONTINUE; END IF;

    -- Limit by capacity
    v_sell_amt := LEAST(v_surplus, v_capacity_remaining);
    IF v_sell_amt <= 0 THEN CONTINUE; END IF;

    -- Execute sale
    UPDATE public.inventories
    SET quantity = quantity - v_sell_amt, updated_at = now()
    WHERE player_id = v_uid AND resource_key = v_policy.resource_key;

    v_total_earned := v_total_earned + (v_sell_amt * v_buy_price);
    v_capacity_remaining := v_capacity_remaining - v_sell_amt;

    -- Add to summary
    v_summary := v_summary || jsonb_build_object(
      'type', 'sell',
      'resource', v_policy.resource_key,
      'quantity', v_sell_amt,
      'unit_price', v_buy_price,
      'total', v_sell_amt * v_buy_price
    );

    -- Log transaction
    INSERT INTO public.trade_transactions (player_id, trader_key, resource_key, quantity, unit_price, total_price, transaction_type)
    VALUES (v_uid, p_trader_key, v_policy.resource_key, v_sell_amt, v_buy_price, v_sell_amt * v_buy_price, 'sell');
  END LOOP;

  -- Credit earnings
  IF v_total_earned > 0 THEN
    UPDATE public.player_profiles SET money = money + v_total_earned WHERE id = v_uid;
    v_player_money := v_player_money + v_total_earned;
  END IF;

  -- ── PHASE 2: Process buys ──
  FOR v_policy IN
    SELECT tp.resource_key, tp.mode, tp.reserve_target
    FROM public.trade_policies tp
    WHERE tp.player_id = v_uid AND tp.mode = 'buy_to_reserve'
  LOOP
    IF v_capacity_remaining <= 0 THEN EXIT; END IF;

    -- Get sell_price (what trader charges player) — skip if NULL or not found
    SELECT tp.sell_price INTO v_sell_price
    FROM public.trader_prices tp
    WHERE tp.trader_key = p_trader_key AND tp.resource_key = v_policy.resource_key AND tp.is_active;
    IF NOT FOUND OR v_sell_price IS NULL THEN CONTINUE; END IF;

    -- Get current inventory
    SELECT COALESCE(quantity, 0) INTO v_inventory
    FROM public.inventories
    WHERE player_id = v_uid AND resource_key = v_policy.resource_key;
    IF v_inventory IS NULL THEN v_inventory := 0; END IF;

    -- Calculate needed
    v_needed := GREATEST(0, v_policy.reserve_target - FLOOR(v_inventory));
    IF v_needed <= 0 THEN CONTINUE; END IF;

    -- Limit by capacity
    v_buy_amt := LEAST(v_needed, v_capacity_remaining);

    -- Limit by affordability
    IF v_sell_price > 0 THEN
      v_buy_amt := LEAST(v_buy_amt, FLOOR(v_player_money / v_sell_price));
    END IF;
    IF v_buy_amt <= 0 THEN CONTINUE; END IF;

    -- Execute purchase
    INSERT INTO public.inventories (player_id, resource_key, quantity)
    VALUES (v_uid, v_policy.resource_key, v_buy_amt)
    ON CONFLICT (player_id, resource_key)
    DO UPDATE SET quantity = inventories.quantity + v_buy_amt, updated_at = now();

    v_total_spent := v_total_spent + (v_buy_amt * v_sell_price);
    v_player_money := v_player_money - (v_buy_amt * v_sell_price);
    v_capacity_remaining := v_capacity_remaining - v_buy_amt;

    -- Add to summary
    v_summary := v_summary || jsonb_build_object(
      'type', 'buy',
      'resource', v_policy.resource_key,
      'quantity', v_buy_amt,
      'unit_price', v_sell_price,
      'total', v_buy_amt * v_sell_price
    );

    -- Log transaction
    INSERT INTO public.trade_transactions (player_id, trader_key, resource_key, quantity, unit_price, total_price, transaction_type)
    VALUES (v_uid, p_trader_key, v_policy.resource_key, v_buy_amt, v_sell_price, v_buy_amt * v_sell_price, 'buy');
  END LOOP;

  -- Debit spending
  IF v_total_spent > 0 THEN
    UPDATE public.player_profiles SET money = money - v_total_spent WHERE id = v_uid;
  END IF;

  -- Record visit
  INSERT INTO public.trader_visits (trader_key, player_id, capacity_total, capacity_used, summary, visited_at)
  VALUES (p_trader_key, v_uid, v_trader.visit_capacity, v_trader.visit_capacity - v_capacity_remaining, v_summary, now())
  RETURNING id INTO v_visit_id;

  -- Return result
  RETURN json_build_object(
    'visit_resolved', true,
    'trader_key', p_trader_key,
    'visit_id', v_visit_id,
    'capacity_total', v_trader.visit_capacity,
    'capacity_used', v_trader.visit_capacity - v_capacity_remaining,
    'total_earned', v_total_earned,
    'total_spent', v_total_spent,
    'summary', v_summary,
    'next_visit_at', now() + v_interval,
    'money', v_player_money,
    'inventory', COALESCE(
      (SELECT json_object_agg(resource_key, quantity)
       FROM public.inventories WHERE player_id = v_uid),
      '{}'::json
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.save_trade_policy(p_resource_key text, p_mode text, p_reserve_target integer)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF p_mode NOT IN ('keep', 'sell_surplus', 'buy_to_reserve') THEN
    RAISE EXCEPTION 'Invalid trade mode: %', p_mode;
  END IF;
  IF p_reserve_target < 0 THEN
    RAISE EXCEPTION 'Reserve target cannot be negative';
  END IF;

  INSERT INTO public.trade_policies (player_id, resource_key, mode, reserve_target)
  VALUES (v_uid, p_resource_key, p_mode, p_reserve_target)
  ON CONFLICT (player_id, resource_key)
  DO UPDATE SET mode = p_mode, reserve_target = p_reserve_target, updated_at = now();

  RETURN json_build_object('ok', true, 'resource_key', p_resource_key, 'mode', p_mode, 'reserve_target', p_reserve_target);
END;
$function$


CREATE OR REPLACE FUNCTION public.seed_district_tiles(p_district_id uuid, p_specialization_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_district record;
  v_world_id uuid;
  v_spec_resource text;
  v_secondary_resource text;
  v_tertiary_resource text;
  v_all_raw text[] := array['timber', 'stone', 'grain', 'clay', 'iron_ore'];
  v_others text[];
  v_dx int;
  v_dy int;
  v_abs_x int;
  v_abs_y int;
  v_tile_index int;
  v_resource text;
  v_terrain text;
  v_seed int;
begin
  -- Load district
  select * into v_district from public.districts where id = p_district_id;
  if v_district is null then
    raise exception 'District not found';
  end if;
  v_world_id := v_district.world_id;

  -- Map specialization_key to resource_key (iron_ore uses iron_ore)
  v_spec_resource := p_specialization_key;

  -- Pick secondary and tertiary resources (deterministic by district position)
  v_others := array[]::text[];
  for i in 1..array_length(v_all_raw, 1) loop
    if v_all_raw[i] != v_spec_resource then
      v_others := v_others || v_all_raw[i];
    end if;
  end loop;
  -- Use origin coords as a simple seed for selection
  v_seed := (v_district.origin_x * 7 + v_district.origin_y * 13) % array_length(v_others, 1);
  v_secondary_resource := v_others[(v_seed % array_length(v_others, 1)) + 1];
  v_tertiary_resource := v_others[((v_seed + 1) % array_length(v_others, 1)) + 1];

  -- Generate 8x8 = 64 tiles
  for v_dy in 0..v_district.height - 1 loop
    for v_dx in 0..v_district.width - 1 loop
      v_abs_x := v_district.origin_x + v_dx;
      v_abs_y := v_district.origin_y + v_dy;
      v_tile_index := v_dy * v_district.width + v_dx;

      -- Resource placement pattern (deterministic, using tile index):
      -- Indices 10,11,18,19,26,34 → primary resource (6 tiles)
      -- Indices 5,44            → secondary resource (2 tiles)
      -- Index  37               → tertiary resource (1 tile)
      v_resource := null;
      if v_tile_index in (10, 11, 18, 19, 26, 34) then
        v_resource := v_spec_resource;
      elsif v_tile_index in (5, 44) then
        v_resource := v_secondary_resource;
      elsif v_tile_index = 37 then
        v_resource := v_tertiary_resource;
      end if;

      -- Terrain: resource tiles get matching terrain hint, others get grass
      if v_resource is not null then
        v_terrain := v_resource;
      else
        v_terrain := 'grass';
      end if;

      insert into public.tiles (world_id, district_id, x, y, terrain_key, resource_key, is_revealed, is_buildable, owner_player_id)
      values (v_world_id, p_district_id, v_abs_x, v_abs_y, v_terrain, v_resource, true, true, v_district.owner_player_id)
      on conflict (world_id, x, y) do nothing;
    end loop;
  end loop;
end;
$function$


CREATE OR REPLACE FUNCTION public.sell_to_trader(p_trader_key text, p_resource_key text, p_quantity numeric)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_price integer;
  v_total integer;
  v_available numeric;
  v_new_money integer;
BEGIN
  -- Catch up production first
  PERFORM public.process_production();

  SELECT buy_price INTO v_price
  FROM public.trader_prices
  WHERE trader_key = p_trader_key AND resource_key = p_resource_key AND is_active;
  IF NOT FOUND OR v_price IS NULL THEN RAISE EXCEPTION 'Trader does not buy this resource'; END IF;

  SELECT COALESCE(quantity, 0) INTO v_available
  FROM public.inventories
  WHERE player_id = v_uid AND resource_key = p_resource_key;
  IF v_available < p_quantity THEN
    RAISE EXCEPTION 'Not enough % (have %, need %)', p_resource_key, v_available, p_quantity;
  END IF;

  v_total := v_price * p_quantity;

  UPDATE public.inventories
  SET quantity = quantity - p_quantity, updated_at = now()
  WHERE player_id = v_uid AND resource_key = p_resource_key;

  UPDATE public.player_profiles
  SET money = money + v_total
  WHERE id = v_uid
  RETURNING money INTO v_new_money;

  INSERT INTO public.trade_transactions (player_id, trader_key, resource_key, quantity, unit_price, total_price)
  VALUES (v_uid, p_trader_key, p_resource_key, p_quantity, v_price, v_total);

  RETURN json_build_object(
    'total_price', v_total,
    'money', v_new_money,
    'inventory', COALESCE(
      (SELECT json_object_agg(resource_key, quantity)
       FROM public.inventories WHERE player_id = v_uid),
      '{}'::json
    )
  );
END;
$function$


CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$function$


CREATE OR REPLACE FUNCTION public.verify_extractor_path(p_player_id uuid, p_ex integer, p_ey integer, p_tx integer, p_ty integer)
 RETURNS integer
 LANGUAGE plpgsql
AS $function$
-- Returns the weighted distance from extractor (p_ex, p_ey) to target
-- tile (p_tx, p_ty), or NULL if unreachable. Same walkability rules as
-- find_nearest_unclaimed_resource: roads cost 1, off-road owned tiles
-- cost 3, anything else is impassable.
DECLARE
  v_state jsonb := '{}'::jsonb;
  v_cur_key text;
  v_cur_dist integer;
  v_cur_x integer;
  v_cur_y integer;
  v_neighbor_x integer;
  v_neighbor_y integer;
  v_neighbor_key text;
  v_neighbor_cost integer;
  v_existing_dist integer;
  v_is_road boolean;
  v_is_highway boolean;
  v_neighbor_walkable boolean;
  v_dx int[] := ARRAY[-1, 1, 0, 0];
  v_dy int[] := ARRAY[0, 0, -1, 1];
  v_i integer;
  v_iters integer := 0;
  v_road_cost constant integer := 1;
  v_offroad_cost constant integer := 3;
BEGIN
  v_state := jsonb_build_object(
    p_ex || ',' || p_ey,
    jsonb_build_object('x', p_ex, 'y', p_ey, 'd', 0, 'v', false)
  );

  WHILE v_iters < 2000 LOOP
    v_iters := v_iters + 1;

    SELECT key, (value->>'x')::int, (value->>'y')::int, (value->>'d')::int
    INTO v_cur_key, v_cur_x, v_cur_y, v_cur_dist
    FROM jsonb_each(v_state)
    WHERE (value->>'v')::boolean = false
    ORDER BY (value->>'d')::int ASC
    LIMIT 1;

    IF v_cur_key IS NULL THEN RETURN NULL; END IF;
    IF v_cur_x = p_tx AND v_cur_y = p_ty THEN RETURN v_cur_dist; END IF;

    v_state := jsonb_set(v_state, ARRAY[v_cur_key, 'v'], 'true'::jsonb);

    FOR v_i IN 1..4 LOOP
      v_neighbor_x := v_cur_x + v_dx[v_i];
      v_neighbor_y := v_cur_y + v_dy[v_i];
      v_neighbor_key := v_neighbor_x || ',' || v_neighbor_y;

      SELECT EXISTS (
        SELECT 1 FROM public.map_tiles mt
        WHERE mt.x = v_neighbor_x AND mt.y = v_neighbor_y
          AND mt.terrain_type = 'highway'
      ) INTO v_is_highway;

      IF v_is_highway THEN
        v_neighbor_cost := v_road_cost;
        v_neighbor_walkable := true;
      ELSE
        SELECT EXISTS (
          SELECT 1 FROM public.buildings b
          JOIN public.building_types bt ON bt.key = b.building_type_key
          WHERE b.x = v_neighbor_x AND b.y = v_neighbor_y
            AND bt.category = 'road' AND b.status = 'active'
            AND b.player_id = p_player_id
        ) INTO v_is_road;

        IF v_is_road THEN
          v_neighbor_cost := v_road_cost;
          v_neighbor_walkable := true;
        ELSE
          SELECT EXISTS (
            SELECT 1 FROM public.map_tiles mt
            WHERE mt.x = v_neighbor_x AND mt.y = v_neighbor_y
              AND mt.owner_player_id = p_player_id
              AND (mt.occupied_building_id IS NULL OR (mt.x = p_tx AND mt.y = p_ty))
          ) INTO v_neighbor_walkable;
          v_neighbor_cost := v_offroad_cost;
        END IF;
      END IF;

      IF NOT v_neighbor_walkable THEN CONTINUE; END IF;

      IF v_state ? v_neighbor_key THEN
        IF NOT ((v_state->v_neighbor_key->>'v')::boolean) THEN
          v_existing_dist := (v_state->v_neighbor_key->>'d')::int;
          IF v_cur_dist + v_neighbor_cost < v_existing_dist THEN
            v_state := jsonb_set(
              v_state, ARRAY[v_neighbor_key, 'd'],
              to_jsonb(v_cur_dist + v_neighbor_cost)
            );
          END IF;
        END IF;
      ELSE
        v_state := v_state || jsonb_build_object(
          v_neighbor_key,
          jsonb_build_object(
            'x', v_neighbor_x, 'y', v_neighbor_y,
            'd', v_cur_dist + v_neighbor_cost, 'v', false
          )
        );
      END IF;
    END LOOP;
  END LOOP;
  RETURN NULL;
END;
$function$


-- ────────────────────────────────────────────────────────────
-- 6. TRIGGERS
-- ────────────────────────────────────────────────────────────

CREATE TRIGGER set_buildings_updated_at BEFORE UPDATE ON public.buildings FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_buildings_change AFTER DELETE ON public.buildings FOR EACH ROW EXECUTE FUNCTION handle_building_change();
CREATE TRIGGER set_player_profiles_updated_at BEFORE UPDATE ON public.player_profiles FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER reject_build_on_resource BEFORE INSERT ON public.buildings FOR EACH ROW EXECUTE FUNCTION reject_build_on_resource();

-- ────────────────────────────────────────────────────────────
-- 7. PERMISSIONS
-- ────────────────────────────────────────────────────────────

GRANT EXECUTE ON FUNCTION public.allocate_district_chunk(p_player_id uuid, p_chunk_x integer, p_chunk_y integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.black_market_trade(p_resource_key text, p_quantity integer, p_direction text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.choose_industry(p_display_name text, p_industry_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.clear_resource_tile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_onboarding(p_display_name text, p_specialization_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expand_district(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.expansion_candidates(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_nearest_unclaimed_resource(p_player_id uuid, p_ex integer, p_ey integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.handle_building_change() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_road_access(p_x integer, p_y integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_road_access(p_player_id uuid, p_x integer, p_y integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.place_building(p_tile_id uuid, p_building_type_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_extractor_target(p_x integer, p_y integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_production() TO authenticated;
GRANT EXECUTE ON FUNCTION public.recompute_extractor_paths(p_player_id uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_trader_visit(p_trader_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_trade_policy(p_resource_key text, p_mode text, p_reserve_target integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.seed_district_tiles(p_district_id uuid, p_specialization_key text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.sell_to_trader(p_trader_key text, p_resource_key text, p_quantity numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_updated_at() TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_extractor_path(p_player_id uuid, p_ex integer, p_ey integer, p_tx integer, p_ty integer) TO authenticated;

-- ────────────────────────────────────────────────────────────
-- 8. SEED DATA (catalog tables)
-- ────────────────────────────────────────────────────────────

-- resources (11 rows)
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('timber', 'Timber', 'raw', 'timber', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('lumber', 'Lumber', 'processed', 'timber', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('stone', 'Stone', 'raw', 'stone', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('brick', 'Brick', 'processed', 'stone', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('grain', 'Grain', 'raw', 'common', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('flour', 'Flour', 'processed', 'common', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('clay', 'Clay', 'raw', 'common', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('pottery', 'Pottery', 'processed', 'common', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('bread', 'Bread', 'processed', 'common', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('furniture', 'Furniture', 'processed', 'timber', true);
INSERT INTO public.resources (key, name, kind, industry_key, is_active) VALUES ('statuary', 'Statuary', 'processed', 'stone', true);

-- building_types (13 rows)
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('house', 'House', 1, 'common', 'housing', 60, 0, NULL, '0', NULL, '0', true, 6);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('road', 'Road', 1, 'common', 'road', 5, 0, NULL, '0', NULL, '0', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('timber_camp', 'Timber Camp', 1, 'timber', 'extractor', 100, 2, NULL, '0', 'timber', '1', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('stone_quarry', 'Stone Quarry', 1, 'stone', 'extractor', 100, 2, NULL, '0', 'stone', '1', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('clay_pit', 'Clay Pit', 1, 'common', 'extractor', 120, 3, NULL, '0', 'clay', '1.5', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('grain_farm', 'Grain Farm', 1, 'common', 'extractor', 150, 4, NULL, '0', 'grain', '2', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('sawmill', 'Sawmill', 2, 'timber', 'processor', 300, 3, 'timber', '1', 'lumber', '0.5', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('mason_workshop', 'Mason Workshop', 2, 'stone', 'processor', 300, 3, 'stone', '1', 'brick', '0.5', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('mill', 'Mill', 2, 'common', 'processor', 300, 3, 'grain', '2', 'flour', '1', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('pottery_kiln', 'Pottery Kiln', 2, 'common', 'processor', 250, 3, 'clay', '1.5', 'pottery', '0.75', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('bakery', 'Bakery', 3, 'common', 'processor', 400, 4, 'flour', '1', 'bread', '0.5', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('woodcarver', 'Woodcarver', 3, 'timber', 'processor', 450, 4, 'lumber', '0.5', 'furniture', '0.25', true, 0);
INSERT INTO public.building_types (key, name, tier, industry_key, category, build_cost, worker_cost, input_resource_key, input_rate, output_resource_key, output_rate, is_active, workers_provided) VALUES ('sculptor', 'Sculptor', 3, 'stone', 'processor', 450, 4, 'brick', '0.5', 'statuary', '0.25', true, 0);

-- housing_tier_config (6 rows)
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (0, 'Shanty', 'S', 2, false, 30, 60);
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (1, 'Mud Hut', 'H', 6, true, 30, 60);
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (2, 'Cottage', 'C', 10, true, 60, 60);
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (3, 'Townhouse', 'T', 16, true, 120, 60);
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (4, 'Villa', 'V', 24, true, 180, 90);
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs) VALUES (5, 'Manor Estate', 'M', 34, true, 300, 120);

-- traders (3 rows)
INSERT INTO public.traders (key, name, description, is_active, created_at, visit_capacity, visit_interval_minutes, display_order) VALUES ('river_traders', 'River Traders', 'Dependable generalist partner. Trades basic raw materials with balanced capacity and reliable timing.', true, '2026-05-01 18:33:43.555055+00:00', 20, 10, 1);
INSERT INTO public.traders (key, name, description, is_active, created_at, visit_capacity, visit_interval_minutes, display_order) VALUES ('desert_caravan', 'Desert Caravan', 'Refined goods specialist. Pays premium prices for lumber and brick. Less frequent but more rewarding.', true, '2026-05-01 18:33:43.555055+00:00', 14, 14, 2);
INSERT INTO public.traders (key, name, description, is_active, created_at, visit_capacity, visit_interval_minutes, display_order) VALUES ('mountain_folk', 'Mountain Folk', 'Industrial materials partner. Handles bulk raw and processed goods. Slower visits but massive carrying capacity.', true, '2026-05-01 18:33:43.555055+00:00', 26, 18, 3);

-- trader_prices (27 rows)
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('12fc2a3c-6901-4a87-9a54-0f38dd6273b9', 'river_traders', 'timber', 4, true, 7);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('b22b8643-634e-4f6f-b35d-22a31630c69d', 'river_traders', 'stone', 5, true, 8);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('bbd61718-2ef3-452a-a3c4-444ead3fa601', 'desert_caravan', 'lumber', 12, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('39146b3d-cf27-4f28-bbfb-cfaa1a2c595f', 'desert_caravan', 'brick', 15, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('50a0a157-c1fe-4b60-b2c7-35beeb11b6ed', 'desert_caravan', 'stone', NULL, true, 9);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('4223ffbf-fa6a-4ba2-a610-1cb2c6a5d9f5', 'desert_caravan', 'timber', NULL, true, 8);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('f0ac6f4c-7e5e-4fef-af5f-d4caa6b5744a', 'mountain_folk', 'timber', 3, true, 5);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('a83b0e25-f9b9-474f-ad59-8b2ca39523b7', 'mountain_folk', 'lumber', 8, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('524a2b81-5f0a-4c85-acfc-61091bfdf263', 'mountain_folk', 'stone', 4, true, 6);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('9938585c-451f-4f8b-9f33-9a8939b33f88', 'river_traders', 'grain', 3, true, 6);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('9c8d324d-4631-4343-8fea-2de64fb0677a', 'desert_caravan', 'flour', 9, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('87d4b1f8-4437-40d5-b977-bb7ec3adc5a5', 'desert_caravan', 'grain', NULL, true, 7);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('8de600fb-33c9-45c1-98ac-4db9a0fe9520', 'mountain_folk', 'grain', 2, true, 4);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('7bec5580-006c-43f2-ad87-4b78b07a53a2', 'mountain_folk', 'flour', 6, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('f520620d-bcee-432b-8cd5-cda8cb9c2ae8', 'river_traders', 'clay', 3, true, 5);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('2f01141d-45c1-45ae-960c-06cd16fb71e2', 'desert_caravan', 'pottery', 10, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('e98831aa-e15c-4f11-aed7-0ae3b7710d5c', 'mountain_folk', 'clay', 2, true, 4);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('d9a6d956-e18f-4e63-a208-e7239784927f', 'mountain_folk', 'pottery', 7, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('6a0db45c-df12-4ce0-8fec-725def766104', 'river_traders', 'bread', 12, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('c3b1e111-02dd-4ea1-9f08-5369d418ff93', 'river_traders', 'furniture', 14, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('cee1c504-cb4e-413e-914b-26be5e112922', 'desert_caravan', 'bread', 15, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('d46c136b-f850-4920-b003-9110d8db9bd2', 'desert_caravan', 'furniture', 18, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('6f6c0728-9a0e-4e11-ac78-64b16f43a7bd', 'mountain_folk', 'bread', 10, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('46111e41-d473-4b77-8564-8acb183b53e4', 'mountain_folk', 'furniture', 12, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('fd1725ad-58cb-4a72-89b9-900c71e426b3', 'river_traders', 'statuary', 14, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('ea3761f5-e9ec-4927-b180-c191d37f854a', 'desert_caravan', 'statuary', 20, true, NULL);
INSERT INTO public.trader_prices (id, trader_key, resource_key, buy_price, is_active, sell_price) VALUES ('9f265e1b-9cee-441b-8090-c4ad2d3a1ad7', 'mountain_folk', 'statuary', 11, true, NULL);

-- external_trade_partners (8 rows)
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('9ae3f0fe-f6e0-434a-afff-ecbf11f6e7a2', '46c4e125-d62f-424b-9551-0738afb3a19d', 'River Traders', 'Barge merchants who haul raw goods downstream. They pay fair prices for timber and grain, and carry surplus bread upriver.', '{"clay": {"price": 6, "max_per_trade": 15}, "grain": {"price": 7, "max_per_trade": 20}, "timber": {"price": 8, "max_per_trade": 20}}'::jsonb, '{"bread": {"price": 18, "max_per_trade": 10}, "flour": {"price": 12, "max_per_trade": 10}}'::jsonb, true, '2026-05-01 01:08:23.561725+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('93c57077-feb7-49ef-95af-01d311826fab', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Mountain Folk', 'Hardy miners from the northern ranges. They trade in stone, ore, and the finest forged tools.', '{"stone": {"price": 9, "max_per_trade": 20}, "iron_ore": {"price": 10, "max_per_trade": 15}, "cut_stone": {"price": 18, "max_per_trade": 10}}'::jsonb, '{"tools": {"price": 25, "max_per_trade": 8}, "iron_bars": {"price": 16, "max_per_trade": 10}}'::jsonb, true, '2026-05-01 01:08:23.561725+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('2e5874e5-334a-440a-8b7e-3a539f3e44c2', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Desert Caravan', 'Exotic merchants crossing the southern wastes. They prize construction goods and offer pottery and fine goods in return.', '{"bricks": {"price": 13, "max_per_trade": 15}, "iron_bars": {"price": 15, "max_per_trade": 10}, "wood_planks": {"price": 14, "max_per_trade": 15}}'::jsonb, '{"pottery": {"price": 22, "max_per_trade": 8}, "fine_goods": {"price": 35, "max_per_trade": 5}}'::jsonb, true, '2026-05-01 01:08:23.561725+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('1613acce-87b3-4258-ad15-3ee33bf3ad7f', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Coastal Merchants', 'Wealthy sea traders with an appetite for luxury goods. They bring surplus construction materials from port cities.', '{"pottery": {"price": 18, "max_per_trade": 10}, "furniture": {"price": 22, "max_per_trade": 10}, "fine_goods": {"price": 30, "max_per_trade": 8}}'::jsonb, '{"bricks": {"price": 17, "max_per_trade": 12}, "cut_stone": {"price": 22, "max_per_trade": 8}, "wood_planks": {"price": 18, "max_per_trade": 12}}'::jsonb, true, '2026-05-01 01:08:23.561725+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('3c10c5aa-8376-4f73-a489-7723b7f7bf0d', '46c4e125-d62f-424b-9551-0738afb3a19d', 'River Traders', 'Barge merchants who haul raw goods downstream. They pay fair prices for timber and grain, and carry surplus bread upriver.', '{"clay": {"price": 6, "max_per_trade": 15}, "grain": {"price": 7, "max_per_trade": 20}, "timber": {"price": 8, "max_per_trade": 20}}'::jsonb, '{"bread": {"price": 18, "max_per_trade": 10}, "flour": {"price": 12, "max_per_trade": 10}}'::jsonb, true, '2026-05-01 01:34:18.982589+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('ada3b523-046d-445c-b209-c325c05e2ff2', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Mountain Folk', 'Hardy miners from the northern ranges. They trade in stone, ore, and the finest forged tools.', '{"stone": {"price": 9, "max_per_trade": 20}, "iron_ore": {"price": 10, "max_per_trade": 15}, "cut_stone": {"price": 18, "max_per_trade": 10}}'::jsonb, '{"tools": {"price": 25, "max_per_trade": 8}, "iron_bars": {"price": 16, "max_per_trade": 10}}'::jsonb, true, '2026-05-01 01:34:18.982589+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('16da0475-45e9-4e7b-91c3-4fae0e7574db', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Desert Caravan', 'Exotic merchants crossing the southern wastes. They prize construction goods and offer pottery and fine goods in return.', '{"bricks": {"price": 13, "max_per_trade": 15}, "iron_bars": {"price": 15, "max_per_trade": 10}, "wood_planks": {"price": 14, "max_per_trade": 15}}'::jsonb, '{"pottery": {"price": 22, "max_per_trade": 8}, "fine_goods": {"price": 35, "max_per_trade": 5}}'::jsonb, true, '2026-05-01 01:34:18.982589+00:00');
INSERT INTO public.external_trade_partners (id, world_id, name, description, buy_catalog, sell_catalog, is_active, created_at) VALUES ('d31e9235-d971-4f8f-bfa7-6e24443d4f58', '46c4e125-d62f-424b-9551-0738afb3a19d', 'Coastal Merchants', 'Wealthy sea traders with an appetite for luxury goods. They bring surplus construction materials from port cities.', '{"pottery": {"price": 18, "max_per_trade": 10}, "furniture": {"price": 22, "max_per_trade": 10}, "fine_goods": {"price": 30, "max_per_trade": 8}}'::jsonb, '{"bricks": {"price": 17, "max_per_trade": 12}, "cut_stone": {"price": 22, "max_per_trade": 8}, "wood_planks": {"price": 18, "max_per_trade": 12}}'::jsonb, true, '2026-05-01 01:34:18.982589+00:00');

-- ────────────────────────────────────────────────────────────
-- 9. REALTIME (broadcast on insert/update/delete)
-- ────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.buildings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.district_chunks;

