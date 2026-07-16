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

  let visible = await alert.isVisible().catch(() => false);
  if (!visible) {
    // The banner can take a moment to appear; wait once and check again
    // before giving up, but skip the wait entirely if it's already there.
    await page.waitForTimeout(3000);
    visible = await alert.isVisible().catch(() => false);
  }

  if (visible) {
    await alert.getByRole('button', { name: 'Dismiss' }).click();
  }
}
