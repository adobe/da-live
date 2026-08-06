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

import { buildFeatureSet, buildAssetSelectorProps } from '../../../../../blocks/shared/aem-assets/selector-props.js';

describe('shared AEM asset selector props', () => {
  const baseArgs = {
    imsToken: 'token',
    repoConfig: {
      repositoryId: 'author-p1-e1.adobeaemcloud.com',
      tierType: 'author',
      isDmEnabled: false,
      approvedOnly: false,
    },
    externalBrief: 'brief',
    onClose: () => {},
    handleSelection: () => {},
  };

  describe('buildFeatureSet', () => {
    it('returns the base feature list when DM is disabled', () => {
      expect(buildFeatureSet(false)).to.deep.equal(['upload', 'collections', 'detail-panel', 'advisor']);
    });

    it('adds dynamic-media when DM is enabled', () => {
      expect(buildFeatureSet(true)).to.deep.equal([
        'upload',
        'collections',
        'detail-panel',
        'advisor',
        'dynamic-media',
      ]);
    });
  });

  describe('buildAssetSelectorProps', () => {
    it('maps the core selector props', () => {
      const props = buildAssetSelectorProps(baseArgs);
      expect(props.imsToken).to.equal('token');
      expect(props.repositoryId).to.equal('author-p1-e1.adobeaemcloud.com');
      expect(props.aemTierType).to.equal('author');
      expect(props.handleSelection).to.equal(baseArgs.handleSelection);
    });

    it('preserves an explicitly supplied empty externalBrief', () => {
      const props = buildAssetSelectorProps({ ...baseArgs, externalBrief: '' });
      expect(props).to.have.property('externalBrief', '');
    });

    it('includes the approved-only filter when enabled', () => {
      const props = buildAssetSelectorProps({
        ...baseArgs,
        repoConfig: { ...baseArgs.repoConfig, approvedOnly: true },
      });
      expect(props.filterSchema.map(({ groupKey }) => groupKey)).to.deep.equal(['AssetStatusGroup']);
      expect(props).to.include({ filterSchemaSource: 'hybrid-merge-deep' });
    });

    it('omits the approved-only filter when disabled', () => {
      const props = buildAssetSelectorProps({
        ...baseArgs,
        repoConfig: { ...baseArgs.repoConfig, approvedOnly: false },
      });
      expect(props).to.not.have.property('filterSchema');
      expect(props).to.not.have.property('filterSchemaSource');
    });

    it('includes onClose when a function is supplied', () => {
      const props = buildAssetSelectorProps(baseArgs);
      expect(props.onClose).to.equal(baseArgs.onClose);
    });

    it('omits onClose when undefined', () => {
      const props = buildAssetSelectorProps({ ...baseArgs, onClose: undefined });
      expect(props).to.not.have.property('onClose');
    });

    it('omits onClose when null', () => {
      const props = buildAssetSelectorProps({ ...baseArgs, onClose: null });
      expect(props).to.not.have.property('onClose');
    });
  });
});
