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

/*
 * Requires the following test assets to be present in DA:
 *   /da-testautomation/da-status/media-tests/test-image.png  - any PNG image
 *   /da-testautomation/da-status/media-tests/test-video.mp4  - any MP4 video
 *
 * The media page is reached via /media#/<org>/<site>/<path>/<file>.<ext>
 */

import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery } from '../../utils/page.js';

const BASE = `${ENV}/media${getQuery()}#`;
const IMG_PATH = '/da-testautomation/acltest/media/image.jpg';
const MP4_PATH = '/da-testautomation/acltest/media/big-buck-bunny.mp4';

test.describe('da-media — image', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}${IMG_PATH}`);
    // Wait for the web component to be defined and rendered
    await page.waitForFunction(() => customElements.get('da-media') !== undefined);
    await expect(page.locator('da-media')).toBeVisible();
  });

  test('da-media element is present on the page', async ({ page }) => {
    await expect(page.locator('da-media')).toBeVisible();
  });

  test('renders an img element for image files', async ({ page }) => {
    // Playwright pierces open shadow roots in locators
    const img = page.locator('da-media img');
    await expect(img).toBeVisible();
  });

  test('img src points to the content URL of the asset', async ({ page }) => {
    const img = page.locator('da-media img');
    const src = await img.getAttribute('src');
    expect(src).toContain('https://content.da.live/da-testautomation/acltest/media/image.jpg');
  });

  test('sets the document title to include the filename', async ({ page }) => {
    await expect(page).toHaveTitle('View image.jpg - Experience Workspace');
  });

  test('da-title component is visible alongside da-media', async ({ page }) => {
    await expect(page.locator('da-title')).toBeVisible();
  });
});

test.describe('da-media — video (mp4)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(`${BASE}${MP4_PATH}`);
    await page.waitForFunction(() => customElements.get('da-media') !== undefined);
    await expect(page.locator('da-media')).toBeVisible();
  });

  test('renders a video element for mp4 files', async ({ page }) => {
    const video = page.locator('da-media video');
    await expect(video).toBeVisible();
  });

  test('video element has controls attribute', async ({ page }) => {
    const video = page.locator('da-media video');
    await expect(video).toHaveAttribute('controls', '');
  });

  test('video source type is video/mp4', async ({ page }) => {
    const source = page.locator('da-media video source');
    await expect(source).toHaveAttribute('type', 'video/mp4');
  });

  test('video source src points to the content URL', async ({ page }) => {
    const source = page.locator('da-media video source');
    const src = await source.getAttribute('src');
    expect(src).toContain('https://content.da.live/da-testautomation/acltest/media/big-buck-bunny.mp4');
  });

  test('sets the document title to include the mp4 filename', async ({ page }) => {
    await expect(page).toHaveTitle('View big-buck-bunny.mp4 - Experience Workspace');
  });
});
