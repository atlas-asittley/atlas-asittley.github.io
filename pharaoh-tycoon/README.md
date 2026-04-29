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

1. **Place roads** first — housing needs road access to settle.
2. **Place housing plots** next to roads — immigrants will arrive automatically.
3. **Build farms** on green floodplain tiles near the Nile — they produce grain.
4. **Build a granary** to store grain from farms.
5. **Build a bazaar** to distribute food to nearby housing — enables housing evolution.
6. **Build wells** for water access — another evolution requirement.
7. **Build a tax office** near housing to collect income.
8. **Build a temple** for religion access — needed for higher-tier housing.

### Controls
| Input | Action |
|-------|--------|
| Left click | Place building / Select building |
| Right-click drag | Pan camera |
| WASD | Scroll camera |
| 1 / 2 / 3 | Game speed |
| Space | Pause/unpause |
| G | Toggle grid |
| Escape | Deselect |
| Delete | Demolish selected building |

### Housing Evolution Chain
```
Empty Plot → Crude Hut (road access)
  → Sturdy Hut (+water)
  → Modest Dwelling (+food)
  → Spacious Dwelling (+religion)
  → Elegant Residence (+tax office)
```

Each level holds more residents and generates more tax revenue.

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
│   ├── renderer.js     Canvas drawing (terrain, buildings, minimap)
│   ├── input.js        Mouse/keyboard, camera control
│   ├── ui.js           HUD updates, build menu, info panel
│   ├── game.js         State creation, game loop orchestration
│   └── main.js         Bootstrap
└── README.md
```

## v1 Vertical Slice (Current)

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
- Walker system (animated service walkers on roads)
- Desirability map (proximity bonuses/penalties)
- Fire/collapse risk for unserviced buildings
- Monument construction (multi-step, expensive prestige buildings)
- Sound effects and ambient music

### Mid-term
- Military/defense (attacks from desert raiders)
- Multiple production chains (clay → pottery, timber → furniture)
- Trade caravans with neighboring cities
- Scenario/mission system with objectives
- Save/load game state

### Long-term
- Nile flooding cycle (seasonal farm productivity)
- Entertainment buildings (juggler, musician)
- Education and health services
- Multi-map campaign
- Mod support
