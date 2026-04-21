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

async function waitForSkillsLabReady(page) {
  await expect(page.locator('da-skills-lab-view')).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.skills-lab-loading')).not.toBeVisible({ timeout: 20000 });
}

function uniqueSkillId() {
  return `pw-skill-${Date.now().toString(36)}`;
}

async function createSkill(page, skillId, body, { draft = false } = {}) {
  await page.locator('input[placeholder="skill-id"]').fill(skillId);
  await page.locator('textarea[aria-label="Skill markdown"]').fill(body);

  const variant = draft ? 'secondary' : 'accent';
  await page.locator(`.skills-lab-save-row sp-button[variant="${variant}"]`).click();

  const card = page.locator('.skills-lab-card-skill').filter({
    has: page.locator('.skills-lab-card-title', { hasText: skillId }),
  });
  await expect(card).toBeVisible({ timeout: 15000 });
  return card;
}

async function deleteSkillViaUI(page, skillId) {
  const card = page.locator('.skills-lab-card-skill').filter({
    has: page.locator('.skills-lab-card-title', { hasText: skillId }),
  });

  if (await card.isVisible()) {
    await card.locator('.skills-lab-skill-edit').click();
    await page.locator('.skills-lab-save-row sp-button[variant="negative"]').click();
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

// ─── existing tests ─────────────────────────────────────────────────────────

test('Skills Lab page renders', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  await expect(page.locator('.skills-lab-section-h').first()).toBeVisible();
});

test('Skills Lab catalog shows Skills tab by default', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  await expect(page.locator('.skills-lab-cat-tab.is-active').first()).toContainText('Skills');
});

test('Skills Lab create and delete a skill', async ({ page }) => {
  test.skip(!!process.env.SKIP_AUTH, 'Requires authentication — set TEST_PASSWORD or run without SKIP_AUTH');
  test.setTimeout(60000);

  const skillId = uniqueSkillId();
  const skillBody = `# ${skillId}\n\nPlaywright test skill — safe to delete.`;

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  await page.locator('input[placeholder="skill-id"]').fill(skillId);
  await page.locator('textarea[aria-label="Skill markdown"]').fill(skillBody);
  await page.locator('.skills-lab-save-row sp-button[variant="accent"]').click();

  const skillCard = page.locator('.skills-lab-card-skill').filter({
    has: page.locator('.skills-lab-card-title', { hasText: skillId }),
  });
  await expect(skillCard).toBeVisible({ timeout: 15000 });

  await skillCard.locator('.skills-lab-skill-edit').click();
  await expect(page.locator('input[placeholder="skill-id"]')).toHaveAttribute('readonly');
  await page.locator('.skills-lab-save-row sp-button[variant="negative"]').click();
  await expect(skillCard).not.toBeVisible({ timeout: 15000 });
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
    await waitForSkillsLabReady(page);
    await createSkill(page, skillId, skillBody);

    // Verify .md file was written
    const mdResp = await getSkillMdFile(page, skillId);
    expect(mdResp.ok(), '.md file should exist after create').toBeTruthy();
    const mdText = await mdResp.text();
    expect(mdText).toContain(skillId);

    // Verify config sheet has the row
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
    await waitForSkillsLabReady(page);
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
    await waitForSkillsLabReady(page);
    const card = await createSkill(page, skillId, skillBody);

    await card.locator('.skills-lab-skill-edit').click();

    const idInput = page.locator('input[placeholder="skill-id"]');
    await expect(idInput).toHaveAttribute('readonly');
    await expect(idInput).toHaveValue(skillId);

    const textarea = page.locator('textarea[aria-label="Skill markdown"]');
    await expect(textarea).toContainText(skillId);

    await deleteSkillViaUI(page, skillId);
  });

  test('Edit skill — save updated content', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const originalBody = `# ${skillId}\n\nOriginal content.`;
    const updatedBody = `# ${skillId}\n\nUpdated content from Playwright.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForSkillsLabReady(page);
    const card = await createSkill(page, skillId, originalBody);

    // Edit the skill
    await card.locator('.skills-lab-skill-edit').click();
    await page.locator('textarea[aria-label="Skill markdown"]').fill(updatedBody);
    await page.locator('.skills-lab-save-row sp-button[variant="accent"]').click();

    // Reload and verify the update persisted
    await page.reload();
    await waitForSkillsLabReady(page);

    const reloadedCard = page.locator('.skills-lab-card-skill').filter({
      has: page.locator('.skills-lab-card-title', { hasText: skillId }),
    });
    await expect(reloadedCard).toBeVisible({ timeout: 15000 });
    await reloadedCard.locator('.skills-lab-skill-edit').click();

    const textarea = page.locator('textarea[aria-label="Skill markdown"]');
    await expect(textarea).toContainText('Updated content from Playwright');

    // Verify .md file has updated content
    const mdResp = await getSkillMdFile(page, skillId);
    expect(mdResp.ok()).toBeTruthy();
    const mdText = await mdResp.text();
    expect(mdText).toContain('Updated content from Playwright');

    await deleteSkillViaUI(page, skillId);
  });

  test('Delete skill — removes tile, .md file, and config row', async ({ page }) => {
    test.setTimeout(60000);
    const skillId = uniqueSkillId();
    const skillBody = `# ${skillId}\n\nWill be deleted — verifies cleanup.`;

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForSkillsLabReady(page);
    await createSkill(page, skillId, skillBody);

    // Confirm it exists before deleting
    const mdBefore = await getSkillMdFile(page, skillId);
    expect(mdBefore.ok(), '.md should exist before delete').toBeTruthy();

    await deleteSkillViaUI(page, skillId);

    // Verify .md file is gone
    const mdAfter = await getSkillMdFile(page, skillId);
    expect(mdAfter.ok(), '.md should be gone after delete').toBeFalsy();

    // Verify config row is gone
    const config = await getConfigSheets(page);
    const row = findSkillRow(config, skillId);
    expect(row, 'Config row should be removed after delete').toBeFalsy();
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
    await waitForSkillsLabReady(page);
    await createSkill(page, skillId, skillBody);

    await page.reload();
    await waitForSkillsLabReady(page);

    const card = page.locator('.skills-lab-card-skill').filter({
      has: page.locator('.skills-lab-card-title', { hasText: skillId }),
    });
    await expect(card).toBeVisible({ timeout: 15000 });

    // Verify the form loads the correct body from the .md file
    await card.locator('.skills-lab-skill-edit').click();
    const textarea = page.locator('textarea[aria-label="Skill markdown"]');
    await expect(textarea).toContainText('Persistence check');

    await deleteSkillViaUI(page, skillId);
  });
});

// ─── Editability ────────────────────────────────────────────────────────────

test.describe('Skills editability', () => {
  test('All skill cards have an edit button', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForSkillsLabReady(page);

    const cards = page.locator('.skills-lab-card-skill');
    const count = await cards.count();

    // Only meaningful if there are skills in the catalog
    test.skip(count === 0, 'No skills in catalog — nothing to verify');

    for (let i = 0; i < count; i++) {
      await expect(cards.nth(i).locator('.skills-lab-skill-edit')).toBeVisible();
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
    await waitForSkillsLabReady(page);
    const card = await createSkill(page, skillId, skillBody);

    await card.locator('.skills-lab-skill-edit').click();

    // The tools column should reference the da_ tool from the skill body
    const toolsCol = page.locator('.skills-lab-tools-col');
    await expect(toolsCol).toBeVisible({ timeout: 10000 });
    await expect(toolsCol).toContainText('da_get_source');

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
    await waitForSkillsLabReady(page);

    // Switch to Prompts tab
    const promptsTab = page.locator('.skills-lab-cat-tab', { hasText: 'Prompts' });
    await promptsTab.click();
    await expect(promptsTab).toHaveClass(/is-active/);

    // Fill prompt form
    const titleInput = page.locator('input[placeholder="Title"]');
    const categoryInput = page.locator('input[placeholder="Category"]');
    const promptTextarea = page.locator('textarea[aria-label="Prompt"]');

    await titleInput.fill(promptTitle);
    await categoryInput.fill('test');
    await promptTextarea.fill(`This is a Playwright test prompt: ${promptTitle}`);

    // Save
    await page.locator('.skills-lab-save-row sp-button[variant="accent"]').click();

    const promptCard = page.locator('.skills-lab-card-prompt').filter({
      has: page.locator('.skills-lab-card-title', { hasText: promptTitle }),
    });
    await expect(promptCard).toBeVisible({ timeout: 15000 });

    // Delete
    await promptCard.locator('.skills-lab-prompt-edit').click();
    await page.locator('.skills-lab-save-row sp-button[variant="negative"]').click();
    await expect(promptCard).not.toBeVisible({ timeout: 15000 });
  });
});

// ─── Catalog navigation ────────────────────────────────────────────────────

test.describe('Catalog navigation', () => {
  test('All catalog tabs render and can be activated', async ({ page }) => {
    test.setTimeout(30000);

    await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
    await waitForSkillsLabReady(page);

    const tabs = page.locator('.skills-lab-cat-tab');
    const count = await tabs.count();
    expect(count).toBeGreaterThanOrEqual(2);

    // Skills tab is active by default
    await expect(tabs.first()).toHaveClass(/is-active/);

    // Click each tab and verify it becomes active
    for (let i = 1; i < count; i++) {
      await tabs.nth(i).click();
      await expect(tabs.nth(i)).toHaveClass(/is-active/);
    }

    // Return to Skills tab
    await tabs.first().click();
    await expect(tabs.first()).toHaveClass(/is-active/);
  });
});
