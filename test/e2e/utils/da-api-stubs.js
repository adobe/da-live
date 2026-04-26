/*
 * Copyright 2024 Adobe. All rights reserved.
 * DA Admin API route stubs for Playwright tests.
 *
 * Intercepts all outbound calls to admin.da.live (prod, stage, local) and
 * returns in-memory fixture responses so tests run without an IMS session.
 *
 * Usage — call BEFORE page.goto():
 *   import { stubDaApi } from '../utils/da-api-stubs.js';
 *   test.beforeEach(async ({ page }) => {
 *     await stubDaApi(page, { org: TEST_ORG, site: TEST_SITE });
 *   });
 */

/**
 * DA Admin origins that the nx-skills-editor component may target depending on
 * localStorage env overrides or the build-time `env` flag.  We stub all three
 * so tests work regardless of local configuration.
 */
const DA_ORIGINS = [
  'https://admin.da.live',
  'https://stage-admin.da.live',
  'http://localhost:8787',
];

/**
 * DA Agent origins that the component may call for MCP tool listings.
 * Keep in sync with getAgentOrigin() in skills-editor-api.js.
 */
const AGENT_ORIGINS = [
  'https://da-agent.adobeaem.workers.dev',
  'http://localhost:4002',
];

// ─── fixture helpers ──────────────────────────────────────────────────────────

function emptySheet() {
  return { total: 0, limit: 1000, offset: 0, data: [] };
}

function freshConfig() {
  return {
    ':names': ['skills', 'prompts', 'mcp-servers', 'agents', 'generated-tools', 'memory'],
    ':type': 'multi-sheet',
    skills: emptySheet(),
    prompts: emptySheet(),
    'mcp-servers': emptySheet(),
    agents: emptySheet(),
    'generated-tools': emptySheet(),
    memory: emptySheet(),
  };
}

/**
 * Extract a named field's value from a multipart/form-data string body.
 * Playwright's postData() gives us the raw multipart string.
 *
 * The parser finds the boundary from the first line, then scans for the named
 * part and extracts the body between the blank line and the next boundary.
 * More robust than the previous regex approach with look-around edge cases.
 *
 * @param {string} rawBody
 * @param {string} fieldName
 * @returns {string|null}
 */
function extractFormField(rawBody, fieldName) {
  if (!rawBody) return null;
  const lines = rawBody.split(/\r?\n/);
  const boundary = lines[0]?.trim();
  if (!boundary || !boundary.startsWith('--')) return null;

  let inPart = false;
  let foundField = false;
  let afterBlank = false;
  const bodyLines = [];

  for (const line of lines) {
    if (line.trim() === boundary || line.trim() === `${boundary}--`) {
      if (foundField && afterBlank) break;
      inPart = true;
      foundField = false;
      afterBlank = false;
      bodyLines.length = 0;
      continue;
    }
    if (inPart && !foundField) {
      if (line.includes(`name="${fieldName}"`)) foundField = true;
      continue;
    }
    if (foundField && !afterBlank) {
      if (line.trim() === '') { afterBlank = true; continue; }
      continue;
    }
    if (foundField && afterBlank) {
      bodyLines.push(line);
    }
  }
  return foundField ? bodyLines.join('\n') : null;
}

// ─── main export ──────────────────────────────────────────────────────────────

/**
 * Register Playwright route stubs for all DA Admin API calls so the
 * nx-skills-editor component loads fully without an IMS session.
 *
 * The stubs maintain stateful in-memory stores so create / update / delete
 * operations performed through the component UI are reflected in subsequent
 * read calls (useful for CRUD tests that verify the list re-renders).
 *
 * Must be called BEFORE page.goto().
 *
 * @param {import('@playwright/test').Page} page
 * @param {{ org: string, site: string }} opts
 * @returns {Promise<{ getConfig: () => object, sourceExists: Set<string> }>}
 */
export async function stubDaApi(page, { org, site }) {
  // Shared mutable state — each test gets its own via a fresh beforeEach call.
  let configStore = freshConfig();
  const sourceFiles = new Map(); // path → content string

  for (const DA of DA_ORIGINS) {
    // ── config GET / POST ───────────────────────────────────────────────────
    // eslint-disable-next-line no-await-in-loop
    await page.route(`${DA}/config/${org}/${site}/`, async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(configStore),
        });
        return;
      }

      if (method === 'POST') {
        try {
          const raw = route.request().postData() || '';
          const json = extractFormField(raw, 'config');
          if (json) configStore = JSON.parse(json);
        } catch (err) {
          // eslint-disable-next-line no-console
          console.warn('[da-api-stubs] Failed to parse config POST body:', err.message);
          /* keep previous state */
        }
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return;
      }

      await route.fulfill({ status: 200 });
    });

    // ── source files GET / PUT / DELETE ─────────────────────────────────────
    // eslint-disable-next-line no-await-in-loop
    await page.route(`${DA}/source/${org}/${site}/**`, async (route) => {
      const method = route.request().method();
      const { pathname } = new URL(route.request().url());

      if (method === 'GET') {
        if (sourceFiles.has(pathname)) {
          await route.fulfill({ status: 200, contentType: 'text/plain', body: sourceFiles.get(pathname) });
        } else {
          await route.fulfill({ status: 404, body: 'Not Found' });
        }
        return;
      }

      if (method === 'PUT') {
        // Extract file content from the FormData body
        const raw = route.request().postData() || '';
        const content = extractFormField(raw, 'data') || '';
        sourceFiles.set(pathname, content);
        await route.fulfill({ status: 200 });
        return;
      }

      if (method === 'DELETE') {
        sourceFiles.delete(pathname);
        await route.fulfill({ status: 204 });
        return;
      }

      await route.fulfill({ status: 200 });
    });

    // ── list (folder listings) ───────────────────────────────────────────────
    // eslint-disable-next-line no-await-in-loop
    await page.route(`${DA}/list/${org}/${site}/**`, async (route) => {
      const reqUrl = new URL(route.request().url());
      const folderPath = reqUrl.pathname.replace(/^\/list/, '/source');
      const items = [];
      for (const filePath of sourceFiles.keys()) {
        if (filePath.startsWith(folderPath)) {
          const name = filePath.split('/').pop();
          const ext = name.includes('.') ? name.split('.').pop() : '';
          items.push({ name: name.replace(`.${ext}`, ''), ext, path: filePath });
        }
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(items) });
    });
  }

  // ── da-agent MCP tools ───────────────────────────────────────────────────
  for (const agentOrigin of AGENT_ORIGINS) {
    // eslint-disable-next-line no-await-in-loop
    await page.route(`${agentOrigin}/**`, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ servers: [] }),
      });
    });
  }

  // ── IMS script and API stubs ──────────────────────────────────────────────
  // The component loads imslib.min.js from auth.services.adobe.com.  Without a
  // stub, the script may be blocked by CSP or take seconds to time out, which
  // delays or prevents the component from initialising.
  //
  // We serve a tiny shim that immediately fires the `onReady` callback configured
  // in `window.adobeid`, so the component proceeds as "anonymous" (no token).
  await page.route('**/imslib/imslib.min.js', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/javascript',
      body: `
        (() => {
          window.adobeIMS = {
            getAccessToken: () => null,
            getProfile: () => Promise.resolve({}),
            signIn: () => {},
            signOut: () => {},
          };
          if (window.adobeid && typeof window.adobeid.onReady === 'function') {
            window.adobeid.onReady();
          }
        })();
      `,
    });
  });

  // Block IMS API calls (token validation, org clusters, etc.)
  await page.route('**/ims-na1-stg1.adobelogin.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });
  await page.route('**/ims-na1.adobelogin.com/**', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
  });

  // Expose state for tests that need to verify writes without page.request
  return {
    getConfig: () => configStore,
    sourceFiles,
  };
}
