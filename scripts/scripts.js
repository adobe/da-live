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

import { initIms } from '../blocks/shared/utils.js';
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
  if (!nx2) {
    // pin to light scheme
    document.body.classList.remove('light-scheme', 'dark-scheme');
    document.body.classList.add('light-scheme');
  }
  // Capture the hash BEFORE imsReady processes it. A sign-in callback
  // includes access_token=...; a sign-out callback comes back with old_hash
  // but no access_token. That distinction is the most reliable signal — no
  // reliance on which nx version manages the nx-ims flag.
  const { hash } = window.location;
  const hadAccessToken = hash.includes('access_token=');
  const isImsCallback = hadAccessToken || hash.includes('old_hash=');

  const imsReady = initIms();
  await setConfig(CONFIG);

  if (isImsCallback) {
    await imsReady;
    if (!hadAccessToken) {
      // Sign-out callback — land on home rather than the page they signed
      // out from, which would just show the session-expired dialog.
      window.location.replace('/');
      return;
    }
  }

  // Cross-tab auth monitor: imslib persists its session in localStorage, so
  // when another tab signs in/out, storage events fire for imslib's keys (not
  // necessarily nx-ims — nx2's handleSignOut leaves that flag alone). Re-check
  // the live auth state on every storage change so we react regardless of
  // which keys flipped.
  imsReady.then(() => {
    let wasAuthed = !!window.adobeIMS?.getAccessToken();
    window.addEventListener('storage', async () => {
      const isAuthed = !!window.adobeIMS?.getAccessToken();
      if (wasAuthed && !isAuthed) {
        const { showAuthBanner } = await import('../blocks/shared/da-auth-banner/da-auth-banner.js');
        showAuthBanner();
      } else if (!wasAuthed && isAuthed) {
        // Another tab signed back in — reload to pick up the fresh session.
        window.location.reload();
      }
      wasAuthed = isAuthed;
    });
  });

  await loadArea();
}

loadPage();
