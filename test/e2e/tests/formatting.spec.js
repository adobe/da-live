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
import { test, expect } from '@playwright/test';
import { getTestPageURL, fill } from '../utils/page.js';

const MOD = process.platform === 'darwin' ? 'Meta' : 'Control';

// Word positions within the default lorem ipsum first sentence:
// "Lorem ipsum dolor sit amet, consectetur adipiscing elit."
const WORDS = {
  Lorem: { offset: 0, length: 5 },
  ipsum: { offset: 6, length: 5 },
  dolor: { offset: 12, length: 5 },
  sit: { offset: 18, length: 3 },
  amet: { offset: 22, length: 4 },
  consectetur: { offset: 28, length: 11 },
};

async function insertLoremIpsum(page) {
  await page.keyboard.type('/lorem');
  await page.locator('slash-menu[visible]').waitFor();
  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
}

async function getFirstParagraphStart(page) {
  return page.evaluate(() => {
    const { view } = window;
    const { state } = view;
    let pos = -1;
    state.doc.forEach((node, offset) => {
      if (pos === -1 && node.type.name === 'paragraph') {
        pos = offset + 1;
      }
    });
    return pos;
  });
}

async function applyMarkToRange(page, markName, from, to) {
  await page.evaluate(({ name, from: f, to: t }) => {
    const { view } = window;
    const markType = view.state.schema.marks[name];
    if (!markType) return;
    view.dispatch(view.state.tr.addMark(f, t, markType.create()));
  }, { name: markName, from, to });
}

async function selectRange(page, from, to) {
  await page.evaluate(({ from: f, to: t }) => {
    const { view } = window;
    const { state } = view;
    const sel = state.selection.constructor.create(state.doc, f, t);
    view.dispatch(state.tr.setSelection(sel));
    view.focus();
  }, { from, to });
}

test('Text formatting and links persist after reload', async ({ page }, workerInfo) => {
  test.setTimeout(60000);

  const url = getTestPageURL('formatting', workerInfo);
  console.log(url);
  await page.goto(url);

  const proseMirror = page.locator('div.ProseMirror');
  await expect(proseMirror).toBeVisible();
  await expect(proseMirror).toHaveAttribute('contenteditable', 'true');
  await page.waitForTimeout(2000);

  // --- Build document structure ---
  // H1 heading
  await fill(page, 'Heading Level One');
  await page.keyboard.press(`${MOD}+Alt+1`);
  await page.keyboard.press('Enter');

  // First lorem ipsum paragraph via / command menu
  await insertLoremIpsum(page);
  await page.keyboard.press('Enter');

  // H2 heading
  await page.keyboard.type('Heading Level Two');
  await page.keyboard.press(`${MOD}+Alt+2`);
  await page.keyboard.press('Enter');

  // Second lorem ipsum paragraph via / command menu
  await insertLoremIpsum(page);

  // --- Apply inline formatting to words in the first lorem paragraph ---
  // Using absolute ProseMirror positions avoids browser-specific mark boundary
  // cursor behavior that causes off-by-one errors with keyboard navigation.
  const paraStart = await getFirstParagraphStart(page);

  // "Lorem" → Bold
  await applyMarkToRange(
    page,
    'strong',
    paraStart + WORDS.Lorem.offset,
    paraStart + WORDS.Lorem.offset + WORDS.Lorem.length,
  );

  // "ipsum" → Italic
  await applyMarkToRange(
    page,
    'em',
    paraStart + WORDS.ipsum.offset,
    paraStart + WORDS.ipsum.offset + WORDS.ipsum.length,
  );

  // "dolor" → Underline
  await applyMarkToRange(
    page,
    'u',
    paraStart + WORDS.dolor.offset,
    paraStart + WORDS.dolor.offset + WORDS.dolor.length,
  );

  // "sit" → Superscript
  await applyMarkToRange(
    page,
    'sup',
    paraStart + WORDS.sit.offset,
    paraStart + WORDS.sit.offset + WORDS.sit.length,
  );

  // "amet" → Subscript
  await applyMarkToRange(
    page,
    'sub',
    paraStart + WORDS.amet.offset,
    paraStart + WORDS.amet.offset + WORDS.amet.length,
  );

  // --- Apply link to "consectetur" pointing to https://adobe.com ---
  // Select the word then use Mod+K to open the link dialog
  const linkFrom = paraStart + WORDS.consectetur.offset;
  const linkTo = linkFrom + WORDS.consectetur.length;
  await selectRange(page, linkFrom, linkTo);
  await page.keyboard.press(`${MOD}+k`);

  await page.locator('da-palette').waitFor();
  await page.locator('da-palette').locator('#field-href').fill('https://adobe.com');
  await page.keyboard.press('Enter');

  // Wait for Y.js to persist the content to the server
  await page.waitForTimeout(5000);

  // --- Reload and verify all formatting was retained ---
  await page.reload();
  await expect(proseMirror).toBeVisible();
  await page.waitForTimeout(3000);

  // Verify headings
  await expect(proseMirror.locator('h1')).toContainText('Heading Level One');
  await expect(proseMirror.locator('h2')).toContainText('Heading Level Two');

  // Verify inline formatting persisted in first lorem paragraph
  await expect(proseMirror.locator('p strong').first()).toContainText('Lorem');
  await expect(proseMirror.locator('p em').first()).toContainText('ipsum');
  await expect(proseMirror.locator('p u').first()).toContainText('dolor');
  await expect(proseMirror.locator('p sup').first()).toContainText('sit');
  await expect(proseMirror.locator('p sub').first()).toContainText('amet');

  // Verify link
  const link = proseMirror.locator('a[href="https://adobe.com"]');
  await expect(link).toContainText('consectetur');
});
