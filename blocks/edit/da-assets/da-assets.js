import { DOMParser as proseDOMParser, Fragment } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch, getFirstSheet } from '../../shared/utils.js';
import getPathDetails from '../../shared/pathDetails.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/static-assets/resources/assets-selectors.js';

const fullConfJsons = {};
const CONFS = {};

async function fetchConf(path) {
  if (CONFS[path]) return CONFS[path];
  const resp = await daFetch(`${DA_ORIGIN}/config${path}`);
  if (!resp.ok) return null;

  fullConfJsons[path] = await resp.json();
  const data = getFirstSheet(fullConfJsons[path]);
  if (!data) return null;
  CONFS[path] = data;
  return data;
}

async function fetchValue(path, key) {
  if (CONFS[path]?.[key]) return CONFS[path][key];

  const data = await fetchConf(path);
  if (!data) return null;

  const confKey = data.find((conf) => conf.key === key);
  if (!confKey) return null;
  return confKey.value;
}

function constructConfigPaths(owner, repo) {
  return [`/${owner}/${repo}/`, `/${owner}/`];
}

// Note: this is called externally to determine if the button should be visible.
export async function getConfKey(owner, repo, key) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    const value = await fetchValue(path, key);
    if (value) {
      return value;
    }
  }
  return null;
}

async function getResponsiveImageConfig(owner, repo) {
  if (!(repo || owner)) return null;
  for (const path of constructConfigPaths(owner, repo)) {
    if (!fullConfJsons[path]) await fetchConf(path);
    const fullConfigJson = fullConfJsons[path];
    const responsiveImages = fullConfigJson?.['responsive-images'];
    if (responsiveImages) {
      return responsiveImages.data.map((config) => ({
        ...config,
        crops: config.crops.split(/\s*,\s*/),
      }));
    }
  }
  return false;
}

function findBlockContext() {
  const { $from } = window.view.state.selection;
  for (let { depth } = $from; depth > 0; depth -= 1) {
    const node = $from.node(depth);
    if (node.type === window.view.state.schema.nodes.table) {
      return node;
    }
  }
  return [];
}

function formatExternalBrief(document) {
  // Find the first H1 title and get the full text of the document
  let title = '';
  document.descendants((node) => {
    if (node.type.name === 'heading' && node.attrs.level === 1 && !title) {
      title = node.textContent;
    }
    return !title;
  });

  const contentPlainText = document.textContent;
  if (!contentPlainText) return '';

  // return the external brief prompt with the title and content
  return `The user is looking for assets that match a web page with the following content:

  ${title ? `Title: ${title}` : ''}

  ${contentPlainText}

  Please suggest Assets that are visually appealing and relevant to the subject.`;
}

export async function openAssets() {
  const details = await loadIms();
  if (details.anonymous) handleSignIn();
  if (!(details.accessToken)) return;

  const { owner, repo } = getPathDetails();
  const repoId = await getConfKey(owner, repo, 'aem.repositoryId');
  const isAuthorRepo = repoId?.startsWith('author');

  // Custom publicly available asset origin
  let prodOrigin = await getConfKey(owner, repo, 'aem.assets.prod.origin');

  const smartCropSelectEnabled = (await getConfKey(owner, repo, 'aem.asset.smartcrop.select')) === 'on';
  const dmDeliveryEnabled = smartCropSelectEnabled || (await getConfKey(owner, repo, 'aem.asset.dm.delivery')) === 'on' || prodOrigin?.startsWith('delivery-');

  prodOrigin = prodOrigin || `${repoId.replace('author', dmDeliveryEnabled ? 'delivery' : 'publish')}`;

  const getBaseDmUrl = (asset) => `https://${prodOrigin}${prodOrigin.includes('/') ? '' : '/adobe/assets/'}${asset['repo:id']}`;

  const getAssetUrl = (asset, name = asset.name) => {
    if (!dmDeliveryEnabled) {
      return `https://${prodOrigin}${asset.path}`;
    }
    return `${getBaseDmUrl(asset)}/original/as/${name}`;
  };

  // Determine if images should be links
  const injectLink = (await getConfKey(owner, repo, 'aem.assets.image.type')) === 'link';

  let dialog = document.querySelector('.da-dialog-asset');
  if (dialog) {
    dialog.showModal();
  } else {
    await loadStyle(import.meta.url.replace('.js', '.css'));
    await loadScript(ASSET_SELECTOR_URL);

    dialog = document.createElement('dialog');
    dialog.className = 'da-dialog-asset';

    const assetSelectorWrapper = document.createElement('div');
    assetSelectorWrapper.className = 'da-dialog-asset-inner';
    dialog.append(assetSelectorWrapper);

    const cropSelectorWrapper = document.createElement('div');
    cropSelectorWrapper.style.display = 'none';
    cropSelectorWrapper.className = 'da-dialog-asset-inner';
    dialog.append(cropSelectorWrapper);

    const resetCropSelector = () => {
      cropSelectorWrapper.style.display = 'none';
      cropSelectorWrapper.innerHTML = '';
      assetSelectorWrapper.style.display = 'block';
    };

    const main = document.body.querySelector('main');
    main.insertAdjacentElement('afterend', dialog);

    dialog.showModal();

    const loadResponsiveImageConfig = getResponsiveImageConfig(owner, repo);

    const aemTierType = repoId.includes('delivery') ? 'delivery' : 'author';
    const featureSet = ['upload', 'collections', 'detail-panel', 'advisor'];
    if (dmDeliveryEnabled) {
      featureSet.push('dynamic-media');
    }
    const externalBrief = formatExternalBrief(window.view.state.doc);

    const selectorProps = {
      imsToken: details.accessToken.token,
      repositoryId: repoId,
      aemTierType,
      featureSet,
      externalBrief,
      onClose: () => assetSelectorWrapper.style.display !== 'none' && dialog.close(),
      handleSelection: async (assets) => {
        const [asset] = assets;
        if (!asset) return;
        const format = asset['aem:formatName'];
        if (!format) return;
        const mimetype = asset.mimetype || asset['dc:format'];
        const isImage = mimetype?.toLowerCase().startsWith('image/');
        // eslint-disable-next-line no-underscore-dangle
        const status = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dam:assetStatus'];
        // eslint-disable-next-line no-underscore-dangle
        const activationTarget = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dam:activationTarget'];
        const { view } = window;
        const { state } = view;

        // eslint-disable-next-line no-underscore-dangle
        const alt = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:description']
          // eslint-disable-next-line no-underscore-dangle
          || asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:title'];

        const createImage = (src) => {
          const imgObj = { src, style: 'width: 180px' };
          if (alt) imgObj.alt = alt;
          return state.schema.nodes.image.create(imgObj);
        };

        // Only show the error message if the asset is not approved for delivery
        // and the repository is an author repository
        if (dmDeliveryEnabled && isAuthorRepo && activationTarget !== 'delivery' && status !== 'approved') {
          assetSelectorWrapper.style.display = 'none';
          cropSelectorWrapper.style.display = 'block';
          cropSelectorWrapper.innerHTML = '<p class="da-dialog-asset-error">The selected asset is not available because it is not approved for delivery. Please check the status.</p><div class="da-dialog-asset-buttons"><button class="back">Back</button><button class="cancel">Cancel</button></div>';
          cropSelectorWrapper.querySelector('.cancel').addEventListener('click', () => {
            resetCropSelector();
            dialog.close();
          });
          cropSelectorWrapper.querySelector('.back').addEventListener('click', () => resetCropSelector());
        } else if (isImage && smartCropSelectEnabled) {
          assetSelectorWrapper.style.display = 'none';
          cropSelectorWrapper.style.display = 'block';

          const listSmartCropsResponse = await daFetch(`${getBaseDmUrl(asset)}/smartCrops`);
          const listSmartCrops = await listSmartCropsResponse.json();

          if (!(listSmartCrops.items?.length > 0)) {
            dialog.close();
            const fpo = createImage(getAssetUrl(asset));
            resetCropSelector();
            view.dispatch(state.tr.replaceSelectionWith(fpo).scrollIntoView());
          }

          const parentBlock = findBlockContext();
          const parentBlockName = (() => {
            if (!parentBlock || parentBlock.type !== state.schema.nodes.table) return null;

            const firstRow = parentBlock.firstChild;
            if (!firstRow) return null;

            const firstCell = firstRow.firstChild;
            if (!firstCell) return null;

            return firstCell.textContent?.toLowerCase().split('(')[0].trim().replaceAll(' ', '-');
          })();

          const stuctureSelection = await (async () => {
            const responsiveImageConfig = await loadResponsiveImageConfig;

            if (!responsiveImageConfig) return '';

            const configs = parentBlockName
              ? responsiveImageConfig.filter((config) => (config.position === 'everywhere' || config.position === parentBlockName) && config.crops.every((crop) => listSmartCrops.items.find((item) => item.name === crop)))
              : responsiveImageConfig.filter((config) => (config.position === 'everywhere' || config.position === 'outside-blocks') && config.crops.every((crop) => listSmartCrops.items.find((item) => item.name === crop)));

            if (configs.length === 0) return '';

            return `<h2>Insert Type</h2><ul class="da-dialog-asset-structure-select">
              <li><input checked type="radio" id="single" name="da-dialog-asset-structure-select" value="single"><label for="single">Single, Manual</label></li>
              <li>${configs.map((config, i) => `<input type="radio" id="da-dialog-asset-structure-select-${i}" name="da-dialog-asset-structure-select" value="${encodeURIComponent(JSON.stringify(config))}"><label for="da-dialog-asset-structure-select-${i}">${config.name}</label>`).join('</li><li>')}</li>
            </ul>`;
          })();

          cropSelectorWrapper.innerHTML = `<div class="da-dialog-asset-crops-toolbar"><button class="cancel">Cancel</button><button class="back">Back</button><button class="insert">Insert</button></div>${stuctureSelection}<h2>Smart Crops</h2>`;

          const cropSelectorList = document.createElement('ul');
          cropSelectorList.classList.add('da-dialog-asset-crops');
          cropSelectorWrapper.append(cropSelectorList);

          cropSelectorWrapper.querySelector('.cancel').addEventListener('click', () => {
            resetCropSelector();
            dialog.close();
          });
          cropSelectorWrapper.querySelector('.back').addEventListener('click', () => resetCropSelector());
          cropSelectorWrapper.querySelector('.insert').addEventListener('click', () => {
            dialog.close();

            const insertTypeSelection = cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
            const structureConfig = !insertTypeSelection || insertTypeSelection.value === 'single' ? null : JSON.parse(decodeURIComponent(insertTypeSelection.value));
            const singleSelectedCropElement = cropSelectorList.querySelector('.selected');
            const singleSelectedCropElementName = !structureConfig ? singleSelectedCropElement?.dataset.name : 'original';
            const fragment = Fragment.fromArray((structureConfig?.crops || [singleSelectedCropElementName]).map((crop) => createImage(cropSelectorList.querySelector(`[data-name="${crop}"] img`)?.src)));
            resetCropSelector();
            view.dispatch(state.tr.insert(state.selection.from, fragment)
              .deleteSelection().scrollIntoView());
          });

          cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select')?.addEventListener('change', (e) => {
            if (e.target.value === 'single') {
              cropSelectorList.querySelectorAll('li').forEach((crop) => crop.classList.remove('selected'));
              cropSelectorList.querySelector('li[data-name="original"]').classList.add('selected');
            } else {
              const structure = JSON.parse(decodeURIComponent(e.target.value));
              cropSelectorList.querySelectorAll('li').forEach((crop) => {
                if (structure.crops.includes(crop.dataset.name)) {
                  crop.classList.add('selected');
                } else {
                  crop.classList.remove('selected');
                }
              });
            }
          });

          const cropItems = listSmartCrops.items.map((smartCrop) => `<li data-name="${smartCrop.name}"><p>${smartCrop.name}</p><img src="${getAssetUrl(asset, `${smartCrop.name}-${asset.name}`)}?smartcrop=${smartCrop.name}">`).join('</li>');
          cropSelectorList.innerHTML = `<li class="selected" data-name="original"><p>Original</p><img src="${getAssetUrl(asset)}"></li>${cropItems}</li>`;
          cropSelectorList.addEventListener('click', () => {
            const structure = cropSelectorWrapper.querySelector('.da-dialog-asset-structure-select input:checked');
            if (structure && structure.value !== 'single') return;
            const li = cropSelectorList.querySelector('li:hover');
            if (!li) return;
            cropSelectorList.querySelector('.selected')?.classList.remove('selected');
            li.classList.add('selected');
          });
        } else {
          dialog.close();

          // eslint-disable-next-line no-underscore-dangle
          const renditionLinks = asset._links['http://ns.adobe.com/adobecloud/rel/rendition'];
          const videoLink = renditionLinks?.find((link) => link.href.endsWith('/play'))?.href;

          let src;
          if (aemTierType === 'author') {
            src = getAssetUrl(asset);
          } else if (mimetype.startsWith('video/')) {
            src = videoLink;
          } else {
            src = renditionLinks?.[0]?.href.split('?')[0];
          }

          let fpo;
          // ensure assets not supported by the MediaBus are added as links
          if (!isImage || injectLink) {
            const para = document.createElement('p');
            const link = document.createElement('a');
            link.href = src;
            link.innerText = src;
            para.append(link);
            fpo = proseDOMParser.fromSchema(window.view.state.schema).parse(para);
          } else {
            fpo = createImage(src);
          }

          view.dispatch(state.tr.replaceSelectionWith(fpo).scrollIntoView());
        }
      },
    };

    window.PureJSSelectors.renderAssetSelector(assetSelectorWrapper, selectorProps);
  }
}
