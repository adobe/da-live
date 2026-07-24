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

/**
 * DA-compatible snapshot of Content Advisor's default file-filter controls.
 *
 * Sources pinned at CQ/assets-selectors commit
 * 8a25725fa6324396e8f3844b95ce11095e343f54:
 * - src/connected/asset-selector/src/components/searchNext/schemas/DefaultFileSchema.js
 * - src/pure/asset-selector/src/utils/FilterUtils.js
 *
 * Content Advisor's live default uses an internal Adaptive Form schema. The public
 * filterSchema prop accepts this array schema, so file-format facets are represented
 * by the pinned static option list below.
 *
 * @returns {Array<object>}
 */
export function createApprovedOnlyFilterSchema() {
  return [
    {
      fields: [{
        element: 'checkbox',
        name: 'type',
        options: [
          { label: 'Images', value: 'image/*' },
          { label: 'Documents', value: 'text/*,application/*' },
          { label: 'Videos', value: 'video/*' },
        ],
        orientation: 'vertical',
        columns: 2,
      }],
      header: 'File Type',
      groupKey: 'FileTypeGroup',
    },
    {
      fields: [{
        element: 'checkbox',
        name: 'property=dc:format=',
        options: [
          { label: 'JPG', value: 'image/jpeg' },
          { label: 'PNG', value: 'image/png' },
          { label: 'TIFF', value: 'image/tiff' },
          { label: 'PSD', value: 'image/vnd.adobe.photoshop' },
          { label: 'INDD', value: 'application/x-indesign' },
          { label: 'GIF', value: 'image/gif' },
          { label: 'MP4', value: 'video/mp4' },
          { label: 'PDF', value: 'application/pdf' },
          { label: 'AI', value: 'application/postscript' },
          { label: 'INDT', value: 'application/vnd.adobe.indesign.template' },
          {
            label: 'PPTX',
            value: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          },
          {
            label: 'DOCX',
            value: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          },
          {
            label: 'XLSX',
            value: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          },
          { label: 'PSB', value: 'application/vnd.3gpp.pic-bw-small' },
          { label: 'WEBP', value: 'image/webp' },
          { label: 'SVG', value: 'image/svg+xml' },
        ],
        columns: 3,
      }],
      header: 'File Format',
      groupKey: 'FileFormatGroup',
    },
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
    {
      fields: [{
        element: 'Number',
        name: 'property=repo:size',
        range: true,
        quiet: true,
        label: 'File Size',
        minLabel: 'Min File Size',
        maxLabel: 'Max File Size',
        hideArrows: true,
        columns: 2,
      }],
      header: 'File Size',
      groupKey: 'FileSizeGroup',
    },
    {
      fields: [
        {
          element: 'Number',
          name: 'property=tiff:imageWidth',
          range: true,
          quiet: true,
          label: 'Width',
          minLabel: 'Width Min',
          maxLabel: 'Width Max',
          hideArrows: true,
          columns: 2,
        },
        {
          element: 'Number',
          name: 'property=tiff:imageLength',
          range: true,
          quiet: true,
          label: 'Height',
          minLabel: 'Height Min',
          maxLabel: 'Height Max',
          hideArrows: true,
          columns: 2,
        },
      ],
      header: 'Image Dimensions',
      groupKey: 'ImageDimensionsGroup',
    },
    {
      fields: [{
        element: 'DateRange',
        name: 'property=repo:modifyDate',
        position: 'top',
        label: 'Modified Date',
        orientation: 'horizontal',
      }],
      header: 'Modified Date',
      groupKey: 'ModifiedDateGroup',
    },
    {
      fields: [{
        element: 'DateRange',
        name: 'property=repo:createDate',
        position: 'top',
        label: 'Created Date',
        orientation: 'horizontal',
      }],
      header: 'Created Date',
      groupKey: 'CreatedDateGroup',
    },
  ];
}

/**
 * Builds the optional selector-prop fragment without emitting filterSchema when disabled.
 *
 * @param {boolean} approvedOnly
 * @returns {{ filterSchema: Array<object> } | {}}
 */
export function getApprovedOnlyFilterProps(approvedOnly) {
  return approvedOnly ? { filterSchema: createApprovedOnlyFilterSchema() } : {};
}
