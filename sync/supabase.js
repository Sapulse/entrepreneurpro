// ============================================================
// sync/supabase.js — Client de données (Supabase OU API locale)
//
// INTERRUPTEUR PRINCIPAL :
//   USE_LOCAL_API = true  → l'app tape sur l'API REST locale (serveur souverain)
//   USE_LOCAL_API = false → l'app utilise le vrai client supabase-js (comportement original)
//
// Pour revenir sur Supabase : changer USE_LOCAL_API à false — UNE seule ligne.
// Aucun autre fichier ne doit être modifié.
// ============================================================

const USE_LOCAL_API  = true;
const API_BASE       = 'http://100.77.223.91:3333/api';

// Identifiants Supabase conservés pour le fallback (USE_LOCAL_API = false)
const SUPABASE_URL = 'https://yojvynoogknerelczxrf.supabase.co';
const SUPABASE_KEY = 'sb_publishable_t9GZjHv8hlHUsuevsKd6RQ_Of_ZUasv';

// ============================================================
// MODE FALLBACK — client supabase-js original, inchangé
// ============================================================
if (!USE_LOCAL_API) {
  // Réutilise le SDK supabase-js chargé via <script> dans index.html
  // La variable globale `sb` est assignée et le reste du code l'utilise normalement.
  var sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ============================================================
// MODE LOCAL — faux client qui imite l'interface supabase-js
// et traduit chaque appel en fetch() vers l'API REST locale.
// ============================================================
if (USE_LOCAL_API) {

  // ----------------------------------------------------------
  // Fonction utilitaire : appel fetch normalisé
  // Retourne toujours { data, error } comme supabase-js.
  // ----------------------------------------------------------
  async function _apiFetch(method, path, body) {
    try {
      const opts = {
        method,
        headers: { 'Content-Type': 'application/json' },
      };
      if (body !== undefined) opts.body = JSON.stringify(body);

      const res = await fetch(API_BASE + path, opts);

      // Réponse vide (204 No Content ou body vide)
      const text = await res.text();
      const json = text ? JSON.parse(text) : null;

      if (!res.ok) {
        // Normalise l'erreur au format supabase-js { code, message }
        const msg = (json && (json.error || json.message)) || res.statusText;
        const code = (json && json.code) || String(res.status);
        return { data: null, error: { code, message: msg } };
      }

      return { data: json, error: null };
    } catch (e) {
      // Erreur réseau (fetch échoué, CORS, timeout…)
      return { data: null, error: { code: 'FETCH_ERROR', message: e.message } };
    }
  }

  // ----------------------------------------------------------
  // QueryBuilder — construit la requête par accumulation de
  // méthodes chaînées, puis l'exécute à l'await.
  // ----------------------------------------------------------
  class QueryBuilder {
    constructor(table) {
      this._table   = table;
      this._method  = 'GET';      // méthode HTTP finale
      this._body    = undefined;  // corps pour POST/PUT/DELETE batch
      this._select  = null;       // colonnes à sélectionner (?select=…)
      this._filters = [];         // [{type:'eq'|'in'|'not', col, val}]
      this._order   = null;       // "col.asc" ou "col.desc"
      this._limit   = null;       // entier
      this._single  = false;      // déplie le tableau en objet unique
      this._isDelete     = false; // marqueur delete()
      this._deleteMode   = null;  // 'batch' | 'all' | 'id'
      this._deleteIds    = null;
      this._deleteId     = null;
      this._isUpsert     = false;
      this._isInsert     = false;
      this._upsertData   = null;
      this._selectAfterWrite = null; // .upsert().select('id') → colonnes retournées
    }

    // ---- Lecture ----

    select(cols) {
      // Après un upsert/insert, .select() précise les colonnes à retourner
      if (this._isUpsert || this._isInsert) {
        this._selectAfterWrite = cols;
      } else {
        this._select = cols || '*';
      }
      return this;
    }

    eq(col, val) {
      this._filters.push({ type: 'eq', col, val });
      return this;
    }

    in(col, vals) {
      if (this._isDelete) {
        // .delete().in('id', [...]) → DELETE /batch
        this._deleteMode = 'batch';
        this._deleteIds  = vals;
      } else {
        this._filters.push({ type: 'in', col, vals });
      }
      return this;
    }

    not(col, op, val) {
      if (this._isDelete) {
        // .delete().not('id', 'is', null) → DELETE /all (vider la table)
        this._deleteMode = 'all';
      }
      // En lecture, .not() n'est pas utilisé dans le code actuel — ignoré silencieusement.
      return this;
    }

    order(col, opts) {
      const dir = (opts && opts.ascending === false) ? 'desc' : 'asc';
      this._order = `${col}.${dir}`;
      return this;
    }

    limit(n) {
      this._limit = n;
      return this;
    }

    single() {
      this._single = true;
      return this;
    }

    // ---- Écriture ----

    upsert(data) {
      this._isUpsert   = true;
      this._upsertData = data;
      return this;
    }

    insert(data) {
      this._isInsert   = true;
      this._upsertData = data;
      return this;
    }

    delete() {
      this._isDelete = true;
      this._deleteMode = 'id'; // mode par défaut, surchargé par .in() ou .not()
      return this;
    }

    // ---- Exécution — appelée à l'await ----
    // Le QueryBuilder est "thenable" : await déclenche _execute().

    then(resolve, reject) {
      return this._execute().then(resolve, reject);
    }

    catch(reject) {
      return this._execute().catch(reject);
    }

    async _execute() {
      // --- UPSERT ---
      if (this._isUpsert) {
        const { data, error } = await _apiFetch('PUT', `/${this._table}/upsert`, this._upsertData);
        if (error) return { data: null, error };
        // Si .select() a été chaîné après upsert, filtrer les colonnes
        const rows = Array.isArray(data) ? data : (data ? [data] : []);
        const filtered = this._selectAfterWrite
          ? rows.map(r => _pickCols(r, this._selectAfterWrite))
          : rows;
        return { data: filtered, error: null };
      }

      // --- INSERT ---
      if (this._isInsert) {
        const { data, error } = await _apiFetch('POST', `/${this._table}`, this._upsertData);
        if (error) return { data: null, error };
        return { data, error: null };
      }

      // --- DELETE ---
      if (this._isDelete) {
        if (this._deleteMode === 'all') {
          return _apiFetch('DELETE', `/${this._table}/all`);
        }
        if (this._deleteMode === 'batch') {
          return _apiFetch('DELETE', `/${this._table}/batch`, { ids: this._deleteIds });
        }
        if (this._deleteMode === 'id' && this._deleteId) {
          return _apiFetch('DELETE', `/${this._table}/${encodeURIComponent(this._deleteId)}`);
        }
        // DELETE sans cible précisée — no-op sécurisé
        return { data: null, error: null };
      }

      // --- SELECT (lecture) ---
      const params = new URLSearchParams();

      if (this._select && this._select !== '*') {
        params.set('select', this._select);
      }
      for (const f of this._filters) {
        if (f.type === 'eq') {
          params.set(`eq.${f.col}`, String(f.val));
        } else if (f.type === 'in') {
          params.set(`in.${f.col}`, Array.isArray(f.vals) ? f.vals.join(',') : f.val);
        }
      }
      if (this._order)  params.set('order', this._order);
      if (this._limit)  params.set('limit', String(this._limit));
      if (this._single) params.set('single', 'true');

      const qs = params.toString();
      const path = `/${this._table}${qs ? '?' + qs : ''}`;
      const { data, error } = await _apiFetch('GET', path);

      if (error) return { data: null, error };

      // Normalisation du mode .single() :
      // supabase-js retourne un objet (pas un tableau) quand .single() est chaîné.
      // L'API peut retourner un objet ou un tableau d'un élément selon l'implémentation.
      if (this._single) {
        if (Array.isArray(data)) {
          if (data.length === 0) {
            // Imite l'erreur PGRST116 de supabase-js ("0 rows")
            return { data: null, error: { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'Results contain 0 rows' } };
          }
          return { data: data[0], error: null };
        }
        return { data, error: null };
      }

      return { data: data ?? [], error: null };
    }
  }

  // ----------------------------------------------------------
  // Utilitaire : sélection de colonnes spécifiques sur un objet
  // Utilisé pour .upsert().select('id') → ne retourner que { id }
  // ----------------------------------------------------------
  function _pickCols(obj, colStr) {
    if (!colStr || colStr === '*' || !obj) return obj;
    const cols = colStr.split(',').map(c => c.trim());
    const result = {};
    for (const col of cols) result[col] = obj[col];
    return result;
  }

  // ----------------------------------------------------------
  // Stub Realtime — aucun WebSocket côté API locale.
  // Les appels .channel().on().subscribe() sont absorbés en no-op.
  // La synchro multi-appareils en temps réel est désactivée ;
  // un F5 suffit à resynchroniser.
  // ----------------------------------------------------------
  const _realtimeStub = {
    on()        { return this; },
    subscribe() {
      console.info('[SYNC] Realtime désactivé (mode API locale — F5 pour resynchroniser)');
      return this;
    },
    unsubscribe() { return this; },
  };

  // ----------------------------------------------------------
  // Client public `sb` — remplace window.supabase.createClient()
  // Interface : sb.from(table) / sb.channel() / sb.removeChannel()
  // ----------------------------------------------------------
  var sb = {
    from(table) {
      return new QueryBuilder(table);
    },

    // Realtime stub (no-op)
    channel(_name) {
      return _realtimeStub;
    },
    removeChannel(_ch) {
      // no-op
    },
  };

  console.info('[SYNC] Mode API locale activé →', API_BASE);
}
