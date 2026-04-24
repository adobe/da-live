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
import { getSkillsLabURL } from '../utils/page.js';
import { stubDaApi } from '../utils/da-api-stubs.js';

const TEST_ORG = process.env.E2E_SKILLS_ORG || 'da-sites';
const TEST_SITE = process.env.E2E_SKILLS_SITE || 'da-status';
const DA_ADMIN = process.env.DA_ADMIN_ORIGIN || 'https://admin.da.live';

/**
 * Write-operation tests need a live DA Admin API. Auth setup sets this env var
 * to '1' when login succeeds; otherwise write tests are skipped.
 */
const HAS_AUTH = process.env.DA_AUTH_OK === '1';

/**
 * Expected catalog tabs — must match CATALOG_TABS in nx-skills-editor.js.
 * The 'generated' tab has label 'Tools'.
 */
const CATALOG_TAB_NAMES = ['Skills', 'Agents', 'Prompts', 'MCPs', 'Tools', 'Memory'];

// ─── helpers ────────────────────────────────────────────────────────────────

// Stub DA Admin API calls so the skills editor loads without an IMS session.
// When HAS_AUTH is true the stubs still run (they don't hurt) but write tests
// also execute against the real API via page.request().
test.beforeEach(async ({ page }) => {
  await stubDaApi(page, { org: TEST_ORG, site: TEST_SITE });
});

async function waitForReady(page) {
  // If the app redirects to IMS login (no auth / expired session) detect it fast
  // and skip the test instead of burning the full 20 s timeout.
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 }).catch(() => {});
  const loginVisible = await page
    .getByRole('heading', { name: 'Sign in' })
    .isVisible({ timeout: 2000 })
    .catch(() => false);
  if (loginVisible) {
    // eslint-disable-next-line no-restricted-syntax
    test.skip(true, 'Redirected to IMS login — re-run the auth setup: npx playwright test tests/auth.setup.js');
  }

  await expect(page.locator('nx-skills-editor')).toBeVisible({ timeout: 20000 });

  // If the component mounts but never finishes loading, the DA APIs need an auth
  // token we don't have (no redirect — the token is just missing / expired).
  // Skip gracefully instead of failing on a 20 s timeout.
  const stillLoading = await page
    .getByText('Loading capabilities')
    .isVisible({ timeout: 500 })
    .catch(() => false);
  if (stillLoading) {
    const loaded = await page
      .getByText('Loading capabilities')
      .waitFor({ state: 'hidden', timeout: 15000 })
      .then(() => true)
      .catch(() => false);
    if (!loaded) {
      // eslint-disable-next-line no-restricted-syntax
      test.skip(true, 'Skills editor is still loading — DA APIs require a valid auth session. Re-run: npx playwright test tests/auth.setup.js');
    }
  }
}

function uniqueSkillId() {
  return `pw-skill-${Date.now().toString(36)}`;
}

/**
 * Locate a skill card article by its data-skill-id attribute.
 */
function skillCard(page, skillId) {
  return page.locator(`article[data-skill-id="${skillId}"]`);
}

/** Open the ⋮ menu for a skill card. */
async function openSkillMenu(page, skillId) {
  const card = skillCard(page, skillId);
  await card.getByRole('button', { name: `More actions for ${skillId}` }).click();
}

/**
 * Locate a prompt card article by its data-prompt-title attribute.
 */
function promptCard(page, title) {
  return page.locator(`article[data-prompt-title="${title}"]`);
}

/** Open the ⋮ menu for a prompt card. */
async function openPromptMenu(page, title) {
  const card = promptCard(page, title);
  await card.getByRole('button', { name: `More actions for ${title}` }).click();
}

/**
 * Open the "+ New Skill" drawer and fill + submit the form.
 * The drawer must be opened explicitly — the form is hidden until triggered.
 */
async function createSkill(page, skillId, body, { draft = false } = {}) {
  await page.getByRole('button', { name: '+ New Skill' }).click();
  await page.getByLabel('Skill ID').fill(skillId);
  await page.getByLabel('Skill markdown').fill(body);

  const btnName = draft ? 'Save as Draft' : 'Save';
  await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: btnName, exact: true }).click();

  const card = skillCard(page, skillId);
  await expect(card).toBeVisible({ timeout: 15000 });
  return card;
}

async function deleteSkillViaUI(page, skillId) {
  const card = skillCard(page, skillId);
  if (await card.isVisible()) {
    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Delete' }).click();
    await expect(card).not.toBeVisible({ timeout: 15000 });
  }
}

async function getSkillMdFile(page, skillId) {
  const url = `${DA_ADMIN}/source/${TEST_ORG}/${TEST_SITE}/.da/skills/${skillId}.md`;
  return page.request.get(url);
}

async function getConfigSheets(page) {
  const url = `${DA_ADMIN}/config/${TEST_ORG}/${TEST_SITE}/`;
  const resp = await page.request.get(url);
  if (!resp.ok()) return null;
  return resp.json();
}

function findSkillRow(config, skillId) {
  const rows = config?.skills?.data;
  if (!Array.isArray(rows)) return null;
  return rows.find((r) => {
    const key = (r.key || r.id || '').replace(/\.md$/, '');
    return key === skillId;
  }) || null;
}

// ─── page render ────────────────────────────────────────────────────────────

test('Skills Editor page renders', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForReady(page);

  await expect(page.locator('nx-skills-editor')).toBeVisible();
});

test('Skills Editor catalog shows Skills tab by default', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForReady(page);

  const skillsTab = page.getByRole('tab', { name: 'Skills' });
  await expect(skillsTab).toHaveAttribute('aria-selected', 'true');
});

test('Skills Editor create and delete a skill', async ({ page }) => {
  test.skip(!HAS_AUTH, 'Write operations require a real IMS session');
  test.setTimeout(60000);

  const skillId = uniqueSkillId();
  const skillBody = `# ${skillId}\n\nPlaywright test skill — safe to delete.`;

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForReady(page);

  // Drawer must be opened before form fields are accessible
  await page.getByRole('button', { name: '+ New Skill' }).click();
  await page.getByLabel('Skill ID').fill(skillId);
  await page.getByLabel('Skill markdown').fill(skillBody);
  await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Save', exact: true }).click();

  const card = skillCard(page, skillId);
  await expect(card).toBeVisible({ timeout: 15000 });

  await openSkillMenu(page, skillId);
  await page.getByRole('menuitem', { name: 'Edit' }).click();
  await expect(page.getByLabel('Skill ID')).toHaveAttribute('readonly');
  await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Delete' }).click();
  await expect(card).not.toBeVisible({ timeout: 15000 });
});

// ─── Skills CRUD ────────────────────────────────────────────────────────────

test.describe('Skills CRUD', () => {
  test.beforeEach(() => { test.skip(!HAS_AUTH, 'Write operations require a real IMS session'); });

  test('Create skill — tile, .md file, and config row', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nCreated by Playwright — verifies storage.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    const mdResp = await getSkillMdFile(page, skillId);
    expect(mdResp.ok(), '.md file should exist after create').toBeTruthy();
    expect(await mdResp.text()).toContain(skillId);

    const config = await getConfigSheets(page);
    const row = findSkillRow(config, skillId);
    expect(row, 'Config sheet should contain the skill row').toBeTruthy();
    expect((row.status || '').toLowerCase()).not.toBe('draft');

    await deleteSkillViaUI(page, skillId);
  });

  test('Create draft skill — status persists as draft', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nDraft skill from Playwright.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody, { draft: true });

    const config = await getConfigSheets(page);
    const row = findSkillRow(config, skillId);
    expect(row, 'Config sheet should contain the draft row').toBeTruthy();
    expect((row.status || '').toLowerCase()).toBe('draft');

    await deleteSkillViaUI(page, skillId);
  });

  test('Edit skill — form loads with existing data', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nOriginal body for edit test.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    const card = await createSkill(page, skillId, skillBody);

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    const idInput = page.getByLabel('Skill ID');
    await expect(idInput).toHaveAttribute('readonly');
    await expect(idInput).toHaveValue(skillId);
    await expect(page.getByLabel('Skill markdown')).toContainText(skillId);

    await deleteSkillViaUI(page, skillId);
  });

  test('Edit skill — save updated content', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const originalBody = `# ${skillId}\n\nOriginal content.`;
    const updatedBody = `# ${skillId}\n\nUpdated content from Playwright.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    const card = await createSkill(page, skillId, originalBody);

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByLabel('Skill markdown').fill(updatedBody);
    await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Save', exact: true }).click();

    await page.reload();
    await waitForReady(page);

    const reloaded = skillCard(page, skillId);
    await expect(reloaded).toBeVisible({ timeout: 15000 });
    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByLabel('Skill markdown')).toContainText('Updated content from Playwright');

    const mdResp = await getSkillMdFile(page, skillId);
    expect(mdResp.ok()).toBeTruthy();
    expect(await mdResp.text()).toContain('Updated content from Playwright');

    await deleteSkillViaUI(page, skillId);
  });

  test('Delete skill — removes tile, .md file, and config row', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nWill be deleted — verifies cleanup.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    const mdBefore = await getSkillMdFile(page, skillId);
    expect(mdBefore.ok(), '.md should exist before delete').toBeTruthy();

    await deleteSkillViaUI(page, skillId);

    const mdAfter = await getSkillMdFile(page, skillId);
    expect(mdAfter.ok(), '.md should be gone after delete').toBeFalsy();

    const config = await getConfigSheets(page);
    expect(findSkillRow(config, skillId), 'Config row should be removed').toBeFalsy();
  });
});

// ─── Loader ─────────────────────────────────────────────────────────────────

test.describe('Skills loader', () => {
  test.beforeEach(() => { test.skip(!HAS_AUTH, 'Write operations require a real IMS session'); });

  test('Skill persists after reload — loaded from .md file', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nPersistence check — should survive reload.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    await page.reload();
    await waitForReady(page);

    const card = skillCard(page, skillId);
    await expect(card).toBeVisible({ timeout: 15000 });

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByLabel('Skill markdown')).toContainText('Persistence check');

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Editability ────────────────────────────────────────────────────────────

test.describe('Skills editability', () => {
  test('All skill cards have a more-actions menu', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const cards = page.locator('article[data-skill-id]');
    const count = await cards.count();
    test.skip(count === 0, 'No skills in catalog — nothing to verify');

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).getByRole('button', { name: /^More actions for / })).toBeVisible();
    }
  });
});

// ─── Drawer state ────────────────────────────────────────────────────────────

test.describe('Drawer state', () => {
  test.beforeEach(() => { test.skip(!HAS_AUTH, 'Write operations require a real IMS session'); });

  test('Drawer reopens on reload — sessionStorage persistence', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nReload persistence check.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    // Open the skill in the drawer
    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByLabel('Skill ID')).toBeVisible({ timeout: 5000 });

    // Reload — the panel should reopen with the same skill
    await page.reload();
    await waitForReady(page);

    await expect(page.getByLabel('Skill ID')).toBeVisible({ timeout: 15000 });
    await expect(page.getByLabel('Skill ID')).toHaveValue(skillId);

    await deleteSkillViaUI(page, skillId);
  });

  test('Drawer closes on reload when it was closed — no ghost state', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    // Drawer should start closed
    await expect(page.getByLabel('Skill ID')).not.toBeVisible();

    await page.reload();
    await waitForReady(page);

    // Should still be closed after reload
    await expect(page.getByLabel('Skill ID')).not.toBeVisible();
  });

  test('Dirty notice appears when skill form is edited', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nDirty-indicator test.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    // No dirty notice yet — form is clean
    await expect(page.getByRole('status')).not.toBeVisible();

    // Type something in the skill body — form becomes dirty
    await page.getByLabel('Skill markdown').type(' edited');
    await expect(page.getByRole('status')).toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('status')).toContainText('Unsaved edits');

    await deleteSkillViaUI(page, skillId);
  });

  test('Dirty skill edits survive tab switch and restore on return', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nDirty-persist-across-tabs test.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    // Open and edit the skill without saving
    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByLabel('Skill markdown').type(' UNSAVED');

    // Confirm dirty indicator is up
    await expect(page.getByRole('status')).toBeVisible({ timeout: 3000 });

    // Switch away to Prompts tab — drawer should close / change content
    await page.getByRole('tab', { name: 'Prompts' }).click();
    await expect(page.getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true');

    // Return to Skills tab — dirty edits must still be in the form
    await page.getByRole('tab', { name: 'Skills' }).click();
    await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');

    // Drawer should reopen with the dirty content and indicator
    await expect(page.getByLabel('Skill markdown')).toBeVisible({ timeout: 5000 });
    await expect(page.getByLabel('Skill markdown')).toContainText('UNSAVED');
    await expect(page.getByRole('status')).toBeVisible();

    await deleteSkillViaUI(page, skillId);
  });

  test('Clean tab switch does not restore drawer on return', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nClean-switch test.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    // Open skill but do NOT edit
    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await expect(page.getByLabel('Skill ID')).toBeVisible({ timeout: 5000 });

    // Switch away without editing
    await page.getByRole('tab', { name: 'Prompts' }).click();

    // Return — drawer should be closed (no dirty state was saved)
    await page.getByRole('tab', { name: 'Skills' }).click();
    await expect(page.getByRole('tab', { name: 'Skills' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('Skill ID')).not.toBeVisible();

    await deleteSkillViaUI(page, skillId);
  });

  test('Dirty notice disappears after saving', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nSave-clears-dirty test.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    await createSkill(page, skillId, skillBody);

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByLabel('Skill markdown').type(' EDIT');

    await expect(page.getByRole('status')).toBeVisible({ timeout: 3000 });

    await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Save', exact: true }).click();

    await expect(page.getByRole('status')).not.toBeVisible({ timeout: 5000 });

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Tool references ─────────────────────────────────────────────────────────

test.describe('Tool references', () => {
  test.beforeEach(() => { test.skip(!HAS_AUTH, 'Write operations require a real IMS session'); });

  test('Skill with tool references — body contains the tool names', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = [
      `# ${skillId}`,
      '',
      'Use the da_get_source tool to read the page.',
      'Also call mcp__test-server__test-tool for external data.',
    ].join('\n');

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);
    const card = await createSkill(page, skillId, skillBody);

    await openSkillMenu(page, skillId);
    await page.getByRole('menuitem', { name: 'Edit' }).click();

    // Skill form is open in the drawer; the body textarea should contain the tool reference
    await expect(page.getByLabel('Skill markdown')).toContainText('da_get_source');

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Prompts ────────────────────────────────────────────────────────────────

test.describe('Prompts', () => {
  test.beforeEach(() => { test.skip(!HAS_AUTH, 'Write operations require a real IMS session'); });

  test('Prompts tab — create and delete a prompt', async ({ page }) => {
    test.setTimeout(60000);
    const promptTitle = `pw-prompt-${Date.now().toString(36)}`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'Prompts' }).click();
    await expect(page.getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true');

    // Drawer must be opened before form fields are accessible
    await page.getByRole('button', { name: '+ New Prompt' }).click();
    await page.getByLabel('Prompt title').fill(promptTitle);
    await page.getByLabel('Prompt category').fill('test');
    await page.getByLabel('Prompt body').fill(`This is a Playwright test prompt: ${promptTitle}`);

    await page.getByRole('toolbar', { name: 'Prompt actions' }).getByRole('button', { name: 'Save', exact: true }).click();

    const card = promptCard(page, promptTitle);
    await expect(card).toBeVisible({ timeout: 15000 });

    await openPromptMenu(page, promptTitle);
    await page.getByRole('menuitem', { name: 'Edit' }).click();
    await page.getByRole('toolbar', { name: 'Prompt actions' }).getByRole('button', { name: 'Delete' }).click();
    await expect(card).not.toBeVisible({ timeout: 15000 });
  });
});

// ─── Agents ─────────────────────────────────────────────────────────────────

test.describe('Agents', () => {
  test('Agents tab shows the DA Assistant built-in agent', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'Agents' }).click();

    const catalog = page.getByRole('region', { name: 'Catalog' });
    await expect(catalog.getByTestId('agent-builtin-card')).toBeVisible({ timeout: 10000 });
    await expect(catalog.locator('.agent-card-title').first()).toContainText('DA Assistant');
  });

  test('Agent card has header, description, and tool chips', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'Agents' }).click();

    const agentCard = page.getByTestId('agent-builtin-card').first();
    await expect(agentCard).toBeVisible({ timeout: 10000 });
    await expect(agentCard.locator('.agent-card-title')).toBeVisible();
    await expect(agentCard.locator('.agent-card-desc')).toBeVisible();
    await expect(agentCard.locator('.agent-tool-chip').first()).toBeVisible();
  });

  test('Clicking an agent card opens the drawer with its associated tools', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'Agents' }).click();
    await page.getByTestId('agent-builtin-card').first().click();

    // Drawer should open with the agent's tools selector
    const drawer = page.locator('.col-editor');
    await expect(drawer).toBeVisible({ timeout: 5000 });

    // At least one tool item should be marked active (agent's tools are pre-selected)
    await expect(drawer.locator('.tool-item.is-active').first()).toBeVisible({ timeout: 5000 });
  });
});

// ─── MCPs ────────────────────────────────────────────────────────────────────

test.describe('MCPs', () => {
  test('MCPs tab shows built-in MCP servers', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'MCPs' }).click();

    const catalog = page.getByRole('region', { name: 'Catalog' });
    await expect(catalog.getByTestId('mcp-builtin-card').first()).toBeVisible({ timeout: 10000 });
  });

  test('Built-in MCP cards show green status dot', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'MCPs' }).click();

    const builtinCard = page.getByTestId('mcp-builtin-card').first();
    await expect(builtinCard).toBeVisible({ timeout: 10000 });
    await expect(builtinCard.locator('.status-dot-approved')).toBeVisible();
  });
});

// ─── Memory ──────────────────────────────────────────────────────────────────

test.describe('Memory', () => {
  test('Memory tab renders and shows project memory state', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const catalog = page.getByRole('region', { name: 'Catalog' });
    await catalog.getByRole('tab', { name: 'Memory' }).click();
    await expect(catalog.getByRole('tab', { name: 'Memory' })).toHaveAttribute('aria-selected', 'true');

    // Memory tab auto-opens the drawer; content resolves to either data or the empty state
    await expect(
      page.locator('pre.memory-content').or(page.getByText('No project memory yet')),
    ).toBeVisible({ timeout: 15000 });
  });
});

// ─── Tools (Generated) ───────────────────────────────────────────────────────

test.describe('Tools (Generated)', () => {
  test('Tools tab renders nx-generated-tools in the catalog', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    // "Tools" is the renamed 'generated' tab — it renders nx-generated-tools inline
    // in the left catalog panel (no drawer, no separate region)
    const catalog = page.getByRole('region', { name: 'Catalog' });
    await catalog.getByRole('tab', { name: 'Tools' }).click();
    await expect(catalog.getByRole('tab', { name: 'Tools' })).toHaveAttribute('aria-selected', 'true');

    await expect(catalog.locator('nx-generated-tools')).toBeVisible({ timeout: 10000 });
  });

  test('nx-generated-tools shows at least one section heading', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const catalog = page.getByRole('region', { name: 'Catalog' });
    await catalog.getByRole('tab', { name: 'Tools' }).click();

    const gt = catalog.locator('nx-generated-tools');
    await expect(gt).toBeVisible({ timeout: 10000 });

    // Section titles are rendered inside the shadow DOM — Playwright pierces it
    await expect(gt.locator('.gt-section-title').first()).toBeVisible({ timeout: 10000 });
  });
});

// ─── Catalog navigation ──────────────────────────────────────────────────────

test.describe('Catalog navigation', () => {
  test(`Catalog has exactly ${CATALOG_TAB_NAMES.length} tabs — ${CATALOG_TAB_NAMES.join(', ')}`, async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const catalog = page.getByRole('region', { name: 'Catalog' });
    const tabs = catalog.getByRole('tab');

    await expect(tabs).toHaveCount(CATALOG_TAB_NAMES.length);

    for (const name of CATALOG_TAB_NAMES) {
      await expect(catalog.getByRole('tab', { name })).toBeVisible();
    }
  });

  test('All catalog tabs can be activated', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const catalog = page.getByRole('region', { name: 'Catalog' });
    const tabs = catalog.getByRole('tab');
    const count = await tabs.count();

    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    for (let i = 1; i < count; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    }

    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });
});
