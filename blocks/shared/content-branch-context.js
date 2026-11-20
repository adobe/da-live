const BRANCH_ID = /^[a-z0-9]{1,8}$/;
const SITE = /^[a-z0-9_-]+$/;

/** Parse a raw site segment. Invalid explicit suffixes throw; never fall back to default. */
export function parseSiteSegment(segment) {
  if (typeof segment !== 'string') throw new TypeError('Invalid site segment');
  const parts = segment.split('~');
  if (parts.length > 2 || !SITE.test(parts[0])
    || (parts.length === 2 && (!BRANCH_ID.test(parts[1]) || parts[1] === 'main'))) {
    throw new TypeError('Invalid site segment');
  }
  return Object.freeze({ site: parts[0], branch: parts.length === 2 ? parts[1] : null });
}

/** Default is represented only by a bare site; explicit main is not a branch URL. */
export function withBranch(site, branch = null) {
  const parsed = parseSiteSegment(site);
  if (parsed.branch !== null) throw new TypeError('Expected a bare site');
  if (branch === null) return site;
  if (typeof branch !== 'string' || !BRANCH_ID.test(branch) || branch === 'main') {
    throw new TypeError('Invalid branch');
  }
  return `${site}~${branch}`;
}

/** Read the raw hash, not sanitized pathDetails. Invalid site segments throw. */
export function getContentBranch(hash = window.location.hash) {
  if (typeof hash !== 'string' || !hash.startsWith('#/')) return null;
  const segment = hash.slice(2).split('/')[1];
  if (!segment) return null;
  return parseSiteSegment(segment).branch;
}
