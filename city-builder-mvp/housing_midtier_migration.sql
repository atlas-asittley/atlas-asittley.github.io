-- ============================================================
-- City Builder - Mid-Tier Housing Migration
-- ============================================================
-- Run AFTER the Housing Evolution migration is in place.
-- Adds: housing tiers 2-4 (Cottage, Townhouse, Villa)
-- These fill the progression gap between basic survival housing
-- and true prosperity, giving players a richer upgrade ladder.
-- ============================================================

-- ────────────────────────────────────────────────────────────
-- 1. SEED MID-TIER DEFINITIONS
-- ────────────────────────────────────────────────────────────
-- Tier 2 (Cottage):   Stable family home. First "real" house.
-- Tier 3 (Townhouse): Multi-family dwelling, visible second story.
-- Tier 4 (Villa):     Prosperous residence approaching luxury.
--
-- All mid-tiers require road access. Upgrade/devolve timers
-- increase with tier to make higher tiers feel more earned
-- and losses more forgiving.

INSERT INTO public.housing_tier_config (tier, name, label, workers, needs_road, upgrade_secs, devolve_secs)
VALUES
  (2, 'Cottage',   'C', 10, true, 45, 60),
  (3, 'Townhouse', 'T', 16, true, 60, 90),
  (4, 'Villa',     'V', 24, true, 90, 120)
ON CONFLICT (tier) DO UPDATE SET
  name = EXCLUDED.name,
  label = EXCLUDED.label,
  workers = EXCLUDED.workers,
  needs_road = EXCLUDED.needs_road,
  upgrade_secs = EXCLUDED.upgrade_secs,
  devolve_secs = EXCLUDED.devolve_secs;
