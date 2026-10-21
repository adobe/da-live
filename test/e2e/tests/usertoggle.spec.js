/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { test, expect } from '../utils/fixtures.js';
import ENV, { TEST_ORG, TEST_SITE } from '../utils/env.js';
import { dismissAlertBanner } from '../utils/utils.js';

// Persisted in the browser by da-nx's nx2/utils/ewFlags.js. The toggle only
// ever writes/clears EW_USER_KEY; the welcome/switchback pending+seen keys
// are one-time-guide bookkeeping, armed by the toggle and consumed on the
// next canvas/edit render.
const EW_USER_KEY = 'nx2:ew-user-enabled';

// Fixed page used by other e2e suites (see delete.spec.js, preview_publish.spec.js)
// as a stable, always-exists page — no create/delete needed for this flow.
const PINGTEST_URL = `${ENV}/edit#/${TEST_ORG}/${TEST_SITE}/tests/pingtest`;

function getEwUserFlag(page) {
  return page.evaluate((key) => window.localStorage.getItem(key), EW_USER_KEY);
}

test.describe('Experience Workspace user toggle', () => {
  test('First-time toggle on redirects to canvas and shows the welcome dialog', async ({ page }) => {
    await page.goto(PINGTEST_URL);
    await dismissAlertBanner(page);

    await page.getByRole('switch', { name: 'New Authoring' }).click();
    await page.waitForURL(/\/canvas#/);
    await expect(page).toHaveURL(/\/canvas#/);

    await page.getByRole('heading', { name: 'Welcome to Experience' }).isVisible();
    await page.getByRole('button', { name: 'Get started' }).click();

    await expect.poll(() => getEwUserFlag(page)).toBe('true');
  });

  test('Toggling on redirects to /canvas, and revisiting /edit redirects there again', async ({ page }) => {
    await page.goto(PINGTEST_URL);
    await dismissAlertBanner(page);

    await page.getByRole('switch', { name: 'New Authoring' }).click();
    await page.waitForURL(/\/canvas#/);
    await expect(page).toHaveURL(/\/canvas#/);

    await page.getByRole('heading', { name: 'Welcome to Experience' }).isVisible();
    await page.getByRole('button', { name: 'Get started' }).click();

    // Revisit /edit — the user flag is still on, so it should redirect straight back.
    await page.goto(PINGTEST_URL);
    await page.waitForURL(/\/canvas#/);
    await expect(page).toHaveURL(/\/canvas#/);
  });

  test('Toggling off in the profile menu clears the flag and redirects back to /edit', async ({ page }) => {
    await page.goto(PINGTEST_URL);
    await dismissAlertBanner(page);

    await page.getByRole('switch', { name: 'New Authoring' }).click();
    await page.waitForURL(/\/canvas#/);
    await expect(page).toHaveURL(/\/canvas#/);

    await page.getByRole('heading', { name: 'Welcome to Experience' }).isVisible();
    await page.getByRole('button', { name: 'Get started' }).click();

    expect(await getEwUserFlag(page)).toBe('true');

    await page.getByRole('button', { name: 'Open profile menu' }).click();
    await expect(page.getByRole('switch', { name: 'New Authoring' })).toBeVisible();
    await page.getByRole('switch', { name: 'New Authoring' }).click();
    await expect(page.getByRole('heading', { name: 'Help us improve the new' })).toBeVisible();
    await page.getByRole('button', { name: 'Skip' }).click();

    await expect.poll(() => getEwUserFlag(page)).toBeNull();

    // Re-visiting /edit now that the flag is cleared should NOT redirect to /canvas again.
    await page.goto(PINGTEST_URL);
    await expect(page).toHaveURL(/\/edit#/);
  });
});
