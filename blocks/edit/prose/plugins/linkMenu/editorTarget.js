const DUMMY_BASE = 'https://__current__.invalid';
const AEM_HOST_RE = /^([\w-]+)--([\w-]+)--([\w-]+)\.(?:aem|hlx)\.(?:page|live)$/;

function parseHref(href) {
  if (typeof href !== 'string' || !href) return null;

  let url;
  try {
    url = new URL(href, DUMMY_BASE);
  } catch {
    return null;
  }

  const isRelative = url.origin === DUMMY_BASE;

  if (isRelative) {
    if (!href.startsWith('/')) return null;
    return { org: null, site: null, branch: null, pathname: url.pathname };
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;

  const aemMatch = url.hostname.match(AEM_HOST_RE);
  if (aemMatch) {
    const [, branch, site, org] = aemMatch;
    return { org, site, branch, pathname: url.pathname };
  }

  return null;
}

function normalizePath(pathname) {
  const path = pathname.replace(/\.html$/, '');
  if (path.length > 1 && path.endsWith('/')) return path.slice(0, -1);
  return path || '/';
}

export function resolveEditorTarget(href, context = {}) {
  const { org: currentOrg, repo: currentRepo, ref: currentRef = 'main' } = context;
  if (!currentOrg || !currentRepo) return null;

  const parsed = parseHref(href);
  if (!parsed) return null;

  const path = normalizePath(parsed.pathname);

  if (parsed.org === null) {
    return { org: currentOrg, repo: currentRepo, path, branch: currentRef };
  }

  if (parsed.org !== currentOrg || parsed.site !== currentRepo) return null;

  return { org: currentOrg, repo: currentRepo, path, branch: parsed.branch };
}

export function buildEditorUrl({ org, repo, path, branch }) {
  const refParam = branch && branch !== 'main' ? `?ref=${branch}` : '';
  return `/edit${refParam}#/${org}/${repo}${path}`;
}
