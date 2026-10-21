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
import { runFolderFor } from '../utils/env.js';
import { getTestPageURL, getTestResourceAge } from '../utils/page.js';

test('runFolderFor maps branches to pw- run folders', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  expect(runFolderFor('collabfx')).toBe('pw-collabfx');
  expect(runFolderFor(undefined)).toBe('pw-main');
  expect(runFolderFor('')).toBe('pw-main');
  expect(runFolderFor('local')).toBe('pw-local');
  expect(runFolderFor('local-https')).toBe('pw-local');
});

test('getTestPageURL nests pages under the run folder', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const url = getTestPageURL('edit1', { project: { name: 'chromium' } });
  // hash portion: /{org}/{site}/tests/pw-{branch}/pw-edit1-{ts}-chromium
  expect(url).toMatch(/#\/[^/]+\/[^/]+\/tests\/pw-[a-z0-9-]+\/pw-edit1-[a-z0-9]+-chromium$/);
});

test('marker name is aged by getTestResourceAge', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  const age = getTestResourceAge('pw-run-mtlj1mp2-marker');
  expect(age).toBe(parseInt('mtlj1mp2', 36));
});
