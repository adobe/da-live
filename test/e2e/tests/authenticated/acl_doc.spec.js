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

test('Read-only document directly configured', async ({ page }, workerInfo) => {
  const url = 'https://da.live/edit#/da-testautomation/acltest/testdocs/doc_readonly';

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('This is doc_readonly');
  await expect(editor, 'Should be readonly').toHaveAttribute('contenteditable', 'false');

  await editor.pressSequentially('Hello');
  await expect(editor, 'The text should not have been updated since its a readonly doc')
    .toHaveText('This is doc_readonly');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).toContain('LockClosed');
});

test('Read-only document indirectly configured', async ({ page }, workerInfo) => {
  const url = 'https://da.live/edit#/da-testautomation/acltest/testdocs/subdir/doc_onlyread';

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('This is doc_onlyread');
  await expect(editor, 'Should be readonly').toHaveAttribute('contenteditable', 'false');

  await editor.pressSequentially('Hello');
  await expect(editor, 'The text should not have been updated since its a readonly doc')
    .toHaveText('This is doc_onlyread');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).toContain('LockClosed');
});

test('Read-write document', async ({ page }, workerInfo) => {
  const url = 'https://da.live/edit#/da-testautomation/acltest/testdocs/doc_readwrite';

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toContainText('This is doc_readwrite');
  await expect(editor, 'Should be editable').toHaveAttribute('contenteditable', 'true');

  // This last part of this test that obtains the ':before' part of the h1
  // apparently only works on Chromium, so skip it for other browsers
  if (workerInfo.project.name !== 'chromium') {
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).not.toContain('LockClosed');
});

test('No access at all', async ({ page }) => {
  const url = 'https://da.live/edit#/da-testautomation/acltest/testdocs/doc_noaccess';

  await page.goto(url);

  await expect(page.locator('h1')).toContainText('doc_noaccess');
  await expect(page.locator('div.ProseMirror'), 'Nothing should be visible').toHaveCount(0);
});
