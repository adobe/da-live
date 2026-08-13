import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery } from '../../utils/page.js';

/*
 * Requires the following config at https://da.live/config#/da-testautomation/:
 *   path                    groups                      actions
 *   /ewtest/+**             907136ED5D35CBF50A495CD4    read
 * And a document at /da-testautomation/ewtest/demo with EW enabled on the site.
 *
 * The disableChat case additionally requires a site with EW enabled and
 * `ew.disableChat` set to `true` at /da-testautomation/ewtest-nochat, with a
 * document at /da-testautomation/ewtest-nochat/demo.
 */

const EW_SITE = `${ENV}/${getQuery()}#/da-testautomation/ewtest`;
const EW_SITE_NO_CHAT = `${ENV}/${getQuery()}#/da-testautomation/ewtest-nochat`;
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

test('Chat button is absent when ew.disableChat is set, even with EW enabled', async ({ page }) => {
  await page.goto(EW_SITE_NO_CHAT);
  await expect(page.locator('da-list-item').first()).toBeVisible();
  await expect(page.locator('button.chat-btn')).toHaveCount(0);
});

test('Document links still use canvas editor when chat is disabled', async ({ page }) => {
  await page.goto(EW_SITE_NO_CHAT);
  await expect(page.locator('a[href="/canvas#/da-testautomation/ewtest-nochat/demo"]')).toBeVisible();
});
