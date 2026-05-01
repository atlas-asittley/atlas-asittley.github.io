// ── Supabase configuration ──
var SUPABASE_URL = 'https://igaulapupbtdcqqjobhs.supabase.co';
var SUPABASE_ANON_KEY = 'sb_publishable_7yi3BNg-J-K5nralw5JSww_c71Pge6e';

if (!window.supabase || typeof window.supabase.createClient !== 'function') {
  document.getElementById('screen-loading').innerHTML =
    '<div style="color:#f0a0a0;padding:24px;text-align:center;">Failed to load Supabase library.<br>Check your connection and reload.</div>';
  throw new Error('Supabase library not loaded');
}

export var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
