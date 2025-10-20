/*
 * Copyright 2025 Adobe
 */
import { AEM_ORIGIN, DA_ORIGIN } from '../../utils.js';
import { daFetch } from '../../../../shared/utils.js';
import getPathDetails from '../../../../shared/pathDetails.js';

/**
 * DaService
 *
 * Thin client for Digital Asset (DA) backend and AEM bridge operations.
 * Handles reading/writing HTML documents via DA APIs and triggering AEM flows.
 */
export class DaService {
  /** @param {object} context - Must include `services.storage` for parse/serialize */
  constructor(context = {}) {
    this._context = context || {};
    this._storage = this._context?.services?.storage;
  }

  /**
   * Read a source HTML document from DA, parse into metadata and data via storage.
   * @returns {Promise<{pagePath:string,title:string,formData:object,schemaId?:string}>}
   */
  async readDocument(pagePath, { storageVersion } = {}) {
    const { owner: org, repo } = getPathDetails();
    const fullpath = `${DA_ORIGIN}/source/${org}/${repo}${pagePath}.html`;
    const response = await daFetch(fullpath);
    if (!response.ok) {
      return { pagePath, title: 'Untitled Page', formData: {}, schemaId: undefined };
    }
    const htmlContent = await response.text();
    const { metadata, data } = await this._storage.parseDocument(htmlContent, { storageVersion });
    const result = { pagePath, title: metadata.title || 'Untitled Page', formData: data, schemaId: metadata.schemaId };
    console.log('readDocument', result);
    return result;
  }

  /**
   * Serialize form details to HTML and PUT to DA source. Returns status info.
   */
  async saveDocument(details, { storageVersion, ext = 'html' } = {}) {
    console.log('saveDocument', { storageVersion, details });
    const { owner: org, repo } = getPathDetails();
    const content = this._storage
      .serializeDocument(details, { storageVersion });
    const body = `\n  <body>\n    <header></header>\n    <main>\n      <div>\n        ${content}\n      </div>\n    </main>\n    <footer></footer>\n  </body>\n`;
    const blob = new Blob([body], { type: 'text/html' });
    const formData = new FormData();
    formData.append('data', blob);
    const opts = { method: 'POST', body: formData };
    const daPath = `/${org}/${repo}${details.pagePath}`;
    const fullpath = `${DA_ORIGIN}/source${daPath}.${ext}`;
    try {
      const daResp = await fetch(fullpath, opts);
      return { daPath, daStatus: daResp.status, daResp, ok: daResp.ok };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Trigger an AEM-side action (e.g., preview/publish) for the given DA path.
   */
  async saveToAem(path, action) {
    const [owner, repo, ...parts] = path.slice(1).toLowerCase().split('/');
    const aemPath = parts.join('/');
    const url = `${AEM_ORIGIN}/${action}/${owner}/${repo}/main/${aemPath}`;
    const resp = await fetch(url, { method: 'POST' });
    if (!resp.ok) {
      const { status } = resp;
      const message = [401, 403].some((s) => s === status) ? 'Not authorized to' : 'Error during';
      return { error: { status, type: 'error', message } };
    }
    return resp.json();
  }

  /** Create a DA version label entry for the saved resource. */
  async saveDaVersion(path, ext = 'html') {
    const fullPath = `${DA_ORIGIN}/versionsource${path}.${ext}`;
    const opts = { method: 'POST', body: JSON.stringify({ label: 'Published' }) };
    try { await daFetch(fullPath, opts); } catch { }
  }

  /**
   * Upload an image (or any binary) to DA source under `/.image/` by default.
   * Returns paths and status information.
   *
   * @param {File|Blob} file - The file/blob to upload
   * @param {{ subdir?: string, filename?: string }} [options]
   * @returns {Promise<{ ok:boolean, status:number, daPath:string, resourcePath:string, previewUrl:string, response?:Response, error?:any }>}
   */
  async uploadImage(file, { subdir = '.image', filename } = {}) {
    try {
      const { owner: org, repo } = getPathDetails();
      if (!org || !repo) throw new Error('Missing org/repo context');
      const originalName = /** @type {any} */(file)?.name || `upload-${Date.now()}`;
      const targetName = filename || originalName;
      const dirPath = `/${org}/${repo}/${subdir}`;
      const encodedName = encodeURIComponent(targetName);
      const fullUrl = `${DA_ORIGIN}/source${dirPath}/${encodedName}`;
      const formData = new FormData();
      // When `file` is a Blob (no name), pass the desired filename explicitly
      formData.append('data', file, targetName);
      const opts = { method: 'POST', body: formData };
      console.log('uploadImage', fullUrl, opts);
      const resp = await daFetch(fullUrl, opts);
      const { ok } = resp;
      const { status } = resp;
      const daPath = `${dirPath}/${targetName}`; // /{org}/{repo}/.image/name
      const resourcePath = `/${subdir}/${targetName}`; // /.image/name (relative)
      const previewUrl = `${DA_ORIGIN}/source${daPath}`; // absolute URL for previews and saving

      return {
        ok, status, daPath, resourcePath, previewUrl, response: resp,
      };
    } catch (error) {
      return {
        ok: false, status: 0, daPath: '', resourcePath: '', previewUrl: '', error,
      };
    }
  }

  /**
   * Build a preview URL for a stored resource path (e.g., '/.image/name.jpg').
   * If an absolute URL is provided, returns it as-is.
   * @param {string} resourcePath
   * @returns {Promise<string>}
   */
  async buildPreviewUrl(resourcePath) {
    if (!resourcePath) return '';
    if (/^https?:\/\//i.test(resourcePath)) return resourcePath;
    const { owner: org, repo } = getPathDetails();
    const clean = resourcePath.startsWith('/') ? resourcePath : `/${resourcePath}`;
    return `${DA_ORIGIN}/source/${org}/${repo}${clean}`;
  }
}

export default DaService;
