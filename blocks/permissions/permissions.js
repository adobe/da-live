import { getNx, getNx2Api } from '../../scripts/utils.js';

const { hashChange, loadStyle } = await import(`${getNx()}/utils/utils.js`);

const styles = await loadStyle(import.meta.url);
document.adoptedStyleSheets.push(styles);

/**
 * Build the Helix 6 user-admin URL for an org/site.
 * @param {string} org
 * @param {string} site
 * @returns {string}
 */
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

// Monotonically increasing token guarding against a stale route: an earlier
// route's `isHlx6` probe resolving after a later route has already started
// must not redirect or remount for a site the user has since left.
let routeToken = 0;

/**
 * Route a hash-change detail to either the Helix 6 redirect or the mounted
 * `<da-permissions>` component. Path segments after the site are ignored.
 * @param {HTMLElement} el
 * @param {{ org: string, site: string|null }|null} details
 * @param {{
 *   isHlx6: (org: string, site: string) => Promise<boolean>,
 *   replace: (url: string) => void,
 * }} deps
 * @returns {Promise<void>}
 */
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
