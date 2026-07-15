import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';
import {
  getQuery, getTestPageURL, getTestFolderURL, createDocument, fill, TEST_ORG, TEST_SITE,
} from '../utils/page.js';

// Requires write access to TEST_SITE. pingtest must exist in the /tests directory.
const TESTS_DIR = `${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`;

const BULK_PAGE_COUNT = 12;

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
    // eslint-disable-next-line no-await-in-loop
    await fill(page, `${prefix} test ${i}`);
    // Wait to ensure its saved in da-admin
    // eslint-disable-next-line no-await-in-loop
    await page.waitForTimeout(5000);
  }
  return pageNames;
}

// Deletes the currently selected item(s) and unpublishes them (removes preview and
// live copies), so tests that actually preview/publish real content don't leave
// anything behind in AEM. Assumes the delete confirmation dialog isn't open yet.
async function deleteAndUnpublish(page) {
  await page.locator('button.delete-button').filter({ visible: true }).click();

  // Check "Unpublish" so the preview/live copies are removed, not just the DA document
  await page.locator('input[name="confirm-unpublish"]').click();

  // Unpublishing (and bulk deletes of 10+ items) requires typing YES to confirm
  await page.locator('sl-input[placeholder="YES"]').locator('input').fill('YES');

  await page.locator('sl-button.negative').filter({ visible: true }).click();

  // Wait for the delete button to disappear, which is when we're done
  await expect(page.locator('button.delete-button').filter({ visible: true }))
    .not.toBeVisible({ timeout: 60000 });
}

// Deletes an (empty) folder from the tests directory. Folders don't have anything
// to unpublish, and an empty folder's delete count is below the typed-YES threshold,
// so this is a plain delete confirmation.
async function deleteFolder(page, folderName) {
  await page.goto(TESTS_DIR);
  await expect(page.getByText(folderName), 'Precondition: folder must exist').toBeVisible();

  await selectItem(page, folderName);
  await page.locator('button.delete-button').filter({ visible: true }).click();

  const confirmButton = page.locator('sl-button.negative').filter({ visible: true });
  await expect(confirmButton).toBeEnabled({ timeout: 10000 });
  await confirmButton.click();

  // Wait for the delete button to disappear, which is when we're done
  await expect(page.locator('button.delete-button').filter({ visible: true }))
    .not.toBeVisible({ timeout: 30000 });
}

test('Preview and Publish buttons appear when a file is selected', async ({ page }) => {
  await page.goto(TESTS_DIR);
  await expect(page.getByText('pingtest'), 'Precondition: pingtest must exist').toBeVisible();

  await selectItem(page, 'pingtest');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toBeVisible();
  await expect(page.locator('button.publish-button').filter({ visible: true })).toBeVisible();
});

test('Clicking Preview opens a confirmation dialog', async ({ page }) => {
  await page.goto(TESTS_DIR);
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

  // Enter some text onto the page
  await fill(page, 'preview test');

  // Wait to ensure its saved in da-admin
  await page.waitForTimeout(5000);

  await page.goto(TESTS_DIR);
  await expect(page.getByText(pageName), 'Precondition: new page must exist').toBeVisible();

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

  // Give the preview tab a moment before wrapping up
  await page.waitForTimeout(5000);
  await previewTab.close();

  // Clean up: unpublish and delete the test page
  await page.locator('button.da-dialog-close-btn').click();
  await selectItem(page, pageName);
  await deleteAndUnpublish(page);
});

test('Publish the selected page', async ({ page, context }, workerInfo) => {
  test.setTimeout(60000);

  const url = getTestPageURL('publish', workerInfo);
  const pageName = url.split('/').pop();
  await createDocument(page, url);

  // Enter some text onto the page
  await fill(page, 'publish test');

  // Wait to ensure its saved in da-admin
  await page.waitForTimeout(5000);

  await page.goto(TESTS_DIR);
  await expect(page.getByText(pageName), 'Precondition: new page must exist').toBeVisible();

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

  // Give the publish tab a moment before wrapping up
  await page.waitForTimeout(5000);
  await publishTab.close();

  // Clean up: unpublish and delete the test page
  await page.locator('button.da-dialog-close-btn').click();
  await selectItem(page, pageName);
  await deleteAndUnpublish(page);
});

test('Preview 12 pages in a folder', async ({ page }, workerInfo) => {
  test.setTimeout(360000);

  const { folderURL, folderPath } = await createFolder(page, workerInfo, 'bulkprev');
  const folderName = folderPath.split('/').pop();
  await createPagesInFolder(page, workerInfo, folderPath, 'bulkprev', BULK_PAGE_COUNT);

  await page.goto(folderURL);
  await expect(page.locator('div.da-item-list-item-inner')).toHaveCount(BULK_PAGE_COUNT);

  await page.locator('da-list.da-list-type-browse input#select-all').click();
  await page.locator('button.preview-button').filter({ visible: true }).click();

  await expect(page.locator('da-dialog')).toContainText('Preview the');
  await page.locator('sl-button.accent').filter({ visible: true }).click();

  await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('button.da-aem-results-btn')).toContainText(`Previewed ${BULK_PAGE_COUNT} items`);
  await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);

  // Clean up: unpublish and delete all 12 test pages, then the now-empty folder
  await page.locator('da-list.da-list-type-browse input#select-all').click();
  await deleteAndUnpublish(page);
  await deleteFolder(page, folderName);
});

test('Publish 12 pages in a folder', async ({ page }, workerInfo) => {
  test.setTimeout(360000);

  const { folderURL, folderPath } = await createFolder(page, workerInfo, 'bulkpub');
  const folderName = folderPath.split('/').pop();
  await createPagesInFolder(page, workerInfo, folderPath, 'bulkpub', BULK_PAGE_COUNT);

  await page.goto(folderURL);
  await expect(page.locator('div.da-item-list-item-inner')).toHaveCount(BULK_PAGE_COUNT);

  await page.locator('da-list.da-list-type-browse input#select-all').click();
  await page.locator('button.publish-button').filter({ visible: true }).click();

  await expect(page.locator('da-dialog')).toContainText('Publish the');
  await page.locator('sl-button.accent').filter({ visible: true }).click();

  await expect(page.locator('button.da-aem-results-btn')).toBeVisible({ timeout: 60000 });
  await expect(page.locator('button.da-aem-results-btn')).toContainText(`Published ${BULK_PAGE_COUNT} items`);
  await expect(page.locator('da-dialog').filter({ hasText: 'Errors' })).toHaveCount(0);

  // Clean up: unpublish and delete all 12 test pages, then the now-empty folder
  await page.locator('da-list.da-list-type-browse input#select-all').click();
  await deleteAndUnpublish(page);
  await deleteFolder(page, folderName);
});

test('Preview and Publish buttons are hidden when only a folder is selected', async ({ page }) => {
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}`);
  await expect(page.getByText('tests'), 'Precondition: tests folder must exist').toBeVisible();

  await selectItem(page, 'tests');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('button.publish-button').filter({ visible: true })).toHaveCount(0);
});
