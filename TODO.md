# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

---

## Up next

- [ ] **Wider zoom-out range as the map grows.**
  - The current `applyMapZoom` clamps zoom to a fixed minimum that was sized for a single 15×15 chunk. As districts expand, you can no longer fit the whole map in view. The minimum zoom should scale down with the player's actual map dimensions (gridCols × gridRows) so you can always see the full district at once if you want.
  - Cap is mostly cosmetic — at extreme zoom-out tiles get tiny — but it should at least cover "all my chunks fit on screen."

- [ ] **Resource tiles: can't build on, but can demolish/clear to free the tile.**
  - Placement validator should reject building on a tile with `resource_node_key IS NOT NULL`.
  - Add a player action to clear the resource (sets `resource_node_key = NULL`), after which the tile is buildable. UI: tap the resource tile → inspector shows a "Clear resource" action.
  - Open: cost? free? small fee? do we leave a "stump" sprite for a while?

- [ ] **Happiness system: citizens immigrate when happy, emigrate when unhappy.**
  - Per-player happiness rating that scales worker supply (or housing growth rate, TBD).
  - Inputs to figure out: housing tier, road access, nearby services (well, market), tax pressure, density, etc.
  - Affects: population growth speed, possibly housing evolution, possibly extractor/processor productivity.
  - Design discussion needed before any code lands.

- [ ] **New buildings.** Sketches, not yet specced:
  - **Well / watering hole** — possibly required for housing to evolve to tier 1 (or 2). Cheap, no workers, area-of-effect happiness or just a precondition.
  - **Tax collector / tax man** — produces money for the city periodically; reduces local happiness. Tradeoff building.

- [ ] **Add a highway / shared road network connecting all districts.**
  - A persistent road system the game owns (not any one player), running through every district so districts can talk to each other and players have somewhere to attach their first road segment.
  - Currently the only seed for road-building is the city center tile of the starter chunk (which Atlas wants to remove anyway — see below).
  - Open: where exactly does the highway run within a chunk? Probably one row + one column at fixed offsets (e.g., y=7 horizontal, x=7 vertical) so it threads through every chunk consistently.
  - **Also: remove the city-center / headquarter tile.** It's stamped at the starter chunk's (7, 7) and Atlas isn't sure why we have it. Once the highway exists it's no longer needed as a road seed. Other side effects to check: it's used as the player's "home" coords for distance calculations; unbuildable; rendered specially on the map. If we remove the visual but keep `home_x/home_y` as a logical anchor, that might be enough.

---

## Done

- **2026-05-04** — District expansion: row-based starters + player-picked expansion. Each player reserves one row at signup; expansion candidates are unowned chunks orthogonally adjacent to the player's district excluding other players' reserved rows. Tap **+ Expand**, candidate chunks pulse gold, tap one to claim. Trapped state impossible because your own row's edges are always available.
