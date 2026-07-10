-- Workout tracker schema. Paste into Supabase → SQL editor → Run.
-- Reuses the shared project (igaulapupbtdcqqjobhs). Tables are prefixed workout_*.

-- =========================================================================
-- Tables
-- =========================================================================

create table if not exists workout_sessions (
  id           uuid primary key default gen_random_uuid(),
  session_date date not null,                 -- the day this workout is for
  day_type     text not null default 'upper', -- 'upper' | 'lower' | free text
  equipment    text,                          -- what was available, e.g. 'dumbbells only'
  status       text not null default 'prescribed', -- 'prescribed' | 'completed'
  bodyweight   numeric,                        -- optional, for tracking the bulk
  notes        text,                           -- coach notes / how it felt
  created_at   timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists workout_sets (
  id             uuid primary key default gen_random_uuid(),
  session_id     uuid not null references workout_sessions(id) on delete cascade,
  exercise       text not null,
  exercise_order int  not null default 0,      -- order of exercises in the session
  exercise_note  text,                          -- coach cue (shown once per exercise)
  rest_seconds   int,                           -- rest to run after each set
  set_index      int  not null,                 -- 1,2,3,4 within the exercise
  target_reps    text,                          -- rep range, e.g. '6-10'
  target_weight  numeric,                        -- recommended weight (lbs)
  target_note    text,                           -- e.g. 'beat 7 on top set'
  actual_reps    int,                            -- filled in by the app
  actual_weight  numeric,                         -- filled in by the app
  created_at     timestamptz not null default now()
);

create index if not exists workout_sets_session_idx  on workout_sets(session_id);
create index if not exists workout_sets_exercise_idx on workout_sets(exercise);
create index if not exists workout_sessions_status_idx on workout_sessions(status, created_at desc);

-- =========================================================================
-- Row-Level Security  (anon key is public, so policies are required)
-- Personal single-user app with non-sensitive data → allow anon read/write
-- on these two tables only. Game tables are untouched.
-- =========================================================================

alter table workout_sessions enable row level security;
alter table workout_sets     enable row level security;

drop policy if exists workout_sessions_anon_all on workout_sessions;
create policy workout_sessions_anon_all on workout_sessions
  for all to anon using (true) with check (true);

drop policy if exists workout_sets_anon_all on workout_sets;
create policy workout_sets_anon_all on workout_sets
  for all to anon using (true) with check (true);
