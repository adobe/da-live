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
  createApprovedOnlyFilterSchema,
  getApprovedOnlyFilterProps,
} from '../../../../../blocks/shared/aem-assets/filter-schema.js';

describe('approved-only AEM Assets filter schema', () => {
  it('preserves the pinned Content Advisor filter groups', () => {
    const schema = createApprovedOnlyFilterSchema();
    expect(schema.map(({ groupKey }) => groupKey)).to.deep.equal([
      'FileTypeGroup',
      'FileFormatGroup',
      'AssetStatusGroup',
      'FileSizeGroup',
      'ImageDimensionsGroup',
      'ModifiedDateGroup',
      'CreatedDateGroup',
    ]);
  });

  it('locks Asset Status to Approved', () => {
    const statusGroup = createApprovedOnlyFilterSchema()
      .find(({ groupKey }) => groupKey === 'AssetStatusGroup');
    const [statusField] = statusGroup.fields;

    expect(statusField).to.include({
      element: 'radiogroup',
      name: 'property=dam:assetStatus=',
      readOnly: true,
    });
    expect(statusField.defaultValue).to.deep.equal(['approved']);
    expect(statusField.options).to.deep.equal([
      { label: 'Approved', value: 'approved', readOnly: true },
    ]);
  });

  it('returns a fresh nested schema for every call', () => {
    const first = createApprovedOnlyFilterSchema();
    const second = createApprovedOnlyFilterSchema();

    expect(first).to.not.equal(second);
    expect(first[0]).to.not.equal(second[0]);
    expect(first[0].fields[0]).to.not.equal(second[0].fields[0]);
  });

  it('adds filterSchema only when approved-only is enabled', () => {
    const enabled = getApprovedOnlyFilterProps(true);
    const disabled = getApprovedOnlyFilterProps(false);

    expect(enabled.filterSchema).to.be.an('array').and.not.empty;
    expect(disabled).to.deep.equal({});
    expect(disabled).to.not.have.property('filterSchema');
  });
});
