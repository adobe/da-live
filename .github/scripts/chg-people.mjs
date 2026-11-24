/*
 * Resolves the change coordinator and approvers for the iPaaS change request
 * (@adobe/semantic-release-ipaas-chg) from the PRs in the upcoming release.
 *
 * - coordinator: always the default coordinator ("_coordinator")
 * - approvers:   the mapped approving reviewers of all PRs, else the default approvers
 *
 * Everything comes from one secret, DA_CHG_LDAP_MAP:
 *   {
 *     "_coordinator": "ldap",             // coordinator (always)
 *     "_approvers": ["ldap1", "ldap2"],    // default approvers
 *     "githubLogin": "ldap", ...           // GitHub login -> Adobe LDAP id
 *   }
 * Keys starting with "_" can never be GitHub logins (letters, digits, hyphens only).
 * Unmapped approvers (e.g. external contributors) are skipped.
 * Results are written as IPAAS_COORDINATOR / IPAAS_APPROVED_BY to $GITHUB_ENV, which
 * overrides the values from the shared Helix secret. Every LDAP id is masked, because
 * the Actions logs of this public repo are public.
 *
 * This step must never block a release: on any error it falls back to the defaults.
 */
/* eslint-disable no-console -- CLI script for GitHub Actions, console is its output */
import { execFileSync } from 'node:child_process';
import { appendFileSync, realpathSync } from 'node:fs';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const DECISIVE_STATES = ['APPROVED', 'CHANGES_REQUESTED', 'DISMISSED'];
const MAX_COMMITS = 100;

export function latestApprovers(reviews) {
  const latest = new Map();
  reviews.forEach(({ user, state }) => {
    if (!user || user.type === 'Bot' || !DECISIVE_STATES.includes(state)) return;
    latest.set(user.login, state);
  });
  return [...latest].filter(([, state]) => state === 'APPROVED').map(([login]) => login);
}

function toList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
}

export function parseConfig(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    parsed = undefined;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) parsed = {};

  const { _coordinator: coordinator, _approvers: approvers } = parsed;
  const map = Object.fromEntries(
    Object.entries(parsed)
      .filter(([key]) => !key.startsWith('_'))
      .map(([login, ldap]) => [login.toLowerCase(), ldap]),
  );
  return {
    map,
    defaults: {
      coordinator: typeof coordinator === 'string' && coordinator.trim() ? coordinator.trim() : undefined,
      approvedBy: toList(approvers),
    },
  };
}

export function resolvePeople({ prs, map, defaults }) {
  const lookup = (login) => map[login?.toLowerCase()];

  const coordinator = defaults.coordinator || undefined;

  const notCoordinator = (ldap) => ldap !== coordinator;
  const mapped = [...new Set(prs.flatMap((pr) => pr.approvers).map(lookup).filter(Boolean))]
    .filter(notCoordinator);
  const approvedBy = mapped.length ? mapped : defaults.approvedBy.filter(notCoordinator);

  return { coordinator, approvedBy: approvedBy?.length ? approvedBy : undefined };
}

export function toEnvLines({ coordinator, approvedBy }) {
  const mask = [];
  const env = [];
  if (coordinator) {
    mask.push(coordinator);
    env.push(`IPAAS_COORDINATOR=${coordinator}`);
  }
  if (approvedBy) {
    mask.push(...approvedBy);
    env.push(`IPAAS_APPROVED_BY=${JSON.stringify(approvedBy)}`);
  }
  return { mask, env };
}

function git(...args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

// Commits that go into the next release (newest first), i.e. everything since the last tag.
function releaseCommits() {
  let range = 'HEAD';
  try {
    range = `${git('describe', '--tags', '--abbrev=0', '--match', 'v[0-9]*', 'HEAD')}..HEAD`;
  } catch {
    // no tag yet: take the most recent commits
  }
  return git('log', range, '--format=%H', `--max-count=${MAX_COMMITS}`).split('\n').filter(Boolean);
}

async function github(path) {
  const { GITHUB_API_URL = 'https://api.github.com', GITHUB_TOKEN } = process.env;
  const resp = await fetch(`${GITHUB_API_URL}${path}`, {
    signal: AbortSignal.timeout(10000),
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${GITHUB_TOKEN}`,
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!resp.ok) throw new Error(`GitHub API ${path} returned ${resp.status}`);
  return resp.json();
}

// Merged PRs for the release commits, newest first, each with its approvers.
async function releasePRs(repo, base) {
  const seen = new Set();
  const prs = [];
  for (const sha of releaseCommits()) {
    const pulls = await github(`/repos/${repo}/commits/${sha}/pulls`);
    for (const pr of pulls) {
      if (pr.merged_at && pr.base.ref === base && !seen.has(pr.number)) {
        seen.add(pr.number);
        const reviews = await github(`/repos/${repo}/pulls/${pr.number}/reviews?per_page=100`);
        prs.push({ number: pr.number, approvers: latestApprovers(reviews) });
      }
    }
  }
  return prs;
}

async function main() {
  const { GITHUB_ENV, GITHUB_REPOSITORY, GITHUB_REF_NAME = 'main', DA_CHG_LDAP_MAP } = process.env;

  const { map, defaults } = parseConfig(DA_CHG_LDAP_MAP);

  let prs = [];
  try {
    prs = await releasePRs(GITHUB_REPOSITORY, GITHUB_REF_NAME);
  } catch (e) {
    console.log(`::warning::Could not read PRs for the change request, using defaults: ${e.message}`);
  }

  const people = resolvePeople({ prs, map, defaults });
  const { mask, env } = toEnvLines(people);
  mask.forEach((value) => console.log(`::add-mask::${value}`));
  if (env.length) appendFileSync(GITHUB_ENV, `${env.join('\n')}\n`);

  // log only GitHub-side facts, never LDAP ids
  console.log(`PRs in release: ${prs.map((pr) => `#${pr.number}`).join(', ') || 'none'}`);
  console.log(`coordinator: ${people.coordinator ? 'set' : 'not set, using shared secret'}`);
  console.log(`approvers: ${people.approvedBy ? people.approvedBy.length : 'not set, using shared secret'}`);
  if (!people.coordinator || !people.approvedBy) {
    console.log('::warning::Change request coordinator/approvers fall back to the shared Helix secret. Set "_coordinator" / "_approvers" in the DA_CHG_LDAP_MAP repo secret.');
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === realpathSync(process.argv[1])) {
  await main();
}
