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

// One page of a folder's immediate children as { name, isFolder }.
async function listChildren(page, authHeader, org, site, path) {
  const headers = { Authorization: authHeader };
  if (IS_HLX6_SITE) headers['x-content-source-authorization'] = authHeader;
  const resp = await page.request.get(buildListUrl(org, site, path), { headers, failOnStatusCode: false });
  if (!resp.ok()) {
    console.warn(`listChildren: list failed (${resp.status()}) for ${path}`);
    return [];
  }
  const items = await resp.json().catch(() => []);
  if (!Array.isArray(items)) return [];
  return items
    .map((item) => {
      const rawName = item.name ?? item.path?.split('/').pop();
      if (!rawName) return null;
      const isFolder = IS_HLX6_SITE ? rawName.endsWith('/') : !item.ext;
      return { name: isFolder ? rawName.replace(/\/$/, '') : rawName, isFolder };
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
 * Yields run folders (`/tests/pw-*`) whose newest run-marker is older than
 * minHours. Marker-only: a folder with no ageable `pw-run-*-marker` is skipped.
 */
export async function* listStaleRunFolders(page, authHeader, org, site, minHours) {
  const cutoff = Date.now() - (1000 * 60 * 60 * minHours);
  const folders = (await listChildren(page, authHeader, org, site, '/tests'))
    .filter((it) => it.isFolder && it.name.startsWith('pw-'));
  // eslint-disable-next-line no-restricted-syntax
  for (const folder of folders) {
    const folderPath = `/tests/${folder.name}`;
    // eslint-disable-next-line no-await-in-loop
    const children = await listChildren(page, authHeader, org, site, folderPath);
    const markerAges = children
      .filter((c) => c.name.startsWith('pw-run-') && c.name.endsWith('-marker'))
      .map((c) => getTestResourceAge(c.name))
      .filter((age) => age !== null);
    if (markerAges.length === 0) continue;
    const newest = Math.max(...markerAges);
    if (newest < cutoff) yield { path: folderPath, isFolder: true };
  }
}
