/* eslint-disable no-underscore-dangle */
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
    ed.togglePane({ detail: 'comments' });
    expect(ed._showPane).to.equal('comments');
  });

  it('handleVersionReset clears _versionUrl', () => {
    const ed = new DaContent();
    ed._versionUrl = 'https://x';
    ed.handleVersionReset();
    expect(ed._versionUrl).to.equal(null);
  });

  it('handleVersionPreview sets _versionUrl from detail', () => {
    const ed = new DaContent();
    ed.handleVersionPreview({ detail: { url: 'https://prev' } });
    expect(ed._versionUrl).to.equal('https://prev');
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

  it('renders comment badge from controller.counts.active', () => {
    const ed = new DaContent();
    ed.commentsController = {
      counts: { active: 3, resolved: 0 },
      hasSelection: false,
    };
    const result = ed.renderCommentBadge();
    expect(result?.strings?.raw?.[0] || '').to.include('da-comment-badge');
    expect(result?.values?.[0]).to.equal(3);
  });

  it('handleToggleComments calls controller.requestCompose', () => {
    const ed = new DaContent();
    const calls = [];
    ed.commentsController = {
      requestCompose() { calls.push('requestCompose'); },
      hasSelection: false,
      counts: { active: 0, resolved: 0 },
    };
    ed.handleToggleComments();
    expect(calls).to.deep.equal(['requestCompose']);
    expect(ed._showPane).to.equal('comments');
  });
});
