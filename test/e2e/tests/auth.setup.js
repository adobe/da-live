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
import { test as setup, expect } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../.playwright/.auth/user.json');

// This is executed once to authenticate the user used during the tests.
setup('Set up authentication', async ({ page }) => {
  const url = 'https://da.live';

  await page.goto(url);
  await page.getByRole('button', { name: 'Sign in' }).click();

  // The IMS sign in page needs a bit of time to load
  await page.waitForTimeout(1000);
  await page.getByLabel('Email address').fill('da-test@adobetest.com');
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await page.getByLabel('Password', { exact: true }).fill(process.env.TEST_PASSWORD);
  await page.getByLabel('Continue').click();
  await page.getByLabel('Foundation Internal').click();
  await expect(page.locator('a.nx-nav-brand')).toContainText('Document Authoring');

  await page.context().storageState({ path: authFile });
});
