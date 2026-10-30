-- Work docket (page: atlas-asittley.github.io/docket/). Built 2026-10-30 at Drew's ask: a checklist he can SEE,
-- separate from the personal to-do list. Private to his email. Plain wording only: no internal system names, no surnames.
create table if not exists public.docket_items (
  id          bigint generated always as identity primary key,
  section     text not null default 'today' check (section in ('today','next','waiting','revisit')),
  text        text not null check (length(trim(text)) > 0),
  detail      text,                              -- where it left off / the next physical action, one line
  done        boolean not null default false,
  done_at     timestamptz,
  sort_order  integer not null default 0,
  added_by    text not null default 'drew',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create or replace function public.docket_touch() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists docket_touch on public.docket_items;
create trigger docket_touch before update on public.docket_items for each row execute function public.docket_touch();
alter table public.docket_items enable row level security;
drop policy if exists "owner manages docket" on public.docket_items;
create policy "owner manages docket" on public.docket_items for all
  using (lower(auth.jwt() ->> 'email') = 'asittley@gmail.com')
  with check (lower(auth.jwt() ->> 'email') = 'asittley@gmail.com');
revoke all on public.docket_items from anon;
grant select, insert, update, delete on public.docket_items to authenticated;
grant select, insert, update, delete on public.docket_items to service_role;

-- 2026-10-30, Drew: "organize this in a somewhat hierarchical fashion" — projects on top, to-dos under each.
-- A project is a row with parent_id null; its to-dos point at it. Sections apply to the to-dos.
alter table public.docket_items add column if not exists parent_id bigint references public.docket_items(id) on delete cascade;
