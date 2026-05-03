# City Builder — Game Design

This is the canonical reference for how the game is intended to work. It describes the **target state** as of the current planned milestones (district scaffolding + distance-based resource collection). Where target state diverges from current code, that's called out explicitly.

For implementation/file layout details see `city-builder-mvp/STRUCTURE.md`. This document is about *mechanics*, not file structure.

---

## Concept

A multiplayer city builder where every player specializes in one primary resource and trades with others to access the rest. The map is shared. Each player owns a contiguous **district** they build in. Districts can be expanded for a cost. Players see each other's work but can't build on it.

Tech: static frontend (no build step) + Supabase (Postgres + Auth + RPC + Realtime). Server is authoritative for game state.

---

## World model

### The map
- Single shared map across all players.
- Coordinates are **absolute signed integers** with no upper bound. The map is unbounded in principle.
- Tiles are stored in `map_tiles` (one row per tile). Key fields:
  - `x`, `y` — coordinates
  - `terrain_type` — visual/biome flavor
  - `resource_node_key` — nullable; if set, the tile contains a resource deposit of that type
  - `buildable` — terrain-level placement allowance
  - `owner_player_id` — nullable; the player who owns this tile (M1 addition)
  - `claimed_by_building_id` — nullable; the extractor currently claiming this resource tile (M2 addition)

Tiles with `owner_player_id = NULL` are **wilderness** — visible but not buildable by anyone.

### Districts
A player's **district** is the set of all tiles where `owner_player_id = me`. Districts are not stored as bounding rectangles — they're computed from per-tile ownership. This allows irregular shapes and fast lookups.

Districts can only contain matching resource tiles for the owner's industry. A timber player's district has only timber resource tiles; a stone player's has only stone, etc.

### Chunks and expansion
A **chunk** is a 15×15 block of tiles allocated as a unit. Districts grow by chunks, not by individual tiles.

**New player onboarding:**
1. Player signs up via `choose_industry`.
2. Server picks the next free slot in a **spiral allocation** order starting at origin: (0,0), (1,0), (0,1), (−1,0), (0,−1), (1,1), (−1,1), (−1,−1), (1,−1), (2,0), … ad infinitum.
3. A 15×15 chunk is created at that slot, all tiles get `owner_player_id = new player`.
4. Approximately 8% of the chunk's tiles get `resource_node_key = player's primary resource`, scattered.

**Expansion:**
1. Player calls `expand_district` RPC.
2. Cost: `base_cost × chunks_owned²` (quadratic curve — gentle early, steep late).
3. Server picks the first adjacent unowned chunk slot (or the player picks a direction; design TBD).
4. New chunk is added with the same 8% resource density.

The spiral allocation guarantees no two players ever overlap, even with concurrent signups, because the next-free pointer just advances atomically.

### Cross-player visibility
- Other players' tiles, buildings, walkers, and roads all render on the map.
- Clicking another player's building opens a limited-info inspector (name, owner, type — no economy data).
- Walkers from other players are visible but not interactable.

---

## Players

Each player has exactly one `industry_key` stored on `player_profiles`. Industries currently defined: `timber`, `stone`, `grain`, `clay`. Each maps 1:1 to a primary resource (timber industry → timber resource, etc.) via `resources.industry_key`.

Industry is **assigned randomly at signup** and never changes. (The current `choose_industry` RPC has a stale validator that only allows `('timber', 'stone')`; this is a known bug to fix as part of M1.)

**Build menu filtering:** server-side check in `place_building`:
```
IF v_bt.industry_key <> 'common' AND v_bt.industry_key <> v_player.industry_key THEN reject
```
Buildings with `industry_key = 'common'` (housing, roads, future civic) are buildable by anyone. Industry-specific buildings are filtered to matching players.

**Workers:** every player starts with 5 base workers. Housing adds workers (each house provides 6). Production buildings consume workers, allocated oldest-first. Buildings without workers go `unstaffed` and don't produce.

---

## Building taxonomy

Buildings are stored in `buildings`; their catalog is `building_types`. Categories:

- **`extractor`** (tier 1) — collects raw resources from map tiles. New mechanic; see [Resource collection](#resource-collection).
- **`processor`** (tier 2) — consumes one resource from inventory, produces another. Examples: sawmill (timber → planks), mill (grain → flour).
- **`artisan`** (tier 3) — higher-tier processor. Examples: woodcarver, sculptor, bakery.
- **`housing`** — provides workers, evolves through tiers t0–t5. `industry_key = 'common'`.
- **`road`** — connectivity infrastructure. Walkers move on roads. Required for production-building access. `industry_key = 'common'`.
- **`specialty`** *(future)* — cross-resource civic buildings. Not yet defined.

Each building has:
- `(x, y)` position
- `player_id` — owner
- `status` — `active`, `inactive`, `idle` (M2: extractor with no path), `unstaffed`, `disconnected`, etc.
- `created_at` — used for worker allocation order

M2 additions to `buildings` (extractors only):
- `target_x`, `target_y` — coordinates of the claimed resource tile
- `path_length` — number of road tiles between the extractor's adjacent road and the road tile next to the target

---

## Resources

Stored in the `resources` catalog table; per-player counts in `inventories`. Each resource has `industry_key` linking it to its native industry. A `kind` field distinguishes raw resources (output of extractors) from processed goods (output of processors).

A player can produce **only their primary resource** directly via extractors. To get any other resource, they must trade (NPC or player-to-player).

---

## Resource collection

This is the new mechanic introduced in M2.

### Placement
Extractors can be placed on any tile in the player's district that is:
- Buildable (terrain allows building)
- Owned by the player
- Road-adjacent (orthogonally next to at least one road tile)
- Not currently occupied by another building

There is **no requirement** that the tile contain a resource node. (Old rule: extractor had to be placed *on* a resource tile. That rule is removed in M2.)

### Pathfinding (server-side BFS)
On placement, the server runs BFS over the player's road graph (active road buildings within their district). The BFS finds the shortest path from a road tile adjacent to the extractor to a road tile orthogonally adjacent to an **unclaimed** resource tile of the player's primary resource type.

- If found: server records `target_x`, `target_y`, `path_length` on the building. Marks the resource tile via `claimed_by_building_id = building.id`.
- If not found: building goes `idle`. Will auto-retry whenever roads change or the district expands.

### Re-targeting (hybrid sticky)
An extractor keeps its claimed tile **until the path becomes invalid** (e.g., a road on the path is demolished, breaking connectivity). When that happens:
1. The claim is released (`claimed_by_building_id = NULL` on the old tile).
2. BFS reruns to find a new target.
3. If a closer unclaimed tile is now reachable, the extractor takes it.
4. If nothing is reachable, the extractor goes idle.

New roads do **not** trigger re-targeting on already-claimed extractors. This keeps gameplay predictable — the player stays in control of their economy.

### Production rate (server-side)
`process_production` reads `path_length` for each extractor and computes:

```
effective_rate = output_rate × min(1, canonical_path_length / max(path_length, 1))
canonical_path_length = 4
```

So an extractor with `path_length ≤ 4` produces at full `output_rate`. Beyond 4 tiles, the rate falls off linearly: a 5-tile path produces at 80%, an 8-tile path at 50%, a 16-tile path at 25%.

Idle (no path) extractors produce nothing.

The 30-second `process_production` tick remains; it just multiplies the per-extractor rate by elapsed time and credits inventory.

### One walker per extractor
Each active extractor owns one **collector walker** that animates the round trip:
1. Spawns at the extractor.
2. Walks the BFS path tile-by-tile (constant speed, linear easing) to the road tile adjacent to the resource.
3. Steps onto the resource tile.
4. Pauses ~1.5 seconds with the work animation.
5. Steps back onto the road and reverses the path home.
6. Despawns at the extractor and immediately respawns. The loop continues forever while the extractor is active.

The walker is **purely visual**. Production math is independent. If the browser tab is backgrounded and the walker animation pauses, the server still accrues the player's resources at the correct rate. When the tab foregrounds, the walker resumes.

### Idle / no-path UX
Extractors with no reachable resource tile show:
- Visual: dimmed, with a `!` indicator (same treatment as `unstaffed`).
- Inspector: "No path to resource — build roads to reach a resource tile."
- No walker spawns.
- Re-attempts BFS on every road change.

---

## Walkers

Two modes coexist:

### Collector (M2 addition)
- Spawned by active extractors.
- Has a fixed `path` array.
- `phase`: `outbound` | `pausing` | `returning`.
- One per extractor; loops indefinitely.

### Ambient (existing)
- Spawned randomly from housing and from staffed production buildings.
- Random-walks on roads.
- Despawns after `WALKER_MAX_STEPS` (default 18).
- Pure flavor.

### Visual rules (both modes)
- Constant speed: `WALKER_MOVE_MS` (default 1.4s per tile), linear CSS easing.
- Per-walker phase offsets: each walker is desynced from the others on bob/waddle animations and on movement timing.
- Other players' walkers render the same way and are visible to all.

---

## Trading

### NPC traders (working)
- `traders` table holds NPC catalog. `trader_prices` sets per-resource buy/sell rates.
- `resolve_trader_visit(trader_key)` RPC: lazy resolution. When the player opens the panel or the visit interval elapses, the server processes outstanding sell-surplus and buy-to-reserve policies per `trade_policies`.
- Visit interval (default 10 minutes) and capacity (default 20 goods) tunable on `traders`.
- Players use trade panel UI to set `trade_policies` per resource (mode + reserve target).

### Player-to-player (planned, untested)
Schema exists from `phase2b_trade_partners_migration.sql` but the flow has not been exercised in production with multiple real players. Future work.

---

## Server authority

### Authoritative on server
- All inventory mutations (production, trade, demolition refunds)
- Building placement validation (industry, district ownership, road connectivity, terrain buildability)
- District allocation and expansion
- BFS pathfinding and `path_length` storage
- Resource tile claims
- Worker allocation across player's buildings
- Trader visit resolution
- Production rate computation (per extractor)

### Client only
- Walker animation timing and visual state
- Map rendering, zoom, pan
- UI panels and inspector
- Click handlers (which then invoke server RPCs)
- Local form state and selection

The trust model: **the server is the source of truth**. The client never submits delta amounts (e.g., "credit me 5 timber"). It calls RPCs that produce server-computed results.

---

## Server RPCs

### Existing
- `place_building(x, y, building_type_key)` — creates a building; validates ownership, industry, terrain, road connectivity. Will gain BFS-and-claim logic in M2.
- `demolish_building(building_id)` — removes building, may refund cost. Will gain claim-release logic in M2.
- `process_production()` — production tick; advances output for each producing building based on `output_rate` and (M2) `path_length`.
- `choose_industry(display_name, industry_key)` — signup; creates `player_profiles` row. Gains district-allocation logic in M1.
- `resolve_trader_visit(trader_key)` — runs NPC trade based on player's policies.
- `save_trade_policy(resource_key, mode, reserve_target)` — upserts a trade policy.

### New (M1)
- `expand_district()` — allocates the next adjacent chunk to the calling player. Costs money proportional to `chunks_owned²`.

### New (M2)
- BFS recompute is folded into `place_building` (on placement), `demolish_building` (when a road is removed, recompute paths for all extractors whose path touched it), and `expand_district` (idle extractors retry).
- Optional: `recompute_extractor_paths()` — admin/debug RPC to nuke and rebuild all path data.

---

## Database schema (high level)

| Table | Purpose |
|---|---|
| `player_profiles` | One row per player: industry, money, workers, display name |
| `map_tiles` | Per-tile data: position, terrain, resource node, **owner (M1)**, **claim (M2)** |
| `buildings` | Placed buildings: position, type, owner, status, **target + path_length (M2)** |
| `building_types` | Catalog of buildable types: industry, category, costs, rates |
| `resources` | Catalog of resource types: name, industry, kind |
| `inventories` | Per-player resource counts |
| `traders`, `trader_prices`, `trade_transactions` | NPC trade plumbing |
| `trade_policies`, `trader_visits` | Trade automation |

Migrations live in `city-builder-mvp/*.sql`. M1/M2 will add new migration files.

---

## Tunable values

These are the dials that affect game feel. Defaults shown.

| Knob | Default | Where |
|---|---|---|
| Chunk size | 15×15 | District allocation RPC |
| Resource density per new chunk | ~8% | Chunk generator |
| Canonical path length (full rate) | 4 tiles | `process_production` |
| Walker step duration | 1.4s | `WALKER_MOVE_MS` in `walkers.js` |
| Walker pause at resource | 1.5s | M2 collector walker |
| Production tick interval | 30s | `game.js` setInterval |
| NPC trader visit interval | 10 min | `traders.visit_interval_minutes` |
| Trader visit capacity | 20 goods | `traders.visit_capacity` |
| Base workers per player | 5 | `choose_industry` |
| Workers per house | 6 | `building_types.workers_provided` |
| Expansion cost | `base × chunks_owned²` | `expand_district` |

---

## Glossary

- **Ambient walker** — a cosmetic walker spawned by housing or staffed production. Random-walks. No game state.
- **Artisan** — tier-3 processor (woodcarver, sculptor, bakery).
- **Canonical path length** — 4 tiles. The path length at which an extractor produces at full rate.
- **Chunk** — a 15×15 block of tiles allocated as a unit. Districts are made of chunks.
- **Claim** — the link from an extractor to its target resource tile. Stored as `map_tiles.claimed_by_building_id`.
- **Collector walker** — a walker tied to an extractor that animates the round trip to its claimed resource tile.
- **District** — the set of tiles owned by a player. Computed from `map_tiles.owner_player_id`.
- **Effective rate** — the actual production rate of an extractor: `output_rate × min(1, 4/path_length)`.
- **Extractor** — tier-1 building that collects raw resources from a map tile via a collector walker.
- **Industry** — a player's specialization. Maps 1:1 to a primary resource. Currently `timber | stone | grain | clay`.
- **Path length** — the number of road tiles between an extractor's adjacent road tile and the road tile orthogonally adjacent to its claimed resource tile.
- **Primary resource** — the resource type a player can extract directly.
- **Processor** — tier-2 building that transforms one resource into another (sawmill, mill, mason workshop, pottery kiln).
- **Specialty resource** — any resource not native to the player's industry. Acquired via trade.
- **Wilderness** — a tile with `owner_player_id = NULL`. Visible but not buildable.

---

## Future / out of scope

These are explicit non-goals for the current milestones, listed so they don't get conflated with planned work.

- **Specialty buildings** — cross-resource civic structures. Not yet designed.
- **Player-to-player trade** — schema exists, untested. Deferred until multiple real players are using the game.
- **Resource depletion or regeneration** — resources are infinite; tiles are never consumed.
- **Multiplayer presence indicators** — no "active now" markers, no chat.
- **Combat / conflict** — non-goal. Districts cannot be contested or invaded.
- **Path visualization on hover** — possible future polish, not in M2.
- **Pipeline of multiple walkers per extractor** — one walker per extractor for v1; richer animations later if desired.
- **Adaptive re-targeting** — current rule is sticky. Adaptive (auto-swap to closer tile when roads change) is a future tuning option.

---

## Document conventions

This doc describes the **target state** after milestones M1 (district scaffolding) and M2 (distance-based collection) ship. Where current code differs, the difference is called out inline. Future AI sessions or new contributors should treat this as the spec; if reality drifts from it, update the doc rather than the other way around.

When mechanics change, update:
1. This document (`GAME_DESIGN.md`)
2. The affected migration file(s) under `city-builder-mvp/*.sql`
3. The relevant client module under `city-builder-mvp/js/`
4. `STRUCTURE.md` only if file layout changes

For implementation context (file dependencies, RPC names, deployment), see `city-builder-mvp/STRUCTURE.md`.
