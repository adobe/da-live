import { expect } from '@esm-bundle/chai';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';
import { encodeAnchor } from '../../../../../blocks/shared/comments/helpers/anchor.js';
import {
  commentMarkers,
  postCommentMarkers,
  postScrollToComment,
} from '../../../../../blocks/canvas/ew-comments/iframe-bridge.js';

/**
 * Build a comment anchor for a text range and a stub controller holding it.
 * Mirrors the pattern in controller.test.js: create the editor, insert text,
 * then encode an anchor against the live ySyncPlugin binding.
 */
async function setup() {
  const editor = await createTestEditor();
  editor.view.dispatch(editor.view.state.tr.insertText('hello world'));
  const encoded = encodeAnchor({
    selectionData: { from: 1, to: 6, anchorType: 'text', anchorText: 'hello' },
    state: editor.view.state,
  });
  const comment = { id: 't1', threadId: null, ...encoded };
  const controller = {
    selectedThreadId: 't1',
    getAttachedThreadIds: () => new Set(['t1']),
    getComment: (id) => (id === 't1' ? comment : undefined),
  };
  return { editor, controller, comment };
}

async function setupImage() {
  const editor = await createTestEditor();
  const { schema } = editor.view.state;
  const image = schema.nodes.image.create({ src: 'https://content.da.live/org/site/media/x.png' });
  editor.view.dispatch(editor.view.state.tr.replaceSelectionWith(image));
  let from = null;
  editor.view.state.doc.descendants((node, pos) => {
    if (node.type.name !== 'image') return true;
    from = pos;
    return false;
  });
  const encoded = encodeAnchor({
    selectionData: { from, to: from + 1, anchorType: 'image', anchorText: '' },
    state: editor.view.state,
  });
  const comment = { id: 'img1', threadId: null, ...encoded };
  const controller = {
    selectedThreadId: 'img1',
    getAttachedThreadIds: () => new Set(['img1']),
    getComment: (id) => (id === 'img1' ? comment : undefined),
  };
  return { editor, controller, comment };
}

describe('iframe-bridge', () => {
  it('commentMarkers returns PM-position markers per attached thread', async () => {
    const { editor, controller } = await setup();
    const markers = commentMarkers(editor.view, controller);
    expect(markers).to.have.lengthOf(1);
    expect(markers[0]).to.include({
      threadId: 't1',
      anchorType: 'text',
      anchorText: 'hello',
    });
    expect(markers[0].from).to.be.a('number');
    expect(markers[0].to).to.be.a('number');
    destroyEditor(editor);
  });

  it('commentMarkers returns [] without a view or controller', () => {
    expect(commentMarkers(null, {})).to.deep.equal([]);
    expect(commentMarkers({}, null)).to.deep.equal([]);
  });

  it('commentMarkers includes imageSrc for image anchors', async () => {
    const { editor, controller } = await setupImage();
    const markers = commentMarkers(editor.view, controller);
    expect(markers).to.have.lengthOf(1);
    expect(markers[0].anchorType).to.equal('image');
    expect(markers[0].imageSrc).to.include('media/x.png');
    destroyEditor(editor);
  });

  it('postCommentMarkers posts markers and selectedThreadId', () => {
    const sent = [];
    const markers = [{ threadId: 't1', anchorType: 'text', from: 3, to: 8, anchorText: 'hello' }];
    postCommentMarkers({ postMessage: (m) => sent.push(m) }, markers, { selectedThreadId: 't1' });
    expect(sent[0]).to.deep.equal({
      type: 'set-comment-markers',
      markers,
      selectedThreadId: 't1',
    });
  });

  it('postScrollToComment posts scroll-to-pos for the selected thread', async () => {
    const { editor, controller } = await setup();
    const sent = [];
    postScrollToComment({ postMessage: (m) => sent.push(m) }, editor.view, controller);
    expect(sent[0].type).to.equal('scroll-to-pos');
    expect(sent[0].proseIndex).to.be.a('number');
    destroyEditor(editor);
  });
});
