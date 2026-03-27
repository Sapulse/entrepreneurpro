// ============================================================
// sync/supabase.js — Client Supabase
// Chargé en premier (script régulier, avant Babel)
// ============================================================

const SUPABASE_URL = 'https://yojvynoogknerelczxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t9GZjHv8hlHUsuevsKd6RQ_Of_ZUasv';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
