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
import { getQuery, getTestFolderURL, getTestPageURL, fill } from '../utils/page.js';

test('Copy and Rename with Versioned document', async ({ page }, workerInfo) => {
  // This test has a fairly high timeout because it waits for the document to be saved
  // a number of times
  test.setTimeout(60000);

  const pageURL = getTestPageURL('copyrename', workerInfo);
  const orgPageName = pageURL.split('/').pop();
  await page.goto(pageURL);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);

  // Enter some initial text onto the page
  await fill(page, 'First text');

  // Wait to ensure its saved in da-admin
  await page.waitForTimeout(5000);

  // Add some more text
  await fill(page, 'Versioned text');
  await page.waitForTimeout(5000);

  // Create a new stored version called 'myver'
  await page.getByRole('button', { name: 'Versions' }).click();
  await page.locator('button.da-version-btn', { hasText: 'Create' }).click();
  await page.locator('input.da-version-new-input').fill('myver');
  await page.locator('input.da-version-new-input').press('Enter');
  await page.waitForTimeout(3000);
  await expect(page.getByText('myver', { exact: false })).toBeVisible();

  // Add some more text
  await fill(page, 'After versioned');
  await page.waitForTimeout(5000);

  // Go back to the directory view
  await page.goto(`${ENV}/${getQuery()}#/da-sites/da-status/tests`);

  const copyFolderURL = getTestFolderURL('copy', workerInfo);
  const copyFolderName = copyFolderURL.split('/').pop();
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: 'Folder' }).click();
  await page.locator('input.da-actions-input').fill(copyFolderName);
  await page.locator('input.da-actions-input').press('Enter');

  const cpCheckbox = page.locator('div.da-item-list-item-inner').filter({ hasText: orgPageName })
    .locator('input[type="checkbox"][name="item-selected"]');
  await cpCheckbox.focus();
  await page.keyboard.press(' ');
  await page.getByRole('button', { name: 'Copy' }).click();

  await page.getByRole('link', { name: copyFolderName }).click();
  await page.waitForURL(`**/da-sites/da-status/tests/${copyFolderName}`);

  await page.getByRole('button', { name: 'Paste' }).click();
  await page.waitForTimeout(3000);
  /* TODO REMOVE once #233 is fixed */ await page.reload();
  const link = await page.getByRole('link', { name: orgPageName });
  const href = await link.getAttribute('href');
  await expect(href).toEqual(`/edit#/da-sites/da-status/tests/${copyFolderName}/${orgPageName}`);

  // go back to the original to rename it
  // Go to the directory view
  await page.goto(`${ENV}/${getQuery()}#/da-sites/da-status/tests`);
  await page.reload(); // Clears any leftover selection, if any

  const checkbox = page.locator('div.da-item-list-item-inner').filter({ hasText: orgPageName })
    .locator('input[type="checkbox"][name="item-selected"]');
  await checkbox.focus();
  await page.keyboard.press(' ');

  // Hit the rename button
  const renPageName = `${orgPageName}ren`;
  await page.getByRole('button', { name: 'Rename' }).click();
  await page.locator(`input[value=${orgPageName}]`).fill(renPageName);
  await page.keyboard.press('Enter');

  // Open the renamed page
  await page.waitForTimeout(3000);
  await page.goto(`${pageURL}ren`);

  await expect(page.locator('div.ProseMirror')).toContainText('After versioned');
  await page.getByRole('button', { name: 'Versions' }).click();
  await page.getByText('myver', { exact: false }).click();
  await page.waitForTimeout(500);
  const myverButton = page.locator('li').filter({ hasText: 'myver' }).getByRole('button');
  await expect(myverButton).toBeVisible();
  await myverButton.click();
  await page.locator('div.da-version-action-area').getByText('Restore').click();

  // Wait for the version preview to dismiss before checking editor content
  await expect(page.locator('div.da-version-action-area')).not.toBeVisible();

  // Ensure that the restored version text is there
  await expect(page.locator('div.ProseMirror')).toContainText('Versioned text');

  // now go to the copy
  await page.goto(`${ENV}/edit${getQuery()}#/da-sites/da-status/tests/${copyFolderName}/${orgPageName}`);
  await page.reload(); // Resets the versions view, shouldn't be needed TODO
  await expect(page.locator('div.ProseMirror')).toContainText('After versioned');
  await page.getByRole('button', { name: 'Versions' }).click();
  await expect(page.getByText('Now')).toBeVisible();
  await expect(page.getByText('myver')).not.toBeVisible(); // The version shouldn't be there on the copy
});
