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
import { test, expect } from '../utils/fixtures.js';
import ENV, { TEST_ORG, TEST_SITE, RUN_FOLDER } from '../utils/env.js';
import { getQuery } from '../utils/page.js';
import { deleteResource } from '../utils/cleanup.js';
import { dismissAlertBanner } from '../utils/utils.js';

// Runs only in the 'cleanup' teardown project (see playwright.config.js), once
// at the very end of the suite.
test('Delete this run folder', async ({ page }) => {
  test.skip(!!process.env.SKIP_AUTH, 'No backend under SKIP_AUTH');
  test.setTimeout(60000);

  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });

  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`);
  await dismissAlertBanner(page);
  await expect.poll(() => authHeader, { timeout: 15000 }).toBeTruthy();

  const resp = await deleteResource(page, authHeader, TEST_ORG, TEST_SITE, `/tests/${RUN_FOLDER}`, { isFolder: true });
  if (!resp.ok() && resp.status() !== 404) {
    console.warn(`Teardown: failed to delete /tests/${RUN_FOLDER} (${resp.status()}) — sweeper will reclaim it`);
  }
  console.log(`Teardown deleted /tests/${RUN_FOLDER} -> ${resp.status()}`);
});
