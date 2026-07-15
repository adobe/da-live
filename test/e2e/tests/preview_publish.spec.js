import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';
import {
  getQuery, getTestPageURL, getTestFolderURL, createDocument, fill, TEST_ORG, TEST_SITE,
} from '../utils/page.js';

// Requires write access to TEST_SITE. pingtest must exist in the /tests directory.
const TESTS_DIR = `${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`;

const BULK_PAGE_COUNT = 12;

// Some environments show a dismissible alert banner the first time the browse
// view loads. If present, dismiss it so it doesn't block later interactions.
async function dismissAlertBanner(page) {
  const alert = page.getByRole('alert');
  if (await alert.isVisible().catch(() => false)) {
    await alert.getByRole('button', { name: 'Dismiss' }).click();
  }
}

async function selectItem(page, name) {
  const checkbox = page
    .locator('div.da-item-list-item-inner').filter({ hasText: name, exact: true })
    .locator('input[type="checkbox"][name="item-selected"]').first();
  await checkbox.focus();
  await page.keyboard.press(' ');
}

// Creates a folder under the tests directory and returns both its URL and the
// hash-path portion (e.g. /org/site/tests/pw-foo-123-chromium) so pages can be
// created directly inside it via getTestPageURL(..., folderPath).
async function createFolder(page, workerInfo, testIdentifier) {
  const folderURL = getTestFolderURL(testIdentifier, workerInfo);
  const folderName = folderURL.split('/').pop();

  await page.goto(TESTS_DIR);
  await page.waitForTimeout(5000);
  await dismissAlertBanner(page);
  await expect(page.getByRole('button', { name: 'New' })).toBeEnabled();
  await page.getByRole('button', { name: 'New' }).click({ force: true });
  await page.getByRole('menuitem', { name: 'Folder' }).click();
  await page.getByPlaceholder('folder name').fill(folderName);
  await page.getByRole('button', { name: 'Create' }).click();

  const folderPath = new URL(folderURL).hash.slice(1);
  return { folderURL, folderPath };
}

// Creates `count` pages inside the given folder, each with some distinguishing
// text content, and returns the list of page names created.
async function createPagesInFolder(page, workerInfo, folderPath, prefix, count) {
  const pageNames = [];
  for (let i = 0; i < count; i += 1) {
    const url = getTestPageURL(`${prefix}${i}`, workerInfo, folderPath);
    const pageName = url.split('/').pop();
    pageNames.push(pageName);

    // eslint-disable-next-line no-await-in-loop
    await createDocument(page, url);

    // Allow Y.js WebSocket to stabilize before typing
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(2000);

    // eslint-disable-next-line no-await-in-loop
    await fill(page, `${prefix} test ${i}`);

    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(3000);
  }
  return pageNames;
}

test('Preview and Publish buttons appear when a file is selected', async ({ page }) => {
  await page.goto(TESTS_DIR);
  await page.waitForTimeout(5000);
  await dismissAlertBanner(page);
  await expect(page.getByText('pingtest'), 'Precondition: pingtest must exist').toBeVisible();

  await selectItem(page, 'pingtest');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toBeVisible();
  await expect(page.locator('button.publish-button').filter({ visible: true })).toBeVisible();
});

test('Clicking Preview opens a confirmation dialog', async ({ page }) => {
  await page.goto(TESTS_DIR);
  await page.waitForTimeout(5000);
  await dismissAlertBanner(page);
  await expect(page.getByText('pingtest'), 'Precondition: pingtest must exist').toBeVisible();

  await selectItem(page, 'pingtest');
  await page.locator('button.preview-button').filter({ visible: true }).click();

  await expect(page.locator('sl-button.accent').filter({ visible: true })).toBeVisible();
  await expect(page.locator('da-dialog')).toContainText('Preview the');
});

test('Preview the selected page', async ({ page, context }, workerInfo) => {
  test.setTimeout(60000);

  const url = getTestPageURL('preview', workerInfo);
  const pageName = url.split('/').pop();
  await createDocument(page, url);

  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);
  await fill(page, 'preview test');

  // Wait to ensure its saved in da-admin
  await page.waitForTimeout(3000);

  await page.goto(TESTS_DIR);
  await expect(page.getByText(pageName), 'Precondition: new page must exist').toBeVisible();

  await dismissAlertBanner(page);
  await selectItem(page, pageName);
  await page.locator('button.preview-button').filter({ visible: true }).click();

  await expect(page.locator('da-dialog')).toContainText('Preview the');
  await page.locator('sl-button.accent').filter({ visible: true }).click();

  await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('button.da-aem-results-btn')).toContainText('Previewed 1 item');
  await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);

  // Open the previewed page in its own browser tab and confirm it actually rendered
  await page.locator('button.da-aem-results-btn').click();
  const previewLink = page.locator('da-dialog a').first();
  await expect(previewLink).toBeVisible();
  const previewUrl = await previewLink.getAttribute('href');

  const previewTab = await context.newPage();
  await previewTab.goto(previewUrl);
  await expect(previewTab.locator('body')).toContainText('preview test');
  await previewTab.close();
});

test('Publish the selected page', async ({ page, context }, workerInfo) => {
  test.setTimeout(60000);

  const url = getTestPageURL('publish', workerInfo);
  const pageName = url.split('/').pop();
  await createDocument(page, url);

  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);
  await fill(page, 'publish test');

  // Wait to ensure its saved in da-admin
  await page.waitForTimeout(3000);

  await page.goto(TESTS_DIR);
  await expect(page.getByText(pageName), 'Precondition: new page must exist').toBeVisible();
  await dismissAlertBanner(page);

  await selectItem(page, pageName);
  await page.locator('button.publish-button').filter({ visible: true }).click();

  await expect(page.locator('da-dialog')).toContainText('Publish the');
  await page.locator('sl-button.accent').filter({ visible: true }).click();

  await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 30000 });
  await expect(page.locator('button.da-aem-results-btn')).toContainText('Published 1 item');
  await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);

  // Open the published page in its own browser tab and confirm it actually rendered
  await page.locator('button.da-aem-results-btn').click();
  const publishLink = page.locator('da-dialog a').first();
  await expect(publishLink).toBeVisible();
  const publishUrl = await publishLink.getAttribute('href');

  const publishTab = await context.newPage();
  await publishTab.goto(publishUrl);
  await expect(publishTab.locator('body')).toContainText('publish test');
  await publishTab.close();
});

test.describe.serial('Bulk preview/publish 12 pages in a folder', () => {
  // Created once in beforeAll and reused by both tests below, since creating
  // 12 real pages is expensive and the same set can be previewed and then
  // published in sequence.
  let folderURL;
  let folderPath;

  test.beforeAll(async ({ browser }, workerInfo) => {
    // Creating 12 real pages takes well over the default 30s hook timeout.
    test.setTimeout(180000);

    const page = await browser.newPage();
    ({ folderURL, folderPath } = await createFolder(page, workerInfo, 'bulk'));
    await createPagesInFolder(page, workerInfo, folderPath, 'bulk', BULK_PAGE_COUNT);
    await page.close();
  });

  test('Preview 12 pages in a folder', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto(folderURL);
    await expect(page.locator('div.da-item-list-item-inner')).toHaveCount(BULK_PAGE_COUNT);
    await dismissAlertBanner(page);

    await page.locator('da-list.da-list-type-browse input#select-all').click();
    await page.locator('button.preview-button').filter({ visible: true }).click();

    await expect(page.locator('da-dialog')).toContainText('Preview the');
    await page.locator('sl-button.accent').filter({ visible: true }).click();

    await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('button.da-aem-results-btn')).toContainText(`Previewed ${BULK_PAGE_COUNT} items`);
    await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);
  });

  test('Publish 12 pages in a folder', async ({ page }) => {
    test.setTimeout(120000);

    await page.goto(folderURL);
    await expect(page.locator('div.da-item-list-item-inner')).toHaveCount(BULK_PAGE_COUNT);
    await dismissAlertBanner(page);

    await page.locator('da-list.da-list-type-browse input#select-all').click();
    await page.locator('button.publish-button').filter({ visible: true }).click();

    await expect(page.locator('da-dialog')).toContainText('Publish the');
    await page.locator('sl-button.accent').filter({ visible: true }).click();

    await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 60000 });
    await expect(page.locator('button.da-aem-results-btn')).toContainText(`Published ${BULK_PAGE_COUNT} items`);
    await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);
  });
});

test('Preview and Publish buttons are hidden when only a folder is selected', async ({ page }) => {
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}`);
  await page.waitForTimeout(5000);
  await dismissAlertBanner(page);
  await expect(page.getByText('tests'), 'Precondition: tests folder must exist').toBeVisible();

  await selectItem(page, 'tests');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('button.publish-button').filter({ visible: true })).toHaveCount(0);
});
