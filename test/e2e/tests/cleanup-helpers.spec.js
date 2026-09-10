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
import { test, expect } from '@playwright/test';
import { createResource, MARKER_DOC, listStaleRunFolders } from '../utils/cleanup.js';

function fakePage(record) {
  return {
    request: {
      post: async (url, opts) => { record.url = url; record.opts = opts; return { ok: () => true, status: () => 200 }; },
    },
  };
}

test('createResource posts an .html page with auth', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const record = {};
  await createResource(fakePage(record), 'Bearer abc', 'da-sites', 'da-status', '/tests/pw-main/pw-run-x-marker', 'BODY');
  // Backend-agnostic: da-admin and hlx6 place org/site differently, but both
  // carry the org, the site, and the .html-suffixed path tail.
  expect(record.url).toContain('da-sites');
  expect(record.url).toContain('da-status');
  expect(record.url).toContain('tests/pw-main/pw-run-x-marker.html');
  expect(record.opts.headers.Authorization).toBe('Bearer abc');
});

test('MARKER_DOC embeds run metadata in a valid body', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const doc = MARKER_DOC('collabfx', 'deadbeef', '2026-09-08T00:00:00.000Z');
  expect(doc).toContain('collabfx');
  expect(doc).toContain('deadbeef');
  expect(doc).toContain('<main>');
});

// Fake list backend: first call returns the /tests listing, subsequent calls
// return each folder's children keyed by URL substring.
function fakeListPage(byPath) {
  return {
    request: {
      get: async (url) => {
        // Sort by longest key first: /tests is a substring of /tests/pw-* paths, so we need specific match.
        const matchingKeys = Object.keys(byPath).filter((k) => url.includes(k));
        const key = matchingKeys.length > 0 ? matchingKeys.sort((a, b) => b.length - a.length)[0] : null;
        const items = key ? byPath[key] : [];
        return { ok: () => true, status: () => 200, json: async () => items, headers: () => ({}) };
      },
    },
  };
}

test('listStaleRunFolders yields only pw- folders with an old marker', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const oldTs = (Date.now() - 3 * 60 * 60 * 1000).toString(36); // 3h ago
  const newTs = Date.now().toString(36);
  // Keys are backend-agnostic path substrings (the list URL differs per
  // backend). Fixtures use the hlx6 list shape (folders end with '/', files
  // carry their extension), which listChildren also resolves correctly for
  // da-admin, so this test passes under both TEST_SITE configs.
  const page = fakeListPage({
    tests: [
      { name: 'pw-main/', ext: undefined },
      { name: 'pw-collabfx/', ext: undefined },
      { name: 'pw-stale/', ext: undefined },
      { name: 'realpage.html', ext: 'html' },
    ],
    'tests/pw-main': [{ name: `pw-run-${oldTs}-marker.html`, ext: 'html' }],
    'tests/pw-collabfx': [{ name: `pw-run-${newTs}-marker.html`, ext: 'html' }],
    'tests/pw-stale': [{ name: 'pw-edit1-abc-chromium.html', ext: 'html' }],
  });
  const out = [];
  for await (const f of listStaleRunFolders(page, 'Bearer x', 'da-sites', 'da-status', 2)) out.push(f);
  expect(out).toEqual([{ path: '/tests/pw-main', isFolder: true }]);
});
