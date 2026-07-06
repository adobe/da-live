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

test('Deleting rows persists after reload', async ({ page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestSheetURL('sheetdel', workerInfo);
  await page.goto(url);

  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  // Fill three identifiable rows in the first column
  const rows = ['rowzero', 'rowone', 'rowtwo'];
  for (let y = 0; y < rows.length; y += 1) {
    await page.locator(`[data-x="0"][data-y="${y}"]`).dblclick();
    await page.locator('td input').fill(rows[y]);
    await page.keyboard.press('Enter');
  }

  // Let the initial cell edits save before deleting rows
  await page.waitForTimeout(1500);

  // Delete the first two rows via the row header's context menu (no confirm dialog
  // on this path, unlike the Delete key shortcut)
  await page.locator('td.jexcel_row[data-y="0"]').click({ button: 'right' });
  await page.getByText('Delete selected rows').click();
  await page.locator('td.jexcel_row[data-y="0"]').click({ button: 'right' });
  await page.getByText('Delete selected rows').click();

  // Let the delete-triggered save flush
  await page.waitForTimeout(1500);

  // Reload to force re-fetching the saved content, same as closing and reopening
  await page.reload();
  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  await expect(page.locator('[data-x="0"][data-y="0"]')).toHaveText('rowtwo');
  await expect(page.locator('td', { hasText: 'rowzero' })).toHaveCount(0);
  await expect(page.locator('td', { hasText: 'rowone' })).toHaveCount(0);

  await page.close();
});
