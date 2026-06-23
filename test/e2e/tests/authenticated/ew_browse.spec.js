import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery } from '../../utils/page.js';

/*
 * Requires the following config at https://da.live/config#/da-testautomation/:
 *   path                    groups                      actions
 *   /ewtest/+**             907136ED5D35CBF50A495CD4    read
 * And a document at /da-testautomation/ewtest/demo with EW enabled on the site.
 */

const EW_SITE = `${ENV}/${getQuery()}#/da-testautomation/ewtest`;
const NON_EW_SITE = `${ENV}/${getQuery()}#/da-testautomation/acltest/testdocs/subdir`;

test('Chat button is visible on EW-enabled site', async ({ page }) => {
  await page.goto(EW_SITE);
  await expect(page.locator('button.chat-btn')).toBeVisible();
});

test('Document links use canvas editor on EW-enabled site', async ({ page }) => {
  await page.goto(EW_SITE);
  await expect(page.locator('a[href="/canvas#/da-testautomation/ewtest/demo"]')).toBeVisible();
});

test('Chat button is absent on non-EW site', async ({ page }) => {
  await page.goto(NON_EW_SITE);
  // Wait for the list to render before asserting absence
  await expect(page.locator('da-list-item').first()).toBeVisible();
  await expect(page.locator('button.chat-btn')).toHaveCount(0);
});
