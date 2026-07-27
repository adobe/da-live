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
import { test as base, expect } from '@playwright/test';
import { parseTestUrl, deleteResource } from './cleanup.js';

/**
 * Extends the base test with a `trackCleanup` fixture. Call
 * `trackCleanup(url)` (or `trackCleanup(url, { isFolder: true })`) right after
 * creating a test document/folder, and it will be deleted directly via the
 * admin API once the test finishes - regardless of whether it passed or
 * failed, since this teardown code runs after `use()` the same way a finally
 * block would.
 */
export const test = base.extend({
  trackCleanup: async ({ page }, use) => {
    let authHeader;
    page.on('request', (request) => {
      const auth = request.headers().authorization;
      if (auth?.startsWith('Bearer ') && !authHeader) authHeader = auth;
    });

    const registered = [];
    await use((url, opts) => registered.push({ url, opts }));

    await Promise.all(registered.map(({ url, opts }) => {
      if (!authHeader) return null;
      const { org, site, path } = parseTestUrl(url);
      return deleteResource(page, authHeader, org, site, path, opts).catch(() => {});
    }));
  },
});

export { expect };
