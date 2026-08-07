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

const { getRepositoryConfig } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);

function makeSheet(entries) {
  return { ok: true, json: async () => ({ data: entries }) };
}

function makeFetch(responses) {
  return async (url) => {
    for (const [pattern, response] of Object.entries(responses).sort(
      ([a], [b]) => b.length - a.length,
    )) {
      if (url.includes(pattern)) return response;
    }
    return { ok: false };
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
