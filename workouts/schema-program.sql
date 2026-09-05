-- ============================================================================
-- workout_program + workout_settings + queue_session()   (added 2026-09-05)
-- The plan lives HERE as data. Sessions are GENERATED from it, not hand-typed.
-- Coach notes (why) stay in ~/workouts/TRAINING-PLAN.md; the WHAT lives here.
-- Writes happen via psql (postgres role). The anon key can only read.
-- ============================================================================

CREATE TABLE IF NOT EXISTS workout_program (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise       text NOT NULL,                       -- canonical name (ONE spelling)
  block          text NOT NULL CHECK (block IN ('daily','daily-essential','upper','lower')),
  sort           int  NOT NULL,                       -- daily 1..99, upper 100..199, lower 200..299
  sets           int  NOT NULL DEFAULT 1,
  target_reps    text,
  working_weight numeric,                             -- NULL for bodyweight / timed
  next_target    text,                                -- progression note (coach-facing)
  cue            text,                                -- -> workout_sets.exercise_note (Drew sees this)
  bodyweight     boolean NOT NULL DEFAULT false,      -- true => app hides the lbs field
  rest_seconds   int,
  active         boolean NOT NULL DEFAULT true,
  added_on       date NOT NULL DEFAULT current_date,
  retired_on     date,
  retire_reason  text,
  rationale      text,                                -- why it's in the plan (coach-facing)
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exercise)
);

CREATE TABLE IF NOT EXISTS workout_settings (
  key        text PRIMARY KEY,
  value      text NOT NULL,
  note       text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE workout_program  ENABLE ROW LEVEL SECURITY;
ALTER TABLE workout_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS workout_program_sel  ON workout_program;
DROP POLICY IF EXISTS workout_settings_sel ON workout_settings;
CREATE POLICY workout_program_sel  ON workout_program  FOR SELECT USING (true);
CREATE POLICY workout_settings_sel ON workout_settings FOR SELECT USING (true);
-- no anon insert/update/delete policies on purpose

-- touch updated_at
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_program_touch  ON workout_program;
DROP TRIGGER IF EXISTS trg_settings_touch ON workout_settings;
CREATE TRIGGER trg_program_touch  BEFORE UPDATE ON workout_program  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
CREATE TRIGGER trg_settings_touch BEFORE UPDATE ON workout_settings FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ----------------------------------------------------------------------------
-- queue_session(date, 'upper'|'lower'|'mobility' [, force])
--   mobility  -> every active 'daily' + 'daily-essential' row
--   upper     -> 'daily-essential' + 'upper'
--   lower     -> 'daily-essential' + 'lower'
-- Guards: refuses if a prescribed session already exists (one-at-a-time rule)
--         unless force. WARNS on rotation violations (never trained lifts
--         back-to-back; never the same lift day twice in a row).
-- Returns the generated rows so the coach VERIFIES BY READING.
-- Coach note goes in afterwards: UPDATE workout_sessions SET notes=... WHERE id=...
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION queue_session(p_date date, p_type text, p_force boolean DEFAULT false)
RETURNS TABLE(session_id uuid, ord int, exercise text, sets int, reps text, weight numeric, bw boolean)
LANGUAGE plpgsql AS $$
DECLARE
  v_id        uuid;
  v_last      record;
  v_equipment text;
  v_blocks    text[];
  r           record;
  v_ord       int := 0;
  v_i         int;
BEGIN
  IF p_type NOT IN ('upper','lower','mobility') THEN
    RAISE EXCEPTION 'p_type must be upper | lower | mobility (got %)', p_type;
  END IF;

  IF NOT p_force AND EXISTS (SELECT 1 FROM workout_sessions WHERE status = 'prescribed') THEN
    RAISE EXCEPTION 'A prescribed session already exists (one-at-a-time rule). Complete/skip it first, or pass p_force => true.';
  END IF;

  SELECT day_type, session_date INTO v_last
  FROM workout_sessions WHERE status = 'completed' ORDER BY session_date DESC LIMIT 1;

  IF v_last.day_type IN ('upper','lower') AND p_type IN ('upper','lower') AND v_last.session_date >= p_date - 1 THEN
    RAISE WARNING 'ROTATION: last completed session was % on %. Drew has never trained lifts back-to-back — expected mobility on %.',
      v_last.day_type, v_last.session_date, p_date;
  END IF;
  IF v_last.day_type = p_type AND p_type IN ('upper','lower') THEN
    RAISE WARNING 'ROTATION: the last lift day was also % (%). Expected the other lift day.', p_type, v_last.session_date;
  END IF;

  v_equipment := CASE WHEN p_type = 'mobility' THEN 'home' ELSE 'Park West' END;
  v_blocks    := CASE WHEN p_type = 'mobility' THEN ARRAY['daily-essential','daily'] ELSE ARRAY['daily-essential', p_type] END;

  INSERT INTO workout_sessions (session_date, day_type, equipment, status)
  VALUES (p_date, p_type, v_equipment, 'prescribed') RETURNING id INTO v_id;

  FOR r IN
    SELECT * FROM workout_program p WHERE p.active AND p.block = ANY (v_blocks) ORDER BY p.sort, p.exercise
  LOOP
    v_ord := v_ord + 1;
    FOR v_i IN 1 .. r.sets LOOP
      INSERT INTO workout_sets (session_id, exercise, exercise_order, exercise_note, rest_seconds, set_index, target_reps, target_weight, bodyweight)
      VALUES (v_id, r.exercise, v_ord, r.cue, r.rest_seconds, v_i, r.target_reps, r.working_weight, r.bodyweight);
    END LOOP;
  END LOOP;

  RETURN QUERY
    SELECT v_id, s.exercise_order, s.exercise, count(*)::int, min(s.target_reps), max(s.target_weight), bool_or(s.bodyweight)
    FROM workout_sets s WHERE s.session_id = v_id
    GROUP BY s.exercise_order, s.exercise ORDER BY s.exercise_order;
END $$;

-- ----------------------------------------------------------------------------
-- Drift audit: active program rows and when they were last COMPLETED.
--   SELECT * FROM workout_program_drift WHERE days_since IS NULL OR days_since > 14;
-- ----------------------------------------------------------------------------
CREATE OR REPLACE VIEW workout_program_drift AS
SELECT p.exercise, p.block, p.sort,
       max(ss.session_date) AS last_completed,
       (current_date - max(ss.session_date)) AS days_since
FROM workout_program p
LEFT JOIN workout_sets s  ON s.exercise = p.exercise
LEFT JOIN workout_sessions ss ON ss.id = s.session_id AND ss.status = 'completed'
WHERE p.active
GROUP BY p.exercise, p.block, p.sort
ORDER BY p.sort;
