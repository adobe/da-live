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

export const [setNx, getNx] = (() => {
  let nx;

  return [
    (nxBase, location) => {
      // Version nxBase if supplied from query param
      const nxVerBase = nxVer ? `${nxBase}2` : nxBase;

      nx = (() => {
        const { hostname, search } = location || window.location;
        const nxBaseParam = sanitizeName(new URLSearchParams(search).get('nx'));
        const isProd = !(hostname.includes('.aem.') || hostname.includes('local'));

        // If no custom nexter branch & on prod, use the default CDN route
        if (!nxBaseParam && isProd) return nxVerBase;

        // Determine set a branch regardless of param
        const branch = nxBaseParam || 'main';

        // Local is a special key to use nexter from localhost
        if (branch === 'local') return `http://localhost:6456${nxVerBase}`;

        // Otherwise use a fully qualified branch
        return `https://${branch}--da-nx--adobe.aem.live${nxVerBase}`;
      })();
      return nx;
    }, () => nx,
  ];
})();
