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
import { expect } from '@playwright/test';
import { BROWSE } from './env.js';

/*
 * Browse page object. Specs describe user flows through these helpers so the same
 * spec runs against legacy (BROWSE=1) and the redesign (BROWSE=2). Anything that
 * differs between the two implementations lives here and nowhere else.
 */

/** The row for a given link href, e.g. `/edit#/org/site/page`. */
export function row(page, href) {
  return page.locator('da-list-item', { has: page.locator(`a[href="${href}"]`) });
}

export async function selectRow(page, href) {
  // The checkbox is visually hidden until the row is hovered or focused.
  await row(page, href).locator('input[name="item-selected"]').check({ force: true });
}

export function deleteButton(page) {
  return page.locator('button.delete-button').filter({ visible: true });
}

export function confirmDeleteButton(page) {
  if (BROWSE === '2') {
    return page.locator('da-confirm-dialog').getByRole('button', { name: /^(Unpublish & delete|Delete)$/ });
  }
  return page.locator('sl-button.negative').filter({ visible: true });
}

export async function deleteSelected(page, href) {
  await deleteButton(page).click();
  await expect(page.getByText(/^Deleting \d+ items?/)).toBeVisible();
  const confirm = confirmDeleteButton(page);
  // The action stays disabled while publish status is checked; sl-button's host
  // never reports disabled to Playwright, so check the attribute.
  await expect(confirm).not.toHaveAttribute('disabled');
  await confirm.click();
  if (href) await expect(row(page, href)).toHaveCount(0);
}
