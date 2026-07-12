import { test, expect } from '@playwright/test';
import { getTestSheetURL, waitForSave } from '../utils/page.js';

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
  const initialSave = waitForSave(page);
  for (let y = 0; y < rows.length; y += 1) {
    await page.locator(`[data-x="0"][data-y="${y}"]`).dblclick();
    await page.locator('td input').fill(rows[y]);
    await page.keyboard.press('Enter');
  }

  // Wait for the initial cell edits to actually save (saves are debounced) before deleting rows
  await initialSave;

  // Select rows 0-1: a plain click sets the anchor, then a shift-click (left button)
  // extends the range selection to include both rows. Right-clicking within an
  // already-selected range keeps the whole range selected and opens the context
  // menu for it - right-clicking straight to row 1 with a Shift modifier does not
  // extend the selection the same way and only ends up deleting that single row.
  const deleteSave = waitForSave(page);
  await page.locator('td.jexcel_row[data-y="0"]').click();
  await page.locator('td.jexcel_row[data-y="1"]').click({ modifiers: ['Shift'] });
  await page.locator('td.jexcel_row[data-y="1"]').click({ button: 'right' });
  await page.getByText('Delete selected rows').click();

  // Wait for the delete-triggered save to flush
  await deleteSave;

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
  const initialSave = waitForSave(page);
  for (let x = 0; x < cols.length; x += 1) {
    await page.locator(`[data-x="${x}"][data-y="0"]`).dblclick();
    await page.locator('td input').fill(cols[x]);
    await page.keyboard.press('Enter');
  }

  // Wait for the initial cell edits to actually save (saves are debounced) before deleting columns
  await initialSave;

  // Select columns 0-1: click + shift-click (left button) extends the range
  // selection - see the row-delete test above for why the selection needs to be
  // extended with a plain shift-click before the right-click opens the context menu.
  const deleteSave = waitForSave(page);
  await page.locator('thead td[data-x="0"]').click();
  await page.locator('thead td[data-x="1"]').click({ modifiers: ['Shift'] });
  await page.locator('thead td[data-x="1"]').click({ button: 'right' });
  await page.getByText('Delete selected columns').click();

  // Wait for the delete-triggered save to flush
  await deleteSave;

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
  const initialSave = waitForSave(page);
  for (let y = 0; y < rows.length; y += 1) {
    await page.locator(`[data-x="0"][data-y="${y}"]`).dblclick();
    await page.locator('td input').fill(rows[y]);
    await page.keyboard.press('Enter');
  }

  // Wait for the initial cell edits to actually save (saves are debounced) before dragging
  await initialSave;

  // jspreadsheet-ce only starts a row drag when the mousedown lands within the last
  // few pixels of the row-number cell's right edge - anywhere else on it just selects
  // the row (as the delete test above does). Drop on the upper half of row 0's header
  // to insert row 2 before it.
  const sourceHandle = page.locator('td.jexcel_row[data-y="2"]');
  const targetHandle = page.locator('td.jexcel_row[data-y="0"]');
  const sourceBox = await sourceHandle.boundingBox();
  const targetBox = await targetHandle.boundingBox();

  const moveSave = waitForSave(page);
  await page.mouse.move(sourceBox.x + sourceBox.width - 2, sourceBox.y + sourceBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height / 2, { steps: 5 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + 2, { steps: 5 });
  await page.mouse.up();

  // Wait for the move-triggered save to flush
  await moveSave;

  // Reload to force re-fetching the saved content, same as closing and reopening
  await page.reload();
  await expect(page.locator('da-sheet-tabs')).toBeVisible();

  await expect(page.locator('[data-x="0"][data-y="0"]')).toHaveText('rowtwo');
  await expect(page.locator('[data-x="0"][data-y="1"]')).toHaveText('rowzero');
  await expect(page.locator('[data-x="0"][data-y="2"]')).toHaveText('rowone');

  await page.close();
});
