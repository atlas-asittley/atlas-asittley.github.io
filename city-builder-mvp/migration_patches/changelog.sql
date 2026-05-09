-- ─────────────────────────────────────────────────────────────────────
-- Player-facing changelog (2026-05-09).
--
-- Atlas: "we need a window that pops up once for each player when
-- there have been changes to the game. tells them what the new
-- features are."
--
-- Design:
--   - changelog_entries: rows authored by hand each time we ship a
--     feature worth surfacing. (slug, title, body, published_at)
--   - player_profiles.last_changelog_seen_at: timestamp watermark.
--     get_unseen_changelog_entries() returns every entry newer than
--     this; mark_changelog_seen() bumps it to now() so the modal
--     stops appearing.
--   - Body is plain text (\n separates paragraphs). Keep entries
--     short — this is a "what's new" surface, not release notes.
-- ─────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.changelog_entries (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug         text        UNIQUE NOT NULL,
  title        text        NOT NULL,
  body         text        NOT NULL,
  published_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_changelog_entries_published_at
  ON public.changelog_entries (published_at DESC);

-- Lock down the table — reads go through the SECURITY DEFINER RPC.
-- Authoring is direct SQL via migrations (no client write path).
ALTER TABLE public.changelog_entries ENABLE ROW LEVEL SECURITY;

-- Player watermark.
ALTER TABLE public.player_profiles
  ADD COLUMN IF NOT EXISTS last_changelog_seen_at timestamptz;

-- ─────────────────────────────────────────────────────────────────────
-- get_unseen_changelog_entries: returns entries newer than the
-- player's watermark, newest first. NULL watermark = "never seen
-- anything"; only return the most recent one in that case so a
-- brand-new player doesn't get a wall of historical context.
--
-- (A returning player will see everything since their last visit.)
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_unseen_changelog_entries()
RETURNS TABLE(
  id uuid,
  slug text,
  title text,
  body text,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_seen timestamptz;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;

  SELECT last_changelog_seen_at INTO v_seen
  FROM public.player_profiles
  WHERE player_profiles.id = v_uid;

  IF v_seen IS NULL THEN
    -- First-time: only the most recent entry, so the player isn't
    -- buried in stale changelog they didn't sign up for.
    RETURN QUERY
      SELECT ce.id, ce.slug, ce.title, ce.body, ce.published_at
      FROM public.changelog_entries ce
      ORDER BY ce.published_at DESC
      LIMIT 1;
  ELSE
    RETURN QUERY
      SELECT ce.id, ce.slug, ce.title, ce.body, ce.published_at
      FROM public.changelog_entries ce
      WHERE ce.published_at > v_seen
      ORDER BY ce.published_at DESC;
  END IF;
END;
$$;

-- list_changelog_entries: full history, for the "What's new" button
-- in Settings (lets a player re-read past entries on demand).
CREATE OR REPLACE FUNCTION public.list_changelog_entries(p_limit integer DEFAULT 30)
RETURNS TABLE(
  id uuid,
  slug text,
  title text,
  body text,
  published_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  RETURN QUERY
    SELECT ce.id, ce.slug, ce.title, ce.body, ce.published_at
    FROM public.changelog_entries ce
    ORDER BY ce.published_at DESC
    LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 30), 100));
END;
$$;

-- mark_changelog_seen: bumps the player's watermark to now(). Idempotent.
CREATE OR REPLACE FUNCTION public.mark_changelog_seen()
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'auth required'; END IF;
  UPDATE public.player_profiles
  SET last_changelog_seen_at = v_now
  WHERE id = v_uid;
  RETURN v_now;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────
-- Seed entry: covers the work shipped today (2026-05-09).
-- Use a stable slug so re-running the migration doesn't duplicate.
-- ─────────────────────────────────────────────────────────────────────
INSERT INTO public.changelog_entries (slug, title, body)
VALUES (
  '2026-05-09-trade-redesign',
  'Trade Partners — redesigned',
  E'The Trade → Partners tab is now a single scrolling list of trader cards instead of one tab per partner. Each card shows what that trader buys, sells, and how often they visit, and you can collapse a card you''re not focused on.\n\nNew: reservation prices. On City → Resources, set "Sell at $X+" or "Buy at $X−" alongside any auto-trade rule. The auto-trade only fires when a partner''s offer beats your floor (or stays under your ceiling). Leave it blank to accept any price like before.\n\nA "Your price gates" banner at the top of Partners shows — for each resource you''ve gated — which trader currently meets your terms (and at what price), so you can see at a glance whether anyone wants what you''re selling.\n\nMore trade partners will appear as you build and upgrade transport hubs. The locked-partner list is gone — you''ll discover them when they arrive.'
)
ON CONFLICT (slug) DO NOTHING;
