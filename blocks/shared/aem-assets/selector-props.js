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

import { getApprovedOnlyFilterProps } from './filter-schema.js';

export function buildFeatureSet(isDmEnabled) {
  const features = ['upload', 'collections', 'detail-panel', 'advisor'];
  if (isDmEnabled) features.push('dynamic-media');
  return features;
}

let lastFolderPath;

/**
 * Records the folder of a selected asset so the next time the picker opens
 * for an author-tier repo, it starts there instead of at the root.
 *
 * @param {object} repoConfig
 * @param {string} [assetPath] - `asset.path`, the JCR path of the selected asset.
 */
export function rememberAssetFolder(repoConfig, assetPath) {
  if (repoConfig.tierType !== 'author' || !assetPath) return;
  const folderPath = assetPath.slice(0, assetPath.lastIndexOf('/'));
  if (folderPath) lastFolderPath = folderPath;
}

export function buildAssetSelectorProps({
  imsToken,
  repoConfig,
  externalBrief,
  onClose,
  handleSelection,
}) {
  return {
    imsToken,
    repositoryId: repoConfig.repositoryId,
    aemTierType: repoConfig.tierType,
    featureSet: buildFeatureSet(repoConfig.isDmEnabled),
    ...(repoConfig.tierType === 'author' && lastFolderPath && { path: lastFolderPath }),
    ...(externalBrief !== undefined && { externalBrief }),
    ...getApprovedOnlyFilterProps(repoConfig.approvedOnly),
    ...(onClose && { onClose }),
    handleSelection,
  };
}
