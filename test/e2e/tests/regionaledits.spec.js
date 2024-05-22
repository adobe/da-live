import { test, expect } from '@playwright/test';
import path from 'path';
import ENV from '../utils/env.js';

const deleteTestPage = async () => {
  // Delete the document even if the test fails;
  const pageName = 'regionaledit.html';
  const adminURL = `https://admin.da.live/source/da-sites/da-status/tests/${pageName}`;
  await fetch(adminURL, { method: 'DELETE' });
};

test('Regional Edit Document', async ({ page }) => {
  test.setTimeout(15000);
  await deleteTestPage();

  try {
    await page.goto(`${ENV}/#/da-sites/da-status/tests`);
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
    await page.getByRole('link', { name: 'regionaledit' }).click();

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
  } finally {
    deleteTestPage();
  }
});
