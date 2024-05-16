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
import ENV from './env.js';

function getTestURL(type, testIdentifier, workerInfo) {
  const dateStamp = Date.now().toString(36);
  const pageName = `pw-${testIdentifier}-${dateStamp}-${workerInfo.project.name}`;
  return `${ENV}/${type}#/da-sites/da-status/tests/${pageName}`;
}

/**
 * Returns a URL for a single-use test page.
 *
 * @param {string} testIdentifier - A identifier for the test
 * @param {object} workerInfo - workerInfo as passed in by Playwright
 * @returns {string} The URL for the test page.
 */
export function getTestPageURL(testIdentifier, workerInfo) {
  return getTestURL('edit', testIdentifier, workerInfo);
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
  const re = /pw-\w+(-t1)*-(\w+)-\w+/;
  const res = re.exec(fileName);
  if (res) {
    return parseInt(res[2], 36);
  }
  return null;
}
