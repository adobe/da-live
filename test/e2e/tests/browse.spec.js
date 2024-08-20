import { test, expect } from '@playwright/test';
import ENV from '../utils/env.js';

test('Get Main Page', async ({ page }) => {
  await page.goto(ENV);
  const html = await page.content();

  expect(html).toContain('Browse - DA');
  await expect(page.locator('a.nx-nav-brand')).toBeVisible();
  await expect(page.locator('a.nx-nav-brand')).toContainText('Document Authoring');
});
