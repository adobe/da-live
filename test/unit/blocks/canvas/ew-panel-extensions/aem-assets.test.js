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

/* eslint-disable import/no-absolute-path, import/no-unresolved -- NX test fixture */
const { setDaConfigs } = await import('/test/fixtures/nx/utils/daConfig.js');
/* eslint-enable import/no-absolute-path, import/no-unresolved */
const { getRepositoryConfig } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);

describe('Canvas AEM Assets repository config', () => {
  afterEach(() => setDaConfigs([]));

  [
    ['DM delivery', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.asset.dm.delivery', value: 'on' },
    ]],
    ['Smart Crop', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.asset.smartcrop.select', value: 'on' },
    ]],
    ['delivery production origin', [
      { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
      { key: 'aem.assets.prod.origin', value: 'delivery-p1-e1.adobeaemcloud.com' },
    ]],
  ].forEach(([name, entries]) => {
    it(`defaults approvedOnly on for ${name}`, async () => {
      setDaConfigs([{ data: entries }]);
      const config = await getRepositoryConfig('org', 'site');
      expect(config.isDmEnabled).to.be.true;
      expect(config.approvedOnly).to.be.true;
    });
  });

  it('enables approvedOnly when aem.asset.dm.approvedonly is on', async () => {
    setDaConfigs([{
      data: [
        { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
        { key: 'aem.asset.dm.delivery', value: 'on' },
        { key: 'aem.asset.dm.approvedonly', value: 'on' },
      ],
    }]);
    const config = await getRepositoryConfig('org', 'site');
    expect(config.isDmEnabled).to.be.true;
    expect(config.approvedOnly).to.be.true;
  });

  it('honors site off over org on', async () => {
    setDaConfigs([
      {
        data: [
          { key: 'aem.repositoryId', value: 'author-p1-e1.adobeaemcloud.com' },
          { key: 'aem.asset.dm.delivery', value: 'on' },
          { key: 'aem.asset.dm.approvedonly', value: 'on' },
        ],
      },
      { data: [{ key: 'aem.asset.dm.approvedonly', value: 'off' }] },
    ]);
    const config = await getRepositoryConfig('org', 'site');
    expect(config.approvedOnly).to.be.false;
  });

  it('does not apply the author filter to delivery tier', async () => {
    setDaConfigs([{ data: [{ key: 'aem.repositoryId', value: 'delivery-p1-e1.adobeaemcloud.com' }] }]);
    const config = await getRepositoryConfig('org', 'site');
    expect(config.approvedOnly).to.be.false;
  });
});
