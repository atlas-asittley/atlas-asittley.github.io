-- Music Tracker schema. Shared Supabase project (igaulapupbtdcqqjobhs). Tables prefixed music_*.
-- Built 2026-10-18 from Drew's own design: a developer's board, per-song next steps, a visible
-- record of days worked, open-ended "anytime" tickets for low-motivation days, and -- his
-- requirement, added the same day -- a CONCRETE FINISH LINE on every ticket.

create table if not exists music_tickets (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  song        text,                                 -- working name; null = general
  finish_line text,                                 -- "done when ___". Must be answerable yes/no.
  status      text not null default 'later',        -- 'later' | 'next' | 'doing' | 'done'
  anytime     boolean not null default false,       -- open-ended, always available, never completed
  notes       text,
  created_at  timestamptz not null default now(),
  done_at     timestamptz
);
alter table music_tickets add column if not exists finish_line text;

-- One row per time Drew does music work. The accumulation record -- the thing the workout tracker
-- has and the music never did. It records what HAPPENED; it never sets a quota.
create table if not exists music_sessions (
  id             uuid primary key default gen_random_uuid(),
  session_date   date not null default ((now() at time zone 'America/Indiana/Indianapolis')::date),
  what           text,
  next_objective text,                              -- set at the END of a session, for the next one
  created_at     timestamptz not null default now()
);

create index if not exists music_tickets_status_idx on music_tickets(status, created_at);
create index if not exists music_sessions_date_idx  on music_sessions(session_date desc);

grant select, insert, update, delete on public.music_tickets  to anon, authenticated, service_role;
grant select, insert, update, delete on public.music_sessions to anon, authenticated, service_role;

alter table music_tickets  enable row level security;
alter table music_sessions enable row level security;

drop policy if exists music_tickets_all on music_tickets;
create policy music_tickets_all on music_tickets for all to public using (true) with check (true);

drop policy if exists music_sessions_all on music_sessions;
create policy music_sessions_all on music_sessions for all to public using (true) with check (true);

-- =========================================================================
-- Seed, 2026-10-18. Finish lines are written so QUALITY can never fail them --
-- "one version exists", not "a good one". Delete or edit freely.
-- =========================================================================
insert into music_tickets (title, song, finish_line, status, anytime)
select * from (values
  ('Play the running order and find where it fights', 'Song 4',
   'Played it through 3 times and written down every spot that snags.', 'next', false),
  ('Come up with one concrete arrangement', 'Song 4',
   'One full version exists, start to finish. Not a good one. One.', 'later', false),
  ('Find the transition from part B into part C', 'Song 4',
   'You can play B into C once without stopping.', 'later', false),
  ('Second set of B lyrics -- from singing, never from the page', 'Song 4',
   '20 lines sung over the riff and written down, unjudged.', 'later', false),
  ('Fix the three flagged lines', 'Old House',
   'All three have a replacement you can sing. Rough counts.', 'later', false),
  ('Build the song out from the riff', 'Riff song (needs a name)',
   'A second part exists that you can play into the riff.', 'later', false),
  ('Noodle on the guitar', null,
   'Half an hour has passed. Anything that showed up got recorded.', 'later', true),
  ('Free-write lines for whatever song', null,
   '20 lines exist. Judging them is not part of this.', 'later', true),
  ('Sing nonsense over a melody, write down what sticks', null,
   'One section''s melody is full of sounds and the keepers are written down.', 'later', true),
  ('Editing pass', null,
   'One stanza is finished to where you would sing it in front of someone.', 'later', true)
) as v(title, song, finish_line, status, anytime)
where not exists (select 1 from music_tickets);

-- =========================================================================
-- Added 2026-10-18 (same day): songs are the unit, in SET ORDER, collapsible.
-- Drew: "I think we should have these in the setlist order as well."
-- =========================================================================
create table if not exists music_songs (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  set_position int,                                  -- order in the hour-long solo set
  notes        text,
  created_at   timestamptz not null default now()
);
grant select, insert, update, delete on public.music_songs to anon, authenticated, service_role;
alter table music_songs enable row level security;
drop policy if exists music_songs_all on music_songs;
create policy music_songs_all on music_songs for all to public using (true) with check (true);

-- Added 2026-10-18: the set meter. Drew's goal is an HOUR, not a song count, so progress is
-- measured in minutes he can actually play front to back -- not in tickets, because he writes
-- the tickets and their size is arbitrary.
alter table music_songs add column if not exists length_minutes numeric;
alter table music_songs add column if not exists performable boolean not null default false;

-- 2026-10-20: hand-ordering. Songs already had set_position; tickets needed their own.
-- Both are rewritten 1..n by the drag handler on the board, so gaps are harmless.
alter table music_tickets add column if not exists sort_order int;
