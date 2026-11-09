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
import { getQuery, TEST_SITE } from '../../utils/page.js';
import { expectNotPermittedOpensProfile, forceForbidden } from '../../utils/utils.js';

test('Read-only document directly configured', async ({ page }, workerInfo) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/readonly-doc`;

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('This is readonly-doc');
  await expect(editor, 'Should be readonly').toHaveAttribute('contenteditable', 'false');

  await editor.pressSequentially('Hello');
  await expect(editor, 'The text should not have been updated since its a readonly doc')
    .toHaveText('This is readonly-doc');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).toContain('S2_Icon_Lock_20_N');
});

test('Read-only document indirectly configured', async ({ page }, workerInfo) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/subdir/onlyread-doc`;

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('This is onlyread-doc');
  await expect(editor, 'Should be readonly').toHaveAttribute('contenteditable', 'false');

  await editor.pressSequentially('Hello');
  await expect(editor, 'The text should not have been updated since its a readonly doc')
    .toHaveText('This is onlyread-doc');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).toContain('S2_Icon_Lock_20_N');
});

test('Read-write document', async ({ page }, workerInfo) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/readwrite-doc`;

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toContainText('This is readwrite-doc');
  await expect(editor, 'Should be editable').toHaveAttribute('contenteditable', 'true');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).not.toContain('S2_Icon_Lock_20_N');
});

test('No access at all', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/noaccess-doc`;

  await page.goto(url);

  await expect(page.locator('h1')).toContainText('noaccess-doc');
  await expect(page.locator('div.ProseMirror'), 'Nothing should be visible').toHaveCount(0);
  await expectNotPermittedOpensProfile(page, expect);
});

test('Not permitted document recovers after switching to an authorized org', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'ACLs are not yet supported for Helix 6');

  // The test user only belongs to one org, so simulate "signed into the wrong
  // org" by forcing a 403 on a document the user can actually read.
  const sourceUrl = /\/source\/da-testautomation\/acltest\/testdocs\/readonly-doc(\.html)?(\?|$)/;
  const restore = await forceForbidden(page, sourceUrl);

  await page.goto(`${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/readonly-doc`);
  await expect(page.locator('div.ProseMirror')).toHaveCount(0);
  await expectNotPermittedOpensProfile(page, expect);

  // Switching org in the profile menu reloads the page with the new token.
  await restore();
  await page.reload();

  await expect(page.locator('div.ProseMirror')).toHaveText('This is readonly-doc');
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toHaveCount(0);
});
