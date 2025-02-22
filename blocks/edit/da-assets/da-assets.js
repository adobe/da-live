import { getNx } from '../../../scripts/utils.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

let repoId;

async function fetchValue(path) {
  if (repoId) return repoId;
  const resp = await daFetch(`${DA_ORIGIN}/config${path}`);
  if (!resp.ok) return null;

  const json = await resp.json();
  const { data } = json[':type'] === 'multi-sheet' ? Object.keys(json)[0] : json;
  if (!data) return null;

  const repoConf = data.find((conf) => conf.key === 'aem.repositoryId');
  if (!repoConf) return null;
  repoId = repoConf.value;
  return repoId;
}

export async function getRepoId(owner, repo) {
  if (!(repo || owner)) return null;
  let value = await fetchValue(`/${owner}/${repo}/`);
  if (!value) value = await fetchValue(`/${owner}/`);
  return value;
}

export async function openAssets() {
  const details = await loadIms();
  if (details.anonymous) handleSignIn();
  if (!(repoId && details.accessToken)) return;

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

    const selectorProps = {
      imsToken: details.accessToken.token,
      repositoryId: repoId,
      aemTierType: 'author',
      onClose: () => { dialog.close(); },
      handleSelection: (assets) => {
        const [asset] = assets;
        if (!asset) return;
        const format = asset['aem:formatName'];
        if (!format) return;
        const { path } = asset;
        const pubRepoId = repoId.replace('author', 'publish');
        const { view } = window;
        const { state } = view;
        dialog.close();

        // eslint-disable-next-line no-underscore-dangle
        const alt = asset?._embedded?.['http://ns.adobe.com/adobecloud/rel/metadata/asset']?.['dc:description'];

        const imgObj = { src: `https://${pubRepoId}${path}`, style: 'width: 180px' };
        if (alt) imgObj.alt = alt;

        const fpo = state.schema.nodes.image.create(imgObj);

        view.dispatch(state.tr.replaceSelectionWith(fpo).scrollIntoView());
      },
    };
    window.PureJSSelectors.renderAssetSelector(inner, selectorProps);
  }

  dialog.showModal();
}
