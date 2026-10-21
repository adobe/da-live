/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import fs from 'fs';
import path from 'path';
import { test as setup, expect } from '@playwright/test';
import ENV, { TEST_ORG, TEST_SITE, RUN_FOLDER } from '../utils/env.js';
import { getQuery } from '../utils/page.js';
import { deleteResource, createResource, MARKER_DOC } from '../utils/cleanup.js';

const AUTH_FILE = path.join(__dirname, '../.playwright/.auth/user.json');

/*
The ACL tests require to be logged in, which is what this setup does.
It is assumed to be configured as follows, where the current est user is in IMS org
907136ED5D35CBF50A495CD4 and in its group DA-Test BUT NOT iN DA-Nonexist.

The configuration in https://da.live/config#/da-testautomation/ should be as follows:

  path groups actions
  /acltest/testdocs/readwrite-doc 907136ED5D35CBF50A495CD4/DA-Test write
  /acltest/testdocs/readonly-doc 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/noaccess-doc 907136ED5D35CBF50A495CD4/DA-Nonexist write
  /acltest/testdocs/subdir/+** 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/subdir/subdir2/** 907136ED5D35CBF50A495CD4 write
  /acltest/testdocs/subdir/subdir1/+** 907136ED5D35CBF50A495CD4 write
  /acltest/testdocs/subdir/subdir2/subdir3 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/dir-readwrite/+** 907136ED5D35CBF50A495CD4/DA-Test write
  /acltest/testdocs/dir-readonly/+** 907136ED5D35CBF50A495CD4/DA-Test read

`/acltest/otherdir` must NOT have any rule on it or any descendant (no row
above should match it or anything below it). It is used to verify that a
folder with no permitted descendant anywhere is still blocked with 403,
now that adobe/da-admin#299 lets ancestors of a permitted path (like
`testdocs` above) list successfully.
*/

// This is executed once to authenticate the user used during the tests.
setup('Set up authentication', async ({ page }) => {
  const pwd = process.env.TEST_PASSWORD;
  if (pwd) {
    console.log('Password found in environment variable TEST_PASSWORD');
  } else {
    throw new Error('Password for authentication needed in environment variable TEST_PASSWORD');
  }

  if (fs.existsSync(AUTH_FILE)) {
    await fs.promises.unlink(AUTH_FILE);
    console.log('Deleted previous storage stage auth file');
  }

  if (process.env.SKIP_AUTH) {
    await fs.promises.writeFile(AUTH_FILE, '{}');
    console.log('Skipping authentication');
    return;
  }

  const url = ENV;

  await page.goto(url);

  const signInButton = page.getByRole('button', { name: 'Sign in' });
  await signInButton.waitFor();

  await fs.promises.mkdir(path.join(__dirname, '../.playwright/shots'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '../.playwright/shots/auth-before.png') });

  await signInButton.click();

  // The IMS sign in page needs a bit of time to load
  await page.waitForTimeout(3000);

  const emailInput = page.getByLabel('Email address');
  await emailInput.waitFor();
  await emailInput.fill('da-test@adobetest.com');

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor();
  await continueButton.click();

  const passwordInput = page.getByLabel(/^(continue with )?password$/i);
  await passwordInput.waitFor();
  await passwordInput.evaluate((el, password) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, password);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, pwd);
  console.log('Entered password');
  await page.locator('button[aria-label="Continue"]').click();

  const foundationInternal = page.getByLabel('Foundation Internal');
  await foundationInternal.waitFor();
  await foundationInternal.click();

  const authorLink = page.locator('a.brand-area');
  await authorLink.waitFor();
  await expect(authorLink).toBeVisible();

  await page.context().storageState({ path: AUTH_FILE });

  // Capture an admin bearer from a live request, then reset this run's folder.
  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`);
  await expect.poll(() => authHeader, { timeout: 15000 }).toBeTruthy();

  const folderPath = `/tests/${RUN_FOLDER}`;
  // Wipe leftovers from any prior (possibly crashed) run of this branch.
  const delResp = await deleteResource(page, authHeader, TEST_ORG, TEST_SITE, folderPath, { isFolder: true });
  if (!delResp.ok() && delResp.status() !== 404) {
    throw new Error(`Setup: failed to reset ${folderPath} (${delResp.status()})`);
  }

  const ts = Date.now().toString(36);
  const marker = `${folderPath}/pw-run-${ts}-marker`;
  const body = MARKER_DOC(RUN_FOLDER.replace(/^pw-/, ''), process.env.GITHUB_SHA ?? 'local', new Date().toISOString());
  const markerResp = await createResource(page, authHeader, TEST_ORG, TEST_SITE, marker, body);
  expect(markerResp.ok(), `Setup: failed to create run marker (${markerResp.status()})`).toBeTruthy();
});
