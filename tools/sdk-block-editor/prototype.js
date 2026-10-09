import {
  DOMParser as PMDOMParser, EditorState, EditorView, TextSelection, NodeSelection,
  columnResizing,
} from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { getInstrumentedHTML } = await import('../../blocks/canvas/editor-utils/editor-utils.js');
const { createExtensionsBridgePlugin } = await import('../../blocks/canvas/editor-utils/extensions-bridge.js');
const { setupIframeChannel } = await import('../../blocks/canvas/ew-panel-extensions/iframe-protocol.js');
const { getEditorSnapshot, resolveEditorTarget } = await import('../../blocks/canvas/editor-utils/editor-sdk.js');
const { canvasBus } = await import('../../blocks/canvas/utils/canvas-bus.js');

const schema = getSchema();
const content = `<p>Click inside a block to edit its fields in the extension.</p>
<table><tr><td colspan="2"><p>Cards (Wide)</p></td></tr>
<tr><td><p>First title</p><p><a href="/first">First link</a></p></td>
<td><p>First description</p><ul><li><p>One</p></li><li><p>Two</p></li></ul></td></tr>
<tr><td><p>Second title</p><p><a href="/second">Second link</a></p></td>
<td><p>Second description</p><ul><li><p>Three</p></li></ul></td></tr></table>
<table><tr><td colspan="2"><p>Settings</p></td></tr>
<tr><td><p>Color</p></td><td><p>red</p></td></tr></table>
<p>Unrelated content after the block.</p>`;
const parsed = new DOMParser().parseFromString(content, 'text/html');
const state = EditorState.create({
  schema,
  doc: PMDOMParser.fromSchema(schema).parse(parsed.body),
  plugins: [columnResizing(), createExtensionsBridgePlugin(null, getInstrumentedHTML)],
});
const view = new EditorView(document.querySelector('#editor'), {
  state,
  dispatchTransaction(tr) { view.updateState(view.state.apply(tr)); },
});
const renderStatus = () => {
  const snapshot = getEditorSnapshot(view);
  document.querySelector('#status').textContent = `Document ${snapshot.documentId}\n`
    + `Revision ${snapshot.revision}, editable: ${snapshot.editable}, `
    + `selected block: ${snapshot.selectedBlock?.index ?? 'none'}`;
};
canvasBus.extensionEditorState.subscribe(renderStatus);
canvasBus.editorProseSelectState.subscribe(({ proseIndex, kind }) => {
  const pos = kind === 'image' ? proseIndex : proseIndex - 1;
  const selection = NodeSelection.create(view.state.doc, pos);
  view.dispatch(view.state.tr.setSelection(selection).scrollIntoView());
});
renderStatus();

const urlInput = document.querySelector('#extension-url');
const params = new URLSearchParams(window.location.search);
urlInput.value = params.get('extension') || 'http://localhost:3002/tools/block-editor/block-editor.html'
  + '?nx=http://localhost:3001/nx&live=http://localhost:3001'
  + '&library=http://localhost:3001/tools/sdk-block-editor/library.json';
let destroy = () => {};
async function connect() {
  destroy();
  const url = new URL(urlInput.value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('An HTTP extension URL is required.');
  const iframe = document.createElement('iframe');
  iframe.src = url.href;
  iframe.title = 'Block sidebar extension';
  iframe.addEventListener('load', async () => {
    const channel = await setupIframeChannel({
      iframe,
      hashState: { org: 'prototype', site: 'sidebar', path: 'demo', view: 'edit' },
      getView: () => view,
      onClose: () => { destroy(); iframe.remove(); },
    });
    destroy = channel.destroy;
  }, { once: true });
  document.querySelector('#extension').replaceChildren(iframe);
}
document.querySelector('#connect').addEventListener('click', () => {
  connect().catch((err) => { document.querySelector('#status').textContent = err.message; });
});
document.querySelector('#remote-edit').addEventListener('click', () => {
  view.dispatch(view.state.tr.insertText('!', 1));
});
document.querySelector('#read-only').addEventListener('change', (event) => {
  view.setProps({ editable: () => !event.target.checked });
});
const initial = getEditorSnapshot(view);
const { target } = initial.blocks[0].rows[0].cells[0].fields[0];
const { pos } = resolveEditorTarget(view, { ...initial, target });
const selection = TextSelection.create(view.state.doc, pos + 1);
view.dispatch(view.state.tr.setSelection(selection));
await connect();
