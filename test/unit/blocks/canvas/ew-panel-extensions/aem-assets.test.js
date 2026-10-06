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
import '../../../setup-nx.js';

const { getNx2 } = await import('../../../../../scripts/utils.js');
const { getRepositoryConfig, getAssetsPlugin } = await import(
  '../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js'
);
const shared = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);

describe('Canvas AEM Assets', () => {
  afterEach(() => {
    shared.setRepositoryConfig(null);
    shared.configCalls.length = 0;
  });

  it('re-exports the shared repository config resolver', async () => {
    expect(getRepositoryConfig).to.equal(shared.getRepositoryConfig);
    const config = { repositoryId: 'author-example', imageType: 'editable-link' };
    shared.setRepositoryConfig(config);
    expect(await getRepositoryConfig('org', 'site')).to.equal(config);
    expect(shared.configCalls).to.deep.equal([['org', 'site']]);
  });

  it('registers the asset picker for the requested site', () => {
    expect(getAssetsPlugin({ org: 'org', site: 'site' })).to.include({ name: 'aem-assets', experience: 'fullsize-dialog', org: 'org', site: 'site' });
  });
});
