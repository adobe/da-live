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
import { test, expect } from '@playwright/test';
import ENV from '../../utils/env.js';
import { getQuery, getTestPageURL, TEST_SITE } from '../../utils/page.js';
import { createResource, parseTestUrl } from '../../utils/cleanup.js';

const ASSET = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets/urn:aaid:aem:00000000-0000-0000-0000-000000000001/as';
const LINK_IMG = `${ASSET}/link-image.avif`;
const CELL_LINK_IMG = `${ASSET}/cell-link-image.avif`;
const NORMAL_IMG = `${ASSET}/normal-image.avif`;
const NORMAL_IMG_SEL = 'div.ProseMirror img[alt="Normal image alt"]:not([data-edit-as])';

const DOC = `<body><header></header><main><div>
<p>Intro text</p>
<p><a href="${LINK_IMG}" title="Link image alt" data-edit-as="image">${LINK_IMG}</a></p>
<div class="columns"><div><div><p><img src="${NORMAL_IMG}" alt="Normal image alt"></p><p><a href="${CELL_LINK_IMG}" title="Cell link image alt" data-edit-as="image">${CELL_LINK_IMG}</a></p></div><div><p>Cell text</p></div></div></div>
</div></main><footer></footer></body>`;

const linkImageSel = (src) => `div.ProseMirror img[data-edit-as="image"][src="${src}"]`;

function sourceUrl({ org, site, path }) {
  if (TEST_SITE === 'da-status') return `https://admin.da.live/source/${org}/${site}${path}.html`;
  return `https://api.aem.live/${org}/sites/${site}/source${path}.html`;
}

function linkImageAnchors(html) {
  return [...html.matchAll(/<a [^>]*data-edit-as="image"[^>]*>/g)].map(([tag]) => tag);
}

async function openSeededDoc(page, testId, workerInfo) {
  const url = getTestPageURL(testId, workerInfo);
  const target = parseTestUrl(url);

  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });
  await page.goto(`${ENV}/${getQuery()}#/${target.org}/${target.site}/tests`);
  await expect.poll(() => authHeader, { timeout: 15000 }).toBeTruthy();

  const resp = await createResource(page, authHeader, target.org, target.site, target.path, DOC);
  expect(resp.ok(), `seed failed (${resp.status()})`).toBeTruthy();

  await page.goto(url);
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator(linkImageSel(LINK_IMG))).toBeVisible();
  await page.waitForTimeout(2000);

  const getSource = async () => {
    const r = await page.request.get(sourceUrl(target), { headers: { Authorization: authHeader } });
    return r.text();
  };
  return { getSource };
}

test('Link-images load as images and save back as anchors', async ({ page }, workerInfo) => {
  test.setTimeout(60000);
  const { getSource } = await openSeededDoc(page, 'linkimg1', workerInfo);

  await expect(page.locator(linkImageSel(LINK_IMG))).toHaveAttribute('alt', 'Link image alt');
  await expect(page.locator(linkImageSel(CELL_LINK_IMG))).toHaveAttribute('alt', 'Cell link image alt');
  await expect(page.locator(NORMAL_IMG_SEL)).toBeVisible();

  await page.locator('div.ProseMirror p', { hasText: 'Intro text' }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' edited');

  await expect.poll(getSource, { timeout: 15000 }).toContain('Intro text edited');
  const html = await getSource();
  const anchors = linkImageAnchors(html);
  expect(anchors).toHaveLength(2);
  expect(anchors.find((a) => a.includes(`href="${LINK_IMG}"`))).toContain('title="Link image alt"');
  expect(anchors.find((a) => a.includes(`href="${CELL_LINK_IMG}"`))).toContain('title="Cell link image alt"');
  expect(html).toMatch(/<img [^>]*alt="Normal image alt"/);
});

test('Link controls are disabled on link-images', async ({ page }, workerInfo) => {
  test.setTimeout(60000);
  await openSeededDoc(page, 'linkimg2', workerInfo);

  const editLink = page.locator('.edit-link');
  const palette = page.locator('da-palette');

  await page.locator(linkImageSel(LINK_IMG)).click();
  await expect(editLink).toHaveClass(/ProseMirror-menu-disabled/);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette).toHaveCount(0);

  await page.locator(NORMAL_IMG_SEL).click();
  await expect(editLink).not.toHaveClass(/ProseMirror-menu-disabled/);
  await page.keyboard.press('ControlOrMeta+k');
  await expect(palette).toHaveCount(1);
});

test('Editing link-image alt saves the anchor title', async ({ page }, workerInfo) => {
  test.setTimeout(60000);
  const { getSource } = await openSeededDoc(page, 'linkimg3', workerInfo);

  await page.locator(linkImageSel(LINK_IMG)).click();
  await page.locator('.img-alt-text').click();
  const input = page.locator('da-palette input');
  await expect(input).toHaveValue('Link image alt');
  await input.fill('New alt');
  await input.press('Enter');
  await expect(page.locator(linkImageSel(LINK_IMG))).toHaveAttribute('alt', 'New alt');

  await expect.poll(async () => {
    const anchors = linkImageAnchors(await getSource());
    return anchors.find((a) => a.includes(`href="${LINK_IMG}"`)) ?? '';
  }, { timeout: 15000 }).toContain('title="New alt"');
});
