import { getNx, getNx2Api } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

export function userAdminUrl(org, site) {
  return `https://tools.aem.live/tools/user-admin/index.html?org=${encodeURIComponent(org)}&site=${encodeURIComponent(site)}`;
}

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

export async function handleRoute(el, details, { isHlx6, replace }) {
  routeToken += 1;
  const token = routeToken;
  const org = details?.org ?? null;
  const site = details?.site ?? null;

  if (site) {
    const hlx6 = await isHlx6(org, site);
    if (token !== routeToken) return;
    if (hlx6) {
      replace(userAdminUrl(org, site));
      return;
    }
  }

  await mountComponent(el, org, site);
}

export default function init(el) {
  el.replaceChildren();
  hashChange.subscribe((details) => {
    handleRoute(el, details, {
      isHlx6: async (org, site) => {
        const { isHlx6: isHlx6Api } = await getNx2Api();
        return isHlx6Api(org, site);
      },
      replace: (url) => { window.location.replace(url); },
    });
  });
}
