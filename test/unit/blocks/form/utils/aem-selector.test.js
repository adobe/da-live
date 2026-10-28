import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { getNx2 } from '../../../../../scripts/utils.js';
import { selectAemAsset } from '../../../../../blocks/form/utils/aem-selector.js';

// The import-maps plugin adds a query to the URLs it can rewrite, which would load a second
// fixture instance. Building the URL from getNx2() shares the instance aem-selector.js loads.
const nx2 = getNx2();
const [
  { setMockIms, resetMockIms },
  { DM_ERROR_MSG, selectionCalls, setSelection },
] = await Promise.all([
  import(`${nx2}/utils/ims.js`),
  import(`${nx2}/utils/aem-assets/selection.js`),
]);

// nx2's resolveAssetSelection and buildAssetSelectorProps are stubbed, so these tests cover how
// the form uses them. Their own rules are tested in da-nx.

const AEM_ERRORS = {
  signIn: 'Sign in to select a file from AEM Assets.',
  unavailable: 'The AEM Assets selector could not be loaded.',
  notImage: 'Only images can be selected here.',
};

const REPO_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
  assetOrigin: 'publish-p1-e1.adobeaemcloud.com',
};

const IMAGE_ASSET = { name: 'photo.jpg', path: '/content/dam/photo.jpg' };
const PDF_ASSET = { name: 'datasheet.pdf', 'repo:name': 'datasheet.pdf', path: '/content/dam/datasheet.pdf' };

const IMAGE_SELECTION = {
  href: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/photo.jpg',
  alt: 'A runner at dawn',
  isImage: true,
};
const PDF_SELECTION = {
  href: 'https://publish-p1-e1.adobeaemcloud.com/content/dam/datasheet.pdf',
  isImage: false,
};

function stubSelector() {
  const calls = [];
  const selectors = { renderAssetSelector: (panel, props) => calls.push({ panel, props }) };
  return { calls, loadSelector: async () => ({ selectors }) };
}

function start({ repoConfig = REPO_CONFIG, imagesOnly, loadSelector } = {}) {
  const selector = stubSelector();
  const pick = selectAemAsset({
    repoConfig,
    imagesOnly,
    loadSelector: loadSelector ?? selector.loadSelector,
  });
  return { pick, calls: selector.calls };
}

const waitForRender = async (calls) => {
  while (!calls.length) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => { setTimeout(resolve); });
  }
  return calls[0];
};

const openDialog = () => document.querySelector('.nx-form-aem-dialog');

async function expectError(pick, message) {
  expect(await pick).to.deep.equal({ error: message });
}

describe('selectAemAsset', () => {
  beforeEach(() => {
    setSelection(IMAGE_SELECTION);
    selectionCalls.length = 0;
  });

  afterEach(() => {
    document.querySelectorAll('.nx-form-aem-dialog').forEach((dialog) => dialog.remove());
    resetMockIms();
  });

  it('renders the hosted selector in a dialog with the IMS token and repository', async () => {
    const { pick, calls } = start();
    const { panel, props } = await waitForRender(calls);

    expect(openDialog().localName).to.equal('nx-dialog');
    expect(openDialog().title).to.equal('AEM Assets');
    expect(openDialog().contains(panel)).to.equal(true);
    expect(props.imsToken).to.equal('test-token');
    expect(props.repoConfig).to.equal(REPO_CONFIG);

    props.onClose();
    await pick;
  });

  it('returns the resolved URL and alt text with the asset name and removes the dialog', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([IMAGE_ASSET]);

    expect(await pick).to.deep.equal({
      href: IMAGE_SELECTION.href,
      name: 'photo.jpg',
      alt: 'A runner at dawn',
    });
    expect(selectionCalls).to.deep.equal([{ asset: IMAGE_ASSET, repoConfig: REPO_CONFIG }]);
    expect(openDialog()).to.equal(null);
  });

  it('prefers the repository name of the asset', async () => {
    setSelection(PDF_SELECTION);
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ ...PDF_ASSET, name: 'other.pdf' }]);

    expect((await pick).name).to.equal('datasheet.pdf');
  });

  it('returns the error of an asset that cannot be used', async () => {
    setSelection({ error: DM_ERROR_MSG });
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([IMAGE_ASSET]);

    await expectError(pick, DM_ERROR_MSG);
    expect(openDialog()).to.equal(null);
  });

  it('cancels when the selector closes', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.onClose();

    expect(await pick).to.deep.equal({ cancelled: true });
    expect(openDialog()).to.equal(null);
  });

  it('cancels when the dialog is dismissed', async () => {
    const { pick, calls } = start();
    await waitForRender(calls);

    openDialog().dispatchEvent(new Event('close'));

    expect(await pick).to.deep.equal({ cancelled: true });
    expect(openDialog()).to.equal(null);
  });

  it('cancels an empty selection', async () => {
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([]);

    expect(await pick).to.deep.equal({ cancelled: true });
  });

  it('fails without opening a dialog when the selector cannot load', async () => {
    const { pick } = start({ loadSelector: async () => ({ error: AEM_ERRORS.unavailable }) });

    await expectError(pick, AEM_ERRORS.unavailable);
    expect(openDialog()).to.equal(null);
  });

  it('fails when the loaded script does not provide a selector', async () => {
    const { pick } = start({ loadSelector: async () => ({ selectors: {} }) });

    await expectError(pick, AEM_ERRORS.unavailable);
    expect(openDialog()).to.equal(null);
  });

  it('asks the user to sign in without loading the selector when there is no IMS token', async () => {
    setMockIms({ anonymous: true });
    let loads = 0;
    const loadSelector = async () => {
      loads += 1;
      return { selectors: {} };
    };
    const { pick } = start({ loadSelector });

    await expectError(pick, AEM_ERRORS.signIn);
    expect(loads).to.equal(0);
    expect(openDialog()).to.equal(null);
  });

  it('offers all file types by default and returns a selected PDF', async () => {
    setSelection(PDF_SELECTION);
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    expect(props.filterSchema).to.equal(undefined);
    props.handleSelection([PDF_ASSET]);

    const result = await pick;
    expect(result.name).to.equal('datasheet.pdf');
    expect(result.href).to.equal(PDF_SELECTION.href);
    expect(result).to.not.have.property('type');
  });

  it('passes the images-only filter when asked for images only', async () => {
    const { calls } = start({ imagesOnly: true });
    const { props } = await waitForRender(calls);

    expect(props.filterSchema.map(({ groupKey }) => groupKey)).to.deep.equal(['FileTypeGroup']);
  });

  it('refuses a file that is not an image when asked for images only', async () => {
    setSelection(PDF_SELECTION);
    const { pick, calls } = start({ imagesOnly: true });
    const { props } = await waitForRender(calls);

    props.handleSelection([PDF_ASSET]);

    await expectError(pick, AEM_ERRORS.notImage);
  });

  it('percent-encodes spaces in the asset URL and keeps encoded characters', async () => {
    const origin = 'https://publish-p1-e1.adobeaemcloud.com/content/dam';
    setSelection({ href: `${origin}/biker video%231.mp4`, isImage: false });
    const { pick, calls } = start();
    const { props } = await waitForRender(calls);

    props.handleSelection([{ name: 'biker video#1.mp4', path: '/content/dam/biker video#1.mp4' }]);

    const result = await pick;
    expect(result.href).to.equal(`${origin}/biker%20video%231.mp4`);
    expect(result.name).to.equal('biker video#1.mp4');
  });
});
