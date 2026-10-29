/*
 * Copyright 2022 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import config from './config.js';
import { getNxUrl, parseSiteUrl } from './urls.js';

export function sanitizeName(name, preserveDots = true, allowUnderscores = true) {
  if (!name) return null;

  if (preserveDots && name.indexOf('.') !== -1) {
    return name
      .split('.')
      .map((part) => sanitizeName(part, true, allowUnderscores))
      .join('.');
  }

  const pattern = allowUnderscores ? /[^a-z0-9_]+/g : /[^a-z0-9]+/g;

  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(pattern, '-')
    .replace(/-$/g, '');
}

export function sanitizePathParts(path) {
  const parts = path.slice(1)
    .toLowerCase()
    .split('/');
  return parts
    .map((name, i) => (name ? sanitizeName(name, true, i < parts.length - 1) : ''))
    // remove path traversal parts, and empty strings unless at the end
    .filter((name, i, filtered) => !/^[.]{1,2}$/.test(name) && (name !== '' || i === filtered.length - 1));
}

export function sanitizePath(path) {
  return `/${sanitizePathParts(path).join('/')}`;
}

// Determine what version of NX to load
let nxVer = document.head.querySelector('[name="nxver"]')?.getAttribute('content');
if (!nxVer) nxVer = sanitizeName(new URLSearchParams(window.location.search).get('nxver'));

/** Determine NX filenames */
export const nxJS = nxVer ? '/scripts/nx.js' : '/scripts/nexter.js';
export const nxCSS = nxVer ? '/styles/styles.css' : '/styles/nexter.css';

export const [setNx, getNx, getNx2, getNx1] = (() => {
  let nx;
  let nx2;
  let nx1;

  return [
    (nxBase, location) => {
      const { hostname, search, href, pathname } = location || window.location;
      const nxParam = sanitizeName(new URLSearchParams(search).get('nx'));
      const branch = nxParam || 'main';
      const isProd = !(parseSiteUrl(href || `https://${hostname}${pathname || '/'}`) || hostname.includes('local'));
      const remote = !isProd || !!nxParam;
      if (branch === 'local') {
        nx1 = `http://localhost:6456${nxBase}`;
        nx2 = `${nx1}2`;
      } else {
        nx1 = config.nx.url || remote ? getNxUrl(nxBase, branch) : nxBase;
        nx2 = nx1.endsWith('/nx') ? `${nx1}2` : nx1;
        if (config.nx.url || config.nx.urlV2) nx2 = getNxUrl(nxBase, branch, true);
      }
      nx = nxVer ? nx2 : nx1;
      if (!config.nx.url) nx1 = nx1.replace(/\/nx2$/, '/nx');
      return nx;
    }, () => nx, () => nx2, () => nx1,
  ];
})();

export const isNx2 = () => !!nxVer || (!config.nx.url && getNx().endsWith('/nx2'));

let nx2ApiPromise;
export const getNx2Api = () => {
  nx2ApiPromise ??= import(`${getNx2()}/utils/api.js`);
  return nx2ApiPromise;
};

export const getNxEWFlags = () => import(`${getNx2()}/utils/ewFlags.js`);
