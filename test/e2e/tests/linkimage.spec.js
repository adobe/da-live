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
import { getTestPageURL, TEST_ORG, TEST_SITE } from '../utils/page.js';
import { createResource } from '../utils/cleanup.js';

const BASE = 'https://delivery-p1-e1.adobeaemcloud.com/adobe/assets';
const SRC = `${BASE}/urn:aaid:aem:3b6e-11/as/linkimg.jpg`;
const SRC2 = `${BASE}/urn:aaid:aem:7c2d-22/as/linkimg-cell.jpg`;

const linkImage = (src, alt) => `<p><a href="${src}" title="${alt}" data-edit-as="image">${src}</a></p>`;
const wrap = (inner) => `<body><header></header><main><div>${inner}</div></main><footer></footer></body>`;

function getSourceUrl(pageURL) {
  const [, org, site, ...rest] = pageURL.split('#')[1].split('/');
  return TEST_SITE === 'da-status'
    ? `https://admin.da.live/source/${org}/${site}/${rest.join('/')}.html`
    : `https://api.aem.live/${org}/sites/${site}/source/${rest.join('/')}.html`;
}

async function seedAndOpen(page, pageURL, html) {
  let authHeader;
  page.on('request', (request) => {
    const auth = request.headers().authorization;
    if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
  });

  await page.goto(pageURL);
  await expect.poll(() => authHeader, { timeout: 15000 }).toBeTruthy();

  const [, org, site, ...rest] = pageURL.split('#')[1].split('/');
  const resp = await createResource(page, authHeader, TEST_ORG, TEST_SITE, `/${rest.join('/')}`, html);
  expect(resp.ok(), `seed failed for ${org}/${site}: ${resp.status()}`).toBeTruthy();

  await page.reload();
  const proseMirror = page.locator('div.ProseMirror');
  await expect(proseMirror).toBeVisible();
  await expect(proseMirror).toHaveAttribute('contenteditable', 'true');
  return authHeader;
}

function readSource(page, sourceUrl, authHeader, check) {
  return async () => {
    const headers = { Authorization: authHeader };
    const resp = await page.request.get(sourceUrl, { headers, failOnStatusCode: false });
    return check(await resp.text());
  };
}

function parseAnchors(page, html, srcs) {
  return page.evaluate(({ source, list }) => {
    const doc = new DOMParser().parseFromString(source, 'text/html');
    return {
      anchors: list.map((src) => {
        const a = [...doc.querySelectorAll('a')].find((el) => el.getAttribute('href') === src);
        if (!a) return null;
        return {
          tag: a.tagName,
          href: a.getAttribute('href'),
          title: a.getAttribute('title'),
          editAs: a.getAttribute('data-edit-as'),
          text: a.textContent,
          parent: a.parentElement.tagName,
        };
      }),
      images: [...doc.querySelectorAll('img, picture')].length,
    };
  }, { source: html, list: srcs });
}

test('Editable link-images round-trip through the editor', async ({ page }, workerInfo) => {
  test.setTimeout(90000);

  const pageURL = getTestPageURL('linkimg', workerInfo);
  const html = wrap(`<p>Plain paragraph</p>${linkImage(SRC, 'Section alt')}<div class="columns"><div><div>${linkImage(SRC2, 'Cell alt')}</div><div><p>cell text</p></div></div></div>`);
  const authHeader = await seedAndOpen(page, pageURL, html);

  const proseMirror = page.locator('div.ProseMirror');
  const images = proseMirror.locator('img[data-edit-as="image"]');
  await expect(images).toHaveCount(2);
  await expect(images.nth(0)).toHaveAttribute('src', SRC);
  await expect(images.nth(0)).toHaveAttribute('alt', 'Section alt');
  await expect(images.nth(1)).toHaveAttribute('src', SRC2);
  await expect(images.nth(1)).toHaveAttribute('alt', 'Cell alt');
  await expect(proseMirror.locator('a[data-edit-as]')).toHaveCount(0);
  await expect(proseMirror).not.toContainText(SRC);
  await expect(proseMirror).not.toContainText(SRC2);

  const marker = `marker${Date.now().toString(36)}`;
  await proseMirror.getByText('Plain paragraph').click();
  await page.keyboard.press('End');
  await page.keyboard.type(` ${marker}`);

  const sourceUrl = getSourceUrl(pageURL);
  await expect.poll(
    readSource(page, sourceUrl, authHeader, (body) => body.includes(marker)),
    { timeout: 30000, intervals: [1000] },
  ).toBe(true);

  const resp = await page.request.get(sourceUrl, { headers: { Authorization: authHeader } });
  const saved = await parseAnchors(page, await resp.text(), [SRC, SRC2]);
  expect(saved.images).toBe(0);
  [[SRC, 'Section alt'], [SRC2, 'Cell alt']].forEach(([src, alt], i) => {
    expect(saved.anchors[i]).toEqual({
      tag: 'A',
      href: src,
      title: alt,
      editAs: 'image',
      text: src,
      parent: 'P',
    });
  });
});

test('Editing alt text of an editable link-image persists as title', async ({ page }, workerInfo) => {
  test.setTimeout(90000);

  const pageURL = getTestPageURL('linkalt', workerInfo);
  const authHeader = await seedAndOpen(page, pageURL, wrap(`<p>Intro</p>${linkImage(SRC, 'Old alt')}`));

  const image = page.locator('div.ProseMirror img[data-edit-as="image"]');
  await expect(image).toHaveCount(1);
  await image.click();

  const altItem = page.locator('.img-alt-text');
  await expect(altItem).not.toHaveClass(/disabled/);
  await altItem.click();

  const palette = page.locator('da-palette');
  await palette.waitFor();
  const newAlt = `New alt ${Date.now().toString(36)}`;
  await palette.locator('#field-altText').fill(newAlt);
  await page.keyboard.press('Enter');

  await expect(image).toHaveAttribute('alt', newAlt);

  const sourceUrl = getSourceUrl(pageURL);
  await expect.poll(
    readSource(page, sourceUrl, authHeader, async (body) => {
      const saved = await parseAnchors(page, body, [SRC]);
      return saved.anchors[0]?.title;
    }),
    { timeout: 30000, intervals: [1000] },
  ).toBe(newAlt);

  const resp = await page.request.get(sourceUrl, { headers: { Authorization: authHeader } });
  const saved = await parseAnchors(page, await resp.text(), [SRC]);
  expect(saved.images).toBe(0);
  expect(saved.anchors[0]).toEqual({
    tag: 'A',
    href: SRC,
    title: newAlt,
    editAs: 'image',
    text: SRC,
    parent: 'P',
  });
});
