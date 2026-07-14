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
import { expect } from '@playwright/test';
import ENV, { TEST_ORG, TEST_SITE } from './env.js';

export { TEST_ORG, TEST_SITE };

export function getQuery() {
  const { GITHUB_HEAD_REF: branch } = process.env;
  if (branch === 'local' || branch === 'local-https') {
    return '?da-admin=local&da-collab=local';
  }
  return '';
}

const QUERY = getQuery();

function getTestURL(type, testIdentifier, workerInfo, dir = `/${TEST_ORG}/${TEST_SITE}/tests`) {
  const dateStamp = Date.now().toString(36);
  const pageName = `pw-${testIdentifier}-${dateStamp}-${workerInfo.project.name}`;
  return `${ENV}/${type}${QUERY}#${dir}/${pageName}`;
}

/**
 * Returns a URL for a single-use test page.
 *
 * @param {string} testIdentifier - A identifier for the test
 * @param {object} workerInfo - workerInfo as passed in by Playwright
 * @param {string} dir - The directory to use (optional)
 * @returns {string} The URL for the test page.
 */
export function getTestPageURL(testIdentifier, workerInfo, dir) {
  return getTestURL('edit', testIdentifier, workerInfo, dir);
}

/**
 * Returns a URL for a single-use test folder.
 *
 * @param {string} testIdentifier - A identifier for the test
 * @param {object} workerInfo - workerInfo as passed in by Playwright
 * @param {string} dir - The directory to use (optional)
 * @returns {string} The URL for the test page.
 */
export function getTestFolderURL(testIdentifier, workerInfo, dir) {
  return getTestURL('', testIdentifier, workerInfo, dir);
}

/**
 * Returns a URL for a single-use test sheet.
 *
 * @param {string} testIdentifier - A identifier for the test
 * @param {object} workerInfo - workerInfo as passed in by Playwright
 * @returns {string} The URL for the test page.
 */
export function getTestSheetURL(testIdentifier, workerInfo) {
  return getTestURL('sheet', testIdentifier, workerInfo);
}

/**
 * Return the age of the test file by inspecting the timestamp in the filename.
 * It also checks if the filename matches the pattern of generated file names.
 * @param {String} fileName The file name, as generated in getTestURL()
 * @returns The age in ms or null if the file name does not match the pattern.
 */
export function getTestResourceAge(fileName) {
  const re = /pw-\w+-(\w+)-\w+/;
  const res = re.exec(fileName);
  if (res) {
    return parseInt(res[1], 36);
  }
  return null;
}

const SELECT_ALL = process.platform === 'darwin' ? 'Meta+a' : 'Control+a';

/**
 * Navigates to a document URL and creates a new document from the blank-page prompt,
 * waiting for the ProseMirror editor to become editable. Used by tests that need a
 * fresh document to work with (editing, deleting, previewing, publishing, etc).
 *
 * @param {import('@playwright/test').Page} page
 * @param {string} url - The URL of the (not yet existing) document to create.
 * @param {string} [content] - Optional text content to type into the document. If
 * provided, the function waits for the resulting save to complete before returning.
 */
export async function createDocument(page, url, content) {
  await page.goto(url);
  await page.getByText('Create document', { exact: true }).click();
  await expect(page.locator('div.ProseMirror')).toBeVisible();
  await expect(page.locator('div.ProseMirror')).toHaveAttribute('contenteditable', 'true');
  // Allow Y.js WebSocket to stabilize before typing
  await page.waitForTimeout(2000);

  if (content) {
    const savePromise = waitForSave(page);
    await fill(page, content);
    await savePromise;
  }
}

export async function fill(page, text) {
  const proseMirror = page.locator('div.ProseMirror');
  await proseMirror.click();
  await page.keyboard.press(SELECT_ALL);
  await page.keyboard.type(text);
}

export async function tabForward(page) {
  const browserName = page.context().browser()?.browserType().name();
  const key = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
  await page.keyboard.press(key);
}

export async function tabBackward(page) {
  const browserName = page.context().browser()?.browserType().name();
  const key = browserName === 'webkit' ? 'Shift+Alt+Tab' : 'Shift+Tab';
  await page.keyboard.press(key);
}

/**
 * Waits for the next successful save request (POST to da-admin's /source endpoint).
 * Sheet saves are debounced through a single shared timer that's cancelled and
 * rescheduled on every edit, so whichever change triggered this call is guaranteed
 * to be included in the next save that fires. Call this before triggering the change.
 */
export function waitForSave(page, timeout = 10000) {
  return page.waitForResponse((response) => response.request().method() === 'POST'
    && new URL(response.url()).pathname.includes('/source/')
    && response.ok(), { timeout });
}
