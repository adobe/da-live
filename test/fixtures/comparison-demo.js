import { EditorState, EditorView, DOMParser as PMDOMParser } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../scripts/utils.js';
import { docToHtml } from '../../blocks/shared/version/compare.js';
import { canvasBus } from '../../blocks/canvas/utils/canvas-bus.js';

setNx('/nx', { hostname: 'example.com' });
const [{ installComparison }, { setupIframeChannel }] = await Promise.all([
  import('../../blocks/canvas/ew-comparison/comparison.js'),
  import('../../blocks/canvas/ew-panel-extensions/iframe-protocol.js'),
  import('../../blocks/canvas/ew-tool-panel/tool-panel.js'),
]);

const params = new URLSearchParams(location.search);
const approver = params.get('view') === 'approver';
const usePublish = params.get('plugin') === 'publish';
let context = { org: 'example', site: 'showcase', path: 'offers/autumn' };
const live = '<h1>Autumn collection</h1><p>Discover our seasonal collection, available from October.</p><table><tbody><tr><td colspan="2"><p>Hero</p></td></tr><tr><td><p>Made for everyday adventures</p></td><td><p>Browse the collection</p></td></tr></tbody></table><h2>Delivery</h2><p>Standard delivery in five working days.</p>';
const preview = live.replace('from October', 'from September').replace('five working days', 'three working days');
const draft = preview.replace('seasonal collection', 'new autumn collection').replace('Browse the collection', 'Explore the new collection');
const schema = getSchema();
const content = new DOMParser().parseFromString(draft, 'text/html').body;
const view = new EditorView(document.querySelector('#editor'), {
  state: EditorState.create({ schema, doc: PMDOMParser.fromSchema(schema).parse(content) }),
  dispatchTransaction(tr) {
    view.updateState(view.state.apply(tr));
    if (tr.docChanged) canvasBus.editorHtmlState.emit({ html: docToHtml(view) });
  },
});

const result = document.querySelector('#result');
const controller = installComparison({
  mountRoot: document.querySelector('.nx-canvas-editor-mount'),
  getContext: () => context,
  getDocument: () => docToHtml(view),
  saveDocument: async () => ({ ok: true }),
  loadContent: async (partition) => (partition === 'live' && document.querySelector('#missing').checked
    ? { html: '', missing: true } : { html: partition === 'live' ? live : preview }),
});
const candidate = document.querySelector('#candidate');
candidate.value = approver ? 'preview' : 'document';
document.querySelector('#open').onclick = async () => {
  const response = await controller.open({ candidate: candidate.value, baseline: 'live' });
  result.textContent = response.ok ? 'Comparison is open. The right rail remains interactive.' : response.error;
};
document.querySelector('#change').onclick = () => {
  view.dispatch(view.state.tr.insertText(' Updated by a collaborator.', view.state.doc.content.size - 1));
  result.textContent = 'Document changed; an open document comparison is now stale.';
};

const panel = document.querySelector('ew-tool-panel');
let connection;
let iframe;
const pluginSrc = () => {
  const origin = `http://localhost:${params.get('iframePort') || '3011'}`;
  const pathname = usePublish ? '/plugin/test/fixtures/comparison-plugin.html' : '/test/fixtures/comparison-plugin.html';
  return `${origin}${pathname}?view=${approver ? 'approver' : 'author'}`;
};
const configureRail = async () => {
  connection?.destroy();
  iframe?.remove();
  iframe = document.createElement('iframe');
  iframe.className = 'demo-plugin';
  iframe.title = usePublish ? 'Publish request' : 'Independent comparison test plugin';
  iframe.src = pluginSrc();
  iframe.addEventListener('load', async () => {
    connection = await setupIframeChannel({ iframe, hashState: context, getView: () => view });
  });
  panel.views = [];
  await panel.updateComplete;
  panel.views = [{ id: 'comparison-demo', label: usePublish ? 'Publish request' : 'Comparison test plugin', load: async () => iframe }];
};
await configureRail();
document.querySelector('#page').onclick = async () => {
  context = { ...context, path: context.path.endsWith('autumn') ? 'offers/winter' : 'offers/autumn' };
  controller.contextChanged();
  await configureRail();
  result.textContent = `Now on /${context.path}. The previous comparison was discarded.`;
};
