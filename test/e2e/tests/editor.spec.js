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
/* eslint-disable import/no-unresolved */
const { test, expect } = require('@playwright/test');

const DA_BRANCH = process.env.GITHUB_HEAD_REF || 'main';
const DA_HOST = `https://${DA_BRANCH}--da-live--adobe.hlx.live`;
console.log('Using DA_URL', DA_HOST);

test('Get Main Page', async ({ page }) => {
  await page.goto(DA_HOST);
  const html = await page.content();
  expect(html).toContain('Dark Alley');

  await expect(page.locator('a.nx-nav-brand')).toBeVisible();
  await expect(page.locator('a.nx-nav-brand')).toContainText('Project Dark Alley');
});

test('Update Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(15000);

  const dateStamp = Date.now().toString(36);
  const pageName = `pw-test1-${dateStamp}-${workerInfo.project.name}`;
  const url = `${DA_HOST}/edit#/da-sites/da-status/tests/${pageName}`;

  try {
    await page.goto(url);
    await expect(page.locator('div.ProseMirror')).toBeVisible();

    const enteredText = `[${workerInfo.project.name}] Edited by test ${new Date()}`;
    await page.locator('div.ProseMirror').fill(enteredText);

    // Wait 3 secs
    await page.waitForTimeout(3000);
    await page.close();

    const newPage = await browser.newPage();
    await newPage.goto(url);
    await expect(newPage.locator('div.ProseMirror')).toBeVisible();
    await expect(newPage.locator('div.ProseMirror')).toContainText(enteredText);
  } finally {
    // Always delete the document afterwards
    const adminURL = `https://admin.da.live/source/da-sites/da-status/tests/${pageName}.html`;
    await fetch(adminURL, { method: 'DELETE' });
  }
});

test('Create Delete Document', async ({ browser, page }, workerInfo) => {
  test.setTimeout(15000);

  const dateStamp = Date.now().toString(36);
  const pageName = `pw-test2-${dateStamp}-${workerInfo.project.name}`;

  try {
    await page.goto(`${DA_HOST}/#/da-sites/da-status/tests`);
    await page.locator('button.da-actions-new-button').click();
    await page.locator('button:text("Document")').click();
    await page.locator('input.da-actions-input').fill(pageName);

    await page.locator('button:text("Create document")').click();
    await expect(page.locator('div.ProseMirror')).toBeVisible();
    await page.locator('div.ProseMirror').fill('testcontent');

    const newPage = await browser.newPage();
    await newPage.goto(`${DA_HOST}/#/da-sites/da-status/tests`);

    // Wait 1 sec
    await newPage.waitForTimeout(4000);
    await newPage.reload();

    await expect(newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`)).toBeVisible();
    await newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`).focus();
    // Note this currently does not work on webkit as the checkbox isn't keyboard focusable there
    await newPage.keyboard.press('Shift+Tab');
    await newPage.keyboard.press(' ');
    await newPage.waitForTimeout(500);
    await expect(newPage.locator('button.delete-button')).toBeVisible();
    await newPage.locator('button.delete-button').click();

    // Wait 1 sec
    await page.waitForTimeout(1000);
    await expect(newPage.locator(`a[href="/edit#/da-sites/da-status/tests/${pageName}"]`)).not.toBeVisible();
  } finally {
    // Delete the document even if the test fails;
    const adminURL = `https://admin.da.live/source/da-sites/da-status/tests/${pageName}.html`;
    await fetch(adminURL, { method: 'DELETE' });
  }
});
