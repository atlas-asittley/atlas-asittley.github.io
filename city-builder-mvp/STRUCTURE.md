# City Builder MVP — File Structure

## Layout

```
city-builder-mvp/
├── index.html          HTML structure (no inline CSS or JS)
├── css/
│   └── styles.css      All styles, extracted from the original inline <style>
├── js/
│   ├── main.js         Entry point — bootstraps the app, restores session
│   ├── version.js      APP_VERSION constant (single source of truth)
│   ├── config.js       Supabase URL/key, creates the client
│   ├── state.js        Shared mutable game state object
│   ├── ui.js           Screen switching, toast notifications, error helpers
│   ├── auth.js         Login, register, logout, industry selection
│   ├── game.js         Game entry, data loading, production loop
│   ├── map.js          Map rendering, placement validation, building placement
│   ├── panels.js       Build/Inventory/Trade panel rendering and events
│   └── realtime.js     Supabase realtime subscription for multiplayer
├── mvp_schema.sql              Base database schema
├── phase2a_trade_migration.sql Phase 2A migration (run after mvp_schema)
└── STRUCTURE.md                This file
```

## How to update the app version

Edit `js/version.js` — change the `APP_VERSION` string. This is the only place the
version is defined; it is displayed automatically in the bottom-right badge.

## Module system

The frontend uses native ES modules (`<script type="module">`). No bundler or build
step is needed. All modern browsers (including mobile Safari/Chrome) support this.

The dependency graph is:

```
main.js
 ├── version.js
 ├── config.js
 ├── ui.js
 ├── auth.js ──► config, state, ui, game
 └── game.js ──► config, state, ui, map, panels, realtime
      ├── map.js ──► config, state, ui, panels
      ├── panels.js ──► config, state, ui, map
      └── realtime.js ──► config, state, ui, map
```

## Phase 2A: Trade Foundation

### New Data Model
- `trade_policies` — per-resource trade mode + reserve target per player
- `trader_visits` — log of each trader visit with summary of what happened
- `trader_prices.sell_price` — new column; what the trader charges the player to buy

### New RPCs
- `save_trade_policy(resource_key, mode, reserve_target)` — upserts a policy row
- `resolve_trader_visit(trader_key)` — lazy visit resolution; checks if a visit is due, executes trades if so

### How Trader Visits Work
- Uses **lazy resolution**: when the player opens the game or clicks "Check Now", the server checks whether enough time has passed since the last visit.
- If due, the server: refreshes production, processes sell-surplus policies (earns money), then buy-to-reserve policies (spends money), respects capacity limits, and records a visit summary.
- Visit interval: 10 minutes (configurable via `traders.visit_interval_minutes`).
- Trader capacity: 20 goods per visit (configurable via `traders.visit_capacity`).

### Tuning
- **Visit interval**: update `traders.visit_interval_minutes` for the starter_trader row.
- **Capacity**: update `traders.visit_capacity`.
- **Prices**: update `trader_prices.buy_price` (what trader pays) and `sell_price` (what trader charges).

## Deployment

Serve the directory as static files at the same path it currently occupies.
No build step required. The Supabase JS library is loaded from CDN in index.html.
