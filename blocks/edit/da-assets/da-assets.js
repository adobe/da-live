import { DOMParser as proseDOMParser } from 'da-y-wrapper';
import { getNx } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch, getFirstSheet } from '../../shared/utils.js';
import getPathDetails from '../../shared/pathDetails.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

const CONFS = {};

async function fetchConf(path) {
  if (CONFS[path]) return CONFS[path];
  const resp = await daFetch(`${DA_ORIGIN}/config${path}`);
  if (!resp.ok) return null;

  const json = await resp.json();
  const data = getFirstSheet(json);
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

// Note: this is called externally to determine if the button should be visible.
export async function getConfKey(owner, repo, key) {
  if (!(repo || owner)) return null;
  let value = await fetchValue(`/${owner}/${repo}/`, key);
  if (!value) value = await fetchValue(`/${owner}/`, key);
  return value;
}

export async function openAssets() {
  const details = await loadIms();
  if (details.anonymous) handleSignIn();
  if (!(details.accessToken)) return;

  const { owner, repo } = getPathDetails();
  const repoId = await getConfKey(owner, repo, 'aem.repositoryId');

  // Custom publicly available asset origin
  let prodOrigin = await getConfKey(owner, repo, 'aem.assets.prod.origin');

  const smartCropSelectEnabled = (await getConfKey(owner, repo, 'aem.asset.smartcrop.select')) === 'on';
  const dmDeliveryEnabled = smartCropSelectEnabled || (await getConfKey(owner, repo, 'aem.asset.dm.delivery')) === 'on' || prodOrigin?.startsWith('delivery-');

  prodOrigin = prodOrigin || `${repoId.replace('author', dmDeliveryEnabled ? 'delivery' : 'publish')}`;

  const getBaseDmUrl = (asset) => `https://${prodOrigin}/adobe/assets/${asset['repo:id']}`;

  const getAssetUrl = (asset, name = asset.name) => {
    if (!dmDeliveryEnabled) {
      return `https://${prodOrigin}${asset.path}`;
    }
    return `${getBaseDmUrl(asset)}/as/${name}`;
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

    const aemTierType = repoId.includes('delivery') ? 'delivery' : 'author';

    let cropSelectionShown = false;
    const selectorProps = {
      imsToken: details.accessToken.token,
      repositoryId: repoId,
      aemTierType,
      onClose: () => !cropSelectionShown && dialog.close(),
      handleSelection: async (assets) => {
        const [asset] = assets;
        if (!asset) return;
        const format = asset['aem:formatName'];
        if (!format) return;
        const mimetype = asset.mimetype || asset['dc:format'];
        const isImage = mimetype?.toLowerCase().startsWith('image/');
        const { view } = window;
        const { state } = view;

        // eslint-disable-next-line no-underscore-dangle
        const alt = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/embedded']?.['dc:description']
          // eslint-disable-next-line no-underscore-dangle
          || asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/embedded']?.['dc:title'];

        const createImage = (src) => {
          const imgObj = { src, style: 'width: 180px' };
          if (alt) imgObj.alt = alt;
          return state.schema.nodes.image.create(imgObj);
        };

        if (isImage && smartCropSelectEnabled) {
          cropSelectionShown = true;
          try {
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

            cropSelectorWrapper.innerHTML = '<div class="da-dialog-asset-crops-toolbar"><button class="cancel">Cancel</button><button class="back">Back</button><button class="insert">Insert</button></div>';

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
              const fpo = createImage(cropSelectorList.querySelector('.selected img').src);
              resetCropSelector();
              view.dispatch(state.tr.replaceSelectionWith(fpo).scrollIntoView());
            });

            const cropItems = listSmartCrops.items.map((smartCrop) => `<p>${smartCrop.name}</p><img src="${getAssetUrl(asset, `${smartCrop.name}-${asset.name}`)}?smartcrop=${smartCrop.name}">`).join('</li><li>');
            cropSelectorList.innerHTML = `<li class="selected"><p>Original</p><img src="${getAssetUrl(asset)}"></li><li>${cropItems}</li>`;
            cropSelectorList.addEventListener('click', () => {
              const li = cropSelectorList.querySelector('li:hover');
              if (!li) return;
              cropSelectorList.querySelector('.selected')?.classList.remove('selected');
              li.classList.add('selected');
            });
          } finally {
            cropSelectionShown = false;
          }
        } else {
          dialog.close();

          // eslint-disable-next-line no-underscore-dangle
          const renditionLinks = asset._links['http://ns.adobe.com/adobecloud/rel/rendition'];
          const videoLink = renditionLinks.find((link) => link.href.endsWith('/play'))?.href;

          let src;
          if (aemTierType === 'author') {
            src = getAssetUrl(asset);
          } else if (mimetype.startsWith('video/')) {
            src = videoLink;
          } else {
            src = renditionLinks[0]?.href.split('?')[0];
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
