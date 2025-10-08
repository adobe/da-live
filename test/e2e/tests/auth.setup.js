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
import ENV from '../utils/env.js';

const AUTH_FILE = path.join(__dirname, '../.playwright/.auth/user.json');

/*
The ACL tests require to be logged in, which is what this setup does.
It is assumed to be configured as follows, where the current est user is in IMS org
907136ED5D35CBF50A495CD4 and in its group DA-Test BUT NOT iN DA-Nonexist.

The configuration in https://da.live/config#/da-testautomation/ should be as follows:

  path groups actions
  /acltest/testdocs/doc_readwrite 907136ED5D35CBF50A495CD4/DA-Test write
  /acltest/testdocs/doc_readonly 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/doc_noaccess 907136ED5D35CBF50A495CD4/DA-Nonexist write
  /acltest/testdocs/subdir/+** 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/subdir/subdir2/** 907136ED5D35CBF50A495CD4 write
  /acltest/testdocs/subdir/subdir1/+** 907136ED5D35CBF50A495CD4 write
  /acltest/testdocs/subdir/subdir2/subdir3 907136ED5D35CBF50A495CD4 read
  /acltest/testdocs/dir-readwrite/+** 907136ED5D35CBF50A495CD4/DA-Test write
  /acltest/testdocs/dir-readonly/+** 907136ED5D35CBF50A495CD4/DA-Test read
*/

// This is executed once to authenticate the user used during the tests.
setup('Set up authentication', async ({ page }) => {
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
  await page.waitForTimeout(3000);

  await fs.promises.mkdir(path.join(__dirname, '../.playwright/shots'), { recursive: true });
  await page.screenshot({ path: path.join(__dirname, '../.playwright/shots/auth-before.png') });
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The IMS sign in page needs a bit of time to load
  await page.waitForTimeout(1000);
  const pwd = process.env.TEST_PASSWORD;
  if (pwd) {
    console.log('Password found in environment variable TEST_PASSWORD');
  } else {
    throw new Error('Password for authentication needed in environment variable TEST_PASSWORD');
  }
  await page.getByLabel('Email address').fill('da-test@adobetest.com');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(pwd);
  console.log('Entered password');
  await page.locator('button[aria-label="Continue"]').click();
  await page.getByLabel('Foundation Internal').click();
  await expect(page.locator('a.nx-nav-brand')).toContainText('Author');

  await page.context().storageState({ path: AUTH_FILE });
});
