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

const HYBRID_FILTER_SCHEMA_SOURCE = 'hybrid-merge-deep';

/**
 * Creates the locked asset-status overlay merged with Content Advisor's defaults.
 *
 * @returns {Array<object>}
 */
export function createApprovedOnlyFilterSchema() {
  return [
    {
      fields: [{
        element: 'radiogroup',
        name: 'property=dam:assetStatus=',
        defaultValue: ['approved'],
        readOnly: true,
        orientation: 'vertical',
        options: [
          { label: 'Approved', value: 'approved', readOnly: true },
        ],
      }],
      header: 'Asset Status',
      groupKey: 'AssetStatusGroup',
    },
  ];
}

/**
 * Builds the optional selector-prop fragment without enabling a filter when disabled.
 *
 * @param {boolean} approvedOnly
 * @returns {{ filterSchema: Array<object>, filterSchemaSource: string } | {}}
 */
export function getApprovedOnlyFilterProps(approvedOnly) {
  return approvedOnly ? {
    filterSchema: createApprovedOnlyFilterSchema(),
    filterSchemaSource: HYBRID_FILTER_SCHEMA_SOURCE,
  } : {};
}
