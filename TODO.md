# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

Order is build-order: small fixes first, foundations next, economy retuning
after that, polish, then big design lifts last.

---

## Up next

- [ ] **Higher worker requirements + hard staffing gate on production.**
  - Extractors currently need ~2 workers each — way too low. Bump production buildings to something like 10 workers each (TBD per type, but in that ballpark).
  - Production should be **all-or-nothing**: a building outputs zero until the full worker requirement is met. Today partial staffing still produces, which makes the worker economy too soft.
  - Likely tuning needed: worker yield from housing tiers, expansion cost relative to staffing pressure, starting worker pool, etc. Will tighten the early-game loop noticeably — check that the player can still get a first extractor running.

- [ ] **Walker variety: fewer of them, more visual variation.**
  - Reduce overall walker count — current density makes the map feel busy and the individual pawns blur together.
  - Add visual variation per walker type: 2–3 sprite variants per role (collector, ambient, etc.) picked deterministically per walker; small variation in size, maybe gait (slight bob/speed jitter). Goal is "this city has individuals" rather than "this city has clones."
  - Extra flair to consider once variants exist: a hat or accessory on some, occasional carry-objects (basket, log) for collectors mid-trip.

- [ ] **New buildings.** Sketches, not yet specced:
  - **Well / watering hole** — possibly required for housing to evolve to tier 1 (or 2). Cheap, no workers, area-of-effect happiness or just a precondition.
  - **Tax collector / tax man** — produces money for the city periodically; reduces local happiness. Tradeoff building.

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
- **2026-05-04** — Highway network + remove HQ tile. Every chunk gets a horizontal strip at y_offset=7 and a vertical strip at x_offset=7 stamped as `terrain_type='highway'`, unbuildable, no resource. Highway counts as cost-1 walkable for walker pathing (any owner) and as road-adjacent for `has_road_access`. Roads now connect to highway OR another of your roads (drops the old "adjacent to home" seed rule). City-center special tile removed entirely; `home_x/home_y` retained as logical anchor.
