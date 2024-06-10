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
import { getTestPageURL } from '../utils/page.js';

test('Create Version and Restore from it', async ({ page }, workerInfo) => {
  // This test has a fairly high timeout because it waits for the document to be saved
  // a number of times
  test.setTimeout(30000);

  await page.goto(getTestPageURL('versions', workerInfo));
  await expect(page.locator('div.ProseMirror')).toBeVisible();

  // Enter some initial text onto the page
  await page.locator('div.ProseMirror').fill('Initial version');

  // Wait 3 secs to ensure its saved in da-admin
  await page.waitForTimeout(3000);

  // Add some more text
  await page.locator('div.ProseMirror').fill('Second version');
  await page.waitForTimeout(3000);

  // Create a new stored version called 'ver 1'
  await page.getByRole('button', { name: 'Versions' }).click();
  await page.locator('button.da-version-btn').click();
  await page.locator('input.da-version-new-input').fill('ver 1');
  await page.locator('input.da-version-new-input').press('Enter');

  // Close the versions panel and add some more text
  await page.locator('button.da-versions-close-btn').click();
  await page.locator('div.ProseMirror').fill('Some modifications');

  // Wait 3 secs to ensure its saved
  await page.waitForTimeout(3000);

  // And add some more text
  await page.locator('div.ProseMirror').fill('Some more modifications');
  // Wait 3 secs to ensure its saved
  await page.waitForTimeout(3000);

  // Reload the page and check that the latest changes are there
  await page.reload();
  await expect(page.locator('div.ProseMirror'))
    .toContainText('Some more modifications');

  // Open the versions panel again
  await page.getByRole('button', { name: 'Versions' }).click();

  // Check that there is an audit entry for the last edit (which we didn't)
  // expliticly create a version for.
  const audit = await page.locator('.da-version-entry.is-audit');
  await audit.click();
  await expect(audit).toContainText('anonymous');

  // Select 'ver 1' and restore it
  await page.getByText('ver 1', { exact: false }).click();
  await page.locator('li').filter({ hasText: 'ver 1' }).getByRole('button').click();
  await page.locator('div.da-version-action-area').getByText('Restore').click();

  // Ensure that the original text is still there
  await expect(page.locator('div.ProseMirror')).toContainText('Second version');
});
