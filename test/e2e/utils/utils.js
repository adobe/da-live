/*
 * Copyright 2024 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * Some environments show a dismissible alert banner the first time the browse
 * view loads. If present, dismiss it so it doesn't block later interactions.
 *
 * @param {import('@playwright/test').Page} page
 */
export async function dismissAlertBanner(page) {
  const alert = page.getByRole('alert');
  const dismiss = () => alert.getByRole('button', { name: 'Dismiss' }).click().catch(() => {});

  let visible = await alert.isVisible().catch(() => false);
  if (!visible) {
    // The banner can take a moment to appear; wait once and check again
    // before giving up, but skip the wait entirely if it's already there.
    await page.waitForTimeout(3000);
    visible = await alert.isVisible().catch(() => false);
  }

  if (visible) {
    await dismiss();
  } else {
    // Some banners (e.g. the "public sandbox" org warning) depend on an async
    // check that can resolve well after this initial window, then sit on top
    // of later controls (e.g. the preview button) and block clicks. Keep
    // watching for a late appearance for the rest of the test instead of
    // giving up after a single check.
    alert.waitFor({ state: 'visible' }).then(dismiss).catch(() => {});
  }
}

/**
 * Asserts the shared "Not permitted" message, clicks its "Open Profile"
 * button and checks that the nx profile menu opens with keyboard focus
 * inside it (so Tab moves through the menu controls).
 *
 * @param {import('@playwright/test').Page} page
 * @param {typeof import('@playwright/test').expect} expect
 */
export async function expectNotPermittedOpensProfile(page, expect) {
  await expect(page.getByRole('heading', { name: 'Not permitted' })).toBeVisible();
  await expect(page.getByText('Please make sure you are logged in with the correct user')).toBeVisible();

  // The error message can render before the profile component is ready.
  await expect(page.getByRole('button', { name: 'Open profile menu', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open Profile', exact: true }).click();
  await expect(page.locator('#nx-menu-profile')).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return !!active?.closest('#nx-menu-profile');
  }), 'Focus should move into the profile menu').toBe(true);
}

/**
 * Makes GET requests matching `urlPattern` answer 403 while keeping the real
 * response headers (CORS), simulating a user signed into an org without access.
 * Returns a function that removes the override again.
 *
 * @param {import('@playwright/test').Page} page
 * @param {RegExp} urlPattern
 */
export async function forceForbidden(page, urlPattern) {
  const handler = async (route) => {
    if (route.request().method() !== 'GET') {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    await route.fulfill({ response, status: 403, body: '' });
  };
  await page.route(urlPattern, handler);
  return () => page.unroute(urlPattern, handler);
}
