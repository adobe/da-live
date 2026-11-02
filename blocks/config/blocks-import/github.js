// GitHub side of the blocks import: find a repo's blocks and guess their structure from CSS/JS.
// Ported from config-console. The token is only kept by the caller, never stored.

import { IMPORT } from '../messages.js';
import { isBlockName } from './blocks.js';

const TIMEOUT_MS = 10000;

export function parseRepo(input) {
  const value = (input ?? '').trim();
  const patterns = [
    /^https?:\/\/github\.com\/([^/]+)\/([^/\s#?]+)/i,
    /^git@github\.com:([^/]+)\/([^/\s]+)/i,
    /^([^/\s:]+)\/([^/\s]+)$/,
  ];
  const match = patterns.map((re) => value.match(re)).find(Boolean);
  if (!match) return null;
  const [, owner, rawRepo] = match;
  const repo = rawRepo.replace(/\.git$/, '');
  const valid = /^[\w.-]+$/;
  return valid.test(owner) && valid.test(repo) ? { owner, repo } : null;
}

export function createGitHub({ owner, repo, branch = 'main', token = '' }) {
  const headers = { Accept: 'application/vnd.github.v3+json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const get = (url) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    return fetch(url, { headers, signal: controller.signal }).finally(() => clearTimeout(timer));
  };
  const base = `https://api.github.com/repos/${owner}/${repo}`;

  return {
    // Resolves to null when the repo is readable, else 'not-found' | 'needs-token' | 'rate-limit'.
    async checkAccess() {
      const resp = await get(base);
      if (resp.ok) return null;
      if (resp.status === 403 && resp.headers.get('X-RateLimit-Remaining') === '0') return 'rate-limit';
      // GitHub answers 404 for private repos without a token.
      if (resp.status === 404 && token) return 'not-found';
      return 'needs-token';
    },

    // Every folder directly inside a blocks/ folder: { name: 'cards', path: 'blocks/cards' }.
    async discoverBlocks() {
      const resp = await get(`${base}/git/trees/${branch}?recursive=1`);
      if (!resp.ok) throw new Error(IMPORT.readRepoFailed(resp));
      const { tree = [] } = await resp.json();
      const blocks = new Map();
      tree.filter((item) => item.type === 'tree').forEach(({ path }) => {
        const parts = path.split('/');
        const name = parts.at(-1);
        if (parts.at(-2) === 'blocks' && isBlockName(name) && !blocks.has(name)) {
          blocks.set(name, { name, path });
        }
      });
      return [...blocks.values()].sort((a, b) => a.name.localeCompare(b.name));
    },

    async readFile(path) {
      const resp = await get(`${base}/contents/${path}?ref=${branch}`);
      if (!resp.ok) return null;
      const { content } = await resp.json();
      return content ? atob(content) : null;
    },
  };
}

// Variants are `.name.variant` selectors in the block's CSS.
export function cssVariants(css, name) {
  if (!css) return [];
  const re = new RegExp(`\\.${name}\\.([\\w-]+)`, 'g');
  return [...new Set([...css.matchAll(re)].map((m) => m[1]))].filter(isBlockName);
}

const ROW_LOOP = /\[\.\.\.block\.children\]|\.forEach\(\(row[,)]|querySelectorAll\(['"]:scope\s*>\s*div['"]\)/i;

// Rows/columns the block's JS reads, e.g. row.children[2] means 3 columns.
export function jsShape(js) {
  if (!js) return { rows: 1, columns: 1 };
  const indexes = [...js.matchAll(/row\.children\[(\d+)\]/g)].map((m) => Number(m[1]) + 1);
  let columns = Math.max(1, ...indexes);
  if (columns === 1 && /\[\.\.\.(row|child|li)\.children\]/.test(js)) columns = 2;
  return { rows: ROW_LOOP.test(js) ? 2 : 1, columns };
}

// What to put in a generated block doc when no page has an example of the block.
export async function analyzeBlock(github, { name, path }) {
  const [js, css] = await Promise.all([
    github.readFile(`${path}/${name}.js`),
    github.readFile(`${path}/${name}.css`),
  ]);
  return { ...jsShape(js), variants: cssVariants(css, name) };
}
