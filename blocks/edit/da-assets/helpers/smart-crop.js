import { daFetch } from '../../../shared/utils.js';
import { buildSmartCropsListUrl, buildSmartCropUrl } from './urls.js';

function buildStructureSelectionHtml(responsiveImageConfig, blockName, smartCropItems) {
  if (!responsiveImageConfig) return '';

  const configs = responsiveImageConfig.filter((config) => {
    const matchesPosition = blockName
      ? config.position === 'everywhere' || config.position === blockName
      : config.position === 'everywhere' || config.position === 'outside-blocks';
    const hasAllCrops = config.crops.every(
      (crop) => smartCropItems.find((item) => item.name === crop),
    );
    return matchesPosition && hasAllCrops;
  });

  if (configs.length === 0) return '';

  const radioItems = configs
    .map((config, i) => `<li><input type="radio" id="da-dialog-asset-structure-select-${i}" name="da-dialog-asset-structure-select" value="${encodeURIComponent(JSON.stringify(config))}"><label for="da-dialog-asset-structure-select-${i}">${config.name}</label></li>`)
    .join('');

  return `<h2>Insert Type</h2><ul class="da-dialog-asset-structure-select">
    <li><input checked type="radio" id="single" name="da-dialog-asset-structure-select" value="single"><label for="single">Single, Manual</label></li>
    ${radioItems}
  </ul>`;
}

function syncCropSelectionToStructure(cropList, structureValue) {
  if (structureValue === 'single') {
    cropList.querySelectorAll('li').forEach((li) => li.classList.remove('selected'));
    cropList.querySelector('li[data-name="original"]')?.classList.add('selected');
    return;
  }
  const structure = JSON.parse(decodeURIComponent(structureValue));
  cropList.querySelectorAll('li').forEach((li) => {
    li.classList.toggle('selected', structure.crops.includes(li.dataset.name));
  });
}

/**
 * Renders the smart crop selection UI into `container`.
 *
 * @param {object} opts
 * @param {HTMLElement} opts.container - Element to render the crop UI into.
 * @param {object} opts.asset - Selected asset object (author-tier fields: repo:id, name, mimetype).
 * @param {string} opts.assetUrl - Pre-built URL for the original asset
 *   (used for "Original" thumbnail).
 * @param {string} opts.dmOrigin - DM delivery origin host (no protocol).
 * @param {string|null} opts.blockName - Current editor block name, or null if outside a block.
 * @param {Promise<Array|false>} opts.responsiveImageConfigPromise - Responsive image configs.
 * @param {function(string[]): void} opts.onInsert - Called with array of src URLs to insert.
 * @param {function(): void} opts.onBack - Called when user clicks Back.
 * @param {function(): void} opts.onCancel - Called when user clicks Cancel.
 * @returns {Promise<boolean>} false if the asset has no smart crops
 *   (caller should insert directly).
 */
export default async function showSmartCropDialog({
  container,
  asset,
  assetUrl,
  dmOrigin,
  blockName,
  responsiveImageConfigPromise,
  onInsert,
  onBack,
  onCancel,
}) {
  const smartCropsResponse = await daFetch(`${buildSmartCropsListUrl(asset, dmOrigin)}`);
  const smartCropsData = await smartCropsResponse.json();

  if (!(smartCropsData.items?.length > 0)) {
    return false;
  }

  const [responsiveImageConfig] = await Promise.all([responsiveImageConfigPromise]);
  const structureSelectionHtml = buildStructureSelectionHtml(
    responsiveImageConfig,
    blockName,
    smartCropsData.items,
  );

  container.innerHTML = `
    <div class="da-dialog-asset-crops-toolbar">
      <button class="cancel">Cancel</button>
      <button class="back">Back</button>
      <button class="insert">Insert</button>
    </div>
    ${structureSelectionHtml}
    <h2>Smart Crops</h2>
  `;

  const cropList = document.createElement('ul');
  cropList.classList.add('da-dialog-asset-crops');
  container.append(cropList);

  const cropItems = smartCropsData.items
    .map((crop) => `<li data-name="${crop.name}"><p>${crop.name}</p><img src="${buildSmartCropUrl(asset, dmOrigin, crop.name)}">`)
    .join('</li>');
  cropList.innerHTML = `<li class="selected" data-name="original"><p>Original</p><img src="${assetUrl}"></li>${cropItems}</li>`;

  container.querySelector('.cancel').addEventListener('click', () => onCancel());
  container.querySelector('.back').addEventListener('click', () => onBack());

  container.querySelector('.da-dialog-asset-structure-select')?.addEventListener('change', (e) => {
    syncCropSelectionToStructure(cropList, e.target.value);
  });

  cropList.addEventListener('click', (e) => {
    const structureInput = container.querySelector('.da-dialog-asset-structure-select input:checked');
    if (structureInput && structureInput.value !== 'single') return;
    const li = e.target.closest('li');
    if (!li) return;
    cropList.querySelector('.selected')?.classList.remove('selected');
    li.classList.add('selected');
  });

  container.querySelector('.insert').addEventListener('click', () => {
    const insertTypeInput = container.querySelector('.da-dialog-asset-structure-select input:checked');
    const structureConfig = !insertTypeInput || insertTypeInput.value === 'single'
      ? null
      : JSON.parse(decodeURIComponent(insertTypeInput.value));

    const selectedCropName = !structureConfig
      ? cropList.querySelector('.selected')?.dataset.name
      : 'original';

    const cropNames = structureConfig?.crops || [selectedCropName];
    const srcs = cropNames.map((cropName) => cropList.querySelector(`[data-name="${cropName}"] img`)?.src);
    onInsert(srcs);
  });

  return true;
}
