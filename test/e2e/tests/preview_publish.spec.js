import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';
import { getQuery, TEST_ORG, TEST_SITE } from '../utils/page.js';

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
  test.skip(TEST_SITE !== 'da-status', 'Requires write access to da-status');
  await page.goto(TESTS_DIR);
  await expect(page.getByText('pingtest'), 'Precondition: pingtest must exist').toBeVisible();

  await selectItem(page, 'pingtest');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toBeVisible();
  await expect(page.locator('button.publish-button').filter({ visible: true })).toBeVisible();
});

test('Clicking Preview opens a confirmation dialog', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'Requires write access to da-status');
  await page.goto(TESTS_DIR);
  await expect(page.getByText('pingtest'), 'Precondition: pingtest must exist').toBeVisible();

  await selectItem(page, 'pingtest');
  await page.locator('button.preview-button').filter({ visible: true }).click();

  await expect(page.locator('da-dialog')).toBeVisible();
  await expect(page.locator('da-dialog')).toContainText('Preview the');
});

test('Preview and Publish buttons are hidden when only a folder is selected', async ({ page }) => {
  test.skip(TEST_SITE !== 'da-status', 'Requires write access to da-status');
  await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}`);
  await expect(page.getByText('tests'), 'Precondition: tests folder must exist').toBeVisible();

  await selectItem(page, 'tests');

  await expect(page.locator('button.preview-button').filter({ visible: true })).toHaveCount(0);
  await expect(page.locator('button.publish-button').filter({ visible: true })).toHaveCount(0);
});
