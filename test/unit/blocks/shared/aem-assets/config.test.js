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
import {
  isDynamicMediaEnabled,
  shouldFilterApprovedAssets,
} from '../../../../../blocks/shared/aem-assets/config.js';

describe('AEM Assets delivery config', () => {
  const authorRepositoryId = 'author-p1-e1.adobeaemcloud.com';

  [
    {
      name: 'explicit DM delivery',
      input: { repositoryId: authorRepositoryId, dmDelivery: 'on' },
    },
    {
      name: 'Smart Crop',
      input: { repositoryId: authorRepositoryId, smartCrop: 'on' },
    },
    {
      name: 'delivery production origin',
      input: { repositoryId: authorRepositoryId, customOrigin: 'delivery-p1-e1.adobeaemcloud.com' },
    },
    {
      name: 'delivery repository',
      input: { repositoryId: 'delivery-p1-e1.adobeaemcloud.com' },
    },
  ].forEach(({ name, input }) => {
    it(`enables Dynamic Media for ${name}`, () => {
      expect(isDynamicMediaEnabled(input)).to.be.true;
    });
  });

  it('keeps author + publish out of Dynamic Media mode', () => {
    expect(isDynamicMediaEnabled({ repositoryId: authorRepositoryId })).to.be.false;
  });

  [
    { configuredValue: undefined, expected: true },
    { configuredValue: null, expected: true },
    { configuredValue: 'on', expected: true },
    { configuredValue: 'off', expected: false },
  ].forEach(({ configuredValue, expected }) => {
    it(`resolves approved-only value ${configuredValue}`, () => {
      expect(shouldFilterApprovedAssets({
        tierType: 'author',
        isDmEnabled: true,
        configuredValue,
      })).to.equal(expected);
    });
  });

  it('does not add the author approval filter to delivery tier', () => {
    expect(shouldFilterApprovedAssets({
      tierType: 'delivery',
      isDmEnabled: true,
      configuredValue: 'on',
    })).to.be.false;
  });

  it('does not filter author + publish mode', () => {
    expect(shouldFilterApprovedAssets({
      tierType: 'author',
      isDmEnabled: false,
      configuredValue: 'on',
    })).to.be.false;
  });
});
