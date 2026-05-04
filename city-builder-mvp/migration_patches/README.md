# Migration patches

Small standalone SQL files that fix bugs in already-shipped migrations. Each file rebuilds one function or adds one missing policy and is safe to re-run.

These were originally born from a single problem: pasting a 700-line migration into the Supabase mobile SQL editor sometimes silently truncates and a function never gets created. Splitting fixes into tiny standalone files makes each one easy to copy from a raw GitHub URL on a phone.

| File | What it fixes |
|---|---|
| `fix_buildings_delete_policy.sql` | The original `mvp_schema.sql` enabled RLS on `buildings` but only created INSERT/SELECT/UPDATE policies. Without DELETE, every demolish silently failed. |
| `fix_place_building_vpath.sql` | The `place_building` function declared `v_path` as `record` but only assigned it for extractors. Reading it from the RETURN's CASE expression crashed for all non-extractor placements. |
| `fix_verify_extractor_path.sql` | M2's `resource_collection_migration.sql` defines this function but mobile-paste truncation occasionally drops it. Standalone copy for re-application. |

Apply order doesn't matter — each is independent. They are also already merged into the canonical migration files (`mvp_schema.sql`, `resource_collection_migration.sql`), so a fresh setup that runs all the migrations in order from scratch picks them up automatically. The patches exist for already-deployed databases that need targeted fixes without re-running multi-hundred-line files.
