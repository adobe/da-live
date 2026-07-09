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
import { getTestPageURL, getQuery, tabBackward, fill, TEST_SITE } from '../../utils/page.js';

test('Read-only directory', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
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
  await expect(page.locator('button.delete-button').filter({ visible: true })).toHaveCount(0);
});

test('Read-write directory', async ({ browser, page }, workerInfo) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  test.setTimeout(60000);
  const pageURL = getTestPageURL('acl-browse-edt', workerInfo, '/da-testautomation/acltest/testdocs/subdir/subdir1');
  const pageName = pageURL.split('/').pop();
  const browseURL = pageURL.replace(`/${pageName}`, '').replace('/edit#/', '/#/');

  await page.goto(browseURL);
  const newButton = page.getByRole('button', { name: 'New' });
  await expect(newButton).toBeEnabled();
  await newButton.click({ force: true });
  await page.getByRole('menuitem', { name: 'Document' }).click();
  await page.getByPlaceholder('document name').fill(pageName);
  await page.getByRole('button', { name: 'Create' }).click();
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
  await page.locator('button.delete-button').filter({ visible: true }).click();

  await page.waitForTimeout(1000);

  await page.locator('sl-button.negative').filter({ visible: true }).click();

  await page.waitForTimeout(1000);

  await expect(page.locator(`a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir1/${pageName}"]`)).not.toBeVisible();
});

test('Readonly directory with writeable document', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  const browseURL = `${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir/subdir2`;
  await page.goto(browseURL);

  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]')).toBeVisible();
  await page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]').focus();

  await tabBackward(page);
  await page.keyboard.press(' ');
  await page.waitForTimeout(500);

  // Check that the expected delete button is there (but don't click it)
  await expect(page.locator('button.delete-button').filter({ visible: true })).toBeVisible();

  await page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/subdir/subdir2/writeable-doc"]').click();
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toContainText('This is writeable-doc');
  await expect(editor).toHaveAttribute('contenteditable', 'true');
});

test('Ancestor directory shows only permitted descendants', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  await page.goto(`${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir`);

  // In this directory we should be able to see files
  await expect(page.getByRole('button', { name: 'Name' })).toBeVisible();

  // `testdocs` itself has no direct grant, but the user has permission on
  // several descendants (readwrite-doc, readonly-doc, subdir/**, dir-readwrite/**,
  // dir-readonly/**), so listing it should now succeed and be filtered to just
  // those, per adobe/da-admin#299.
  await page.goto(`${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs`);
  // We need to reload the page explicitly because the only thing we changed
  // was the anchor and that doesn't normally trigger a change
  await page.reload();

  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/readwrite-doc"]')).toBeVisible();
  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/readonly-doc"]')).toBeVisible();
  await expect(page.locator('a[href="#/da-testautomation/acltest/testdocs/subdir"]')).toBeVisible();
  await expect(page.locator('a[href="#/da-testautomation/acltest/testdocs/dir-readwrite"]')).toBeVisible();
  await expect(page.locator('a[href="#/da-testautomation/acltest/testdocs/dir-readonly"]')).toBeVisible();

  // noaccess-doc requires DA-Nonexist, which the test user is not a member of
  await expect(page.locator('a[href="/edit#/da-testautomation/acltest/testdocs/noaccess-doc"]')).not.toBeVisible();
});

test('No access directory should not show anything', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');

  // `otherdir` sits outside the `testdocs` tree and has no ACL grant on it or
  // any descendant, so unlike `testdocs` above it has no permitted descendant
  // to fall back on and listing it must still be blocked (see auth.setup.js).
  await page.goto(`${ENV}/${getQuery()}#/da-testautomation/acltest/otherdir`);
  // We need to reload the page explicitly because the only thing we changed
  // was the anchor and that doesn't normally trigger a change
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible();
});
