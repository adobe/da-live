import { getNx } from '../../../scripts/utils.js';
import getPathDetails from '../../shared/pathDetails.js';
import { DA_ORIGIN } from '../../shared/constants.js';
import { daFetch } from '../../shared/utils.js';

const { loadStyle } = await import(`${getNx()}/scripts/nexter.js`);
const { loadIms, handleSignIn } = await import(`${getNx()}/utils/ims.js`);
const loadScript = (await import(`${getNx()}/utils/script.js`)).default;

const ASSET_SELECTOR_URL = 'https://experience.adobe.com/solutions/CQ-assets-selectors/assets/resources/assets-selectors.js';

export async function getRepoId() {
  const details = getPathDetails();
  if (!details) return null;
  const { repo, owner } = details;
  if (!(repo || owner)) return null;
  const resp = await daFetch(`${DA_ORIGIN}/config/${owner}/${repo}`);
  if (!resp.ok) return null;
  let json = await resp.json();

  if (json[':type'] === 'multi-sheet') {
    // If config is a multi-sheet, the data is one level deeper
    json = json.data;
  }

  const repoConf = json.data.find((conf) => conf.key === 'aem.repositoryId');
  if (!repoConf) return null;
  return repoConf.value;
}

export async function openAssets() {
  const repoId = await getRepoId();
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
        console.log(asset._embedded['http://ns.adobe.com/adobecloud/rel/metadata/asset']['dc:description']);

        const imgObj = { src: `https://${pubRepoId}${path}`, style: 'width: 180px' };
        const fpo = state.schema.nodes.image.create(imgObj);
        view.dispatch(state.tr.insert(state.selection.head, fpo).scrollIntoView());
      },
    };
    window.PureJSSelectors.renderAssetSelector(inner, selectorProps);
  }

  dialog.showModal();
}
