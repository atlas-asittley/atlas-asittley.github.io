# Pharaoh Tycoon

A browser-based city-builder / tycoon game inspired by Sierra's Pharaoh.

## Quick Start

ES modules require a local server. Pick one:

```bash
# Python (built-in)
cd pharaoh-tycoon && python3 -m http.server 8080

# Node
npx serve .

# PHP
php -S localhost:8080
```

Then open `http://localhost:8080` in your browser.

## How to Play

The game starts on a **main menu** where you can choose a scenario or sandbox mode:

- **Sandbox** — free play with no objectives
- **Village of the Nile** — beginner scenario with population and economy goals
- **Prosperity of Pharaoh** — harder scenario requiring temples, gardens, and evolved housing

If you have a saved game, you can also **load** it from the menu.

### Building Your City

1. **Place roads** first — housing needs road access to settle.
2. **Place housing plots** next to roads — immigrants will arrive automatically.
3. **Build farms** on green floodplain tiles near the Nile — they produce grain.
4. **Build a granary** to store grain from farms.
5. **Build a bazaar** next to a road — it sends food walkers along roads to deliver food to housing.
6. **Build wells** next to a road — water carriers walk roads to provide water access.
7. **Build a tax office** next to a road — tax collectors walk roads to collect income.
8. **Build a temple** next to a road — priests walk roads providing religion access.

> **Important:** Service buildings (bazaar, well, temple, tax office) must be adjacent to a road to
> dispatch walkers. Walkers travel along roads and deliver their service to housing tiles they pass.
> Housing that is not reached by a walker will not receive that service, even if it is close to the
> building. Plan your road network to ensure walkers can reach all your housing!

### Controls
| Input | Action |
|-------|--------|
| Left click | Place building / Select building |
| Right-click drag | Pan camera |
| WASD | Scroll camera |
| 1 / 2 / 3 | Game speed |
| Space | Pause/unpause |
| G | Toggle grid |
| V | Cycle overlays (desirability / fire risk / collapse risk) |
| Escape | Deselect |
| Delete | Demolish selected building |
| Ctrl+S | Save game |

### Save & Load

- **Ctrl+S** or the **Save** button in the top bar saves to browser localStorage
- The **Load** button or the menu's "Load Saved Game" option restores a saved game
- Save captures all buildings, economy, population, time, camera, and scenario progress
- Walkers are transient — they respawn naturally from service buildings after load
- Tile coverage (water, food, religion, etc.) resets on load and rebuilds as walkers travel

### Scenarios & Objectives

Scenarios provide goals to work toward. The **objectives panel** (bottom-right) shows:
- Each goal with a progress bar and current/target values
- Checkmarks for completed goals
- A "Victory!" banner when all objectives are met

After winning you can continue playing or return to the menu.

### Housing Evolution Chain
```
Empty Plot → Crude Hut (road access)
  → Sturdy Hut (+water)
  → Modest Dwelling (+food)
  → Spacious Dwelling (+religion, desirability 4+)
  → Elegant Residence (+tax office, desirability 8+)
```

Each level holds more residents and generates more tax revenue. Higher levels require
minimum desirability — place gardens and temples near housing to boost it.

### Desirability

Buildings and terrain emit desirability that affects nearby tiles:
- **Positive:** Gardens (+4), Temples (+3), Water proximity (+3), Wells (+1)
- **Negative:** Farms (-3), Granaries (-2), Bazaars/Service posts (-1)

Desirability decays with distance. Press **V** to toggle the desirability overlay and see
exact values per tile.

### Hazards (Fire & Collapse)

All buildings (except roads and gardens) accumulate **fire risk** and **collapse risk** over
time. Without mitigation:
- At 60 ticks of accumulated risk, a **fire** or **collapse** event triggers
- Fires burn for 8 ticks then destroy the building, and can **spread** to adjacent buildings
- Collapse destroys the building instantly
- Destroyed buildings give no refund

**Mitigation:**
- **Firehouse** — sends firefighter walkers (red `!`) that reset fire risk to zero
- **Architect's Post** — sends architect walkers (gray `A`) that reset collapse risk to zero

Warning indicators appear on buildings when risk exceeds 60%: orange dot (fire) and
brown dot (collapse). Use the **V** key to see exact risk values per building.

### Walker System

Service buildings send **walkers** (animated agents) along roads:
- **Bazaar** → food walkers (purple)
- **Well** → water carriers (blue)
- **Temple** → priests (cream)
- **Tax Office** → tax collectors (gold)
- **Firehouse** → firefighters (red)
- **Architect's Post** → architects (gray)

Walkers spawn periodically from staffed service buildings, take a random walk along connected roads,
and apply their service coverage to any housing adjacent to the road tiles they visit. Coverage
persists for a limited time, so buildings must keep sending walkers to maintain service.

## Architecture

```
pharaoh-tycoon/
├── index.html          Entry point
├── css/style.css       UI styling
├── js/
│   ├── config.js       Constants, building definitions, colors
│   ├── grid.js         Map generation, tile access, range queries
│   ├── buildings.js    Placement validation, construction, demolition
│   ├── simulation.js   Per-tick game logic (economy, population, food)
│   ├── hazards.js      Fire & collapse risk accumulation, events, spread
│   ├── renderer.js     Canvas drawing (terrain, buildings, minimap)
│   ├── menu.js         Main menu screen rendering
│   ├── input.js        Mouse/keyboard, camera control
│   ├── ui.js           HUD updates, build menu, info panel, objectives
│   ├── walkers.js      Walker spawning, movement, service coverage
│   ├── save.js         Save/load to localStorage
│   ├── scenario.js     Scenario definitions, objective tracking
│   ├── messages.js     In-game notification system
│   ├── game.js         State creation, game loop orchestration
│   └── main.js         Bootstrap
└── README.md
```

## v4 Save/Load & Scenarios Milestone (Current)

- Everything from v3 plus:
- **Main menu** — scenario selection screen with sandbox and objective-based modes
- **Save/load system** — full game state serialization to browser localStorage via Ctrl+S
  or UI buttons; walkers and tile coverage are transient and rebuild on load
- **Scenario system** — two built-in scenarios ("Village of the Nile", "Prosperity of Pharaoh")
  with population, gold, housing level, and building count objectives
- **Objectives panel** — real-time progress bars for each goal with completion tracking
- **Win condition** — victory banner when all scenario objectives are met
- **Notification system** — in-game toast messages for saves, loads, scenario events
- **Menu button** — return to main menu to start new scenarios or load saves

### v3 Desirability & Hazards

- **Desirability system** — buildings and water terrain emit positive/negative desirability to
  nearby tiles. Housing evolution at levels 4-5 requires minimum desirability thresholds
- **Garden building** — dedicated beautification structure that boosts nearby desirability
- **Fire hazard loop** — buildings accumulate fire risk; fires ignite, burn, spread, and destroy
- **Collapse hazard loop** — buildings accumulate collapse risk; instant destruction at threshold
- **Firehouse & Architect's Post** — send walkers to mitigate hazards
- **Overlays** — desirability, fire risk, and collapse risk visualization
- **Hazard warning indicators** — pulsing dots on high-risk buildings

### v2 Walker Milestone

- **Walker/service-agent system** — service buildings send animated walkers along roads
- **Road-connected service delivery** — coverage delivered by walkers, not radius checks
- **Coverage decay** — walker-delivered coverage fades over time
- **Visual walker feedback** — colored walker figures with service-type icons

### v1 Foundation

- 60x40 grid with desert, floodplain, Nile river, and rock terrain
- Road placement with drag-to-paint
- Housing with 6-level evolution based on nearby services
- Farm → Granary → Bazaar food production chain
- Well (water), Temple (religion), Tax Office (income) service buildings
- Employment/labor system — buildings need workers from housing population
- Treasury with income (taxes) and expenses (maintenance)
- Minimap, info panel, build menu
- Game speed controls (pause, 1x, 2x, 3x)

## Roadmap to Full Pharaoh-like Game

### Near-term
- Monument construction (multi-step, expensive prestige buildings)
- Entertainment buildings (juggler booth, musician)
- Sound effects and ambient music
- Nile flooding cycle (seasonal farm productivity)

### Mid-term
- Military/defense (attacks from desert raiders)
- Multiple production chains (clay → pottery, timber → furniture)
- Trade caravans with neighboring cities
- Education and health services
- More scenarios with varied difficulty

### Long-term
- Multi-map campaign
- Mod support
