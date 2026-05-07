# Balance notes from sandbox runs

Initial pass on 2026-05-07 using `sandbox/balance_sim.py`. Numbers are
from the **pure-Python model**, not live-DB measurements — directionally
correct but treat as illustrative until validated with `db_sim.py`.

## Baseline starter player (30-min run)

Setup: clay player, $1000, completes the tutorial (4 huts → well →
garden → clay pit), policy clay = `sell_surplus reserve=0`.

```
After 30.0 min:
  money:        $530   (down $470 from $1000 — most of it the build cost)
  population:   54.1
  happiness:    63.0
  workers:      23/23 (fully employed, no labor shortage)
  food stock:   0.0   ← model bottleneck, see below
  avg housing:  tier 6 in the model (model is too lenient on tier gates)
  trade earned: $90 over 3 visits ($45/visit × 2 visits, 1 visit empty)
```

**Time to milestones:**
- Hit population 50 at minute 26.5 (with happiness=63, immigration rate=4·(63-50)/50 = 1.04/min)
- First trade fired at minute 10.5 (river_traders 10-min cooldown)
- Average housing crossed Cottage threshold at minute 0.5 (model artifact —
  the upgrade_secs gate fires too eagerly without the school/temple/luxury-food
  prereqs the SQL enforces; **don't trust avg_tier from this model past tier 3**)

**Reading:** the starter loadout is balanced. ~$45/10min income from
clay sales is a usable starter trickle. Ending at ~$530 with no
upkeep buildings means the player is solvent but has no slack — building
a Watch House ($300, +$15/min upkeep) immediately would be tight.

## Time to first Watch House

Player needs $300 cash + 5 spare workers to staff one. With a stable
$45/10min income and no upkeep yet, money grows at ~$4.5/min. Starting
at $530 after the tutorial, a Watch House is affordable around **minute 15**
post-tutorial — but the spare-workers requirement only relaxes once
population grows past 30 (well 3 + garden 10 + clay 10 + watch 5 = 28).
At immigration rate 1+ per minute, that's roughly the same window.

**Practical guidance for tutorial copy:** don't suggest building a
Watch House until ~15-30 min post-tutorial. Earlier is doable but
puts the player on a knife edge.

## Doubling immigration

`IMMIGRATION_MAX_RATE = 4.0 → 8.0` in the model. Result on the
baseline scenario: pop after 30 min 54 → ~70. That's a meaningful
nudge but the housing capacity (24 from 4 tier-1 huts) is the real
ceiling. Doubling immigration only matters for players who've grown
their housing past the starter set.

**Reading:** the current 4.0/min is fine for early game. If late-game
feels too slow to grow into bigger housing, 6.0 or 8.0 would help —
but only after the player has the housing supply to support it.

## Food drain at higher tiers

At pop=100 with 6 Cottages (tier 2, 0.06/min each = 0.36/min total):
two staffed gardens (1.0/min each = 2.0/min) easily cover. **Surplus.**

At pop=200 of mostly Mansions (tier 6, 0.40/min each):
- 16 mansions × 0.40 = 6.4/min food drain
- Need 7 staffed gardens just to break even (each at 1.0/min)
- Plus food variety for happiness — actually need 2-3 different food types

**Reading:** food becomes a real constraint at tier 5+. Players need
to plan for multiple food extractors (different industries via trade
or own production). Could be intended difficulty curve. Worth checking
late-game playtests.

## Open questions to validate with db_sim

The pure-Python model has known gaps (housing-tier prereq gates,
productivity multipliers, multi-input service feeding). To answer with
high confidence:

1. **At what pop/time does a typical player unlock Cottage (tier 2)?**
   The pure-Python model says ~30s — not realistic; tier 2 needs food.
2. **What's the realistic ceiling on housing tier without trade with
   other players?** The model says tier 6+. SQL says tier 7+ needs
   industrial luxuries which require cross-industry trade.
3. **How long does a player stay at floor=15 if they don't build a
   single house?** Model says forever. SQL says happiness drops without
   services + food, but population stays at floor.

Run these via `db_sim.py` for definitive answers.
