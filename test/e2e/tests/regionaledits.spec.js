import { test, expect } from '@playwright/test';
import path from 'path';
import { getTestFolderURL } from '../utils/page.js';

test('Regional Edit Document', async ({ page }, workerInfo) => {
  test.setTimeout(15000);

  const folderURL = getTestFolderURL('regionaledit', workerInfo);
  await page.goto(folderURL);
  await page.getByRole('button', { name: 'New' }).click();
  await page.getByRole('button', { name: 'Media' }).click();

  const [fileChooser] = await Promise.all([
    page.waitForEvent('filechooser'),
    page.getByText('Select file').click(),
  ]);

  const htmlFile = path.join(__dirname, '/mocks/regionaledit.html');
  console.log(htmlFile);
  await fileChooser.setFiles([`${htmlFile}`]);

  await page.getByRole('button', { name: 'Upload' }).click();
  await page.getByRole('link', { name: 'regionaledit', exact: true }).click();

  await expect(page.locator('div.loc-color-overlay.loc-langstore')).toBeVisible();
  await expect(page.locator('div.loc-color-overlay.loc-regional')).toBeVisible();

  expect(page.getByText('Deleted H1 Here', { exact: true })).toBeVisible();
  expect(page.getByText('Added H1 Here', { exact: true })).toBeVisible();

  await page.locator('div.loc-color-overlay.loc-langstore').hover();
  await page.locator('da-loc-deleted').getByText('Delete', { exact: true }).click();
  await expect(page.getByText('Deleted H1 Here', { exact: true })).not.toBeVisible();

  await page.locator('div.loc-color-overlay.loc-regional').hover();
  await page.locator('da-loc-added').getByText('Keep', { exact: true }).click();
  await expect(page.getByText('Added H1 Here', { exact: true })).toBeVisible();
  await expect(page.locator('div.loc-color-overlay.loc-regional')).not.toBeVisible();

  // Note that the test folder will be automatically cleaned up in subsequent runs
  // by the delete.spec.js test
});
