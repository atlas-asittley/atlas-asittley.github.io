# UI Number Audit — Findings

Working file. Each computed UI number gets verified here with:
- The formula as displayed in the UI
- The source-of-truth comparison
- ✅ correct / ⚠ suspicious / 🐞 confirmed bug
- For 🐞 entries: research notes (git log / memory / migration history) before fix.

Pass-through entries get a one-line "trivially correct" note.

---

## Topbar (entries #1-11)

- #1 Money — pass-through `state.profile.money`. ✅ trivially correct.
- #2 Runway — 🐞 **BUG (fixed)**: pantry buffers weren't added to stock. After the per-house pantry rollout (2026-05-09), houses hold up to 30 min of consumption in their own buffers; `computeCityRunway` in panels.js was only counting `state.inventory[*]`, ignoring `state.buildingBuffers`. For Drew's 17 houses at tier 2 that's ~120 food-units of unaccounted buffer (~8 min at his drain rate). Under-reported runway in deficit scenarios.
  - Fix shipped: food + lifestyle stock now sums each building's relevant buffer alongside city inventory. Skipped when `state.buildingBuffers` isn't loaded yet (early render guard).
- #3 Parcels — pass-through `state.profile.chunks_owned`. ✅ correct.
- #4 Trader-reset countdown — `(nextUtcMidnight - now) / 60000` then format. ✅ math correct, matches server's `day_bucket = CURRENT_DATE` boundary.
- #5 Workers `used/needed` — pass-through from `state.laborInfo`. ✅ display correct.
- #6 Labor shortage badge — pass-through. ✅
- #7 Population `Math.floor(pop) / cap` — ✅ correct.
- #8 Happiness — `Math.round(h)` from server. ✅ display correct.
  - 🐞 **BUG: tooltip rate estimate is 4× too low.** `ui.js:163-164`:
    ```js
    'Citizens slowly moving in (~' + ((h - 50) / 50).toFixed(2) + '/min).'
    ```
    Server uses `v_max_rate = 4.0` (commit `12c7f87`, 2026-05-06: "was 1.0; bumped per playtest"). Tooltip wasn't updated; still shows the pre-bump 1.0 multiplier. At happiness 100, tooltip says "1.00/min" but real migration is 4/min. Same for the leaving-rate branch.
    Memory `feedback_balance_invariants.md` correctly tracks v_max_rate=4.0; only the UI tooltip leaked.
    **Fix shipped**: tooltip now uses the actual `state.profile.migration_rate` instead of computing its own estimate.
- #9 Crime — `Math.round(c)` from server. ✅ display correct.
- #10 Migration rate `±X.XX` — `Math.round(rate * 100) / 100` of server's `migration_rate`. ✅ math correct.
- #11 Productivity `X%` — `Math.round(p * 100)`. ✅ correct.
