# Happiness — Design

Status: **proposed**, in active implementation.
Last updated: 2026-05-05.

## Goals

1. **Population is dynamic.** Today, `worker_capacity` is a deterministic function of housing tiers (5 base + Σ tier workers + tavern bonus). Replace with a stored `population` that drifts toward the housing capacity at a rate driven by happiness. A happy city slowly grows; a miserable one slowly shrinks.
2. **Visible cause-and-effect.** A player who builds services / diversifies food / staffs everything sees their population rise. A player who taxes hard / lets buildings sit unstaffed sees citizens leave.
3. **Slow shift.** Maximum ~1 citizen/min in either direction. No instant population swings.
4. **Immigrant + emigrant walkers** (visual flavor, layer on once mechanics work). Walkers spawn at the map edge with luggage / backpacks / bindles, cross grass to a road, then to a house.
5. **Per-player.** No per-house heatmap in v1. Single happiness number per player.

## Vocabulary

- **Population**: stored numeric on `player_profiles.population`. Counts citizens currently living in the district. Initial value = 5 (matches current worker base).
- **Housing capacity**: `5 + Σ (workers per active housing tier)`. The implicit 5 is the existing base — kept so a player without housing still has 5 workers.
- **Happiness**: 0–100, computed each tick from district state. 50 is the steady-state pivot.
- **Worker capacity**: `floor(population) + tavern_bonus`. Tavern still acts as a +10 bump on top of population (it's a service, not an immigration boost).

## Population dynamics

Each call to `process_production`:

```
v_target       = 5 + housing_workers              -- where population is drifting toward
v_happiness    = compute_happiness(uid)           -- 0..100
v_velocity     = (v_happiness - 50) / 50.0        -- -1 .. +1
v_minutes      = EXTRACT(EPOCH FROM elapsed) / 60
v_max_rate     = 1.0  -- citizens per minute, full velocity
v_delta        = v_velocity * v_max_rate * v_minutes
new_population = clamp(population + v_delta, 0, v_target)
```

Effects:

- **Happiness 100, below capacity**: +1/min until full.
- **Happiness 100, at capacity**: stays full (clamp at v_target).
- **Happiness 50**: no change either direction.
- **Happiness 0**: -1/min until empty.

The clamp at `v_target` (no overflow above housing capacity) is intentional — surplus immigrants *leave* if there's nowhere to live.

## Happiness formula (v1)

Six weighted components, summed and clamped to 0–100. Each constant is intentionally simple so we can tune without rewriting structure.

```
happiness = clamp(
  30                                                           -- base
  + 3 × num_operational_service_types                          -- max +15 (5 services)
  + 2 × avg_active_housing_tier                                -- max +16 (avg tier 8)
  + min(15, distinct_is_food_in_inventory × 2)                 -- max +15
  - 3 × num_active_tax_offices                                 -- penalty (cap -15 at 5 offices)
  + 20 × (staffed_count / max(1, worker_buildings_total))      -- max +20
, 0, 100)
```

Tunable constants live in the SQL function so we can adjust without a migration. Notes on each input:

- **Operational services**: well counts when active + road-connected; tavern / bathhouse / school / temple count when staffed + fed (they have to actually be running).
- **Avg housing tier**: averaged across active housing only; players with all shanties (tier 0) get +0.
- **Food variety**: distinct keys with `is_food = true` *and* quantity > 0.
- **Tax offices**: only active ones (paused = 0 penalty).
- **Staffing**: ratio of staffed-out-of-needed for worker-consuming buildings (extractor / food_extractor / processor / booster / service / tax). 100% staffed = +20.

Worst-case (no services, all shanties, no food, max tax, nothing staffed): 30 + 0 + 0 + 0 - 15 + 0 = 15.
Best-case (all services, tier 8, 7+ foods, no tax, full staffing): 30 + 15 + 16 + 15 + 0 + 20 = 96.

So the typical range is ~15..96 — both immigration and emigration are reachable with tuning room.

## Schema additions

```sql
ALTER TABLE player_profiles
  ADD COLUMN population numeric NOT NULL DEFAULT 5,
  ADD COLUMN happiness  numeric NOT NULL DEFAULT 50,
  ADD COLUMN last_population_tick_at timestamptz NOT NULL DEFAULT now();
```

For existing rows (already-deployed players), seed `population = worker_capacity` so they don't suddenly find their population at 5. The migration runs:

```sql
UPDATE player_profiles
SET population = GREATEST(5, worker_capacity)
WHERE population = 5;
```

## RPC integration

`process_production` orchestrator gains a new phase between `_pp_drain_housing_food` and `_pp_evolve_housing` — `_pp_update_population(uid)` — that:

1. Reads `last_population_tick_at` (or now() - 1 min if null).
2. Computes happiness.
3. Computes target = 5 + housing_workers.
4. Computes delta = velocity × elapsed × max_rate.
5. Updates `population`, `happiness`, `last_population_tick_at`.

The orchestrator's worker-supply line at the end becomes:

```
v_supply = FLOOR(updated_population) + v_tavern_bonus
```

Replacing the previous `5 + _pp_housing_supply + _pp_tavern_bonus`.

## UI

A new compact happiness indicator in the topbar — number 0–100 with a small smiley scale:

- 0–25: ☹  red
- 26–50: 😐 amber
- 51–75: 🙂 green
- 76–100: 😊 bright green

Hover/tap shows the breakdown (service / tier / food / tax / staffing scores).

The existing worker-capacity display stays as-is — it's already pulling from `worker_capacity` on the profile, which now reflects population.

## Walkers (deferred, layer on later)

Once the mechanics are in:

- Compute population delta sign per tick. If population grew this tick, spawn N immigrant walkers at random map edges; if it shrank, spawn N emigrant walkers from random houses.
- Immigrant walker:
  - Spawn at a random border tile (off-screen or edge cell).
  - Walk through grass (off-road) toward the nearest road.
  - Walk along roads toward a random active house.
  - Despawn at the house.
  - Sprite variety: plain figure with a luggage-overlay (rectangle), backpack-overlay (round bump), or bindle (stick on shoulder).
- Emigrant walker:
  - Reverse: spawn from a random house, walk to nearest road, walk to nearest map edge, despawn off-screen.

## Productivity modifier (separate task)

Atlas asked to track a separate "productivity modifier" measure that affects building output rate. Distinct from happiness (which gates *who lives there*). Possible mechanics: tools-stocked, education-tier, bonus equipment buildings. Filed as its own TODO entry — design + implementation pending.

## Implementation order

1. Design doc (this file).
2. Schema migration: population / happiness / last_population_tick_at columns + seed for existing players.
3. `compute_happiness(uid)` RPC (returns 0..100).
4. `_pp_update_population(uid)` helper + orchestrator wiring; replace worker-supply formula.
5. Topbar happiness indicator (smiley scale).
6. Tests: happiness formula bounds, population drift up/down, target clamp.
7. Walkers (separate slice).
