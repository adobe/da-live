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

import { setLibs } from './utils.js';

// Add project-wide style path here.
const STYLES = '/styles/styles.css';

// Use '/libs' if your live site maps '/libs' to milo's origin.
const LIBS = '/libs';

// Add any config options.
const CONFIG = {
  imsClientId: 'darkalley',
  locales: {
    '': { ietf: 'en-US', tk: 'hah7vzn.css' },
  },
};

// Load LCP image immediately
function loadLCPImage() {
  if (document.body.querySelector('.browse')) {
    const tag = '<link rel="preload" as="image" href="/blocks/browse/da-orgs/img/da-one.webp" />';
    document.head.insertAdjacentHTML('beforeend', tag);
  } else {
    const lcpImg = document.querySelector('img');
    lcpImg?.removeAttribute('loading');
  }
}

/*
 * ------------------------------------------------------------
 * Edit below at your own risk
 * ------------------------------------------------------------
 */

const miloLibs = setLibs(LIBS);

function loadStyles() {
  const paths = [`${miloLibs}/styles/styles.css`];
  if (STYLES) { paths.push(STYLES); }
  paths.forEach((path) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', path);
    document.head.appendChild(link);
  });
}

loadLCPImage();
loadStyles();

export default async function loadPage() {
  // TODO: Franklin "markup" doesn't do colspan in blocks correctly
  const divs = document.querySelectorAll('div[class] div');
  divs.forEach((div) => { if (div.innerHTML.trim() === '') div.remove(); });

  const { loadArea, setConfig } = await import(`${miloLibs}/utils/utils.js`);
  setConfig({ ...CONFIG, miloLibs });

  // try { await loadIms(); } catch { /* die silently */ }
  await loadArea();
}

// Side-effects
(async function daPreview() {
  const { searchParams } = new URL(window.location.href);
  if (searchParams.get('dapreview') === 'on') {
    const { default: livePreview } = await import('./dapreview.js');
    livePreview(loadPage);
  }
}());

loadPage();
