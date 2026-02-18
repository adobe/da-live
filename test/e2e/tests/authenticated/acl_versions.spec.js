/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery } from '../../utils/page.js';

test('Can read versions of read-write document', async ({ page }) => {
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/dir-readwrite/doc-rw`;

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('This is v2');

  await page.getByRole('button', { name: 'Versions' }).click();

  // find v1 and check it — the click expands the version entry to reveal its
  // button; WebKit needs a beat for the expansion to start processing.
  await page.getByText('v1').click();
  await page.waitForTimeout(500);
  const v1Button = page.locator('li').filter({ hasText: 'v1' }).getByRole('button');
  await expect(v1Button).toBeVisible();
  await v1Button.click();

  await page.locator('div.da-version-preview').waitFor({ timeout: 15000 });
  const versionPreview = page.locator('div.da-version-preview > div.ProseMirror');
  await expect(versionPreview).toHaveText('Initial version');

  // check that the restore button is enabled
  await expect(page.locator('da-editor').getByRole('button', { name: 'Restore' })).toBeEnabled();
});

test('Cannot read versions of read-only document', async ({ page }) => {
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/dir-readonly/doc-r`;

  await page.goto(url);
  const editor = page.locator('div.ProseMirror');
  await expect(editor).toHaveText('We have v2 here');

  await page.getByRole('button', { name: 'Versions' }).click();

  // find v1 and check it — the click expands the version entry to reveal its
  // button; WebKit needs a beat for the expansion to start processing.
  await page.getByText('version 1').click();
  await page.waitForTimeout(500);
  const v1Button = page.locator('li').filter({ hasText: 'version 1' }).getByRole('button');
  await expect(v1Button).toBeVisible();
  await v1Button.click();

  await page.locator('div.da-version-preview').waitFor({ timeout: 15000 });
  const versionPreview = page.locator('div.da-version-preview > div.ProseMirror');
  await expect(versionPreview).toHaveText('We have v1 here');

  // check the restore button is disabled, as it's a readonly page
  await expect(page.locator('da-editor').getByRole('button', { name: 'Restore' })).toBeDisabled();
});

test('Cannot access versions of no-access document', async ({ page }) => {
  const url = `${ENV}/edit${getQuery()}#/da-testautomation/acltest/testdocs/dir-noaccess/doc-nope`;

  await page.goto(url);

  // The page should not be visible at all
  await expect(page.locator('div.ProseMirror')).toHaveCount(0);
});
