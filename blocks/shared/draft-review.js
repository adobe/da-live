import { getNx, getNx2Api } from '../../scripts/utils.js';
import { createDraftReviewService } from './draft-review-actions.js';
import { htmlToAuthoringDom } from './version/version-actions.js';
import { buildCompareDom, domToHtml } from './version/compare.js';
import '../canvas/ew-comparison/ew-canvas-compare.js';

const { DOMParser: PMDOMParser } = await import('da-y-wrapper');
const { trackingPluginKey } = await import('../canvas/editor-utils/prose-diff.js');
const { validateReview, draftRootForUser } = await import(`${getNx()}/blocks/chat-ao/draft-review/protocol.js`);
const { loadIms } = await import(`${getNx()}/utils/ims.js`);
const { CHAT_EVENT } = await import(`${getNx()}/utils/chat.js`);
const api = await getNx2Api();

function activeEditor(context) {
  const editor = document.querySelector('ew-editor-doc');
  return editor?.getComparisonSession(context) ? editor : null;
}

async function flush(context) {
  const editor = activeEditor(context);
  if (!editor) return;
  const result = await editor.saveForComparison(context);
  if (!result.ok) throw new Error(`Could not save the open page before review: ${result.error}`);
}

async function write({ content, ...context }) {
  const editor = activeEditor(context);
  if (editor) {
    const session = editor.getComparisonSession(context);
    if (!session?.view.editable) throw new Error('The open page is not writable.');
    const { view } = session;
    const dom = htmlToAuthoringDom(content);
    const doc = PMDOMParser.fromSchema(view.state.schema).parse(dom);
    view.dispatch(view.state.tr.replaceWith(0, view.state.doc.content.size, doc.content)
      .setMeta(trackingPluginKey, true));
    await flush(context);
    return;
  }
  const response = await api.source.save(`/${context.org}/${context.site}${context.path}`, { body: content });
  if (!response?.ok) throw new Error(`Could not update ${context.path} (${response?.status ?? 'network error'}).`);
}

let comparison;
async function compare({ before, after, path, title }) {
  const beforeDom = htmlToAuthoringDom(before);
  const afterDom = htmlToAuthoringDom(after);
  const htmlA = domToHtml(beforeDom);
  const htmlB = domToHtml(afterDom);
  const diff = await buildCompareDom({ htmlA, htmlB, closeOnOutsideClick: false });
  comparison?.remove();
  comparison = document.createElement('ew-canvas-compare');
  Object.assign(comparison, {
    dom: afterDom,
    diffDom: diff.dom,
    path,
    label: `AI draft: ${title}`,
    currentLabel: 'Original / saved version',
    split: true,
    canWrite: false,
  });
  comparison.addEventListener('close', () => comparison.remove());
  comparison.addEventListener('toggle-split', () => { comparison.split = !comparison.split; });
  document.body.append(comparison);
}

export const draftReview = createDraftReviewService({
  api,
  storage: sessionStorage,
  validateReview,
  draftRootForUser,
  getIdentity: loadIms,
  flush,
  write,
  compare,
  verify: ({ expected, actual }) => (
    domToHtml(htmlToAuthoringDom(expected)) === domToHtml(htmlToAuthoringDom(actual))
  ),
  notify: ({ org, site, path }) => document.dispatchEvent(new CustomEvent(CHAT_EVENT.AGENT_CHANGE, { detail: { scope: 'file', paths: [`/${org}/${site}${path.slice(0, path.lastIndexOf('/'))}`] } })),
});
