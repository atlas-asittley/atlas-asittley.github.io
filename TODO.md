# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

Order is build-order: small fixes first, foundations next, economy retuning
after that, polish, then big design lifts last.

---

## Up next

- [ ] **Happiness system: citizens immigrate when happy, emigrate when unhappy.**
  - Per-player happiness rating that scales worker supply (or housing growth rate, TBD).
  - Inputs to figure out: housing tier, road access, nearby services (well, market), tax pressure, density, etc.
  - Affects: population growth speed, possibly housing evolution, possibly extractor/processor productivity.
  - Design discussion needed before any code lands.

---

## Done

- **2026-05-04** — District expansion: row-based starters + player-picked expansion. Each player reserves one row at signup; expansion candidates are unowned chunks orthogonally adjacent to the player's district excluding other players' reserved rows. Tap **+ Expand**, candidate chunks pulse gold, tap one to claim. Trapped state impossible because your own row's edges are always available.
- **2026-05-04** — Resource tile rules: can't build on a resource tile (BEFORE INSERT trigger). Tap an owned resource tile to clear it (sets `resource_node_key = NULL`); then it's buildable. Free for now; demolish blocked if an extractor still targets the tile. Tests, including a `clear_resources` shared fixture for tests that build at known coords.
- **2026-05-04** — Wider zoom-out as the map grows. New `computeMinZoom()` returns the smaller of `MAP_MIN_ZOOM` (0.5, the existing static floor for small maps) and the dynamic "fit the whole grid in the viewport" zoom. Hard floor at 0.05 so tiles don't disappear on very large districts.
- **2026-05-04** — Two new buildings: **Well** (`category='service'`, $50, 0 workers) is now a precondition for housing to evolve past tier 0 — needs to be within Manhattan distance 4 of the house. **Tax Office** (`category='tax'`, $300, 10 workers, needs road) credits $10/min when fully staffed via a new section in `process_production`. Placeholder solid-color tile art with letter labels (W / TX); SVG polish later. Happiness hookup deferred to that item.
- **2026-05-04** — Walker variety: WALKER_MAX_COUNT 12→7, spawn chance 0.4→0.22, max steps 18→14, cooldown 4→6 ticks. Per-walker visual jitter via CSS vars: `--wk-scale` (0.85–1.15), `--wk-hue` (±18°, hue-rotates the sprite), `--wk-bob-ms`/`--wk-waddle-ms` (small per-walker animation period jitter). ~18% of ambient walkers spawn `has-hat` → small brown-cap SVG anchored to the head. Same five base sprites, but every walker reads as a slightly different person.
- **2026-05-04** — Worker requirements bumped: extractors and processors all 10 workers each (was 2-4). The all-or-nothing per-building staffing gate already existed in `process_production` (a building only joins `v_staffed_ids` if remaining workers ≥ its worker_cost; only staffed buildings produce). The gate just rarely fired at the old low costs. Now early game is meaningfully tighter — likely future tuning on housing yields if the first-extractor wait feels too long.
- **2026-05-04** — Highway network + remove HQ tile. Every chunk gets a horizontal strip at y_offset=7 and a vertical strip at x_offset=7 stamped as `terrain_type='highway'`, unbuildable, no resource. Highway counts as cost-1 walkable for walker pathing (any owner) and as road-adjacent for `has_road_access`. Roads now connect to highway OR another of your roads (drops the old "adjacent to home" seed rule). City-center special tile removed entirely; `home_x/home_y` retained as logical anchor.
