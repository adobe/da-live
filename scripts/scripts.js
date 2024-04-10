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

import { setNx, codeBase, decorateArea } from './utils.js';

const nx = setNx('/nx');
const STYLES = '/styles/styles.css';
const CONFIG = {
  codeBase,
  imsClientId: 'darkalley',
  imsScope: 'ab.manage,additional_info.projectedProductContext,AdobeID,gnav,openid,org.read,read_organizations,session',
  decorateArea,
};

/*
 * ------------------------------------------------------------
 * Edit below at your own risk
 * ------------------------------------------------------------
 */

const { loadArea, setConfig } = await import(`${nx}/scripts/nexter.js`);
setConfig(CONFIG);

// TODO: Remove this once content is fixed for Nexter
const headerMeta = document.head.querySelector('[content="aec-shell"]');
if (headerMeta) headerMeta.remove();

function loadStyles() {
  const paths = [`${nx}/styles/nexter.css`];
  if (STYLES) { paths.push(STYLES); }
  paths.forEach((path) => {
    const link = document.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', path);
    document.head.appendChild(link);
  });
}

export default async function loadPage() {
  // TODO: AEM markup doesn't do colspan in blocks correctly
  const divs = document.querySelectorAll('div[class] div');
  divs.forEach((div) => { if (div.innerHTML.trim() === '') div.remove(); });

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

loadStyles();
decorateArea();
loadPage();
