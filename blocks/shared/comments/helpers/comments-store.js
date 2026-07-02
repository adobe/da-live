import { DA_ORIGIN } from '../../constants.js';
import { daFetch } from '../../utils.js';

// Fingerprint covers only mutable fields — anchor and author are write-once.
function commentFingerprint(c) {
  return `${c.body}|${c.resolved}|${c.resolvedAt ?? ''}`;
}

export function createCommentsStore({ docId, owner, repo }) {
  const map = new Map();
  const observers = new Set();
  let loaded = false;
  const base = `${DA_ORIGIN}/source/${owner}/${repo}/.da/comments/${docId}`;
  const listUrl = `${DA_ORIGIN}/list/${owner}/${repo}/.da/comments/${docId}/`;

  const fire = () => observers.forEach((fn) => fn());

  // Resolve the loading state after the first completed fetch (success or
  // handled failure) and force a notification on the false->true transition,
  // even when no comment data changed, so the panel can drop its spinner.
  function settleLoaded(changed) {
    const wasLoaded = loaded;
    loaded = true;
    if (changed || !wasLoaded) fire();
  }

  async function reload() {
    const listResp = await daFetch(listUrl, { cache: 'no-store' });
    if (!listResp.ok) {
      settleLoaded(false);
      return;
    }
    const list = await listResp.json();
    const ids = list.map((entry) => entry.name.replace(/\.json$/, ''));

    const fetched = await Promise.all(
      ids.map((id) => daFetch(`${base}/${id}.json`, { cache: 'no-store' })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null)),
    );

    const next = new Map();
    fetched.forEach((value, i) => { if (value) next.set(ids[i], value); });

    const changed = next.size !== map.size
      || [...next.entries()].some(([k, v]) => {
        const existing = map.get(k);
        return !existing || commentFingerprint(existing) !== commentFingerprint(v);
      });

    map.clear();
    next.forEach((v, k) => map.set(k, v));

    settleLoaded(changed);
  }

  return {
    get size() { return map.size; },

    get loaded() { return loaded; },

    forEach(fn) { map.forEach((value, id) => fn(value, id, this)); },

    get(id) { return map.get(id); },

    observe(fn) { observers.add(fn); },
    unobserve(fn) { observers.delete(fn); },

    async set(id, value) {
      const body = new FormData();
      body.append('data', new Blob([JSON.stringify(value)], { type: 'application/json' }));
      const resp = await daFetch(`${base}/${id}.json`, { method: 'POST', body });
      if (!resp.ok) {
        throw new Error(`[comments] set ${id} failed: ${resp.status}`);
      }
      const changed = JSON.stringify(map.get(id)) !== JSON.stringify(value);
      map.set(id, value);
      if (changed) fire();
    },

    async delete(id) {
      const resp = await daFetch(`${base}/${id}.json`, { method: 'DELETE' });
      if (!resp.ok) {
        throw new Error(`[comments] delete ${id} failed: ${resp.status}`);
      }
      if (map.has(id)) {
        map.delete(id);
        fire();
      }
    },

    async deleteBatch(ids) {
      const results = await Promise.all(
        ids.map((id) => daFetch(`${base}/${id}.json`, { method: 'DELETE' })),
      );
      let changed = false;
      const failed = [];
      results.forEach((resp, i) => {
        if (resp.ok) {
          map.delete(ids[i]);
          changed = true;
        } else {
          failed.push(`${ids[i]} (${resp.status})`);
        }
      });
      if (changed) fire();
      if (failed.length) {
        throw new Error(`[comments] deleteBatch failed for: ${failed.join(', ')}`);
      }
    },

    async load() { await reload(); },
    async refresh() { await reload(); },
  };
}
