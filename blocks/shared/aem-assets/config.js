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
 * Resolves every documented Dynamic Media activation path.
 *
 * @param {object} config
 * @param {string} config.repositoryId
 * @param {string|null} [config.customOrigin]
 * @param {string|null} [config.dmDelivery]
 * @param {string|null} [config.smartCrop]
 * @returns {boolean}
 */
export function isDynamicMediaEnabled({
  repositoryId,
  customOrigin,
  dmDelivery,
  smartCrop,
}) {
  return dmDelivery === 'on'
    || smartCrop === 'on'
    || customOrigin?.startsWith('delivery-')
    || repositoryId.startsWith('delivery-');
}

/**
 * Resolves whether DA should supply the locked author approval filter.
 *
 * @param {object} config
 * @param {'author'|'delivery'} config.tierType
 * @param {boolean} config.isDmEnabled
 * @param {string|null} config.configuredValue
 * @returns {boolean}
 */
export function shouldFilterApprovedAssets({
  tierType,
  isDmEnabled,
  configuredValue,
}) {
  return tierType === 'author'
    && isDmEnabled
    && configuredValue === 'on';
}
