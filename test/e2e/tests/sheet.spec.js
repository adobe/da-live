import { test, expect } from '@playwright/test';
import { getTestSheetURL } from '../utils/page.js';

test('New sheet', async ({ page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestSheetURL('sheet1', workerInfo);
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
});
