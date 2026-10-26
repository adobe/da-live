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

/*
 * Browse page object shared by the file-management flows.
 */

/** The row for a given link href, e.g. `/edit#/org/site/page`. */
export function row(page, href) {
  return page.locator('da-file-item', { has: page.locator(`a[href="${href}"]`) });
}

export async function selectRow(page, href) {
  await row(page, href).getByRole('checkbox', { name: 'Select item', exact: true }).check();
}

export function deleteButton(page) {
  return page.locator('button.delete-button').filter({ visible: true });
}

export function confirmDeleteButton(page) {
  return page.locator('da-confirm-dialog').getByRole('button', { name: /^(Unpublish & delete|Delete)$/ });
}

export async function deleteSelected(page, href) {
  await deleteButton(page).click();
  await expect(page.getByText(/^Deleting \d+ items?/)).toBeVisible();
  const confirm = confirmDeleteButton(page);
  await expect(confirm).toBeEnabled();
  await confirm.click();
  if (href) await expect(row(page, href)).toHaveCount(0);
}
