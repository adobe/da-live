/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { test, expect } from '../utils/fixtures.js';
import ENV, { TEST_ORG, TEST_SITE } from '../utils/env.js';
import { getQuery } from '../utils/page.js';
import { dismissAlertBanner } from '../utils/utils.js';
import { listStaleRunFolders, deleteResource, mapWithConcurrency, DELETE_CONCURRENCY } from '../utils/cleanup.js';

// Files are deleted after 2 hours by default
const MIN_HOURS = process.env.PW_DELETE_HOURS ? Number(process.env.PW_DELETE_HOURS) : 2;

// Runs only in the 'sweeper' project (scheduled cleanup.yml via test:cleanup),
// never in the normal suite - reclaims stale pw-* run folders from past runs.
test('Delete multiple old pages', async ({ page }) => {
  test.skip(!!process.env.SKIP_AUTH, 'No backend under SKIP_AUTH');
  test.setTimeout(5 * 60 * 1000);

  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });

  console.log('Deleting test files that are older than', MIN_HOURS, 'hours');

  // Open the directory listing, just to obtain an authenticated request to capture
  // the auth header from - no further UI interaction happens after this.
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`);
  await expect.poll(() => authHeader, { timeout: 15000 }).toBeTruthy();
  await dismissAlertBanner(page);

  const stale = listStaleRunFolders(page, authHeader, TEST_ORG, TEST_SITE, MIN_HOURS);
  let deletedCount = 0;
  try {
    await mapWithConcurrency(stale, DELETE_CONCURRENCY, async ({ path, isFolder }) => {
      await deleteResource(page, authHeader, TEST_ORG, TEST_SITE, path, { isFolder });
      deletedCount += 1;
    });
  } finally {
    console.log(deletedCount ? `Deleted ${deletedCount} stale run folders` : 'No stale run folders to delete');
  }
});
