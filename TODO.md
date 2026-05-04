# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

Order is build-order: small fixes first, foundations next, economy retuning
after that, polish, then big design lifts last.

---

## Up next

- [ ] **Two resources per player: their industry resource + an industry-paired food.**
  - Currently each player extracts one resource (timber/stone/grain/clay). New rule: every player ALSO produces one food crop, paired with their industry. Total of two extractable resources per player.
  - Open: how to pair industries with foods given grain itself is currently an industry. Options to weigh: (a) collapse grain into a sub-step of another industry and replace it with a non-food primary like "iron" or "copper"; (b) keep grain as an industry whose food is a different food; (c) something else. Will need to revisit `industry_key` and the seed building_types.
  - Likely pairings to discuss: timber → berries (orchard), stone → fish (fishing pier), clay → vegetables (garden), <new fourth> → grain (farm).

- [ ] **Happiness system: citizens immigrate when happy, emigrate when unhappy.**
  - Per-player happiness rating that scales worker supply (or housing growth rate, TBD).
  - Inputs to figure out: housing tier, road access, nearby services (well, market), tax pressure, density, etc.
  - Affects: population growth speed, possibly housing evolution, possibly extractor/processor productivity.
  - Design discussion needed before any code lands.

---

## Done

- **2026-05-04** — Citizen-service buildings (×4), each consuming a unique pair of resources to push trade. **Tavern** (bread+pottery → +10 worker capacity, $350/5w/tier 2), **Bathhouse** (brick+clay → blocks housing devolve in 4-tile radius, $300/5w/tier 2), **School** (lumber+flour → gates Townhouse tier 3 in 5-tile radius, $600/10w), **Temple** (statuary+brick → gates Villa tier 4 in 6-tile radius, $800/10w). All require staffing AND ongoing input feeding to operate — drop either input → effect disappears next tick. Schema: added `input_resource_key_2`/`input_rate_2` to `building_types` (cheaper than a join table); added `needs_school`/`needs_temple` to `housing_tier_config`. Process: `process_production` now feeds services in a fourth loop, populates `v_operating_services`, and `v_has_school`/`v_has_temple`/`v_has_bathhouse` queries that set in the housing loop. Tavern's worker bonus uses the existing `output_rate` column (10). Inline-SVG sprites in the kiln style for all four. Tests: 7 covering multi-input charging, partial-feed idle, worker-capacity bonus on/off, tier 3 gate fed/unfed, devolve block fed/unfed.
- **2026-05-04** — District expansion: row-based starters + player-picked expansion. Each player reserves one row at signup; expansion candidates are unowned chunks orthogonally adjacent to the player's district excluding other players' reserved rows. Tap **+ Expand**, candidate chunks pulse gold, tap one to claim. Trapped state impossible because your own row's edges are always available.
- **2026-05-04** — Resource tile rules: can't build on a resource tile (BEFORE INSERT trigger). Tap an owned resource tile to clear it (sets `resource_node_key = NULL`); then it's buildable. Free for now; demolish blocked if an extractor still targets the tile. Tests, including a `clear_resources` shared fixture for tests that build at known coords.
- **2026-05-04** — Wider zoom-out as the map grows. New `computeMinZoom()` returns the smaller of `MAP_MIN_ZOOM` (0.5, the existing static floor for small maps) and the dynamic "fit the whole grid in the viewport" zoom. Hard floor at 0.05 so tiles don't disappear on very large districts.
- **2026-05-04** — Hide tile coordinates in inspector panels. Stripped the `(x, y)` row from buildings, walkers, and the new resource-tile inspector. Walker also lost its redundant duplicate-source row in the cleanup.
- **2026-05-04** — Resource tile inspector. Tapping an owned resource tile now opens the same panel chrome the building inspector uses, with rows listing the deposit's role: harvested by which extractor, processed by which processor → output, optional second downstream step, and the tile coords. Demolish button at the bottom calls `clear_resource_tile` (matches the server's "blocked while an extractor is targeting this tile" rule with an inline warning). The old confirm dialog flow is gone.
- **2026-05-04** — Well polished: 3 workers + road requirement + walker. Staffing flows through the same loop as processors/tax (`category='service'` joined). New 64×64 inline-SVG art in the kiln/mill style — stone ring, water inside, two posts holding a small thatched roof, a bucket on a rope. Well attendants render as plain `citizen` walkers for now. Tax Office still uses the placeholder solid-color tile (its own SVG polish is a separate task).
- **2026-05-04** — Two new buildings: **Well** (`category='service'`, $50, 0 workers) is now a precondition for housing to evolve past tier 0 — needs to be within Manhattan distance 4 of the house. **Tax Office** (`category='tax'`, $300, 10 workers, needs road) credits $10/min when fully staffed via a new section in `process_production`. Placeholder solid-color tile art with letter labels (W / TX); SVG polish later. Happiness hookup deferred to that item.
- **2026-05-04** — Walker variety: WALKER_MAX_COUNT 12→7, spawn chance 0.4→0.22, max steps 18→14, cooldown 4→6 ticks. Per-walker visual jitter via CSS vars: `--wk-scale` (0.85–1.15), `--wk-hue` (±18°, hue-rotates the sprite), `--wk-bob-ms`/`--wk-waddle-ms` (small per-walker animation period jitter). ~18% of ambient walkers spawn `has-hat` → small brown-cap SVG anchored to the head. Same five base sprites, but every walker reads as a slightly different person.
- **2026-05-04** — Worker requirements bumped: extractors and processors all 10 workers each (was 2-4). The all-or-nothing per-building staffing gate already existed in `process_production` (a building only joins `v_staffed_ids` if remaining workers ≥ its worker_cost; only staffed buildings produce). The gate just rarely fired at the old low costs. Now early game is meaningfully tighter — likely future tuning on housing yields if the first-extractor wait feels too long.
- **2026-05-04** — Highway network + remove HQ tile. Every chunk gets a horizontal strip at y_offset=7 and a vertical strip at x_offset=7 stamped as `terrain_type='highway'`, unbuildable, no resource. Highway counts as cost-1 walkable for walker pathing (any owner) and as road-adjacent for `has_road_access`. Roads now connect to highway OR another of your roads (drops the old "adjacent to home" seed rule). City-center special tile removed entirely; `home_x/home_y` retained as logical anchor.
