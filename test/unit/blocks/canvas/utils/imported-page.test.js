import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { routeDeps } = await import('../../../../../blocks/edit/imported-page/imported-page.js');
const { mountCanvasInspection, unmountCanvasInspection } = await import('../../../../../blocks/canvas/utils/imported-page.js');
const CAPS = {
  apiVersion: 1,
  transport: 'helix6',
  contentProfile: 'aem-import',
  readOnly: true,
  openKinds: ['page', 'sheet', 'image'],
  collaboration: false,
  branching: false,
  generation: 'g1',
};

describe('Canvas imported Page inspection without route navigation', () => {
  let href;
  let saved;
  let mountRoot;
  beforeEach(() => {
    href = window.location.href;
    saved = { ...routeDeps };
    window.history.replaceState(null, '', '/canvas?da-source=da-rs&theme=dark#/demo/wknd/a%20space_under');
    mountRoot = document.createElement('div');
    routeDeps.discover = async () => CAPS;
  });
  afterEach(() => {
    unmountCanvasInspection(mountRoot);
    mountRoot.remove();
    Object.assign(routeDeps, saved);
    window.history.replaceState(null, '', href);
  });

  it('renders the inspector repeatedly in place without reloading or creating an editor', async () => {
    const url = window.location.href;
    const paths = [];
    routeDeps.source = async () => ({
      get: async (path, extra, options) => {
        paths.push({ path, render: options.render });
        return new Response('<section class="aem-component"><header class="aem-component__header"><code>example/title</code></header><div class="aem-component__content"><h1>Imported</h1></div></section>', { headers: { 'content-type': 'text/html; charset=utf-8', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } });
      },
    });
    for (let i = 0; i < 2; i += 1) {
      // eslint-disable-next-line no-await-in-loop
      expect(await mountCanvasInspection({ mountRoot, isCurrent: () => true })).to.equal(true);
      expect(window.location.href).to.equal(url);
      expect(mountRoot.querySelector('iframe').getAttribute('sandbox')).to.equal('allow-top-navigation-by-user-activation');
      expect(mountRoot.querySelector('iframe').getAttribute('title')).to.equal('Author page layout');
      expect(mountRoot.querySelector('button').getAttribute('aria-pressed')).to.equal('true');
      expect(mountRoot.querySelector('da-title').readOnly).to.equal(true);
      expect(mountRoot.querySelector('ew-editor-doc,ew-editor-wysiwyg,da-content')).to.equal(null);
      unmountCanvasInspection(mountRoot);
      expect(mountRoot.querySelector('iframe')).to.equal(null);
    }
    expect(paths).to.deep.equal([
      { path: '/demo/wknd/a space_under.html', render: 'author' },
      { path: '/demo/wknd/a space_under.html', render: 'author' },
    ]);
  });

  it('does not mount native, branch, non-Page or stale routes', async () => {
    routeDeps.source = async () => { throw new Error('Source must not be initialized'); };
    expect(await mountCanvasInspection({ mountRoot, isCurrent: () => false })).to.equal(false);
    routeDeps.discover = async () => ({ ...CAPS, contentProfile: 'native-da' });
    expect(await mountCanvasInspection({ mountRoot, isCurrent: () => true })).to.equal(false);
    routeDeps.discover = async () => CAPS;
    for (const hash of ['#/demo/wknd~draft/a', '#/demo/wknd/a.json', '#/demo/wknd']) {
      window.history.replaceState(null, '', `/canvas?da-source=da-rs${hash}`);
      // eslint-disable-next-line no-await-in-loop
      expect(await mountCanvasInspection({ mountRoot, isCurrent: () => true })).to.equal(false);
    }
  });

  it('fills the available Canvas flex width on desktop and narrow layouts', async () => {
    const canvasStyles = document.createElement('style');
    canvasStyles.textContent = await (await fetch('/blocks/canvas/canvas.css')).text();
    document.head.append(canvasStyles);
    mountRoot.className = 'nx-canvas-editor-mount';
    document.body.append(mountRoot);
    routeDeps.source = async () => ({ get: async () => new Response('<section class="aem-component"><header class="aem-component__header"><code>example/title</code></header></section>', { headers: { 'content-type': 'text/html; charset=utf-8', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } }) });
    try {
      expect(await mountCanvasInspection({ mountRoot, isCurrent: () => true })).to.equal(true);
      const inspector = mountRoot.querySelector('.da-imported-page');
      const frame = inspector.querySelector('iframe');
      for (const width of [1000, 320]) {
        mountRoot.style.width = `${width}px`;
        expect(inspector.getBoundingClientRect().width).to.be.closeTo(width, 1);
        expect(frame.getBoundingClientRect().width).to.be.closeTo(width - 48, 1);
        expect(frame.getBoundingClientRect().right)
          .to.be.at.most(mountRoot.getBoundingClientRect().right);
      }
    } finally {
      canvasStyles.remove();
    }
  });
});
