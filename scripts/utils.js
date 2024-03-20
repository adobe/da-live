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

export const [setNx, getNx] = (() => {
  let nx;
  return [
    (nxBase, location) => {
      nx = (() => {
        const { hostname, search } = location || window.location;
        if (!(hostname.includes('.hlx.') || hostname.includes('local'))) return nxBase;
        const branch = new URLSearchParams(search).get('nx') || 'main';
        if (branch === 'local') return 'http://localhost:6456/nx';
        return branch.includes('--') ? `https://${branch}.hlx.live/nx` : `https://${branch}--nexter--da-sites.hlx.live/nx`;
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

(function loadOrgLCP() {
  const { pathname, hash } = window.location;
  if (pathname !== '/' && hash) return;
  const tag = '<link rel="preload" as="image" href="/blocks/browse/da-orgs/img/da-one.webp" />';
  document.head.insertAdjacentHTML('beforeend', tag);
}());
