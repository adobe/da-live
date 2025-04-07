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

  // Determine publicly available asset origin
  const prodOrigin = await getConfKey(owner, repo, 'aem.assets.prod.origin') || `${repoId.replace('author', 'publish')}`;

  // Determine if images should be links
  const injectLink = (await getConfKey(owner, repo, 'aem.assets.image.type')) === 'link';
  //determine if the links are dms7 links
  const injectDms7Link = (await getConfKey(owner, repo, 'aem.assets.image.type')) === 'dms7link';
  let dialog = document.querySelector('.da-dialog-asset');
  if (!dialog) {
    await loadStyle(import.meta.url.replace('.js', '.css'));
    await loadScript(ASSET_SELECTOR_URL);

    dialog = document.createElement('dialog');
    dialog.className = 'da-dialog-asset';

    const inner = document.createElement('div');
    inner.className = 'da-dialog-asset-inner';

    dialog.append(inner);

    const main = document.body.querySelector('main');
    main.insertAdjacentElement('afterend', dialog);

    const aemTierType = repoId.includes('delivery') ? 'delivery' : 'author';

    const selectorProps = {
      imsToken: details.accessToken.token,
      repositoryId: repoId,
      aemTierType,
      onClose: () => { dialog.close(); },
      handleSelection: (assets) => {
        const [asset] = assets;
        if (!asset) return;
        const format = asset['aem:formatName'];
        if (!format) return;
        const { path } = asset;
        const { view } = window;
        const { state } = view;
        dialog.close();

        // eslint-disable-next-line no-underscore-dangle
        const alt = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:description'];

        const src = aemTierType === 'author'
          ? `${prodOrigin}${path}`
          // eslint-disable-next-line no-underscore-dangle
          : asset._links['http://ns.adobe.com/adobecloud/rel/rendition'][0].href.split('?')[0];

        const imgObj = { src, style: 'width: 180px' };
        if (alt) imgObj.alt = alt;

        let fpo;
        if (injectLink) {
          const para = document.createElement('p');
          const link = document.createElement('a');
          link.href = src;
          link.innerText = src;
          para.append(link);
          fpo = proseDOMParser.fromSchema(window.view.state.schema).parse(para);
        } else {
          fpo = state.schema.nodes.image.create(imgObj);
        }

        if (injectDms7Link) {
          console.log('injectDms7Link', asset);
          const para = document.createElement('p');
          const link = document.createElement('a');
          link.href = asset['repo:dmScene7Url'] || src;
          link.innerText = src;
          para.append(link);
          fpo = proseDOMParser.fromSchema(window.view.state.schema).parse(para);
        } else {
          fpo = state.schema.nodes.image.create(imgObj);
        }
      },
    };
    window.PureJSSelectors.renderAssetSelector(inner, selectorProps);
  }

  dialog.showModal();
}
