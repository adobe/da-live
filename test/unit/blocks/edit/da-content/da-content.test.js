import { expect } from '@esm-bundle/chai';

// This is needed to make a dynamic import work that is indirectly referenced
// from da-editor.js
const { setNx } = await import('../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: DaContent } = await import('../../../../../blocks/edit/da-content/da-content.js');

describe('da-content', () => {
  it('Test wsprovider disconnectedcallback', async () => {
    const ed = new DaContent();

    const called = [];
    const mockWSProvider = { disconnect: () => called.push('disconnect') };

    ed.wsProvider = mockWSProvider;
    ed.disconnectWebsocket();
    expect(ed.wsProvider).to.be.undefined;
    expect(called).to.deep.equal(['disconnect']);
  });

  it('disconnectWebsocket is a no-op when there is no wsProvider', () => {
    const ed = new DaContent();
    ed.wsProvider = undefined;
    expect(() => ed.disconnectWebsocket()).not.to.throw();
  });

  it('togglePane sets _showPane', () => {
    const ed = new DaContent();
    ed.togglePane({ detail: 'preview' });
    expect(ed._showPane).to.equal('preview');
    ed.togglePane({ detail: 'versions' });
    expect(ed._showPane).to.equal('versions');
  });

  it('handleVersionReset clears _version', () => {
    const ed = new DaContent();
    ed._version = { org: 'o', site: 's', path: '/p', versionId: 'v' };
    ed.handleVersionReset();
    expect(ed._version).to.equal(null);
  });

  it('handleVersionPreview sets _version from detail', () => {
    const ed = new DaContent();
    const version = { org: 'o', site: 's', path: '/p', versionId: 'v' };
    ed.handleVersionPreview({ detail: { version } });
    expect(ed._version).to.deep.equal(version);
  });

  it('loadViews short-circuits after the first call', async () => {
    const ed = new DaContent();
    ed._editorLoaded = true;
    await ed.loadViews(); // should resolve without re-importing modules
    expect(ed._editorLoaded).to.be.true;
  });

  it('handleEditorLoaded triggers loadViews and loadUe', async () => {
    const ed = new DaContent();
    let viewsCalled = false;
    let ueCalled = false;
    ed.loadViews = async () => { viewsCalled = true; };
    ed.loadUe = async () => { ueCalled = true; };
    await ed.handleEditorLoaded();
    expect(viewsCalled).to.be.true;
    expect(ueCalled).to.be.true;
  });
});
