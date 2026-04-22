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

const TEST_ORG = process.env.E2E_SKILLS_ORG || 'da-sites';
const TEST_SITE = process.env.E2E_SKILLS_SITE || 'da-status';

const DA_ADMIN = process.env.DA_ADMIN_ORIGIN || 'https://admin.da.live';

// ─── helpers ────────────────────────────────────────────────────────────────

async function waitForReady(page) {
  await expect(page.locator('nx-skills-editor')).toBeVisible({ timeout: 20000 });
  await expect(page.getByText('Loading capabilities')).not.toBeVisible({ timeout: 20000 });
}

function uniqueSkillId() {
  return `pw-skill-${Date.now().toString(36)}`;
}

function skillCard(page, skillId) {
  return page.getByTestId('skill-card').filter({
    has: page.getByRole('button', { name: `Edit ${skillId}` }),
  });
}

function promptCard(page, title) {
  return page.getByTestId('prompt-card').filter({
    has: page.getByRole('button', { name: `Edit ${title}` }),
  });
}

async function createSkill(page, skillId, body, { draft = false } = {}) {
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
    await card.getByRole('button', { name: `Edit ${skillId}` }).click();
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

  await expect(page.getByRole('heading').first()).toBeVisible();
});

test('Skills Editor catalog shows Skills tab by default', async ({ page }) => {
  test.setTimeout(30000);
  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForReady(page);

  const skillsTab = page.getByRole('tab', { name: 'Skills' });
  await expect(skillsTab).toHaveAttribute('aria-selected', 'true');
});

test('Skills Editor create and delete a skill', async ({ page }) => {
  test.skip(!!process.env.SKIP_AUTH, 'Requires authentication');
  test.setTimeout(60000);

  const skillId = uniqueSkillId();
  const skillBody = `# ${skillId}\n\nPlaywright test skill — safe to delete.`;

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForReady(page);

  await page.getByLabel('Skill ID').fill(skillId);
  await page.getByLabel('Skill markdown').fill(skillBody);
  await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Save', exact: true }).click();

  const card = skillCard(page, skillId);
  await expect(card).toBeVisible({ timeout: 15000 });

  await card.getByRole('button', { name: `Edit ${skillId}` }).click();
  await expect(page.getByLabel('Skill ID')).toHaveAttribute('readonly');
  await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Delete' }).click();
  await expect(card).not.toBeVisible({ timeout: 15000 });
});

// ─── Skills CRUD ────────────────────────────────────────────────────────────

test.describe('Skills CRUD', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!!process.env.SKIP_AUTH, 'Requires authentication');
  });

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

    await card.getByRole('button', { name: `Edit ${skillId}` }).click();

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

    await card.getByRole('button', { name: `Edit ${skillId}` }).click();
    await page.getByLabel('Skill markdown').fill(updatedBody);
    await page.getByRole('toolbar', { name: 'Skill actions' }).getByRole('button', { name: 'Save', exact: true }).click();

    await page.reload();
    await waitForReady(page);

    const reloaded = skillCard(page, skillId);
    await expect(reloaded).toBeVisible({ timeout: 15000 });
    await reloaded.getByRole('button', { name: `Edit ${skillId}` }).click();
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
  test.beforeEach(async ({ page }) => {
    test.skip(!!process.env.SKIP_AUTH, 'Requires authentication');
  });

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

    await card.getByRole('button', { name: `Edit ${skillId}` }).click();
    await expect(page.getByLabel('Skill markdown')).toContainText('Persistence check');

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Editability ────────────────────────────────────────────────────────────

test.describe('Skills editability', () => {
  test('All skill cards have an edit button', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const cards = page.getByTestId('skill-card');
    const count = await cards.count();
    test.skip(count === 0, 'No skills in catalog — nothing to verify');

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).getByRole('button', { name: /^Edit / })).toBeVisible();
    }
  });
});

// ─── Tool references ────────────────────────────────────────────────────────

test.describe('Tool references', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!!process.env.SKIP_AUTH, 'Requires authentication');
  });

  test('Skill with tool references — tools column highlights them', async ({ page }) => {
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

    await card.getByRole('button', { name: `Edit ${skillId}` }).click();

    const toolsRegion = page.getByRole('region', { name: 'Tools' });
    await expect(toolsRegion).toBeVisible({ timeout: 10000 });
    await expect(toolsRegion).toContainText('da_get_source');

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Prompts ────────────────────────────────────────────────────────────────

test.describe('Prompts', () => {
  test.beforeEach(async ({ page }) => {
    test.skip(!!process.env.SKIP_AUTH, 'Requires authentication');
  });

  test('Prompts tab — create and delete a prompt', async ({ page }) => {
    test.setTimeout(60000);
    const promptTitle = `pw-prompt-${Date.now().toString(36)}`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    await page.getByRole('tab', { name: 'Prompts' }).click();
    await expect(page.getByRole('tab', { name: 'Prompts' })).toHaveAttribute('aria-selected', 'true');

    await page.getByLabel('Prompt title').fill(promptTitle);
    await page.getByLabel('Prompt category').fill('test');
    await page.getByLabel('Prompt', { exact: true }).fill(`This is a Playwright test prompt: ${promptTitle}`);

    await page.getByRole('toolbar', { name: 'Prompt actions' }).getByRole('button', { name: 'Save', exact: true }).click();

    const card = promptCard(page, promptTitle);
    await expect(card).toBeVisible({ timeout: 15000 });

    await card.getByRole('button', { name: `Edit ${promptTitle}` }).click();
    await page.getByRole('toolbar', { name: 'Prompt actions' }).getByRole('button', { name: 'Delete' }).click();
    await expect(card).not.toBeVisible({ timeout: 15000 });
  });
});

// ─── Catalog navigation ────────────────────────────────────────────────────

test.describe('Catalog navigation', () => {
  test('All catalog tabs render and can be activated', async ({ page }) => {
    test.setTimeout(30000);
    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForReady(page);

    const tabs = page.getByRole('region', { name: 'Catalog' }).getByRole('tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');

    for (let i = 1; i < count; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveAttribute('aria-selected', 'true');
    }

    await tabs.first().click();
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
  });
});
