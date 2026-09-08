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

test('runFolderFor maps branches to pw- run folders', async ({}, workerInfo) => {
  if (workerInfo.project.name !== 'chromium') return;
  expect(runFolderFor('collabfx')).toBe('pw-collabfx');
  expect(runFolderFor(undefined)).toBe('pw-main');
  expect(runFolderFor('')).toBe('pw-main');
  expect(runFolderFor('local')).toBe('pw-local');
  expect(runFolderFor('local-https')).toBe('pw-local');
});
