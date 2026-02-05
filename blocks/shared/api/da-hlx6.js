import { daFetch } from '../fetch.js';

const getPathParts = (path) => {
  const parts = path.split('/').filter((p) => p);
  return {
    org: parts[0],
    repo: parts[1],
    rest: parts.slice(2).join('/'),
  };
};

export default class DaHlx6Api {
  constructor(origin) {
    this.origin = origin;
    this.isHlx = true;
  }

  getSourceUrl(path) {
    const { org, repo, rest } = getPathParts(path);
    if (!repo) return `${this.origin}/source${path}`;
    return `${this.origin}/${org}/sites/${repo}/source/${rest}`;
  }

  getConfigUrl(path) {
    const { org, repo } = getPathParts(path);

    // TODO: migrate to api.aem.live when ready
    // cannot work as is because auth... not the same token is required
    // https://admin.hlx.page/config/kptdobe/sites/daplayground.json
    return `https://admin.hlx.page/config/${org}/sites/${repo}.json`;

    // return `${this.origin}/${org}/sites/${repo}/config/`;
  }

  getListUrl(path) {
    const { org, repo, rest } = getPathParts(path);
    if (!repo) return `${this.origin}/list${path}`;
    // HLX6 uses the source endpoint for listing as well (if it's a folder)
    return `${this.origin}/${org}/sites/${repo}/source/${rest}`;
  }

  getVersionListUrl(path) {
    return `${this.origin}/versionlist${path}`;
  }

  getVersionSourceUrl(path) {
    return `${this.origin}/versionsource${path}`;
  }

  async getSource(path) {
    return daFetch(this.getSourceUrl(path));
  }

  async deleteSource(path) {
    return daFetch(this.getSourceUrl(path), { method: 'DELETE' });
  }

  async saveSource(path, { blob, method = 'PUT' } = {}) {
    const opts = { method, body: blob };
    const daResp = await daFetch(this.getSourceUrl(path), opts);
    if (!daResp.ok) return undefined;
    return daResp;
  }

  async getConfig(path) {
    return daFetch(this.getConfigUrl(path));
  }

  async getList(path) {
    return daFetch(this.getListUrl(path));
  }

  async getVersionList(path) {
    return daFetch(this.getVersionListUrl(path));
  }

  async getVersionSource(path) {
    return daFetch(this.getVersionSourceUrl(path));
  }

  async move(path, destination, continuationToken) {
    const body = new FormData();
    body.append('destination', destination);
    if (continuationToken) body.append('continuation-token', continuationToken);

    // Assuming HLX6 follows similar pattern or we fallback to what was generated before
    const url = `${this.origin}/move${path}`;
    return daFetch(url, { method: 'POST', body });
  }

  async copy(path, destination, continuationToken) {
    const body = new FormData();
    body.append('destination', destination);
    if (continuationToken) body.append('continuation-token', continuationToken);

    const url = `${this.origin}/copy${path}`;
    return daFetch(url, { method: 'POST', body });
  }
}
