// ============================================================
// sync/supabase.supabase.js — COPIE DE SECOURS du client Supabase original
// Conservé tel quel pour rollback immédiat si nécessaire.
// Pour revenir sur Supabase : copier ce contenu dans sync/supabase.js
//   et passer USE_LOCAL_API = false dans le nouveau supabase.js.
// ============================================================

const SUPABASE_URL = 'https://yojvynoogknerelczxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t9GZjHv8hlHUsuevsKd6RQ_Of_ZUasv';
const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
