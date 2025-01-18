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

test('Collab cursors in multiple editors', async ({ browser, page }, workerInfo) => {
  // Open 2 editors on the same page and edit in both of them
  // Ensure that the edits are visible to both and that the collab cursors are there
  // Also check that the cloud icon is visible for the collaborator

  const pageURL = getTestPageURL('collab', workerInfo);

  await page.goto(pageURL);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await page.locator('div.ProseMirror').fill('Entered by user 1');

  // Right now there should not be any collab indicators yet
  await expect(page.locator('div.collab-icon.collab-icon-user[data-popup-content="Anonymous"]')).not.toBeVisible();
  await expect(page.locator('span.ProseMirror-yjs-cursor')).not.toBeVisible();

  const page2 = await browser.newPage();
  await page2.goto(pageURL);
  await expect(page2.locator('div.ProseMirror')).toBeVisible();
  await expect(page2.locator('div.ProseMirror')).toContainText('Entered by user 1');

  // Click in the second window at the beginning of the edit control
  const editBox = await page2.locator('div.ProseMirror').boundingBox();
  await page2.mouse.click(editBox.x + 10, editBox.y + 10);
  await page2.keyboard.type('From user 2');

  // Check the little cloud icon for collaborators
  await expect(page2.locator('div.collab-icon.collab-icon-user[data-popup-content="Anonymous"]')).toBeVisible();

  // Check the cursor for collaborator
  await expect(page2.locator('span.ProseMirror-yjs-cursor')).toBeVisible();
  await expect(page2.locator('span.ProseMirror-yjs-cursor')).toContainText('Anonymous');
  const text2 = await page2.locator('div.ProseMirror').innerText();
  const text2Idx = text2.indexOf('From user 2Entered by user 1');
  const cursor2Idx = text2.indexOf('Anonymous');
  expect(text2Idx).toBeGreaterThanOrEqual(0);
  expect(cursor2Idx).toBeGreaterThanOrEqual(0);
  expect(cursor2Idx).toBeGreaterThan(text2Idx);

  await page.waitForTimeout(3000);

  // Check the little cloud icon for collaborators
  await expect(page.locator('div.collab-icon.collab-icon-user[data-popup-content="Anonymous"]')).toBeVisible();

  // Check the cursor for collaborator, should be in a different location here
  await expect(page.locator('span.ProseMirror-yjs-cursor')).toBeVisible();
  await expect(page.locator('span.ProseMirror-yjs-cursor')).toContainText('Anonymous');
  await expect(page.locator('div.ProseMirror')).toContainText('From user 2');
  await expect(page.locator('div.ProseMirror')).toContainText('Entered by user 1');

  const text = await page.locator('div.ProseMirror').innerText();
  const textIdx = text.indexOf('Entered by user 1');
  const textIdx2 = text.indexOf('From user 2');
  const cursorIdx = text.indexOf('Anonymous');
  expect(textIdx).toBeGreaterThanOrEqual(0);
  expect(textIdx2).toBeGreaterThanOrEqual(0);
  expect(cursorIdx).toBeGreaterThanOrEqual(0);
  expect(cursorIdx).toBeLessThan(textIdx);
  expect(textIdx2).toBeLessThan(cursorIdx);
});
