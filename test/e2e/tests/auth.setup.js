/*
 * Copyright 2025 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

/**
 * @file auth.setup.js
 * Playwright global setup — runs once before all browser projects.
 * Writes .playwright/.auth/user.json with IMS session cookies.
 *
 * ── Configuration (environment variables / .env) ───────────────────────────
 *
 *   TEST_PASSWORD   Required for real-auth runs. IMS password for TEST_EMAIL.
 *   TEST_EMAIL      Optional. IMS email to log in with.
 *                   Default: da-test@adobetest.com
 *                   This account must be provisioned on the IMS stg1 instance
 *                   that the target DA environment uses.
 *   SKIP_AUTH       Optional. Set to any truthy value to skip login entirely
 *                   and write an empty session.  All write-operation tests will
 *                   be skipped; stub-based structural tests will still run.
 *
 * ── Behaviour ──────────────────────────────────────────────────────────────
 *
 *   This setup NEVER fails — it always exits cleanly regardless of whether
 *   login succeeds.  This is intentional: most tests use DA Admin API stubs
 *   (see utils/da-api-stubs.js) and do not require a real session.
 *
 *   When login succeeds:
 *     - user.json is written with real session cookies
 *     - process.env.DA_AUTH_OK = '1' is set
 *     - Write-operation tests (create/edit/delete) run against the live API
 *
 *   When login fails for any reason (account not found, wrong password,
 *   IMS stg1 was refreshed and account was wiped, network error, etc.):
 *     - user.json is written as an empty session { cookies: [], origins: [] }
 *     - process.env.DA_AUTH_OK remains unset
 *     - Write-operation tests skip automatically (guarded by !HAS_AUTH)
 *     - Stub-based structural tests run normally
 *
 *   Screenshots are saved to .playwright/shots/ at each login step so you
 *   can diagnose failures without running the browser interactively.
 *
 * ── Shared setup note ──────────────────────────────────────────────────────
 *
 *   This file is used by ALL test suites in this e2e directory, not just
 *   skills-lab.  If you add new tests that need auth, follow the same pattern:
 *
 *     const HAS_AUTH = process.env.DA_AUTH_OK === '1';
 *     test.beforeEach(() => { test.skip(!HAS_AUTH, 'Requires real IMS session'); });
 *
 * ── ACL test account requirements ──────────────────────────────────────────
 *
 *   The ACL tests (acl.spec.js) require the test user to be in IMS org
 *   907136ED5D35CBF50A495CD4 and in group DA-Test BUT NOT in DA-Nonexist.
 *
 *   The configuration at https://da.live/config#/da-testautomation/ must be:
 *
 *     path                                      groups                         actions
 *     /acltest/testdocs/readwrite-doc           907136ED5D35CBF50A495CD4/DA-Test  write
 *     /acltest/testdocs/readonly-doc            907136ED5D35CBF50A495CD4          read
 *     /acltest/testdocs/noaccess-doc            907136ED5D35CBF50A495CD4/DA-Nonexist write
 *     /acltest/testdocs/subdir/+**              907136ED5D35CBF50A495CD4          read
 *     /acltest/testdocs/subdir/subdir2/**       907136ED5D35CBF50A495CD4          write
 *     /acltest/testdocs/subdir/subdir1/+**      907136ED5D35CBF50A495CD4          write
 *     /acltest/testdocs/subdir/subdir2/subdir3  907136ED5D35CBF50A495CD4          read
 *     /acltest/testdocs/dir-readwrite/+**       907136ED5D35CBF50A495CD4/DA-Test  write
 *     /acltest/testdocs/dir-readonly/+**        907136ED5D35CBF50A495CD4/DA-Test  read
 */

import fs from 'fs';
import path from 'path';
import { test as setup, expect } from '@playwright/test';
import ENV from '../utils/env.js';

const AUTH_FILE = path.join(__dirname, '../.playwright/.auth/user.json');
const SHOTS_DIR = path.join(__dirname, '../.playwright/shots');
const EMPTY_SESSION = JSON.stringify({ cookies: [], origins: [] });

function saveEmptySession(reason) {
  console.warn(`Auth: ${reason}`);
  console.warn('Saving empty session — stub-based tests will run; write-operation tests will skip.');
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.writeFileSync(AUTH_FILE, EMPTY_SESSION);
}

setup('Set up authentication', async ({ page }) => {
  setup.setTimeout(60000);
  fs.mkdirSync(path.dirname(AUTH_FILE), { recursive: true });
  fs.mkdirSync(SHOTS_DIR, { recursive: true });

  if (fs.existsSync(AUTH_FILE)) {
    fs.unlinkSync(AUTH_FILE);
    console.log('Deleted previous auth file');
  }

  // ── SKIP_AUTH: explicit opt-out (CI jobs that only run stub tests) ────────
  if (process.env.SKIP_AUTH) {
    saveEmptySession('SKIP_AUTH is set');
    return;
  }

  // ── No password: run in stub-only mode ───────────────────────────────────
  const pwd = process.env.TEST_PASSWORD;
  if (!pwd) {
    saveEmptySession('No TEST_PASSWORD set — copy .env.example to .env and set TEST_PASSWORD');
    return;
  }

  // ── Step 1: navigate to DA and click Sign In ─────────────────────────────
  await page.goto(ENV);
  const signInButton = page.getByRole('button', { name: 'Sign in' });
  await signInButton.waitFor({ timeout: 10000 });
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-01-before-signin.png') });
  await signInButton.click();

  // ── Step 2: fill email on IMS ────────────────────────────────────────────
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-02-ims-loaded.png') });

  const emailInput = page.getByLabel('Email address');
  await emailInput.waitFor({ timeout: 10000 });
  await emailInput.fill(process.env.TEST_EMAIL || 'da-test@adobetest.com');

  const continueButton = page.getByRole('button', { name: 'Continue', exact: true });
  await continueButton.waitFor({ timeout: 5000 });
  await continueButton.click();

  // ── Step 3: race — password field vs. IMS error ──────────────────────────
  // IMS renders all steps in the DOM simultaneously.  After clicking Continue,
  // either (a) the password step activates or (b) IMS shows "We don't have an
  // account with this email address."  We race them so we bail fast on (b)
  // instead of waiting for a 20-second timeout.
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-03-after-email.png') });

  const passwordField = page.locator('input[name="passwd"]');
  const imsError = page.getByText("We don't have an account with this email");

  const winner = await Promise.race([
    passwordField.waitFor({ state: 'attached', timeout: 10000 }).then(() => 'password'),
    imsError.waitFor({ timeout: 10000 }).then(() => 'error'),
  ]).catch(() => 'timeout');

  if (winner !== 'password') {
    saveEmptySession(
      winner === 'error'
        ? 'IMS rejected the email — account not provisioned (stg1 may have been refreshed)'
        : 'Neither password field nor IMS error appeared within 10s',
    );
    return;
  }

  // ── Step 4: fill password ────────────────────────────────────────────────
  // IMS uses a React-controlled hidden backing input (aria-hidden="true",
  // name="passwd").  We set the value via the native HTMLInputElement setter
  // to trigger React's synthetic event chain, then submit with Enter.
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-04-password-visible.png') });
  await passwordField.evaluate((el, password) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(el, password);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }, pwd);
  console.log('Entered password');

  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');

  // ── Step 5: org picker ───────────────────────────────────────────────────
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-05-after-password.png') });

  const foundationInternal = page.getByLabel('Foundation Internal');
  const hasOrgPicker = await foundationInternal
    .waitFor({ timeout: 10000 })
    .then(() => true)
    .catch(() => false);

  if (!hasOrgPicker) {
    saveEmptySession('Org picker ("Foundation Internal") did not appear — password may be wrong');
    return;
  }
  await foundationInternal.click();

  // ── Step 6: verify DA app loaded ─────────────────────────────────────────
  const authorLink = page.locator('a.nx-nav-brand');
  const landed = await authorLink
    .waitFor({ timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  if (!landed) {
    saveEmptySession('DA app did not load after org selection');
    return;
  }

  await expect(authorLink).toContainText('Author');
  await page.screenshot({ path: path.join(SHOTS_DIR, 'auth-06-logged-in.png') });
  await page.context().storageState({ path: AUTH_FILE });
  process.env.DA_AUTH_OK = '1';
  console.log('Authentication successful — session saved.');
});
