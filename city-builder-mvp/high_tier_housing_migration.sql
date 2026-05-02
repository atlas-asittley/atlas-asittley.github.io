-- ============================================================
-- City Builder - High-Tier Housing Migration
-- ============================================================
-- Run AFTER the Housing Evolution migration is in place.
-- Adds: housing tiers 2-5 (Cottage, Townhouse, Villa, Manor Estate)
-- These represent the aspirational late-game housing ladder.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. SEED HIGH-TIER HOUSING DEFINITIONS
-- ────────────────────────────────────────────────────────────
-- All high-tier housing requires road access.
-- Workers scale non-linearly to reward investment in upgrading.
-- Upgrade times increase per tier; devolve is always faster.

INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs)
VALUES
  (2, 'Cottage',       'C', 10, true, 60,  60),
  (3, 'Townhouse',     'T', 16, true, 120, 60),
  (4, 'Villa',         'V', 24, true, 180, 90),
  (5, 'Manor Estate',  'M', 34, true, 300, 120)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  label = EXCLUDED.label,
  workers = EXCLUDED.workers,
  needs_road = EXCLUDED.needs_road,
  upgrade_secs = EXCLUDED.upgrade_secs,
  devolve_secs = EXCLUDED.devolve_secs;
