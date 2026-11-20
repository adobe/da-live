import { expect } from '@esm-bundle/chai';
import { setNx, getNx2Api } from '../../../../../scripts/utils.js';
import { getExtensionsBridge } from '../../../../../blocks/canvas/editor-utils/extensions-bridge.js';
import { trackingPluginKey } from '../../../../../blocks/canvas/editor-utils/prose-diff.js';
import { canvasBus } from '../../../../../blocks/canvas/utils/canvas-bus.js';
import createCanvasVersionsEditor from '../../../../../blocks/canvas/editor-utils/versions-editor.js';
import { makeView } from '../test-helpers.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const PATH = '/org/site/doc.html';
const ENTRY = { url: '/versionsource/org/site/v1.html', timestamp: 1 };
const paragraphDoc = (text) => ({
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
});

describe('createCanvasVersionsEditor', () => {
  let versions;
  let savedGet;
  let editor;

  before(async () => {
    ({ versions } = await getNx2Api());
  });

  beforeEach(() => {
    savedGet = versions.get;
    versions.get = async () => new Response('<body><main><div><p>Saved content</p></div></main></body>');
    editor = createCanvasVersionsEditor();
  });

  afterEach(() => {
    versions.get = savedGet;
    getExtensionsBridge().view = null;
    document.querySelectorAll('.nx-canvas-editor-mount, aside.panel').forEach((el) => el.remove());
  });

  it('lets the author write only in an editable canvas document', () => {
    expect(editor.canWrite()).to.equal(false);
    getExtensionsBridge().view = { editable: false };
    expect(editor.canWrite()).to.equal(false);
    getExtensionsBridge().view = { editable: true };
    expect(editor.canWrite()).to.equal(true);
  });

  it('reports each document change until unsubscribed', () => {
    let calls = 0;
    const unsubscribe = editor.subscribe(() => { calls += 1; });
    canvasBus.editorHtmlState.emit('<body></body>');
    unsubscribe();
    canvasBus.editorHtmlState.emit('<body></body>');
    expect(calls).to.equal(1);
  });

  it('gives no current content without a canvas document', () => {
    expect(editor.getCurrentHtml()).to.equal(null);
  });

  it('loads a version in the shape of the canvas document', async () => {
    const body = await editor.fetchVersion(PATH, ENTRY);
    expect(body.textContent).to.include('Saved content');
  });

  it('replaces the document with the version in one tracked change', async () => {
    const view = makeView(paragraphDoc('Current content'));
    view.editable = true;
    const dispatched = [];
    const { dispatch } = view;
    view.dispatch = (tr) => {
      dispatched.push(tr);
      dispatch(tr);
    };
    getExtensionsBridge().view = view;
    expect(await editor.restore(PATH, ENTRY)).to.equal(true);
    expect(dispatched).to.have.lengthOf(1);
    expect(dispatched[0].getMeta(trackingPluginKey)).to.equal(true);
    expect(view.state.doc.textContent).to.equal('Saved content');
  });

  it('restores nothing without a canvas document or a loaded version', async () => {
    expect(await editor.restore(PATH, ENTRY)).to.equal(false);
    const view = makeView(paragraphDoc('Current content'));
    getExtensionsBridge().view = view;
    versions.get = async () => new Response('', { status: 500 });
    expect(await editor.restore(PATH, ENTRY)).to.equal(false);
    expect(view.state.doc.textContent).to.equal('Current content');
  });

  it('covers the canvas editor and the open chat with a comparison', () => {
    expect(editor.getCompareArea()).to.deep.equal([]);
    const mount = document.createElement('div');
    mount.className = 'nx-canvas-editor-mount';
    document.body.append(mount);
    expect(editor.getCompareArea()).to.deep.equal([mount, null]);
    const chat = document.createElement('aside');
    chat.className = 'panel';
    chat.dataset.position = 'before';
    document.body.append(chat);
    expect(editor.getCompareArea()).to.deep.equal([mount, chat]);
  });
});
