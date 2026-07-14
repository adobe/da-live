import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';
import {
  getQuery, getTestPageURL, createDocument, fill, TEST_ORG, TEST_SITE,
} from '../utils/page.js';

// Requires write access to TEST_SITE. pingtest must exist in the /tests directory.
const TESTS_DIR = `${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`;

async function selectItem(page, name) {
  const checkbox = page
    .locator('div.da-item-list-item-inner').filter({ hasText: name, exact: true })
    .locator('input[type="checkbox"][name="item-selected"]').first();
  await checkbox.focus();
  await page.keyboard.press(' ');
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

test('Preview actually previews the selected page', async ({ page, context }, workerInfo) => {
  test.setTimeout(90000);

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
});

test('Publish actually publishes the selected page', async ({ page, context }, workerInfo) => {
  test.setTimeout(90000);

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
});

test('Preview and Publish buttons are hidden when only a folder is selected', async ({ page }) => {
  //test.skip(TEST_SITE !== 'da-status', 'Requires write access to da-status');
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}`);
  await expect(page.getByText('tests'), 'Precondition: tests folder must exist').toBeVisible();

  await selectItem(page, 'tests');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('button.publish-button').filter({ visible: true })).toHaveCount(0);
});
