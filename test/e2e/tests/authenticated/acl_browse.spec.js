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
import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getTestPageURL, getQuery, tabBackward, fill } from '../../utils/page.js';

test('Read-only directory', async ({ page }) => {
  const url = `${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir`;

  await page.goto(url);
  const newButton = page.getByRole('button', { name: 'New' });
  await expect(newButton).toBeDisabled();

  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/onlyread-doc"]')).toBeVisible();
  await page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/onlyread-doc"]').focus();

  await tabBackward(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(500);

  const tickbox = page.locator('da-list-item').filter({ hasText: 'onlyread-doc' }).locator('label');
  await expect(tickbox).toBeChecked();

  // There should not be a delete button
  await expect(page.locator('button.delete-button').locator('visible=true')).toHaveCount(0);
});

test('Read-write directory', async ({ browser, page }, workerInfo) => {
  test.setTimeout(60000);
  const pageURL = getTestPageURL('acl-browse-edt', workerInfo, '/da-testautomation/acltest/testdocs/subdir/subdir1');
  const pageName = pageURL.split('/').pop();
  const browseURL = pageURL.replace(`/${pageName}`, '').replace('/edit#/', '/#/');

  await page.goto(browseURL);
  const newButton = page.getByRole('button', { name: 'New' });
  await expect(newButton).toBeEnabled();
  await newButton.click();
  await page.locator('button:text("Document")').click();
  await page.locator('input.da-actions-input').fill(pageName);

  // Cannot just click the 'Create document' button because on Firefox that for some reason gets
  // overlaid with the 'sign out button', so just press 'space' on it.
  await page.locator('button:text("Create document")').press(' ');
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // The new page needs a moment to be ready
  await page.waitForTimeout(2000);
  await fill(page, 'test writable doc');
  await page.waitForTimeout(3000);

  const newPage = await browser.newPage();
  await newPage.goto(pageURL);
  // The following assertion has an extended timeout as it might cycle through the login screen
  // before the document is visible. The login screen doesn't need any input though, it will just
  // continue with the existing login
  await expect(newPage.locator('div.ProseMirror')).toContainText('test writable doc');
  newPage.close();

  await page.goto(browseURL);
  await expect(page.locator(`a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir1/${pageName}"]`)).toBeVisible();
  await page.locator(`a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir1/${pageName}"]`).focus();

  await tabBackward(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(500);

  const tickbox = page.locator('da-list-item').filter({ hasText: pageName }).locator('label');
  await expect(tickbox).toBeChecked();

  // There are 2 delete buttons, one on the Browse panel and another on the Search one
  // select the visible one.
  await page.locator('button.delete-button').locator('visible=true').click();

  await page.waitForTimeout(1000);

  await page.locator('sl-button.negative').locator('visible=true').click();

  await page.waitForTimeout(1000);

  await expect(page.locator(`a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir1/${pageName}"]`)).not.toBeVisible();
});

test('Readonly directory with writeable document', async ({ page }) => {
  const browseURL = `${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir/subdir2`;
  await page.goto(browseURL);

  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]')).toBeVisible();
  await page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]').focus();

  await tabBackward(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(500);

  // Check that the expected delete button is there (but don't click it)
  await expect(page.locator('button.delete-button').locator('visible=true')).toBeVisible();

  await page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]').click();
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toContainText('This is writeable-doc');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
});

test('No access directory should not show anything', async ({ page }) => {
  await page.goto(`${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir`);

  // In this directory we should be able to see files
  await expect(page.getByRole('button', { name: 'Name' })).toBeVisible();

  // In this directory we should be able to see nothing
  await page.goto(`${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs`);
  // We need to reload the page explicitly because the only thing we changed
  // was the anchor and that doesn't normally trigger a change
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible();
});
