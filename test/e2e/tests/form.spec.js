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
import { test as base, expect } from '../utils/fixtures.js';
import ENV, { TEST_ORG, TEST_SITE, RUN_FOLDER } from '../utils/env.js';
import { getQuery, getTestResourceName, waitForSave } from '../utils/page.js';
import { createResource, deleteResource, FORM_SCHEMAS_FOLDER } from '../utils/cleanup.js';

const RUN_FOLDER_PATH = `/tests/${RUN_FOLDER}`;
const ENV_ORIGIN = new URL(ENV).origin;
const TITLE_SCHEMA = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'E2E form schema with title field',
  type: 'object',
  properties: { title: { type: 'string', title: 'Title' } },
};

function getFormURL(documentName) {
  return `${ENV}/form${getQuery()}#/${TEST_ORG}/${TEST_SITE}${RUN_FOLDER_PATH}/${documentName}`;
}

function toDocument(content) {
  return `<body><header></header><main><div>${content}</div></main><footer></footer></body>`;
}

// The form reads the schema JSON from the first <code> element.
function toSchemaDocument(schema) {
  return toDocument(`<pre><code>${JSON.stringify(schema)}</code></pre>`);
}

function branchRequests(urls, pathname) {
  return urls.filter((url) => url.origin === ENV_ORIGIN && url.pathname === pathname);
}

// TODO: Remove once the /form page content declares a `form` block.

// The /form page declares an `nx-form` block, which loads da-nx's copy.
// Serving it as a `form` block makes the page load da-live's copy instead.
async function useRoutedFormBlock(page) {
  await page.route(
    (url) => url.origin === ENV_ORIGIN && url.pathname === '/form',
    async (route) => {
      const response = await route.fetch();
      const body = (await response.text()).replace('class="nx-form"', 'class="form"');
      await route.fulfill({ response, body });
    },
  );
}

const test = base.extend({
  page: async ({ page }, use) => {
    await useRoutedFormBlock(page);
    await use(page);
  },

  // The block loads the same way whether or not the document exists, so this
  // opens a name that is never created.
  formPageRequests: async ({ page }, use, testInfo) => {
    const requestedUrls = [];
    page.on('request', (request) => requestedUrls.push(new URL(request.url())));

    await page.goto(getFormURL(getTestResourceName('formroute', testInfo)));
    await expect(page.locator('div.form nx-form')).toBeAttached();
    // The block keeps importing modules (chat) after the editor mounts. Wait
    // until loading settles so absence checks see every request.
    await page.waitForLoadState('networkidle');
    await use(requestedUrls);
  },

  authHeader: async ({ page }, use, testInfo) => {
    // Without a sign-in, no request carries a bearer token to wait for.
    testInfo.skip(!!process.env.SKIP_AUTH, 'The source API needs a signed-in user');

    const authorizedRequest = page.waitForRequest(
      (request) => request.headers().authorization?.startsWith('Bearer '),
    );
    await page.goto(`${ENV}/${getQuery()}#/${TEST_ORG}/${TEST_SITE}/tests`);
    const request = await authorizedRequest;
    await use(request.headers().authorization);
  },

  source: async ({ page, authHeader }, use) => {
    await use({
      create: (path, body) => createResource(page, authHeader, TEST_ORG, TEST_SITE, path, body),
      remove: (path) => deleteResource(page, authHeader, TEST_ORG, TEST_SITE, path),
    });
  },

  schemaName: async ({ source }, use, testInfo) => {
    const schemaName = getTestResourceName('formschema', testInfo);
    const schemaPath = `${FORM_SCHEMAS_FOLDER}/${schemaName}`;
    const response = await source.create(schemaPath, toSchemaDocument(TITLE_SCHEMA));
    await expect(response).toBeOK();

    await use(schemaName);
    const removal = await source.remove(schemaPath);
    await expect(removal, `Leaked schema ${schemaPath}`).toBeOK();
  },

  documentName: async ({ source }, use, testInfo) => {
    const documentName = getTestResourceName('formdocument', testInfo);
    const documentPath = `${RUN_FOLDER_PATH}/${documentName}`;
    const response = await source.create(documentPath, toDocument(''));
    await expect(response).toBeOK();

    await use(documentName);
    const removal = await source.remove(documentPath);
    await expect(removal, `Leaked document ${documentPath}`).toBeOK();
  },
});

test('Form loads its block and SDK from da-live', async ({ formPageRequests }) => {
  const nxFormRequests = formPageRequests
    .filter((url) => url.pathname.startsWith('/nx/blocks/form/'));

  expect(branchRequests(formPageRequests, '/blocks/form/form.js')).toHaveLength(1);
  expect(branchRequests(formPageRequests, '/deps/da-sc-sdk/dist/index.js')).toHaveLength(1);
  expect(nxFormRequests).toHaveLength(0);
});

test('Form loads the nx2 runtime once', async ({ formPageRequests }) => {
  const nxScriptRequests = formPageRequests
    .filter((url) => url.pathname.endsWith('/nx2/scripts/nx.js'));

  expect(nxScriptRequests).toHaveLength(1);
});

test('Form keeps a saved value after reload', async ({ page, schemaName, documentName }, testInfo) => {
  const form = page.locator('nx-form');
  const titleField = form.getByRole('textbox', { name: 'Title', exact: true });
  const enteredTitle = `[${testInfo.project.name}] Saved by test ${Date.now()}`;

  await page.goto(getFormURL(documentName));
  await form.getByRole('combobox', { name: 'Schema' }).selectOption(schemaName);
  await form.getByRole('button', { name: 'Create' }).click();
  const saved = waitForSave(page);
  await titleField.fill(enteredTitle);
  await saved;
  await page.reload();

  await expect(titleField).toHaveValue(enteredTitle);
});
