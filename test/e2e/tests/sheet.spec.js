import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';

test('New sheet', async ({ page }, workerInfo) => {
  test.setTimeout(15000);

  const dateStamp = Date.now().toString(36);
  const pageName = `pw-test1-${dateStamp}-${workerInfo.project.name}`;
  const url = `${ENV}/sheet#/da-sites/da-status/tests/${pageName}`;

  try {
    await page.goto(url);

    // DA title
    await expect(page.locator('h1')).toBeVisible();

    // Sheet tabs
    await expect(page.locator('da-sheet-tabs')).toBeVisible();

    // Enter text into first cell
    const enteredText = `[${workerInfo.project.name}] Edited by test ${new Date()}`;
    await page.locator('[data-x="0"][data-y="0"]').dblclick();
    await page.locator('input').fill('key');

    // Enter text into second cell
    await page.locator('[data-x="0"][data-y="1"]').dblclick();
    await page.locator('td input').fill(enteredText);

    await page.waitForTimeout(3000);
    await page.close();
  } finally {
    // Always delete the document afterwards
    // const adminURL = `https://admin.da.live/source/da-sites/da-status/tests/${pageName}.json`;
    // await fetch(adminURL, { method: 'DELETE' });
  }
});
