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

import { setNx, nxJS, nxCSS } from './utils.js';

export function decorateArea({ area = document } = {}) {
  // Find all dark & light images
  const lcpImgs = [...area.querySelectorAll('[alt="light"], [alt="dark"]')].filter((img) => {
    const pic = img.parentElement;
    const parent = img.alt === 'light' ? img.closest('.light-scheme') : img.closest('.dark-scheme');
    pic.dataset.scheme = img.alt;
    img.alt = '';
    return !!parent;
  });

  // If browsing with a hash, skip LCP detection
  if (window.location.hash && area.querySelector('.browse')) return;

  // Only pick the first image from all found
  const img = lcpImgs[0] || area.querySelector('img');
  if (!img) return;

  img.removeAttribute('loading');
  img.fetchPriority = 'high';
}

// Where to load NX
const nx = setNx('/nx');
const nx2 = nx.endsWith('nx2');
const { loadArea, setConfig, getColorScheme } = await import(`${nx}${nxJS}`);

// Set color scheme once
document.body.classList.add(getColorScheme());

// Load NX styles
const link = document.createElement('link');
link.setAttribute('rel', 'stylesheet');
link.setAttribute('href', `${nx}${nxCSS}`);
document.head.appendChild(link);

const CONFIG = {
  hostnames: ['da.live', 'da.page'],
  codeBase: import.meta.url.replace('/scripts/scripts.js', ''),
  providers: { da: window.location.origin },
  decorateArea,
  imsClientId: 'darkalley',
  imsScope: 'ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,aem.frontend.all,additional_info.ownerOrg,additional_info.projectedProductContext,account_cluster.read',
};

export default async function loadPage() {
  loadStyles();
  const imsReady = initIms();

  if (!nx2) {
    // pin to light scheme
    document.body.classList.remove('light-scheme', 'dark-scheme');
    document.body.classList.add('light-scheme');
  }
  await setConfig(CONFIG);
  // Only block on IMS for OAuth-callback loads
  const { hash } = window.location;
  if (hash.includes('access_token=') || hash.includes('old_hash=')) {
    await imsReady;
  }
  await loadArea();
}

loadPage();
