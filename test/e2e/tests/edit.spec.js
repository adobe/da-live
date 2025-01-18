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
import { getTestPageURL } from '../utils/page.js';

test('Update Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestPageURL('edit1', workerInfo);
  await page.goto(url);
  await expect(page.locator('div.ProseMirror')).toBeVisible();

  await page.waitForTimeout(3000);
  const enteredText = `[${workerInfo.project.name}] Edited by test ${new Date()}`;
  await page.locator('div.ProseMirror').fill(enteredText);

  await page.waitForTimeout(3000);
  await page.close();

  const newPage = await browser.newPage();
  await newPage.goto(url);
  await newPage.waitForTimeout(3000);
  await expect(newPage.locator('div.ProseMirror')).toBeVisible();
  await expect(newPage.locator('div.ProseMirror')).toContainText(enteredText);
});

test('Create Delete Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestPageURL('edit2', workerInfo);
  const pageName = url.split('/').pop();

  await page.goto(`${ENV}/#/da-sites/da-status/tests`);
  await page.locator('button.da-actions-new-button').click();
  await page.locator('button:text("Document")').click();
  await page.locator('input.da-actions-input').fill(pageName);

  await page.locator('button:text("Create document")').click();
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await page.locator('div.ProseMirror').fill('testcontent');
  await page.waitForTimeout(1000);

  const newPage = await browser.newPage();
  await newPage.goto(`${ENV}/#/da-sites/da-status/tests`);

  await newPage.waitForTimeout(3000);
  await newPage.reload();

  await expect(newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`)).toBeVisible();
  await newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`).focus();
  // Note this currently does not work on webkit as the checkbox isn't keyboard focusable there
  await newPage.keyboard.press('Shift+Tab');
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
  test.setTimeout(30000);

  const url = getTestPageURL('edit3', workerInfo);
  const urlA = `${url}A`;
  const urlB = `${url}B`;

  await page.goto(urlA);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await page.waitForTimeout(3000);

  await page.locator('div.ProseMirror').fill('before table');
  await page.getByText('Block', { exact: true }).click();
  await page.getByText('columns').fill('mytable');
  await page.keyboard.press('Tab');
  await page.keyboard.press('k');
  await page.keyboard.press('Tab');
  await page.keyboard.press('v');
  await page.getByText('Edit Block').click();
  await page.getByText('Insert row after').click();
  await page.keyboard.press('Tab');
  await page.keyboard.type('k 2');
  await page.keyboard.press('Tab');
  await page.keyboard.type('v 2');
  await page.waitForTimeout(3000);

  await page.goto(urlB);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await page.waitForTimeout(3000);

  await page.locator('div.ProseMirror').fill('page B');
  await page.waitForTimeout(3000);

  await page.goto(urlA);
  await page.waitForTimeout(3000);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toContainText('mytable');
  await page.waitForTimeout(2000);
  await expect(page.locator('div.ProseMirror')).toContainText('k 2');
  await expect(page.locator('div.ProseMirror')).toContainText('v 2');

  await page.goto(urlB);
  await page.waitForTimeout(3000);
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toContainText('page B');
});
