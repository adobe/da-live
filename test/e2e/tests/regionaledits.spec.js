import { test, expect } from '@playwright/test';
import path from 'path';
import { getTestFolderURL } from '../utils/page.js';

async function findPageTab(title, page, context) {
  let attemptsLeft = 5;
  while (attemptsLeft > 0) {
    attemptsLeft -= 1;

    await page.waitForTimeout(500);
    const pages = context.pages();
    console.log('Num Pages:', pages.length);
    for (let i = 0; i < pages.length; i += 1) {
      const pageTitle = await pages[i].title();
      console.log('Page:', pageTitle);
      if (pageTitle.includes('Edit regionaledit')) {
        return pages[i];
      }
    }
  }
  throw new Error('Could not find the regional edit page');
}

test('Regional Edit Document', async ({ page, context }, workerInfo) => {
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

  const newPage = await findPageTab('Edit regionaledit', page, context);
  await expect(newPage.locator('div.loc-color-overlay.loc-langstore')).toBeVisible();
  await expect(newPage.locator('div.loc-color-overlay.loc-regional')).toBeVisible();

  await expect(newPage.getByText('Deleted H1 Here', { exact: true })).toBeVisible();
  await expect(newPage.getByText('Added H1 Here', { exact: true })).toBeVisible();

  await newPage.locator('div.loc-color-overlay.loc-langstore').hover();
  await newPage.locator('da-loc-deleted').getByText('Delete', { exact: true }).click();
  await expect(newPage.getByText('Deleted H1 Here', { exact: true })).not.toBeVisible();

  await newPage.locator('div.loc-color-overlay.loc-regional').hover();
  await newPage.locator('da-loc-added').getByText('Keep', { exact: true }).click();
  await expect(newPage.getByText('Added H1 Here', { exact: true })).toBeVisible();
  await expect(newPage.locator('div.loc-color-overlay.loc-regional')).not.toBeVisible();

  // Note that the test folder will be automatically cleaned up in subsequent runs
  // by the delete.spec.js test
});
