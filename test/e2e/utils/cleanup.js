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

function buildListUrl(org, site, path) {
  if (!IS_HLX6_SITE) return `${DA_ADMIN}/list/${org}/${site}${path}`;
  const slashed = path.endsWith('/') ? path : `${path}/`;
  return buildSourceUrl(org, site, slashed);
}

/**
 * Deletes a single test-created document or folder directly via the admin API,
 * bypassing the browse-view UI entirely
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

export async function listOldTestResources(page, authHeader, org, site, path, minHours) {
  const cutoff = Date.now() - (1000 * 60 * 60 * minHours);
  const stale = [];
  const listUrl = buildListUrl(org, site, path);
  let token;
  // Same 500-iteration safety cap as da-list.js's loadAllPages(), so a runaway
  // continuation token can't spin forever.
  for (let i = 0; i < 500; i += 1) {
    const headers = { Authorization: authHeader };
    if (IS_HLX6_SITE) headers['x-content-source-authorization'] = authHeader;
    if (token) headers['da-continuation-token'] = token;

    // eslint-disable-next-line no-await-in-loop
    const resp = await page.request.get(listUrl, { headers, failOnStatusCode: false });
    if (!resp.ok()) {
      // Surface this instead of quietly returning no stragglers - a failed list
      // call and an empty folder look identical to the caller otherwise.
      if (i === 0) console.warn(`listOldTestResources: list failed (${resp.status()}) for ${listUrl}`);
      break;
    }

    // eslint-disable-next-line no-await-in-loop
    const items = await resp.json().catch(() => []);
    if (Array.isArray(items)) {
      items.forEach((item) => {
        const rawName = item.name ?? item.path?.split('/').pop();
        if (!rawName) return;
        const isFolder = IS_HLX6_SITE ? rawName.endsWith('/') : !item.ext;
        const name = isFolder ? rawName.replace(/\/$/, '') : rawName;
        const age = getTestResourceAge(name);
        if (age && age < cutoff) stale.push({ path: `${path}/${name}`, isFolder });
      });
    }

    token = resp.headers()['da-continuation-token'];
    if (!token) break;
  }
  return stale;
}
