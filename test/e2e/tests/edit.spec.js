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
import { getQuery, getTestPageURL, tabBackward, fill } from '../utils/page.js';

test('Update Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestPageURL('edit1', workerInfo);
  await page.goto(url);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);
  const enteredText = `[${workerInfo.project.name}] Edited by test ${new Date()}`;
  await fill(page, enteredText);

  // Wait for content to save before closing
  await page.waitForTimeout(3000);
  await page.close();

  const newPage = await browser.newPage();
  await newPage.goto(url);
  await expect(newPage.locator('div.ProseMirror')).toBeVisible();
  await expect(newPage.locator('div.ProseMirror')).toContainText(enteredText);
});

test('Create Delete Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestPageURL('edit2', workerInfo);
  const pageName = url.split('/').pop();

  await page.goto(`${ENV}/${getQuery()}#/da-sites/da-status/tests`);
  await page.locator('button.da-actions-new-button').click();
  await page.locator('button:text("Document")').click();
  await page.locator('input.da-actions-input').fill(pageName);

  await page.locator('button:text("Create document")').click();
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);
  await fill(page, 'testcontent');
  await page.waitForTimeout(1000);

  const newPage = await browser.newPage();
  await newPage.goto(`${ENV}/${getQuery()}#/da-sites/da-status/tests`);

  await newPage.waitForTimeout(3000);
  await newPage.reload();

  await expect(newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`)).toBeVisible();
  await newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`).focus();
  await tabBackward(newPage);
  await newPage.keyboard.press(' ');
  await newPage.waitForTimeout(500);
  await page.close(); // Close the original page to avoid it writing the content

  // There are 2 delete buttons, one on the Browse panel and another on the Search one
  // select the visible one.
  await newPage.locator('button.delete-button').locator('visible=true').click();

  await newPage.waitForTimeout(1000);
  /* TODO REMOVE once #233 is fixed */ await newPage.reload();
  await expect(newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`)).not.toBeVisible();
});

test('Change document by switching anchors', async ({ page }, workerInfo) => {
  test.setTimeout(60000);

  const url = getTestPageURL('edit3', workerInfo);
  const urlA = `${url}A`;
  const urlB = `${url}B`;

  await page.goto(urlA);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);

  await fill(page, 'before table');
  await page.getByText('Block', { exact: true }).click();
  await page.getByText('columns').dblclick();
  await page.keyboard.type('mytable');
  const dataCells = page.locator('div.ProseMirror table tr:nth-child(2) td');
  await dataCells.nth(0).click();
  await page.keyboard.press('k');
  await dataCells.nth(1).click();
  await page.keyboard.press('v');
  await page.getByText('Edit Block').click();
  await page.getByText('Insert row after').click();
  const newRowCells = page.locator('div.ProseMirror table tr:nth-child(3) td');
  await newRowCells.nth(0).click();
  await page.keyboard.type('k 2');
  await newRowCells.nth(1).click();
  await page.keyboard.type('v 2');
  await page.waitForTimeout(5000);

  await page.goto(urlB);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(3000);
  await fill(page, 'page B');
  // Verify the fill took effect locally before waiting for persistence
  await expect(page.locator('div.ProseMirror')).toContainText('page B');
  // Wait for Y.js to persist the content to the server
  await page.waitForTimeout(5000);

  await page.goto(urlA);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toContainText('mytable');
  await expect(page.locator('div.ProseMirror')).toContainText('k 2');
  await expect(page.locator('div.ProseMirror')).toContainText('v 2');

  await page.goto(urlB);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('div.ProseMirror')).toContainText('page B');
});

test('Add code mark', async ({ page }, workerInfo) => {
  test.setTimeout(30000);
  const url = getTestPageURL('edit5', workerInfo);
  await page.goto(url);
  const proseMirror = page.locator('div.ProseMirror');
  await proseMirror.waitFor();
  await expect(proseMirror).toBeVisible();
  await expect(proseMirror).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);
  await fill(page, 'This is a line that will contain a code mark.');

  // Forward
  for (let i = 0; i < 10; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.press('`');
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('`');
  // leave time for the code mark to be processed
  let codeElement = proseMirror.locator('code');
  await codeElement.waitFor();
  await expect(codeElement).toContainText('code');

  // Backward
  await fill(page, 'This is a line that will contain a code mark.');
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.press('`');
  await page.locator('div.ProseMirror').locator('code');
  for (let i = 0; i < 5; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.press('`');
  codeElement = proseMirror.locator('code');
  await codeElement.waitFor();
  await expect(codeElement).toContainText('code');

  // No Overwrite
  for (let i = 0; i < 6; i += 1) {
    await page.keyboard.press('ArrowLeft');
  }
  await page.keyboard.press('`');

  for (let i = 0; i < 11; i += 1) {
    await page.keyboard.press('ArrowRight');
  }
  await page.keyboard.press('`');
  await expect(proseMirror).toContainText('This is a line that will contain `a code mark`.');
});
