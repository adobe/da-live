import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery } from '../../utils/page.js';

const EW_SITE = `${ENV}/${getQuery()}#/da-testautomation/ewtest`;
const NON_EW_SITE = `${ENV}/${getQuery()}#/da-testautomation/acltest`;

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
