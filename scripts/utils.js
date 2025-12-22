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
export const codeBase = `${import.meta.url.replace('/scripts/utils.js', '')}`;

export function sanitizeName(name, preserveDots = true) {
  if (!name) return null;

  if (preserveDots && name.indexOf('.') !== -1) {
    return name
      .split('.')
      .map((part) => sanitizeName(part))
      .join('.');
  }

  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9_]+/g, '-')
    .replace(/-$/g, '');
}

export function sanitizePathParts(path) {
  return path.slice(1)
    .toLowerCase()
    .split('/')
    .map((name) => (name ? sanitizeName(name) : ''))
    // remove path traversal parts, and empty strings unless at the end
    .filter((name, i, parts) => !/^[.]{1,2}$/.test(name) && (name !== '' || i === parts.length - 1));
}

export function sanitizePath(path) {
  return `/${sanitizePathParts(path).join('/')}`;
}

export const [setNx, getNx] = (() => {
  let nx;
  return [
    (nxBase, location) => {
      nx = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.hlx.') || hostname.includes('.aem.') || hostname.includes('local'))) return nxBase;
        const branch = sanitizeName(new URLSearchParams(search).get('nx'), false) || 'main';
        if (branch === 'local') return 'http://localhost:6456/nx';
        return `https://${branch}--da-nx--adobe.aem.live/nx`;
      })();
      return nx;
    }, () => nx,
  ];
})();

export function decorateArea(area = document) {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    img?.removeAttribute('loading');
  };

  (async function loadLCPImage() {
    const hero = area.querySelector('.nx-hero, .hero');
    if (!hero) {
      eagerLoad(area, 'img');
      return;
    }

    eagerLoad(hero, 'div:first-child img');
    eagerLoad(hero, 'div:last-child > div:last-child img');
  }());
}
