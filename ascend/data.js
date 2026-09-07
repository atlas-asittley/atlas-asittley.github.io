/* ============================================================
   Ascend — data layer
   Reads Drew's REAL workout data from Supabase. READ-ONLY.
   Nothing in this file ever writes. The workout tracker owns
   that data; Ascend only listens.
   ============================================================ */

const SUPABASE_URL = 'https://igaulapupbtdcqqjobhs.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e';

const CACHE_KEY = 'ascend.snapshot.v1';

/* Set once Drew is signed in, so reads go out as `authenticated`
   rather than as the public anon role. */
let ACCESS_TOKEN = null;
function setAccessToken(t) { ACCESS_TOKEN = t; }

async function sb(path) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${ACCESS_TOKEN || SUPABASE_KEY}` }
  });
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json();
}

/* Pull everything the game needs in one round trip each. */
async function fetchSnapshot() {
  const [sessions, sets, weights, measures] = await Promise.all([
    sb('workout_sessions?select=session_date,day_type,status&status=eq.completed&order=session_date.desc'),
    sb('workout_sets?select=exercise,set_index,actual_reps,actual_weight,workout_sessions(session_date,status)&actual_reps=gt.0&limit=2000'),
    sb('workout_bodyweight?select=log_date,weight&order=log_date.desc&limit=30'),
    sb('workout_measurements?select=log_date,waist,shoulders,chest,arm,thigh&order=log_date.desc&limit=20')
  ]);

  // Flatten the embedded session onto each set, drop anything not completed.
  const flatSets = sets
    .filter(s => s.workout_sessions && s.workout_sessions.status === 'completed')
    .map(s => ({
      exercise: s.exercise,
      set_index: s.set_index,
      reps: s.actual_reps,
      weight: s.actual_weight == null ? 0 : Number(s.actual_weight),
      date: s.workout_sessions.session_date
    }));

  const snap = {
    fetchedAt: new Date().toISOString(),
    sessions,
    sets: flatSets,
    weights,
    measures
  };
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) {}
  return snap;
}

function cachedSnapshot() {
  try { return JSON.parse(localStorage.getItem(CACHE_KEY)); } catch (e) { return null; }
}

/* The cache holds his bodyweight and measurements — it does not outlive
   the session. */
function clearSnapshot() {
  try { localStorage.removeItem(CACHE_KEY); } catch (e) {}
}

/* ---------- small date helpers ---------- */
const DAY = 86400000;
function daysAgo(dateStr) {
  const d = new Date(dateStr + 'T12:00:00');
  return Math.floor((Date.now() - d.getTime()) / DAY);
}
