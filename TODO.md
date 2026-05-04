# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

Order is build-order: small fixes first, foundations next, economy retuning
after that, polish, then big design lifts last.

---

## Up next

- [ ] **Wider zoom-out range as the map grows.**
  - The current `applyMapZoom` clamps zoom to a fixed minimum that was sized for a single 15×15 chunk. As districts expand, you can no longer fit the whole map in view. The minimum zoom should scale down with the player's actual map dimensions (gridCols × gridRows) so you can always see the full district at once if you want.
  - Cap is mostly cosmetic — at extreme zoom-out tiles get tiny — but it should at least cover "all my chunks fit on screen."

- [ ] **Add a highway / shared road network connecting all districts. Also remove the city-center / HQ tile.**
  - A persistent road system the game owns (not any one player), running through every district so districts can talk to each other and players have somewhere to attach their first road segment.
  - Currently the only seed for road-building is the city center tile of the starter chunk (which Atlas wants to remove anyway).
  - Open: where exactly does the highway run within a chunk? Probably one row + one column at fixed offsets (e.g., y=7 horizontal, x=7 vertical) so it threads through every chunk consistently.
  - **Also: remove the city-center / headquarter tile.** It's stamped at the starter chunk's (7, 7) and Atlas isn't sure why we have it. Once the highway exists it's no longer needed as a road seed. Other side effects to check: it's used as the player's "home" coords for distance calculations; unbuildable; rendered specially on the map. If we remove the visual but keep `home_x/home_y` as a logical anchor, that might be enough.

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
