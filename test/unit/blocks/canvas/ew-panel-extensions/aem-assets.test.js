/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */

import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { getRepositoryConfig, renderAssets } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);
const { getExtensionsBridge } = await import(
  '../../../../../blocks/canvas/editor-utils/extensions-bridge.js'
);

function makeSheet(entries) {
  return { ok: true, json: async () => ({ data: entries }) };
}

function makeFetch(responses) {
  return async (url) => {
    // getNx2Api's config.get pings isHlx6 first (HLX_ADMIN/ping/{org}/{site}); check that
    // before the pattern match below, since a ping url can otherwise collide with an
    // org-level config pattern (e.g. '/ping/{org}/{site}' contains '/{org}/').
    if (url.includes('/ping/')) return new Response('', { status: 200 });
    for (const [pattern, response] of Object.entries(responses).sort(
      ([a], [b]) => b.length - a.length,
    )) {
      if (url.includes(pattern)) return response;
    }
    return new Response('', { status: 404 });
  };
}

function makeDoc(text, h1Title = '') {
  return {
    textContent: text,
    descendants: (fn) => {
      if (h1Title) {
        fn({ type: { name: 'heading' }, attrs: { level: 1 }, textContent: h1Title });
      }
    },
  };
}

describe('Canvas AEM Assets repository config', () => {
  [
    ['DM delivery', 'canvas-dm-org', 'canvas-dm-site', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.asset.dm.delivery', value: 'on' },
    ]],
    ['Smart Crop', 'canvas-smartcrop-org', 'canvas-smartcrop-site', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.asset.smartcrop.select', value: 'on' },
    ]],
    ['delivery production origin', 'canvas-delivery-org', 'canvas-delivery-site', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.assets.prod.origin', value: 'delivery-p1-e1.adobeaemcloud.com' },
    ]],
  ].forEach(([name, org, site, entries]) => {
    it(`defaults approvedOnly on for ${name}`, async () => {
      const orgFetch = window.fetch;
      window.fetch = makeFetch({ [`/config/${org}/${site}/`]: makeSheet(entries) });
      try {
        const config = await getRepositoryConfig(org, site);
        expect(config.isDmEnabled).to.be.true;
        expect(config.approvedOnly).to.be.true;
      } finally {
        window.fetch = orgFetch;
      }
    });
  });

  it('enables approvedOnly when aem.asset.dm.approvedonly is on', async () => {
    const org = 'canvas-approved-on-org';
    const site = 'canvas-approved-on-site';
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      [`/config/${org}/${site}/`]: makeSheet([
        { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
        { key: 'aem.asset.dm.delivery', value: 'on' },
        { key: 'aem.asset.dm.approvedonly', value: 'on' },
      ]),
    });
    try {
      const config = await getRepositoryConfig(org, site);
      expect(config.isDmEnabled).to.be.true;
      expect(config.approvedOnly).to.be.true;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('honors site off over org on', async () => {
    const org = 'canvas-site-off-org';
    const site = 'canvas-site-off-site';
    const orgFetch = window.fetch;
    window.fetch = makeFetch({
      [`/config/${org}/`]: makeSheet([
        { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
        { key: 'aem.asset.dm.delivery', value: 'on' },
        { key: 'aem.asset.dm.approvedonly', value: 'on' },
      ]),
      [`/config/${org}/${site}/`]: makeSheet([{ key: 'aem.asset.dm.approvedonly', value: 'off' }]),
    });
    try {
      const config = await getRepositoryConfig(org, site);
      expect(config.approvedOnly).to.be.false;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('does not apply the author filter to delivery tier', async () => {
    const org = 'canvas-delivery-tier-org';
    const site = 'canvas-delivery-tier-site';
    const orgFetch = window.fetch;
    window.fetch = makeFetch({ [`/config/${org}/${site}/`]: makeSheet([{ key: 'aem.repositoryId', value: 'delivery-p1-e1.adobeaemcloud.com' }]) });
    try {
      const config = await getRepositoryConfig(org, site);
      expect(config.approvedOnly).to.be.false;
    } finally {
      window.fetch = orgFetch;
    }
  });
});

describe('Canvas AEM Assets renderAssets', () => {
  let orgFetch;
  let orgHeadAppend;
  let orgPureJSSelectors;
  let orgImsDetails;
  let bridge;

  beforeEach(() => {
    orgFetch = window.fetch;
    orgHeadAppend = document.head.append;
    orgPureJSSelectors = window.PureJSSelectors;
    orgImsDetails = window.__testImsDetails;
    bridge = getExtensionsBridge();
    bridge.view = null;
    window.__testImsDetails = {
      accessToken: { token: 'ims-token' },
      anonymous: false,
    };
    document.head.append = function append(node) {
      if (node.tagName === 'SCRIPT') {
        queueMicrotask(() => node.onload?.());
        return node;
      }
      return orgHeadAppend.call(this, node);
    };
  });

  afterEach(() => {
    window.fetch = orgFetch;
    document.head.append = orgHeadAppend;
    window.PureJSSelectors = orgPureJSSelectors;
    window.__testImsDetails = orgImsDetails;
    bridge.view = null;
  });

  it('passes the page-content externalBrief to the asset selector advisor', async () => {
    const org = 'canvas-brief-org';
    const site = 'canvas-brief-site';
    window.fetch = makeFetch({
      [`/config/${org}/${site}/`]: makeSheet([
        { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      ]),
    });

    bridge.view = {
      state: {
        doc: makeDoc('We sell great shoes.', 'Our Products'),
      },
    };

    let renderCall;
    window.PureJSSelectors = {
      renderAssetSelector: (...args) => {
        renderCall = args;
      },
    };

    const container = document.createElement('div');
    await renderAssets({ container, org, site });

    expect(renderCall).to.have.length(2);
    expect(renderCall[1].externalBrief).to.include('Title: Our Products');
    expect(renderCall[1].externalBrief).to.include('We sell great shoes.');
  });

  it('falls back to an empty externalBrief when the canvas view is unavailable', async () => {
    const org = 'canvas-empty-brief-org';
    const site = 'canvas-empty-brief-site';
    window.fetch = makeFetch({
      [`/config/${org}/${site}/`]: makeSheet([
        { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      ]),
    });

    let renderCall;
    window.PureJSSelectors = {
      renderAssetSelector: (...args) => {
        renderCall = args;
      },
    };

    const container = document.createElement('div');
    await renderAssets({ container, org, site });

    expect(renderCall).to.have.length(2);
    expect(renderCall[1]).to.have.property('externalBrief', '');
  });
});
