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

---

## 2026-05-19 — Jill — "townhouses say no operating school despite schools within 5 tiles"

**Reported:** 2026-05-18 23:25 UTC.

**Description (verbatim):**
> Townhouses indicate there is not an operating school, but both have
> schools within 5 tiles so should qualify to upgrade.

**Diagnosis:**
Jill's two tier-3 townhouses at (-16, 45) and (-14, 51) each had her
school at (-18, 49) sitting **Manhattan distance 6** away (`|dx|+|dy| =
2+4`) but **Chebyshev distance 4** (`max(|dx|,|dy|) = 4`). The server
gate in `_pp_evolve_housing` used Manhattan (`ABS(b2.x-v_house.x) +
ABS(b2.y-v_house.y) <= 5`), so Manhattan=6 fell just outside the cap
even though the school was visibly only 4 tiles away on the map. The
same Manhattan check was also in `has_well_access` (range 4) and the
frontend mirror `hasNearbyService` (`src/scenes/housing.js:220`).
Player intuition for "within N tiles" matches Chebyshev (king's-move)
distance — a 5×5 square around the building — not the diamond Manhattan
produces.

**Fix:**
- `service_proximity_chebyshev.sql` (city-builder-mvp / live DB) —
  rewrote `has_well_access` and `_pp_evolve_housing` to use
  `GREATEST(ABS(dx), ABS(dy))` for school (5), temple (6), bathhouse (4),
  and well (4). Service coverage is now an N-tile square instead of an
  N-tile diamond (~2.5× the area). Other Manhattan uses
  (booster/extractor adjacency, desirability falloff, crime spread)
  remain Manhattan — those model walking and influence diffusion, where
  Manhattan is correct.
- `7ffcb35` (citybuilder-game / v2) — `hasNearbyService` in
  `src/scenes/housing.js` switched to the same Chebyshev formula so
  the inspector's blocker text agrees with the server gate.
- `c63b873` (citybuilder) — two new tests in
  `tests/db/test_citizen_services.py`:
  `test_school_uses_chebyshev_distance` (dx=2, dy=4 → Manhattan=6,
  Chebyshev=4: must upgrade) and
  `test_school_chebyshev_corner_still_excluded` (dy=6 alone: must NOT
  upgrade) so the cap can't silently drop.

---

## 2026-05-19 — Jill — "clay industry buildings list no longer shows mosaic workshop"

**Reported:** 2026-05-19 16:53 UTC.

**Description (verbatim):**
> The clay industry available buildings no longer shows a mosaic
> workshop.

**Diagnosis:**
Same root cause as the next entry — see "no schools or temples in civic
services" below. Mosaic Workshop is industry_key='clay' but its second
input is `nails` (industry_key='iron'). After commit `f2080a3`
(2026-05-15, v1-parity build tab) added a producibility filter on the
input chain ("don't show a bakery if nobody in your industry can make
grain"), any building whose declared inputs reached across industries
got silently dropped from the menu. Trade is the explicit mechanism for
bringing in cross-industry inputs, so the filter was overzealous for
trade-unlocked players.

**Fix:** see entry below — shared fix.

---

## 2026-05-19 — Jill — "no schools or temples in civic services"

**Reported:** 2026-05-19 20:52 UTC.

**Description (verbatim):**
> There are no schools or temples that are available in the civic
> services buildings to build.

**Diagnosis:**
For Jill (clay industry), the school's inputs (lumber + flour) and
temple's inputs (statuary + brick) are all produced by other industries
(timber / iron / stone). The producibility filter at
`src/ui/bottompanel/BuildTabPanel.js:120-121`, added in `f2080a3` to
catch a bakery-without-grain misplacement, was unconditional — so for
trade-unlocked players any cross-industry-input building (school,
temple, bathhouse, tavern, mosaic_workshop, brewery, etc.) silently
disappeared from the menu. The filter's design intent ("you can't
make bread if you have no grain") was an early-game guardrail; once
trade is unlocked you can import any input from a partner city, so the
guardrail no longer applies.

**Fix:**
- `49b7358` (citybuilder-game / v2) — `BuildTabPanel.renderBuildTab`
  now gates the producibility filter on `!state.profile.trade_unlocked`.
  Pre-trade tutorial players still get the bakery-without-grain
  guard; everyone else sees every building they own the industry tag
  for (or that's 'common'). Also fixes the mosaic-workshop dropout
  reported the same day (see entry above).

---

## 2026-05-19 — Jill — "placement preview squares don't appear"

**Reported:** 2026-05-19 20:53 UTC.

**Description (verbatim):**
> When you purchase a new type of building or road, the squares to
> indicate the available spaces to place it do not show.

**Diagnosis:**
`MainScene.setPlacementMode` created the ghost sprite at world (0, 0)
and only repositioned it on the next `pointermove` event. On mobile
there is no pointermove between selecting a building and the first
map-tap, so the ghost sat far off-screen at the world origin until
after the first placement attempt — looking to the player like "no
preview." On desktop the gap was shorter (any cursor motion fixed it)
but still visible if the player clicked the build tab via keyboard or
without moving the mouse. The AoE preview (police / park / booster
coverage) had the same delay: `_updatePlacementAoe` only ran from
pointermove, so the coverage diamond didn't appear until after a hover.

**Fix:**
- `11f1d33` (citybuilder-game / v2) — new `_seedPlacementGhost`
  helper called at the end of `setPlacementMode`. Seeds the ghost
  at the current cursor (if it's over the canvas) or the camera
  center as a mobile-safe fallback, and runs `_updatePlacementAoe`
  immediately so the coverage overlay paints on the same frame the
  player selects the building.

---

## 2026-05-21 — Jill — "expanded 4th parcel, charged but no new parcel" + "new parcel squares say not mine"

**Reported:** 2026-05-21 10:25 UTC (4th parcel, no parcel shown) and 15:26 UTC (5th parcel, some squares wrong). Both from iPhone Safari.

**Description (verbatim):**
> I expanded to a 4th parcel and it charged me the money, but does not show another parcel.

> I expanded my parcel to the parcel above mine, but certain squares inside my new parcel indicate they are not mine to build on even though they are within my parcel.

**Diagnosis:**
Same root cause. `fetchTileMap` in `src/state/loader.js` did a single
`sb.from('map_tiles').select(...).eq('owner_player_id', uid)` with no
pagination. PostgREST's default 1000-row cap silently dropped every
tile past the first 1000. With 5 parcels × 225 tiles = 1125 tiles,
the last 125 tiles never made it into `state.tileMap`. The FE then
treated those tiles as wilderness — UI showed them outside the
player's parcel boundary; `place_building` checks (`tile.owner === me`)
failed on the FE side ("not in your parcel"). Server allocation +
ledger were correct the whole time; the bug was purely client-side
display.

Bug #1 (4th parcel "doesn't show") at 900 tiles was below the hard
cap. It still surfaced once, probably a slower mobile fetch returning
fewer than the full 900 — could be a Supabase JS client pagination
quirk on smaller default page sizes for some connections. The
pagination fix resolves both cases.

Same bug class as Max's "half her parcel missing" earlier this year
(audit 2026-05-09); `fetchAllBuildings` was already paginated then,
but `fetchTileMap` was missed.

**Fix:**
- `0b4614f` (citybuilder-game / v2) — paginate `fetchTileMap` in
  loops of 1000 rows ordered by id, mirroring the existing
  `fetchAllBuildings` pattern. No FE state changes; the next page
  reload picks up every tile.

---

## 2026-05-21 — Drew — "new parcel renders wrong colors" + "I only see Jill pledging \$25"

**Reported:** 22:02 UTC and 22:03 UTC, both from Android Chrome (Trade > Contracts tab open).

**Description (verbatim):**
> I just bought a parcel, but I don't see it the same colors as my other parcels

> I still only see Jill pledging \$25, but she pledge much more

**Diagnosis (#1, parcel colors):**
Duplicate root cause of Jill bcd4939d/43933d0b — the same morning.
Drew bought his 5th parcel (1125 tiles), `fetchTileMap` was running
the pre-pagination bundle, the 1000-row PostgREST cap dropped the
last 125 tiles of his new parcel, and the FE rendered them as
wilderness. The fix shipped in `0b4614f` at 15:00 UTC; Drew's bug
filed at 22:02 UTC was against the bundle his browser had cached at
expand time. Reloading picks up the paginated loader.

**Diagnosis (#2, Jill's stake stuck at \$25):**
`SupplyContractsTab` cached the `list_supply_contracts()` response at
module scope and only invalidated the cache when the LOCAL player
contributed or withdrew. Other players' pledges never triggered Drew's
client to refetch, so his view stayed pinned at Jill's first \$25
pledge for ~7 hours while she pushed her stake past \$60k. This was a
pure visibility bug — server-side `list_supply_contracts()` was
returning the correct \$60,225 the whole time.

**Fix:**
- `0f07646` (citybuilder-game / v2) — added a 5-second TTL on
  the contracts cache with stale-while-revalidate. Combined with the
  existing 30s tick refresh of the bottom panel, other players'
  activity now lands within 30s for a passive viewer and within 5s
  for anyone interacting with the panel.

(Resolution for #1 is `0b4614f` from earlier the same day.)

---

## 2026-05-21 — Drew — "the economy is based so much on bread"

**Reported:** 22:05 UTC. Filed as a bug; really design feedback.

**Description (verbatim):**
> The economy is based so much on bread. Jill buys so much bread just
> to keep her housing up. We should balance that out more

**Audit:**
At the time of the report, Jill's 95 houses (5 tier-3, 21 tier-4, 38
tier-5, 12 tier-6, 9 tier-7, 10 tier-8) drained **26.88 bread/min**
≈ 1,612/hour. Buying at the cheapest import price ($14/unit) that's
$376/min — about **14% of her gross tax revenue** going to bread
alone. Drew's instinct was right.

**Fix:**
- `halve_bread_demand.sql` — `UPDATE housing_lifestyle_demands SET
  qty_per_minute = qty_per_minute * 0.5 WHERE resource_key = 'bread'`.
  Per-tier rates were 0.05 / 0.075 / 0.10 / 0.125 / 0.15 / 0.175 at
  tiers 3–8; halved across the board. Substitutes (spices / caviar /
  spirits) still apply at the new lower rate.

No code commit — pure data migration. The next process_production
tick uses the new rates; pantry buffers naturally refill faster as a
side effect.

---

## 2026-05-21 — Atlas — "error sending money to another player" + "NPC trade hold fails"

**Reported:** in chat (not via the in-game modal — no bug_reports rows). 2026-05-21 evening.

**Description (verbatim):**
> I get an error when I try to send money to another player

> for trades with NPC's, you can't hold. it fails if you choose hold

**Diagnosis (#1, P2P send money):**
The compose form in `TradePlayersTab` built `giveResources` /
`receiveResources` as **arrays** of `{resource_key, quantity}`. Server
`propose_trade` + `accept_trade` walk those JSONB columns with
`jsonb_each_text()`, which **only operates on OBJECTS**. Passing an
array (or even an empty array `[]` for money-only trades) raised
`cannot call jsonb_each_text on a non-object`, so every P2P
proposal failed. The five historical offers stored in
`player_trade_offers` were all object-shaped — at some point the FE
diverged from the canonical shape and no one had successfully sent
a P2P trade since.

Two FE readers had been "fixed" earlier the same day (commit
`745668a`) to iterate arrays — wrong for the actual stored shape,
silently dropping P2P data again. Reverted to the object shape
canonically, with defensive both-shapes acceptance in readers.

**Diagnosis (#2, NPC trade hold):**
String drift between FE and server. FE dropdowns in CityResourcesTab
+ TradePartnersTab used `value="hold"`. Server CHECK constraint and
`save_trade_policy`'s IF allowed only `('keep', 'sell_surplus',
'buy_to_reserve')`. Clicking Hold always raised
`Invalid trade mode: hold`. 'hold' is the player-facing word —
brought the server to match. Also fixed
`src/scenes/helpers.js:315` which still guarded with
`policy.mode !== 'keep'` (dead code; never matched after the FE
moved to 'hold').

**Fix:**
- `a287c93` (citybuilder-game / v2) — TradePlayersTab compose now
  builds `{ resource_key: qty }` objects. describeBundle +
  computeInboxBlockers + CityResourcesTab aggregation all defensively
  accept both shapes. helpers.js:315 corrected from 'keep' to 'hold'.
- `5634d6a` (citybuilder / v1) — `trade_mode_keep_to_hold.sql`:
  DROP constraint, UPDATE 3 existing 'keep' rows to 'hold', new
  constraint allowing 'hold'; save_trade_policy IF updated.

---

## 2026-05-22 — Jill — "housing capacity dropped from ~4000 to ~3100"

**Reported:** 2026-05-22 00:27 UTC, in-game bug-report modal.

**Description (verbatim):**
> I thought I had a housing capacity of over 4000, but now it is showing only about 3100 as a capacity. Can you tell if any housing devolved or if that higher capacity was ever there?

**Diagnosis:**
Working as designed — no code bug. Jill's 6 temples each consume
brick (0.5/min) and statuary (0.25/min); with 6 temples that's 3.0
brick/min. At ~22:10 UTC on 2026-05-21, brick reached zero and the
temples failed `_pp_run_services`'s input-availability check. They
were staffed and in-range, but not in `p_operating_services` for that
tick, so 71 tier-5 houses lost temple coverage and devolved to tier 4.
Many re-upgraded within minutes as brick restocked. 20 houses remain
at tier 4 because their desirability (53–68) is below the tier-5 gate
of 70 — these are correctly blocked.

**Resolution:** Deferred — no code change needed. Queued a
feedback_prompt explaining the root cause (brick starvation) and
advising Jill to raise desirability in the affected areas to recover
full capacity.

---

## 2026-05-22 — Drew — "new parcel didn't show immediately after purchase"

**Reported:** 2026-05-22 00:39 UTC, in-game bug-report modal.

**Description (verbatim):**
> I just tried to buy a new parcel, and it didn't immediately show as available to me. It might show after a refresh, but it should show immediately.

**Diagnosis:**
`StatInfoModal.js` opens the expansion picker with an empty callback:
`openExpansionPanel(() => {})`. The `rerenderWorld()` call that paints
newly claimed tiles onto the Phaser canvas lives in `main.js`'s
`mountTopBar` callback — only reached when expansion is triggered from
the top bar. Expansions from the district stats panel skipped the
rerender entirely, leaving the map stale until manual refresh.

**Fix:** `db691ba` (citybuilder-game / v2) — added
`if (sceneRef?.rerenderWorld) sceneRef.rerenderWorld()` directly in
`ExpansionPanel.js`'s `onPickCandidate` success handler, before the
caller's callback fires. The map now rerenders unconditionally on
every successful parcel claim regardless of entry point.

---

## 2026-05-22 — Atlas — "feedback modal hidden under topbar + small gap above infobar"

**Reported:** in chat. Both layout bugs.

**Description (verbatim):**
> the window that pops up for a response for bug reports is not aligned properly. part of it is covered by the top title bar.

> there is a small gap between the title bar that tells me that I am in the timber industry, and the info bars above that

**Diagnosis:**
Two unrelated CSS bugs:

1. `FeedbackPromptModal` mounts an overlay with `id="feedback-overlay"`,
   but the only fixed/centered overlay rule in `styles.css` was scoped
   to `#bug-overlay`. The modal fell into normal block flow at the top
   of `<body>` and the `position:fixed` topbar overlapped it. Same root
   cause as if I'd built the modal without any CSS at all.

2. `#infobar` was positioned at `top: 74px` based on a comment that
   assumed `box-sizing: content-box` and computed the topbar as
   `2 × 36px content + 2 × 1px borders = 74px`. The global reset
   `* { box-sizing: border-box; ... }` means `min-height: 28px`
   already INCLUDES the padding, so the topbar's actual rendered
   height is `2 × 28px + 2 × 1px = 58px`. The ~16px gap was exactly
   the difference.

**Fix:**
- `ae94366` (citybuilder-game / v2) — extended the `#bug-overlay`
  CSS rule selector to `#bug-overlay, #feedback-overlay` so the
  feedback modal inherits its overlay styling. Moved `#infobar`
  from `top: calc(74px + safe-area-inset)` to
  `top: calc(58px + safe-area-inset)`. Updated two stale comments
  referencing the old 74px constant.
