# Productivity (design doc — pre-implementation)

Status: **draft, awaiting Atlas review.** Not implemented yet. The TODO entry explicitly called for a design discussion before code, and the open questions below are gameplay-balance calls rather than code-shape calls.

## Problem

Today, happiness gates **who lives in the district** (immigration / emigration via the population-snap-up + slow-emigrate model in HAPPINESS.md). We don't have a separate measure that affects **how productive each building is**. Atlas wants one — a per-player productivity modifier that multiplies building output, distinct from local booster buildings.

## Recommended design (v1)

A single global multiplier per player, range **0.7 to 1.3**, default 1.0. Multiplies the effective output rate of every functional building (extractors, food extractors, processors, services with output, tax). Layered on top of the existing local boosters — they don't compete:

```
effective_rate = base_rate × productivity × (1 + sum_of_local_booster_bonuses) × staffing × inputs
```

So a Mason Workshop on a tile with a Foreman's Office adjacent (+30% local) and a city productivity of 1.2 outputs `0.5 × 1.2 × 1.30 = 0.78 brick/min` (vs. 0.5 baseline).

### Inputs (additive — capped at +0.3 / -0.3)

| Lever | Effect | Why |
|---|---|---|
| Education coverage | +0.03 per 10% of active housing within a school radius (max +0.10) | Schools already gate Townhouse evolution; stacking small productivity on top reinforces "schools are good" without making them mandatory. |
| Tools in inventory | +0.10 if you have ≥ population × 0.5 tools, +0.05 if ≥ population × 0.2, else 0 | Reuses the existing Toolmaker chain. Tools become consumables: drained by `_pp_drain_tools` at population × 0.05/min while staffed productive buildings exist. |
| Crime | -0.005 per crime point above 50, capped at -0.10 | Already-tracked metric, additional pressure besides the happiness penalty. |
| Population pressure | -0.05 if workers_idle ≤ 0 (everyone tapped) | Encourages keeping a worker buffer. |
| Tavern services running | +0.05 (booster — pulled from existing service flag) | Already exists in the staffing model, this just ties it to productivity too. |

Additive total clamped to ±0.3, applied as 1.0 + clamped_total → final productivity in [0.7, 1.3].

### Storage

New column `player_profiles.productivity` (numeric, default 1.0). Recomputed every tick by `_pp_compute_productivity(uid)` (new phase helper, runs after housing evolution since it depends on housing tier counts and active-house counts). Returned in the process_production JSON so the frontend can show it.

### UI

Topbar indicator next to the happiness emoji: `⚒︎ 1.18×` color-coded (red <0.9 / amber 0.9–1.1 / green >1.1). Clicking opens a tooltip with the breakdown of contributors.

## Open design questions (need Atlas input)

1. **Single number or per-category?** Per-category (extractor / processor / food) gives more design surface but doubles the UI and makes the topbar harder to read. The recommendation above is single-number for simplicity. Atlas: keep single, or split?

2. **Tools as a hard requirement or soft?** Recommendation makes them soft (no tools = no productivity boost, but you don't lose anything). A harder model would idle production when out of tools, more like the existing input-resource model. Hard would couple the toolmaker chain into every player's progression — that's a big push.

3. **Crime penalty: stack on happiness penalty or replace?** Crime already feeds happiness via `-floor(crime/5)`. Adding a separate productivity penalty (recommendation) means crime hits twice, reinforcing it as a real problem. Atlas: too punishing, or feels right?

4. **How visible should the breakdown be?** Recommendation is "tooltip on the topbar indicator." Could also surface per-building ("This Mason Workshop is producing 1.2× because of the city productivity bonus") in the building inspector. Atlas: keep the breakdown city-level, or thread it into the inspector?

## Implementation cost (rough)

If recommendation is approved as-is:
- 1 column on player_profiles + small migration.
- 1 new `_pp_compute_productivity` helper (~50 lines plpgsql).
- 1 hook in process_production after housing evolution.
- Update _pp_run_extractors / _pp_run_food_extractors / _pp_run_processors / _pp_run_tax to multiply output by productivity (~5 lines each).
- Frontend: topbar indicator + tooltip.
- ~10 regression tests pinning each lever.

Ballpark: half a session.

## Why this is paused

The four open questions above are gameplay calls, not code calls. Picking blind risks shipping a system that feels wrong (too punishing, too generous, too noisy on the topbar) and then unwinding it. Cheaper to align on the design first.
