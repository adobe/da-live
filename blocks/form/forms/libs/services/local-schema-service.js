/*
 * Copyright 2025 Adobe
 */

/**
 * LocalSchemaService
 * Discovers and loads local schemas from tools/forms/local-schema/ based on URL flags.
 */
export class LocalSchemaService {
  constructor(context = {}) {
    this._context = context || {};
    this._base = new URL('../../local-schema/', import.meta.url);
  }

  /**
   * Discover local schemas.
   * @param {{ allowDefaults?: boolean, explicitList?: string[] }} opts
   */
  async discoverSchemas(opts = {}) {
    const { allowDefaults = false, explicitList = [] } = opts || {};
    const found = [];
    const tryAdd = async (relPath, nameHint) => {
      try {
        const url = new URL(relPath, this._base);
        const res = await fetch(url, { cache: 'no-store', method: 'HEAD' });
        if (!res.ok) return;
        found.push({ id: relPath, name: nameHint || relPath, url: url.pathname, _source: 'local' });
      } catch { }
    };

    if (allowDefaults) {
      await tryAdd('llrc.schema.json', 'LLRC');
      await tryAdd('inputs.schema.json', 'Inputs');
      await tryAdd('demo.schema.json', 'Demo');
      await tryAdd('ffc-photoshop.schema.json', 'ffc-photoshop');
    }

    if (Array.isArray(explicitList) && explicitList.length > 0) {
      for (const p of explicitList) {
        try {
          const u = new URL(p, this._base);
          const r = await fetch(u, { cache: 'no-store' });
          if (!r.ok) continue;
          await r.json();
          found.push({ id: p, name: p, url: u.pathname, _source: 'local' });
        } catch { }
      }
    }

    return found;
  }

  async loadSchemaByUrl(relativePath) {
    const res = await fetch(relativePath, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch local schema (${res.status})`);
    return res.json();
  }

  async loadSchemaById(localId) {
    // Expect format: local:<relativePath>
    const id = String(localId || '').startsWith('local:') ? String(localId).slice('local:'.length) : String(localId);
    const url = new URL(id, this._base);
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`Failed to fetch local schema (${res.status})`);
    return res.json();
  }
}

export default LocalSchemaService;


