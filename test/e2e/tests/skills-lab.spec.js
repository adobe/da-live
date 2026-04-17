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

// Override with E2E_SKILLS_ORG / E2E_SKILLS_SITE when targeting a different repo.
const TEST_ORG = process.env.E2E_SKILLS_ORG || 'da-sites';
const TEST_SITE = process.env.E2E_SKILLS_SITE || 'da-status';

// ─── helpers ────────────────────────────────────────────────────────────────

/** Wait until the Skills Lab catalog finishes its initial load. */
async function waitForSkillsLabReady(page) {
  await expect(page.locator('da-skills-lab-view')).toBeVisible({ timeout: 20000 });
  // "Loading capabilities…" is shown while config is being fetched.
  await expect(page.locator('.skills-lab-loading')).not.toBeVisible({ timeout: 20000 });
}

// ─── tests ──────────────────────────────────────────────────────────────────

test('Skills Lab page renders', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  // At least one section header should be visible (Skills, Agents, Prompts, or MCP).
  await expect(page.locator('.skills-lab-section-h').first()).toBeVisible();
});

test('Skills Lab catalog shows Skills tab by default', async ({ page }) => {
  test.setTimeout(30000);

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  // The "Skills" tab is the default active catalog tab.
  await expect(page.locator('.skills-lab-cat-tab.is-active').first()).toContainText('Skills');
});

test('Skills Lab create and delete a skill', async ({ page }) => {
  test.skip(!!process.env.SKIP_AUTH, 'Requires authentication — set TEST_PASSWORD or run without SKIP_AUTH');
  test.setTimeout(60000);

  const skillId = `pw-skill-${Date.now().toString(36)}`;
  const skillBody = `# ${skillId}\n\nPlaywright test skill — safe to delete.`;

  await page.goto(getSkillsLabURL(TEST_ORG, TEST_SITE));
  await waitForSkillsLabReady(page);

  // ── create ──────────────────────────────────────────────────────────────
  await page.locator('input[placeholder="skill-id"]').fill(skillId);
  await page.locator('textarea[aria-label="Skill markdown"]').fill(skillBody);

  // Click the primary "Save" button (variant="accent") in the skill form save row.
  await page.locator('.skills-lab-save-row sp-button[variant="accent"]').click();

  // Card should appear in the catalog.
  const skillCard = page.locator('.skills-lab-card-skill').filter({
    has: page.locator(`.skills-lab-card-title`, { hasText: skillId }),
  });
  await expect(skillCard).toBeVisible({ timeout: 15000 });

  // ── delete ──────────────────────────────────────────────────────────────
  // Open the edit panel for this skill.
  await skillCard.locator('.skills-lab-skill-edit').click();

  // In edit mode the skill-id input is read-only.
  await expect(page.locator('input[placeholder="skill-id"]')).toHaveAttribute('readonly');

  // Confirm and delete.
  await page.locator('.skills-lab-save-row sp-button[variant="negative"]').click();

  // Card must disappear from the catalog.
  await expect(skillCard).not.toBeVisible({ timeout: 15000 });
});
