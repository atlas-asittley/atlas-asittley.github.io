-- ============================================================
-- Housing Low-Tier Expansion Migration
-- Expands housing from 2 tiers (0-1) to 5 tiers (0-4)
-- with richer low-end progression
-- ============================================================
--
-- NEW TIER STRUCTURE:
--   Tier 0: Lean-to   — sticks & hide, 1 worker, no road needed
--   Tier 1: Shanty    — scrappy shack, 2 workers, no road needed
--   Tier 2: Shack     — rough walled structure, 3 workers, no road needed
--   Tier 3: Hut       — mud-wattle walls, thatched roof, 5 workers, needs road
--   Tier 4: Cottage   — whitewashed mud-brick, tiled roof, 8 workers, needs road
--
-- MIGRATION PATH (existing data):
--   Old tier 0 (Shanty)  → New tier 1 (Shanty)   — same name, same behavior
--   Old tier 1 (Mud Hut) → New tier 3 (Hut)      — similar role, renamed
--   New houses placed after migration start at tier 0 (Lean-to)
-- ============================================================

BEGIN;

-- Step 1: Remap existing building tiers (order matters: do tier 1→3 first to avoid collision)
UPDATE public.buildings
  SET housing_tier = 3
  WHERE building_type_key = 'house' AND housing_tier = 1;

UPDATE public.buildings
  SET housing_tier = 1
  WHERE building_type_key = 'house' AND housing_tier = 0;

-- Step 2: Replace tier config with expanded 5-tier table
DELETE FROM public.housing_tier_config;

INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs)
VALUES
  (0, 'Lean-to',  'L', 1, false, 15, 60),
  (1, 'Shanty',   'S', 2, false, 25, 45),
  (2, 'Shack',    'K', 3, false, 35, 45),
  (3, 'Hut',      'H', 5, true,  45, 60),
  (4, 'Cottage',  'C', 8, true,  60, 90)
ON CONFLICT (tier) DO UPDATE SET
  name         = EXCLUDED.name,
  label        = EXCLUDED.label,
  workers      = EXCLUDED.workers,
  needs_road   = EXCLUDED.needs_road,
  upgrade_secs = EXCLUDED.upgrade_secs,
  devolve_secs = EXCLUDED.devolve_secs;

-- Step 3: Update place_building to start new houses at tier 0 (Lean-to)
-- (The existing function already sets housing_tier = 0 for new houses,
--  so no change needed there — tier 0 is now Lean-to instead of Shanty.)

COMMIT;
