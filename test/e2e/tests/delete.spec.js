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
import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';
import { getTestResourceAge } from '../utils/page.js';

// Files are deleted after 2 hours by default
const MIN_HOURS = process.env.PW_DELETE_HOURS ? Number(process.env.PW_DELETE_HOURS) : 2;

// This test deletes old testing pages that are older than 2 hours
test('Delete multiple old pages', async ({ page }, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') {
    // only execute this test on chromium
    return;
  }

  console.log('Deleting test files that are older than', MIN_HOURS, 'hours');
  // The timeout for this test is long because it may take a while to delete all the files
  // that are left behind by previous test runs.
  test.setTimeout(600000);

  // Open the directory listing
  await page.goto(`${ENV}/#/da-sites/da-status/tests`);

  // Wait for the page to appear
  await page.waitForTimeout(1000);

  // This page will always be there as its used by a test
  await expect(page.getByText('pingtest'), 'Precondition').toBeVisible();

  // List the resources and check fot the ones that are to be deleted. These are always pages
  // created by the getTestPageURL() function in page.js
  const items = page.locator('.da-item-list-item');
  let itemsToDelete;
  for (let i = 0; i < await items.count(); i += 1) {
    const item = items.nth(i);
    const fileName = await item.innerText();
    console.log('Item', i, fileName, '-', getTestResourceAge(fileName));

    // This method checks if the page is a generated test page. If it is, it returns its age in ms.
    const age = getTestResourceAge(fileName);
    if (!age) {
      // eslint-disable-next-line no-continue
      continue;
    }
    const day = 1000 * 60 * 60 * MIN_HOURS;
    if (Date.now() - day < age) {
      console.log('Too new:', fileName);
      // eslint-disable-next-line no-continue
      continue;
    }

    // If we're here the page has to be deleted. We'll tick the checkbox next to it in the page
    const checkbox = page
      .locator('li').filter({ hasText: fileName, exact: true })
      .locator('input[type="checkbox"][name="item-selected"]').first();
    console.log('To be deleted, checked box:', await checkbox.count());
    await checkbox.focus();
    await page.keyboard.press(' ');
    itemsToDelete = true;
  }

  if (!itemsToDelete) {
    console.log('No items to delete');
    return;
  }

  // Hit the delete button
  await page.getByRole('button', { name: 'Delete' }).click();

  // Wait for the delete button to disappear which is when we're done
  await expect(page.getByRole('button', { name: 'Delete' })).not.toBeVisible({ timeout: 600000 });
});
