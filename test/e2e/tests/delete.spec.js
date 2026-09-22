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
import { test, expect } from '../utils/fixtures.js';
import ENV from '../utils/env.js';
import {
  getQuery, getTestPageURL, tabBackward, fill, TEST_ORG, TEST_SITE, RUN_FOLDER,
} from '../utils/page.js';
import { dismissAlertBanner } from '../utils/utils.js';

test('Empty out open editors on deleted documents', async ({ browser, page }, workerInfo) => {
  test.skip(TEST_SITE !== 'da-status', 'Empty out open editors on deleted documents doesn\'t work yet in Helix 6');
  test.setTimeout(60000);

  const url = getTestPageURL('delete', workerInfo);
  const pageName = url.split('/').pop();

  await page.goto(url);
  await page.getByText('Create document', { exact: true }).click();
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);

  const enteredText = `Some content entered at ${new Date()}`;
  await fill(page, enteredText);

  // Create a second window on the same document
  const page2 = await browser.newPage();
  await page2.goto(url);
  await expect(page2.locator('div.ProseMirror')).toContainText(enteredText);

  // Close the first window
  await page.close();

  const list = await browser.newPage();
  await list.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests/${RUN_FOLDER}`);

  await list.waitForTimeout(3000);
  await list.reload();

  // Now delete the document
  await expect(list.locator(`a[href="/edit#/${TEST_ORG}/${TEST_SITE}/tests/${RUN_FOLDER}/${pageName}"]`)).toBeVisible();
  await list.locator(`a[href="/edit#/${TEST_ORG}/${TEST_SITE}/tests/${RUN_FOLDER}/${pageName}"]`).focus();
  await tabBackward(list);
  await list.keyboard.press(' ');
  await list.waitForTimeout(500);
  await dismissAlertBanner(list);
  await list.locator('button.delete-button').filter({ visible: true }).click();

  // Give the modal a chance to open
  await list.waitForTimeout(1000);

  // Hit the delete confirmation button
  await list.locator('sl-button.negative').filter({ visible: true }).click();

  // The open window should be cleared out now
  await expect(page2.locator('div.ProseMirror')).not.toBeVisible();
});
