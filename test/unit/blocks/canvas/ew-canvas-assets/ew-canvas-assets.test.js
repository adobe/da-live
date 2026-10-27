import { expect } from '@esm-bundle/chai';

const { setNx, getNx, getNx2 } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setImsResult, handleSignInCalls } = await import(`${getNx()}/utils/ims.js`);
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);
const { selectorLoadCalls, setSelectorLoadResult } = await import(`${getNx2()}/utils/aem-assets/selector.js`);

const {
  renderAssetsRail,
  NOT_CONFIGURED_ERROR,
  SIGN_IN_ERROR,
} = await import('../../../../../blocks/canvas/ew-canvas-assets/ew-canvas-assets.js');

const REPO_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
};

function setup() {
  setImsResult({ accessToken: { token: 'test-token' } });
  setRepositoryConfig(REPO_CONFIG);
  setSelectorLoadResult(undefined);
  selectorLoadCalls.length = 0;
  handleSignInCalls.length = 0;
}

function teardown() {
  setImsResult(undefined);
  setRepositoryConfig(null);
  setSelectorLoadResult(undefined);
  selectorLoadCalls.length = 0;
  handleSignInCalls.length = 0;
}

describe('renderAssetsRail', () => {
  let renderCalls;
  let orgRenderAssetSelector;

  beforeEach(() => {
    setup();
    renderCalls = [];
    orgRenderAssetSelector = window.PureJSSelectors?.renderAssetSelector;
    window.PureJSSelectors = {
      ...window.PureJSSelectors,
      renderAssetSelector: (el, props) => renderCalls.push({ el, props }),
    };
  });

  afterEach(() => {
    teardown();
    window.PureJSSelectors.renderAssetSelector = orgRenderAssetSelector;
  });

  it('renders the selector in rail mode', async () => {
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({});
    expect(renderCalls).to.have.length(1);
    const [{ el, props }] = renderCalls;
    expect(el).to.equal(container);
    expect(props.rail).to.equal(true);
    expect(props.imsToken).to.equal('test-token');
    expect(props).to.not.have.property('handleSelection');
  });

  it('returns an error when the site has no repository', async () => {
    setRepositoryConfig(null);
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: NOT_CONFIGURED_ERROR });
    expect(renderCalls).to.have.length(0);
  });

  it('returns the loader error when the selector script fails', async () => {
    const loaderError = 'The AEM Assets selector could not be loaded.';
    setSelectorLoadResult({ error: loaderError });
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: loaderError });
    expect(renderCalls).to.have.length(0);
  });

  it('signs in and returns an error when the user is anonymous', async () => {
    setImsResult({ anonymous: true });
    const container = document.createElement('div');
    const result = await renderAssetsRail({ container, org: 'org', site: 'site' });

    expect(result).to.deep.equal({ error: SIGN_IN_ERROR });
    expect(handleSignInCalls).to.have.length(1);
    expect(renderCalls).to.have.length(0);
  });
});

describe('ew-canvas-assets element', () => {
  let renderCalls;
  let orgRenderAssetSelector;
  let inst;

  beforeEach(() => {
    setup();
    renderCalls = [];
    orgRenderAssetSelector = window.PureJSSelectors?.renderAssetSelector;
    window.PureJSSelectors = {
      ...window.PureJSSelectors,
      renderAssetSelector: (el, props) => renderCalls.push({ el, props }),
    };
  });

  afterEach(() => {
    teardown();
    window.PureJSSelectors.renderAssetSelector = orgRenderAssetSelector;
    inst?.remove();
  });

  async function createInstance(props = {}) {
    const el = document.createElement('ew-canvas-assets');
    Object.assign(el, props);
    document.body.append(el);
    await el.updateComplete;
    // Let the async renderAssetsRail() call inside firstUpdated settle.
    await new Promise((r) => { setTimeout(r, 0); });
    await el.updateComplete;
    return el;
  }

  it('renders the selector once across hide/show', async () => {
    inst = await createInstance({ org: 'org', site: 'site' });
    expect(renderCalls).to.have.length(1);

    inst.hidden = true;
    await inst.updateComplete;
    inst.hidden = false;
    await inst.updateComplete;
    expect(renderCalls).to.have.length(1);

    const { parentNode } = inst;
    inst.remove();
    parentNode.append(inst);
    await inst.updateComplete;
    expect(renderCalls).to.have.length(1);
  });

  it('shows the error message', async () => {
    setRepositoryConfig(null);
    inst = await createInstance({ org: 'org', site: 'site' });
    const errorEl = inst.shadowRoot.querySelector('.assets-rail-error');
    expect(errorEl.textContent).to.equal(NOT_CONFIGURED_ERROR);
  });
});
