# City Builder TODO

Running list of things to do. The user (Atlas) adds items; we work through them
together. Move completed items to **Done** with a date so the history is
visible without needing `git log`.

---

## Up next

- [ ] **Fix district expansion: adjacent, not diagonal — and rethink the layout for multiple players.**
  - **Immediate bug:** Atlas just bought an expansion and got the chunk diagonally off his starter, with a 1-chunk gap he can't build a road across. Cause is in `next_unowned_chunk_slot()` (baseline_schema.sql ~line 1072): at each radius it iterates the full square ring with `ABS(x)=r OR ABS(y)=r`, which visits corners before edges, so the first available ring-1 slot is a diagonal.
  - **Bigger design question:** the allocator is a single global spiral and conflates "where does a new player land?" with "where does an existing player's expansion go?" — those should probably be separate decisions. Districts need to grow infinitely AND accommodate infinite players without collision.
  - Atlas's leaning: **row-based** — each player gets a horizontal strip that grows left/right; new players get a strip below.
  - Other options worth weighing: (a) per-player local spiral that prefers orthogonal neighbors of *your* existing chunks, with a starter allocator that spreads new players far apart; (b) explicit "directions to grow" picker each time the player taps Expand.

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

---

## Done

_(empty — completed items move here with a date and a one-line summary)_
