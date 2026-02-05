import { daFetch } from '../fetch.js';

export default class DaAdminApi {
  constructor(origin) {
    this.origin = origin;
    this.isHlx = false;
  }

  getSourceUrl(path) {
    return `${this.origin}/source${path}`;
  }

  getConfigUrl(path) {
    return `${this.origin}/config${path}`;
  }

  getListUrl(path) {
    return `${this.origin}/list${path}`;
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

  async saveSource(path, { formData, blob, props, method = 'PUT' } = {}) {
    const opts = { method };
    const form = formData || new FormData();
    if (blob || props) {
      if (blob) form.append('data', blob);
      if (props) form.append('props', JSON.stringify(props));
    }
    if ([...form.keys()].length) opts.body = form;

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
