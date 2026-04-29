// Minimal test fixture for da-nx api/index.js.
import { daFetch } from './fetch.js';

const DA_ORIGIN = 'https://admin.da.live';

class StubApi {
  constructor() {
    this.apiVersion = 'legacy';
  }

  // identity
  origin() { return DA_ORIGIN; }

  isHelix6() { return false; }

  // URL builders
  getSourceUrl(path) { return `${DA_ORIGIN}/source${path}`; }

  getConfigUrl(path) { return `${DA_ORIGIN}/config${path}`; }

  getListUrl(path) { return `${DA_ORIGIN}/list${path}`; }

  getVersionListUrl(path) { return `${DA_ORIGIN}/versionlist${path}`; }

  getVersionSourceUrl(path) { return `${DA_ORIGIN}/versionsource${path}`; }

  // ops
  getSource(path, opts) { return daFetch(this.getSourceUrl(path), opts); }

  saveSource(path, { formData, blob, props, method = 'PUT' } = {}) {
    const opts = { method };
    const form = formData || new FormData();
    if (blob || props) {
      if (blob) form.append('data', blob);
      if (props) form.append('props', JSON.stringify(props));
    }
    if ([...form.keys()].length) opts.body = form;
    return daFetch(this.getSourceUrl(path), opts);
  }

  deleteSource(path) { return daFetch(this.getSourceUrl(path), { method: 'DELETE' }); }

  getConfig(path, opts) { return daFetch(this.getConfigUrl(path), opts); }

  saveConfig(path, body) { return daFetch(this.getConfigUrl(path), { method: 'PUT', body }); }

  async getList(path, { continuationToken } = {}) {
    const opts = continuationToken
      ? { headers: { 'da-continuation-token': continuationToken } }
      : {};
    const resp = await daFetch(this.getListUrl(path), opts);
    const out = { ok: resp.ok, status: resp.status, items: [], continuationToken: null };
    if (!resp.ok) return out;
    const json = await resp.json();
    const items = Array.isArray(json) ? json : (json?.items || []);
    out.continuationToken = resp.headers?.get('da-continuation-token')
      || json?.continuationToken
      || null;
    out.items = items;
    return out;
  }

  move(src, dest) {
    const body = new FormData();
    body.append('destination', dest);
    return daFetch(`${DA_ORIGIN}/move${src}`, { method: 'POST', body });
  }

  copy(src, dest) {
    const body = new FormData();
    body.append('destination', dest);
    return daFetch(`${DA_ORIGIN}/copy${src}`, { method: 'POST', body });
  }

  async getVersionList(path) {
    const resp = await daFetch(this.getVersionListUrl(path));
    return { ok: resp.ok, status: resp.status, items: resp.ok ? await resp.json() : [] };
  }

  getVersion(path) { return daFetch(this.getVersionSourceUrl(path)); }

  createVersion(path, { label } = {}) {
    const opts = { method: 'POST' };
    if (label) opts.body = JSON.stringify({ label });
    return daFetch(this.getVersionSourceUrl(path), opts);
  }
}

export const daApi = new StubApi();
export const resolveDaApi = async () => daApi;
export const getDaApi = () => daApi;
export const knownApiVersion = () => 'legacy';
export const registerApiVersion = () => {};
export const deriveCapabilities = ({ apiVersion = 'legacy', depth = 0 } = {}) => ({
  apiVersion,
  canCreateOrgFiles: !(apiVersion === 'helix6' && depth === 1),
  supportsVersioning: true,
  supportsSheets: true,
  supportsLinks: true,
  supportsMediaUpload: true,
});
export const getCapabilities = (org, site, depth) => deriveCapabilities({ apiVersion: 'legacy', depth });
export const FALLBACK_CAPABILITIES = deriveCapabilities({ apiVersion: 'legacy' });
