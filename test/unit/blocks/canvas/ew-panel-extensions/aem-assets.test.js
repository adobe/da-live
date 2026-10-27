import { expect } from '@esm-bundle/chai';

const { setNx, getNx, getNx2 } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { setImsResult, handleSignInCalls } = await import(`${getNx()}/utils/ims.js`);
const { setRepositoryConfig } = await import(`${getNx2()}/utils/aem-assets/repository-config.js`);
const { selectorLoadCalls, setSelectorLoadResult } = await import(`${getNx2()}/utils/aem-assets/selector.js`);

const { renderAssets } = await import('../../../../../blocks/canvas/ew-panel-extensions/aem-assets.js');
const { renderAssetsRail } = await import('../../../../../blocks/canvas/ew-canvas-assets/ew-canvas-assets.js');

const REPO_CONFIG = {
  repositoryId: 'author-p1-e1.adobeaemcloud.com',
  tierType: 'author',
};

describe('aem-assets dialog shares the selector loader with the rail', () => {
  let renderCalls;
  let orgRenderAssetSelector;

  beforeEach(() => {
    setImsResult({ accessToken: { token: 'test-token' } });
    setRepositoryConfig(REPO_CONFIG);
    setSelectorLoadResult(undefined);
    selectorLoadCalls.length = 0;
    handleSignInCalls.length = 0;

    renderCalls = [];
    orgRenderAssetSelector = window.PureJSSelectors?.renderAssetSelector;
    window.PureJSSelectors = {
      ...window.PureJSSelectors,
      renderAssetSelector: (el, props) => renderCalls.push({ el, props }),
    };
  });

  afterEach(() => {
    setImsResult(undefined);
    setRepositoryConfig(null);
    setSelectorLoadResult(undefined);
    selectorLoadCalls.length = 0;
    handleSignInCalls.length = 0;
    window.PureJSSelectors.renderAssetSelector = orgRenderAssetSelector;
  });

  it('uses the shared selector loader for the dialog too', async () => {
    const scriptCountBefore = document.head.querySelectorAll('script').length;

    const container = document.createElement('div');
    await renderAssets({ container, org: 'org', site: 'site' });
    await renderAssetsRail({ container: document.createElement('div'), org: 'org', site: 'site' });

    expect(selectorLoadCalls.length).to.equal(2);
    expect(renderCalls.length).to.equal(2);
    expect(document.head.querySelectorAll('script').length).to.equal(scriptCountBefore);
  });
});
