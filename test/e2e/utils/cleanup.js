/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { TEST_SITE } from './env.js';
import { getTestResourceAge } from './page.js';

const DA_ADMIN = 'https://admin.da.live';
const AEM_API = 'https://api.aem.live';
const MS_PER_HOUR = 60 * 60 * 1000;

export const FORM_SCHEMAS_FOLDER = '/.da/forms/schemas';

// Same discriminator the rest of the suite already uses
// (test.skip(TEST_SITE !== 'da-status', ...)).
const IS_HLX6_SITE = TEST_SITE !== 'da-status';

export function parseTestUrl(url) {
  const [, org, site, ...rest] = url.split('#')[1].split('/');
  return { org, site, path: `/${rest.join('/')}` };
}

export const DELETE_CONCURRENCY = 5;

export async function mapWithConcurrency(iterable, limit, fn) {
  const iterator = iterable[Symbol.asyncIterator]();
  let count = 0;
  async function worker() {
    for (;;) {
      // eslint-disable-next-line no-await-in-loop
      const { value, done } = await iterator.next();
      if (done) return;
      count += 1;
      // eslint-disable-next-line no-await-in-loop
      await fn(value);
    }
  }
  await Promise.all(Array.from({ length: limit }, worker));
  return count;
}

function buildSourceUrl(org, site, path) {
  return IS_HLX6_SITE
    ? `${AEM_API}/${org}/sites/${site}/source${path}`
    : `${DA_ADMIN}/source/${org}/${site}${path}`;
}

function buildListUrl(org, site, path) {
  if (!IS_HLX6_SITE) return `${DA_ADMIN}/list/${org}/${site}${path}`;
  const slashed = path.endsWith('/') ? path : `${path}/`;
  return buildSourceUrl(org, site, slashed);
}

/**
 * Returns the time before which a test resource counts as stale.
 *
 * @param {number} minHours - Minimum age in hours for a resource to count as stale
 * @returns {number} The cutoff in milliseconds since the epoch
 */
function getStaleCutoff(minHours) {
  return Date.now() - MS_PER_HOUR * minHours;
}

/**
 * Lists the immediate children of a folder. Makes a single list request and
 * does not follow pagination.
 *
 * @param {import('@playwright/test').Page} page - Page whose request context calls the API
 * @param {string} authHeader - Bearer token sent as the Authorization header
 * @param {string} org - DA organization that owns the site
 * @param {string} site - DA site the tests write to
 * @param {string} path - Folder path relative to the site
 * @returns {Promise<Array<{ name: string, isFolder: boolean }>>} The children
 *   with file names stripped of their extension, or an empty array when the
 *   request fails
 */
async function listChildren(page, authHeader, org, site, path) {
  const headers = { Authorization: authHeader };
  if (IS_HLX6_SITE) {
    headers['x-content-source-authorization'] = authHeader;
  }

  const url = buildListUrl(org, site, path);
  const response = await page.request.get(url, { headers, failOnStatusCode: false });
  if (!response.ok()) {
    console.warn(`listChildren: list failed (${response.status()}) for ${path}`);
    return [];
  }

  const items = await response.json().catch(() => []);
  if (!Array.isArray(items)) {
    return [];
  }

  return items
    .map((item) => {
      const rawName = item.name ?? item.path?.split('/').pop();
      if (!rawName) {
        return null;
      }

      const isFolder = IS_HLX6_SITE ? rawName.endsWith('/') : !item.ext;
      // hlx6 lists file names with their extension and da-admin without.
      // deleteResource adds the extension back.
      const name = isFolder ? rawName.replace(/\/$/, '') : rawName.replace(/\.\w+$/, '');
      return { name, isFolder };
    })
    .filter(Boolean);
}

/**
 * Deletes a single test-created document or folder directly via the admin API,
 * bypassing the browse-view UI entirely
 */
export async function deleteResource(page, authHeader, org, site, path, opts = {}) {
  const resourcePath = opts.isFolder
    ? `${path.replace(/\/$/, '')}/`
    : `${path}${opts.ext ?? '.html'}`;
  const url = buildSourceUrl(org, site, resourcePath);
  const headers = { Authorization: authHeader };
  if (IS_HLX6_SITE) headers['x-content-source-authorization'] = authHeader;
  return page.request.delete(url, { headers, failOnStatusCode: false });
}

export function MARKER_DOC(branch, sha, iso) {
  return `<body><header></header><main><div><p>Playwright run marker</p><ul><li>branch: ${branch}</li><li>commit: ${sha}</li><li>started: ${iso}</li></ul></div></main><footer></footer></body>`;
}

/**
 * Creates a page directly via the admin API. da-admin takes a multipart `data`
 * field; hlx6 takes the raw body with a Content-Type header.
 */
export async function createResource(page, authHeader, org, site, path, body, opts = {}) {
  const resourcePath = `${path}${opts.ext ?? '.html'}`;
  const url = buildSourceUrl(org, site, resourcePath);
  const headers = { Authorization: authHeader };
  if (IS_HLX6_SITE) headers['x-content-source-authorization'] = authHeader;
  if (IS_HLX6_SITE) {
    headers['Content-Type'] = 'text/html';
    return page.request.post(url, { headers, data: body, failOnStatusCode: false });
  }
  return page.request.post(url, {
    headers,
    multipart: { data: { name: 'index.html', mimeType: 'text/html', buffer: Buffer.from(body, 'utf-8') } },
    failOnStatusCode: false,
  });
}

/**
 * Lists the run folders in `/tests` whose newest run marker is older than
 * minHours. Folders without a parseable `pw-run-*-marker` file are skipped.
 *
 * @param {import('@playwright/test').Page} page - Page whose request context calls the API
 * @param {string} authHeader - Bearer token sent as the Authorization header
 * @param {string} org - DA organization that owns the site
 * @param {string} site - DA site the tests write to
 * @param {number} minHours - Minimum age in hours for a run folder to count as stale
 * @yields {{ path: string, isFolder: true }} Each stale run folder, with its
 *   path relative to the site
 */
export async function* listStaleRunFolders(page, authHeader, org, site, minHours) {
  const cutoff = getStaleCutoff(minHours);
  const folders = (await listChildren(page, authHeader, org, site, '/tests'))
    .filter((child) => child.isFolder && child.name.startsWith('pw-'));
  // eslint-disable-next-line no-restricted-syntax
  for (const folder of folders) {
    const folderPath = `/tests/${folder.name}`;
    // eslint-disable-next-line no-await-in-loop
    const children = await listChildren(page, authHeader, org, site, folderPath);
    const markerCreationTimes = children
      .filter((child) => /^pw-run-\w+-marker$/.test(child.name))
      .map((child) => getTestResourceAge(child.name))
      .filter((createdAt) => createdAt !== null);
    const isStale = markerCreationTimes.length > 0 && Math.max(...markerCreationTimes) < cutoff;
    if (isStale) {
      yield { path: folderPath, isFolder: true };
    }
  }
}

/**
 * Lists the test files directly inside a folder whose name timestamp is older
 * than minHours.
 *
 * @param {import('@playwright/test').Page} page - Page whose request context calls the API
 * @param {string} authHeader - Bearer token sent as the Authorization header
 * @param {string} org - DA organization that owns the site
 * @param {string} site - DA site the tests write to
 * @param {string} folderPath - Folder to list, such as `/.da/forms/schemas`
 * @param {number} minHours - Minimum age in hours for a file to count as stale
 * @yields {{ path: string, isFolder: false }} Each stale file, with its path
 *   relative to the site and without an extension
 */
export async function* listStaleTestFiles(page, authHeader, org, site, folderPath, minHours) {
  const cutoff = getStaleCutoff(minHours);
  const children = await listChildren(page, authHeader, org, site, folderPath);
  const staleFiles = children.filter(({ name, isFolder }) => {
    const createdAt = getTestResourceAge(name);
    return !isFolder && name.startsWith('pw-') && createdAt !== null && createdAt < cutoff;
  });
  yield* staleFiles.map(({ name }) => ({ path: `${folderPath}/${name}`, isFolder: false }));
}
