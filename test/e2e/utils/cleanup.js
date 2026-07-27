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
// (test.skip(TEST_SITE !== 'da-status', ...)). Helix 6 has no `list` API, so
// listOldTestResources() is a no-op there.
const IS_HLX6_SITE = TEST_SITE !== 'da-status';

/**
 * Parses a URL produced by getTestPageURL()/getTestFolderURL() into its
 * org/site/path parts. Mirrors the inline parsing in collab.spec.js.
 *
 * @param {string} url
 * @returns {{ org: string, site: string, path: string }}
 */
export function parseTestUrl(url) {
  const [, org, site, ...rest] = url.split('#')[1].split('/');
  return { org, site, path: `/${rest.join('/')}` };
}

function buildSourceUrl(org, site, path) {
  return IS_HLX6_SITE
    ? `${AEM_API}/${org}/sites/${site}/source${path}`
    : `${DA_ADMIN}/source/${org}/${site}${path}`;
}

/**
 * Deletes a single test-created document or folder directly via the admin API,
 * bypassing the browse-view UI entirely (see delete.spec.js history for why:
 * driving the UI here previously interacted badly with da-list's infinite-scroll
 * pagination once the backlog grew large).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} authHeader - `Bearer <token>`, e.g. captured from an authenticated
 *   in-app request (same technique collab.spec.js uses).
 * @param {string} org
 * @param {string} site
 * @param {string} path - e.g. `/tests/pw-edit1-abc123-chromium`
 * @param {{ isFolder?: boolean }} [opts]
 */
export async function deleteResource(page, authHeader, org, site, path, opts = {}) {
  const resourcePath = opts.isFolder ? `${path.replace(/\/$/, '')}/` : `${path}.html`;
  const url = buildSourceUrl(org, site, resourcePath);
  const headers = { Authorization: authHeader };
  if (IS_HLX6_SITE) headers['x-content-source-authorization'] = authHeader;
  await page.request.delete(url, { headers, failOnStatusCode: false });
}

/**
 * Lists test-generated resources under `path` that are older than `minHours`,
 * for the lightweight safety-net sweep (delete.spec.js). Legacy-DA only: Helix 6
 * has no `list` API, so this returns an empty array there, matching the
 * `test.skip(TEST_SITE !== 'da-status', ...)` convention used elsewhere.
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} authHeader
 * @param {string} org
 * @param {string} site
 * @param {string} path
 * @param {number} minHours
 * @returns {Promise<string[]>} paths (relative to org/site) safe to pass to deleteResource
 */
export async function listOldTestResources(page, authHeader, org, site, path, minHours) {
  if (IS_HLX6_SITE) return [];

  const cutoff = Date.now() - (1000 * 60 * 60 * minHours);
  const stale = [];
  let token;
  // Same 500-iteration safety cap as da-list.js's loadAllPages(), so a runaway
  // continuation token can't spin forever.
  for (let i = 0; i < 500; i += 1) {
    const headers = { Authorization: authHeader };
    if (token) headers['da-continuation-token'] = token;

    // eslint-disable-next-line no-await-in-loop
    const resp = await page.request.get(`${DA_ADMIN}/list/${org}/${site}${path}`, { headers, failOnStatusCode: false });
    if (!resp.ok()) break;

    // eslint-disable-next-line no-await-in-loop
    const items = await resp.json().catch(() => []);
    if (Array.isArray(items)) {
      items.forEach((item) => {
        const name = item.name ?? item.path?.split('/').pop();
        const age = getTestResourceAge(name);
        if (age && age < cutoff) stale.push(`${path}/${name}`);
      });
    }

    token = resp.headers()['da-continuation-token'];
    if (!token) break;
  }
  return stale;
}
