# Bug Reports

Resolved bug-report archive. Each entry preserves the player's original
description, the diagnosis, and the commit that fixed it. The richer
`bug_reports` table on the server (filed via the in-game 🐞 Report bug
button) holds the full client + server state snapshot for re-analysis;
this file is the human-readable index.

**Workflow** (per `feedback_bug_report_workflow.md`):

1. New bug arrives in `public.bug_reports` (or the convenience view
   `public.open_bug_reports`).
2. Diagnose using the server_state JSON snapshot.
3. Ship the fix.
4. UPDATE the row with `resolved_at = now()`, `resolution_notes`, and
   `resolution_commit`. The row stays in the DB.
5. Append a new entry to this file with date filed, reporter, problem,
   diagnosis, fix, and commit SHA(s).

The inbox `SELECT * FROM open_bug_reports` filters to unresolved only,
so the table doesn't grow visually as we work through them.

---

## 2026-05-09 — Jill — "unable to update from a townhouse to a villa"

**Reported:** 2026-05-09 19:22 UTC, in-game bug-report modal.

**Description (verbatim):**
> I am unable to update from a townhouse to a villa. The upgrade button
> is there, but the building doesn't upgrade.

**Diagnosis:**
Two interacting issues. (1) The upgrade-error `showToast` call had been
stripped to a no-op the day before (commit `7f58698`, "Notifications:
keep only housing-ready-to-upgrade") — when the server rejected the
upgrade with "House is not currently eligible", the alert was silent and
the button visibly snapped back to "Upgrade" with no explanation. From
Jill's view, clicks did nothing. (2) The Upgrade button stayed visible
on houses the server had since deemed *ineligible* because the realtime
sub only watched INSERT/DELETE on buildings, not UPDATE — so her client's
`state.allBuildings` had a stale `evolution_eligible_at`. Server-side,
the eligibility-cleared transition never emitted an event either, so
client refetches were never triggered for the lost direction.

Conditions actually failing at the moment of her report (verified from
the server-state snapshot): flour 0.026 (school couldn't sustain
operation), tile desirability NULL (defaulted to 50, tier 4 needs ≥ 60),
some townhouses 6+ tiles from the school (tier 4 needs ≤ 5).

**Fix:**
- `25aa226` — converted 39 silent error `showToast` calls to `alert()`
  across the codebase per `feedback_bell_log_policy.md`. Added a new
  `housing_lost_eligibility` event to `_pp_evolve_housing` (mirrors
  `housing_ready_to_upgrade` for the clearing direction) so the
  evolution_events array stays non-empty on transitions.
- `f9497ac` — subscribed to UPDATE on buildings in `realtime.js` so
  other players' tier changes propagate without waiting for the
  current player's own tick.

**Tests:** `test_housing_lost_eligibility.py` (3 tests pinning the new
event behavior).

---

## 2026-05-13 — Jill — "clay master's hut isn't boosting"

**Reported:** 2026-05-13 13:57 UTC.

**Description (verbatim):**
> The clay master's hut does not appear to be boosting clay
> production. I added additional clay masters huts within 2 tiles
> of my clay diggers but my clay production did not appear to
> increase. I need this for increasing revenue or my city is doomed.

## 2026-05-14 — Jill — "clay reserve isn't accumulating"

**Reported:** 2026-05-14 00:52 UTC.

**Description (verbatim):**
> I should be having a net accumulation of clay at the rate of 9
> per minute, but my clay reserve is staying unchanged. I am not
> trading any clay, so it should be accumulating.

**Diagnosis (both):**
Same root cause. Both clients' City → Resources panel summed
extractor `output_rate` without applying the per-tick scaling the
server actually uses:

- `min(1, 4/path_length)` — Jill's 20 clay_pits ranged from path 3
  to path 37; effective production was ~13/min, not the 30/min the
  panel implied.
- Booster MAX multiplier — 14 of her 20 pits WERE in range of a
  staffed clay_master_hut (×1.25), but the panel showed no effect
  either before or after she added more huts.
- Productivity multiplier (`player_profiles.productivity`, currently
  1.15 for her) — neither production nor consumption was scaled.

Real math: ~17.8 clay/min produced vs. 12 pottery_kiln × 1.5 × 1.15
+ 2 glassworks × 1.0 × 1.15 = 23/min consumed → −5/min net.
Stockpile sat at 0 because consumption exceeded production. The
panel said +9/min. Server-side production math was correct; the bug
was 100% on the UI side.

**Fix:**
- `9ebd0b4` (citybuilder / v1) — new helpers in
  `city-builder-mvp/js/panels.js`: `getProductivity`,
  `getBoosterMultiplier` (Manhattan ≤ boost_range, MAX of matching
  staffed boosters), `effectiveOutputRate` (per-instance
  composition). `computeNetRates` + `computeResourceFlow` updated.
- `f0c610d` (citybuilder-game / v2) — mirror of the same logic in
  `src/scenes/helpers.js`. 10 new vitest cases including a full
  reproduction of Jill's clay layout (20 pits + 4 huts + 12 kilns
  + productivity 1.15) — the panel now reports the deficit instead
  of a phantom surplus.

---

## 2026-05-15 — Jill — "required bread to sustain the city is too high"

**Reported:** 2026-05-15 13:34 UTC.

**Description (verbatim):**
> The required bread to sustain the city is set too high. The amount
> that can be purchased from available traders is not enough to
> sustain the city.

**Diagnosis:**
Bread is a tier-2+ lifestyle good — every cottage/townhouse/villa/etc.
drains it every minute (rates per `housing_lifestyle_demands`). Jill's
options for *importing* it were thin: of 10 active NPC partners only
2 happened to roll bread in their 3-6 random catalog (proc_71fab7296f3e
and river_traders), and even those priced it near the upper band
(sell_price 19-20). The base_price-anchored procedural model
(`_spawn_random_trader`) makes "does this partner sell bread?" a
coin-flip per partner per spawn, so a player can run a 4-trader hub
and never get an option to import the staple they need.

**Fix:**
- `7cbf94d` (citybuilder / v1) — `bread_always_available.sql`:
  `_spawn_random_trader` now appends a guaranteed bread row to every
  procedural partner on top of its 3-6 random non-bread picks. Bread
  sell_price discounted 25% (band 1.05-1.5× × 0.75 = 0.79-1.13×
  base_price; rolls land at 12-17 vs base 15). Backfill knocked 25%
  off existing bread sell_prices and inserted a discounted bread row
  for every active trader that didn't sell bread (8 of 10). buy_price
  untouched — discount only applies to player-buys-bread, not
  player-sells-bread. Test now asserts 4-7 trader_prices rows plus a
  bread row on every spawn.

---

## 2026-05-15 — Jill — "total housing capacity doesn't match old UI"

**Reported:** 2026-05-15 16:28 UTC.

**Description (verbatim):**
> On the new UI, my total housing capacity does not show as the same
> number as the old UI.

**Diagnosis:**
v1's state.js sets `housingCapacity = popFloor + sum(tier.workers)`
for active road-connected houses and the topbar renders pop/cap from
it. v2's `state.laborInfo.housingCapacity` had a default of 0 and was
never recomputed — `tick.js` only mirrored profile.worker_capacity
(= current workforce supply, not housing cap). With li.housingCapacity
= 0, `TopBar.refreshTopBar` line 223 fell back to `cap = pop`, so the
topbar showed pop/pop. For Jill at pop=1149, that's `1149/1149`
instead of the actual `1149/1291` (15 floor + 27×24 + 17×34 + 1×50).

**Fix:**
- `b096635` (citybuilder-game / v2) — new
  `computeHousingCapacity(allBuildings, buildingTypes,
  housingTierConfig, myId, profile)` helper in `src/scenes/helpers.js`
  mirroring v1's state.js calc. Called from `TopBar.refreshTopBar`
  and stashed on `state.laborInfo.housingCapacity` so other consumers
  can re-use. 5 new vitest cases (floor, tutorial, road requirement,
  tier-0 shanty without road, foreign/inactive filter).
