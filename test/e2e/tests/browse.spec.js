import { test, expect } from '../utils/fixtures.js';
import ENV from '../utils/env.js';
import { getQuery, getTestFolderURL } from '../utils/page.js';
import { row, deleteSelected } from '../utils/browse.js';
import { dismissAlertBanner } from '../utils/utils.js';

test('Get Main Page', async ({ page }) => {
  await page.goto(`${ENV}/${getQuery()}`);
  const html = await page.content();

  expect(html).toContain('Browse - DA');
  await expect(page.locator('a.brand-area')).toBeVisible();
});

test('Switch between list and card views, select and rename a folder', async ({ page }, workerInfo) => {
  test.setTimeout(60000);
  const folderURL = new URL(getTestFolderURL('browse', workerInfo));
  const folderPath = folderURL.hash.slice(1);
  const folderName = folderPath.split('/').pop();
  const browseURL = new URL(folderURL);
  browseURL.hash = folderPath.slice(0, folderPath.lastIndexOf('/'));
  await page.goto(browseURL.href);
  await dismissAlertBanner(page);

  const listView = page.getByRole('button', { name: 'List view', exact: true });
  const cardView = page.getByRole('button', { name: 'Card view', exact: true });
  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(listView).toBeVisible();
  await listView.click({ force: true });
  await expect(listView).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'New', exact: true }).click();
  await page.getByRole('menuitem', { name: 'Folder', exact: true }).click();
  await page.getByPlaceholder('folder name').fill(folderName);
  await page.getByRole('button', { name: 'Create', exact: true }).click();

  const item = row(page, `#${folderPath}`);
  await expect(item.getByRole('link', { name: folderName, exact: true })).toBeVisible();
  await item.getByRole('checkbox', { name: 'Select item', exact: true }).check();
  await page.getByRole('button', { name: 'Unselect items', exact: true }).click({ force: true });

  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(cardView).toBeVisible();
  await cardView.click({ force: true });
  await expect(cardView).toHaveAttribute('aria-pressed', 'true');
  await expect(item.getByRole('link', { name: folderName, exact: true })).toBeVisible();
  await expect(item.getByRole('button', { name: 'More', exact: true })).toBeVisible();

  const checkbox = item.getByRole('checkbox', { name: 'Select item', exact: true });
  await checkbox.check();
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'Unselect items', exact: true }).click({ force: true });
  await expect(checkbox).not.toBeChecked();
  await expect(checkbox).toBeFocused();

  await checkbox.press('Space');
  await expect(checkbox).toBeChecked();
  await page.getByRole('button', { name: 'Rename', exact: true }).click({ force: true });
  const renamedName = `${folderName}-renamed`;
  const renameInput = item.getByRole('textbox', { name: 'Rename item', exact: true });
  await renameInput.fill(renamedName);
  await renameInput.press('Enter');

  const renamedHref = `#${folderPath}-renamed`;
  const renamedItem = row(page, renamedHref);
  await expect(renamedItem.getByRole('link', { name: renamedName, exact: true })).toBeVisible();
  await expect(renamedItem.getByRole('checkbox', { name: 'Select item', exact: true })).not.toBeChecked();

  await page.getByRole('button', { name: 'Appearance', exact: true }).click();
  await expect(listView).toBeVisible();
  await listView.click({ force: true });
  await expect(listView).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await dismissAlertBanner(page);
  await expect(renamedItem.getByRole('link', { name: renamedName, exact: true })).toBeVisible();
  await expect(row(page, `#${folderPath}`)).toHaveCount(0);
  await renamedItem.getByRole('checkbox', { name: 'Select item', exact: true }).check();
  await deleteSelected(page, renamedHref);
});
