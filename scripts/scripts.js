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

import { setNx, getNx, nxJS, nxCSS } from './utils.js';
import { initIms } from '../blocks/shared/utils.js';

/** Determine where to load NX from */
const nx = setNx('/nx');
const nx2 = nx.endsWith('nx2');

/** Default area decoration */
const decorateArea = ({ area = document }) => {
  const eagerLoad = (parent, selector) => {
    const img = parent.querySelector(selector);
    if (!img) return;
    img.removeAttribute('loading');
    img.fetchPriority = 'high';
  };

  eagerLoad(area, 'img');

  if (!nx2) return;
  // Prefix DA blocks so NX knows to load from DA
  // TODO: NX2 forward compatibility, remove after upgrade
  area.querySelectorAll('div[class]').forEach((block) => {
    const { className } = block;

    // If its an nx block, remove the prefix, otherwise add 'da-'
    block.className = className.startsWith('nx-')
      ? className.replace('nx-', '') : `da-${className}`;
  });
};

// Who can provide blocks
const providers = { da: window.location.origin };

/** Setup the NX config object */
const CONFIG = {
  providers,
  hostnames: ['da.live', 'da.page'],
  codeBase: import.meta.url.replace('/scripts/scripts.js', ''),
  imsClientId: 'darkalley',
  imsScope: 'ab.manage,AdobeID,gnav,openid,org.read,read_organizations,session,aem.frontend.all,additional_info.ownerOrg,additional_info.projectedProductContext,account_cluster.read',
  decorateArea,
};

const { loadArea, setConfig } = await import(`${nx}${nxJS}`);

function loadStyles() {
  const link = document.createElement('link');
  link.setAttribute('rel', 'stylesheet');
  link.setAttribute('href', `${nx}${nxCSS}`);
  document.head.appendChild(link);
}

export default async function loadPage() {
  loadStyles();
  initIms();

  if (!nx2) {
    // pin to light scheme
    document.body.classList.add('light-scheme');
    // nx2 decorates automatically
    decorateArea({});
  }
  await setConfig(CONFIG);
  await loadArea();
}

loadPage();
