# Onboarding

How to get the City Builder running locally and contribute changes.

## What this is

A multiplayer city builder. Static frontend (no build step) deployed via GitHub Pages, backed by Supabase (Postgres + Auth + RPC + Realtime). Every push to `main` deploys to production in ~40 seconds.

For game mechanics, read `GAME_DESIGN.md` at the repo root. For file layout and module dependencies, read `city-builder-mvp/STRUCTURE.md`.

## Prerequisites

- Git
- A web browser (mobile Safari/Chrome works)
- A static file server (any of: `python3 -m http.server`, `npx http-server`, VSCode Live Server, etc.)
- A Supabase project (free tier is fine)

That's it. **No Node, no bundler, no build step.** The frontend uses native ES modules.

## First-time setup

### 1. Clone and serve

```bash
git clone https://github.com/atlas-asittley/atlas-asittley.github.io.git citybuilder
cd citybuilder/city-builder-mvp
python3 -m http.server 8000
```

Open `http://localhost:8000`. You'll see a blank login screen until Supabase is wired up.

### 2. Create a Supabase project

- Go to https://supabase.com → New project.
- Pick a region close to you. Free tier is fine for development.
- After provisioning, go to **Project Settings → API** and copy:
  - `Project URL`
  - `anon public` key (NOT the service-role key)

### 3. Wire the client to Supabase

Edit `city-builder-mvp/js/config.js` (only file with credentials in it; do not commit your changes):

```javascript
var SUPABASE_URL = 'https://[your-project-ref].supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_...';
```

The anon key is safe to expose; RLS policies enforce all access control. The service-role key must NEVER end up in client code.

### 4. Run the migrations in order

Open Supabase Dashboard → SQL Editor → New query. Paste each file's contents and run, **in this order**:

1. `mvp_schema.sql`
2. `phase2a_trade_migration.sql`
3. `phase2b_trade_partners_migration.sql`
4. `black_market_migration.sql`
5. `housing_labor_migration.sql`
6. `roads_migration.sql`
7. `housing_evolution_migration.sql`
8. `road_connectivity_rule_migration.sql`
9. `grain_chain_migration.sql`
10. `clay_chain_migration.sql`
11. `tier3_chains_migration.sql`
12. `sculptor_migration.sql`
13. `housing_tiers_expansion.sql`
14. `district_scaffolding_migration.sql` *(M1 — destructive: wipes existing tiles/buildings; safe on a fresh project)*
15. `resource_collection_migration.sql` *(M2)*
16. `worker_cost_tuning_migration.sql`

Then run any patches from `migration_patches/` (these are small fixes for bugs found post-deployment; harmless to apply on top of fresh migrations):

- `migration_patches/fix_buildings_delete_policy.sql`
- `migration_patches/fix_place_building_vpath.sql`
- `migration_patches/fix_verify_extractor_path.sql`

> **Mobile note:** Supabase's SQL editor on mobile sometimes silently truncates large pastes. If a function ends up missing from `pg_proc`, paste the relevant `migration_patches/fix_*.sql` standalone.

> **Why so many migrations?** Historical: features shipped incrementally. There is a known maintenance debt — `place_building` is rewritten across 8 files. A future "consolidated baseline" pass will collapse this. For now, run them in order.

### 5. Sign in and start playing

Go back to the local server tab. Sign up with email/password. Pick an industry (timber, stone, grain, or clay). You'll be allocated a 15×15 starting district at the origin, with ~18 randomly-scattered resource tiles of your industry.

## Day-to-day development

- **Edit, save, refresh.** The frontend has no build step. ES modules load directly from disk.
- **Commit and push to `main`** for changes to go live. GitHub Pages serves with `Cache-Control: max-age=600` so users may need a hard-refresh after CSS/JS changes.
- **SQL changes** are migrations: write a new `*.sql` file under `city-builder-mvp/`, run it on Supabase. **Never** edit a previously-shipped migration file in place.
- **Don't bypass server authority.** All inventory mutations, placements, and demolitions go through RPCs. The client only displays state.

## Direct database access (advanced)

For debugging and one-off queries, save your Supabase Session-pooler URL to `~/.citybuilder_db_url` (chmod 600). Then use `psql` or `psycopg2` directly — see `~/.claude/projects/-home-atlas-citybuilder/memory/reference_database_access.md` for the patterns.

The Session pooler URL is found in Supabase Dashboard → Settings → Database → Connection string → Session pooler. Direct connections (`db.[ref].supabase.co`) are IPv6-only on free tier and frequently fail.

## Where to find more

- `GAME_DESIGN.md` — canonical mechanics reference (target state)
- `city-builder-mvp/STRUCTURE.md` — file layout, module deps, deployment
- `city-builder-mvp/graphics/ART_DIRECTION.md` — visual style for any new sprites
- `archive/` — historical runbooks and shipped initiative plans, kept for context
