import { getNx, getNx2Api } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

async function mountComponent(el, org, site) {
  await import('./da-permissions/da-permissions.js');
  let cmp = el.querySelector('da-permissions');
  if (!cmp) {
    cmp = document.createElement('da-permissions');
    el.append(cmp);
  }
  cmp.org = org;
  cmp.site = site;
}

// Bumped per route so a slow isHlx6 probe can't act on a route the user already left.
let routeToken = 0;

export async function handleRoute(el, details) {
  routeToken += 1;
  const token = routeToken;
  const org = details?.org ?? null;
  const site = details?.site ?? null;

  const { isHlx6 } = await getNx2Api();
  const hlx6 = await isHlx6(org, site);
  if (token !== routeToken) return null;
  if (hlx6) {
    return `https://tools.aem.live/tools/user-admin/index.html?org=${encodeURIComponent(org)}&site=${encodeURIComponent(site)}`;
  }

  await mountComponent(el, org, site);
  return null;
}

export default function init(el) {
  el.replaceChildren();
  hashChange.subscribe(async (details) => {
    const redirect = await handleRoute(el, details);
    if (redirect) window.location.replace(redirect);
  });
}
