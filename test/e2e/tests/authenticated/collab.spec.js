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
import { getTestPageURL, fill, TEST_SITE } from '../../utils/page.js';

test('Collab cursors in multiple editors', async ({ browser, page, browserName }, workerInfo) => {
  // Open 2 editors on the same page and edit in both of them.
  // Ensure that the edits are visible to both and that the collab cursors are there
  // Also check that the cloud icon is visible for the collaborator

  test.setTimeout(60000);

  const pageURL = getTestPageURL('collab', workerInfo);

  // Capture the Bearer token that da-live's daFetch attaches to its backend
  // requests, so we can reuse the exact same Authorization header below.
  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });

  await page.goto(pageURL);
  await page.waitForTimeout(2000);
  await page.getByText('Create document', { exact: true }).click();
  await expect(page.getByLabel('Open profile menu')).toBeVisible();
  // Wait a little bit so that the collab awareness has caught up and knows that we are logged in as
  // 'DA Testuser'
  await page.waitForTimeout(2000);

  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  await page.waitForTimeout(3000);
  await fill(page, 'Entered by user 1');

  // Right now there should not be any collab indicators yet
  await expect(page.locator('div.collab-icon.collab-icon-user[data-popup-content="DA Testuser"]')).not.toBeVisible();
  await expect(page.locator('span.ProseMirror-yjs-cursor')).not.toBeVisible();

  // Open a new browser page with an empty storage state. which means its not logged in and
  // will have an anonymous user
  const page2 = await browser.newPage();
  await page2.goto(pageURL);

  // The following assertions have an extended timeout as they might cycle through the login screen
  // before the document is visible. The login screen doesn't need any input though, it will just
  // continue with the existing login
  await expect(page2.locator('div.ProseMirror')).toBeVisible();
  await expect(page2.locator('div.ProseMirror')).toContainText('Entered by user 1');

  // Click in the second window at the beginning of the edit control
  const editBox = await page2.locator('div.ProseMirror').boundingBox();
  await page2.mouse.click(editBox.x + 10, editBox.y + 10);
  await page2.keyboard.type('From user 2');

  // Give the collab cursors some cycles to appear
  await page.waitForTimeout(3000);

  // Wait for page2's edit to reach page1 — confirms YJS sync before checking collab state
  await expect(page.locator('div.ProseMirror')).toContainText('From user 2');

  // Check the little cloud icon for collaborators
  // as we use the same user for both pages, the cloud icon should be visible on both pages
  await expect(page.locator('div.collab-icon.collab-icon-user[data-popup-content="DA Testuser"]')).toBeVisible();
  await expect(page2.locator('div.collab-icon.collab-icon-user[data-popup-content="DA Testuser"]')).toBeVisible();

  // Check the cursor for collaborator
  await expect(page2.locator('span.ProseMirror-yjs-cursor')).toBeVisible();
  await expect(page2.locator('span.ProseMirror-yjs-cursor')).toContainText('DA Testuser');
  // Wait for user 1's cursor awareness to settle at the end of text so the two
  // text pieces are adjacent in innerText (cursor span between them breaks indexOf)
  await expect(page2.locator('div.ProseMirror')).toContainText('From user 2Entered by user 1');
  const text2 = await page2.locator('div.ProseMirror').innerText();
  const text2Idx = text2.indexOf('From user 2Entered by user 1');
  const cursor2Idx = text2.indexOf('DA Testuser');
  expect(text2Idx).toBeGreaterThanOrEqual(0);
  expect(cursor2Idx).toBeGreaterThanOrEqual(0);
  expect(cursor2Idx).toBeGreaterThan(text2Idx);
  // Check the cursor for collaborator, should be in a different location here
  await expect(page.locator('span.ProseMirror-yjs-cursor')).toBeVisible();
  await expect(page.locator('span.ProseMirror-yjs-cursor')).toContainText('DA Testuser');
  await expect(page.locator('div.ProseMirror')).toContainText('From user 2');
  await expect(page.locator('div.ProseMirror')).toContainText('Entered by user 1');

  const text = await page.locator('div.ProseMirror').innerText();
  const textIdx = text.indexOf('Entered by user 1');
  const textIdx2 = text.indexOf('From user 2');
  const cursorIdx = text.indexOf('DA Testuser');
  expect(textIdx).toBeGreaterThanOrEqual(0);
  expect(textIdx2).toBeGreaterThanOrEqual(0);
  expect(cursorIdx).toBeGreaterThanOrEqual(0);
  expect(cursorIdx).toBeLessThan(textIdx);
  expect(textIdx2).toBeLessThan(cursorIdx);

  // Wait for debounce to happen and changes to be saved
  await page.waitForTimeout(4000);

  // Check with the backend that the edits came through and are stored there.
  // Convert the editor URL (…#/<org>/<site>/<path>) into the da-admin/Helix source URL.
  const [, org, site, ...rest] = pageURL.split('#')[1].split('/');
  let sourceUrl;
  if (TEST_SITE === 'da-status') {
    sourceUrl = `https://admin.da.live/source/${org}/${site}/${rest.join('/')}.html`;
  } else {
    sourceUrl = `https://api.aem.live/${org}/sites/${site}/source/${rest.join('/')}.html`;
  }

  console.log('Checking backend at', sourceUrl);
  const resp = await page.request.get(sourceUrl, { headers: { Authorization: authHeader } });
  const body = await resp.text();

  const expected = '<main><div><p>From user 2Entered by user 1</p></div></main>';
  expect(body).toContain(expected);
});
