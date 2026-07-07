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

  // Select rows 0-1 (click + shift-right-click extends the selection) and delete
  // both in one context-menu action. A second separate right-click/delete cycle
  // doesn't work here: jSuites' contextmenu handler dispatches based on
  // document.activeElement, which after the first menu-item click is still that
  // (now-closed) link, so a follow-up right-click never reopens a fresh menu.
  await page.locator('td.jexcel_row[data-y="0"]').click();
  await page.locator('td.jexcel_row[data-y="1"]').click({ button: 'right', modifiers: ['Shift'] });
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

test('Deleting columns persists after reload', async ({ page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestSheetURL('sheetdelc', workerInfo);
  await page.goto(url);

  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  // Fill three identifiable columns in the first row
  const cols = ['colzero', 'colone', 'coltwo'];
  for (let x = 0; x < cols.length; x += 1) {
    await page.locator(`[data-x="${x}"][data-y="0"]`).dblclick();
    await page.locator('td input').fill(cols[x]);
    await page.keyboard.press('Enter');
  }

  // Let the initial cell edits save before deleting columns
  await page.waitForTimeout(1500);

  // Select columns 0-1 (click + shift-right-click extends the selection) and
  // delete both in one context-menu action - see the row-delete test above for
  // why a second separate right-click/delete cycle doesn't work.
  await page.locator('thead td[data-x="0"]').click();
  await page.locator('thead td[data-x="1"]').click({ button: 'right', modifiers: ['Shift'] });
  await page.getByText('Delete selected columns').click();

  // Let the delete-triggered save flush
  await page.waitForTimeout(1500);

  // Reload to force re-fetching the saved content, same as closing and reopening
  await page.reload();
  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  await expect(page.locator('[data-x="0"][data-y="0"]')).toHaveText('coltwo');
  await expect(page.locator('td', { hasText: 'colzero' })).toHaveCount(0);
  await expect(page.locator('td', { hasText: 'colone' })).toHaveCount(0);

  await page.close();
});

test('Moving a row persists after reload', async ({ page }, workerInfo) => {
  test.setTimeout(30000);

  const url = getTestSheetURL('sheetmove', workerInfo);
  await page.goto(url);

  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  // Fill three identifiable rows in the first column
  const rows = ['rowzero', 'rowone', 'rowtwo'];
  for (let y = 0; y < rows.length; y += 1) {
    await page.locator(`[data-x="0"][data-y="${y}"]`).dblclick();
    await page.locator('td input').fill(rows[y]);
    await page.keyboard.press('Enter');
  }

  // Let the initial cell edits save before dragging
  await page.waitForTimeout(1500);

  // jspreadsheet-ce only starts a row drag when the mousedown lands within the last
  // few pixels of the row-number cell's right edge - anywhere else on it just selects
  // the row (as the delete test above does). Drop on the upper half of row 0's header
  // to insert row 2 before it.
  const sourceHandle = page.locator('td.jexcel_row[data-y="2"]');
  const targetHandle = page.locator('td.jexcel_row[data-y="0"]');
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  await page.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 2, { steps: 5 });
  await page.mouse.up();

  // Let the move-triggered save flush
  await page.waitForTimeout(1500);

  // Reload to force re-fetching the saved content, same as closing and reopening
  await page.reload();
  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  await expect(page.locator('[data-x="0"][data-y="0"]')).toHaveText('rowtwo');
  await expect(page.locator('[data-x="0"][data-y="1"]')).toHaveText('rowzero');
  await expect(page.locator('[data-x="0"][data-y="2"]')).toHaveText('rowone');

  await page.close();
});
