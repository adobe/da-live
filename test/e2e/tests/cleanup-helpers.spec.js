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
import { createResource, MARKER_DOC } from '../utils/cleanup.js';

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
  expect(record.url).toContain('/source/da-sites/da-status/tests/pw-main/pw-run-x-marker.html');
  expect(record.opts.headers.Authorization).toBe('Bearer abc');
});

test('MARKER_DOC embeds run metadata in a valid body', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const doc = MARKER_DOC('collabfx', 'deadbeef', '2026-09-08T00:00:00.000Z');
  expect(doc).toContain('collabfx');
  expect(doc).toContain('deadbeef');
  expect(doc).toContain('<main>');
});
