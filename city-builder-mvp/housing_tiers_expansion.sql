-- ============================================================
-- City Builder - Housing Tiers Expansion (Tiers 2-4)
-- ============================================================
-- Run AFTER housing_evolution_migration.sql.
-- Adds: Cottage (T2), Villa (T3), Mansion (T4) tier definitions.
-- The evolution conditions in process_production will need updating
-- to handle multi-tier upgrades (road + building count, etc.).
-- ============================================================

-- Seed expanded tier definitions
INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs)
VALUES
  (2, 'Cottage',  'C', 10, true, 60,  90),
  (3, 'Villa',    'V', 16, true, 120, 120),
  (4, 'Mansion',  'M', 24, true, 180, 180)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  label = EXCLUDED.label,
  workers = EXCLUDED.workers,
  needs_road = EXCLUDED.needs_road,
  upgrade_secs = EXCLUDED.upgrade_secs,
  devolve_secs = EXCLUDED.devolve_secs;
