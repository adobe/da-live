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

test('Basic Access Control', async ({ page }, workerInfo) => {
  const url = 'https://da.live/edit#/da-testautomation/acltest/testdocs/doc1';

  await page.goto(url);

  await expect(page.locator('div.ProseMirror')).toContainText('This is doc1');

  // This is a readonly document, so entering text should not work.
  // TODO check that you can't enter text.

  // This last part that obtains the ':before' part of the h1 only works on Chromium
  if (workerInfo.project.name !== 'chromium') {
    // only execute this test on chromium
    return;
  }

  // check the lock icon
  const h1 = page.locator('h1');
  const h1Before = await h1.evaluate((element) => window.getComputedStyle(element, ':before'));
  expect(h1Before.backgroundImage).toContain('LockClosed');
});
