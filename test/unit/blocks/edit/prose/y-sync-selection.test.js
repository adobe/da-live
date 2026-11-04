import { expect } from '@esm-bundle/chai';
import {
  EditorState,
  EditorView,
  NodeSelection,
  TextSelection,
  prosemirrorToYDoc,
  ySyncPlugin,
} from 'da-y-wrapper';
import { getSchema } from 'da-parser';

const schema = getSchema();
const paragraph = (text) => ({ type: 'paragraph', content: [{ type: 'text', text }] });
const table = {
  type: 'table',
  content: [{ type: 'table_row', content: [{ type: 'table_cell', content: [paragraph('cell')] }] }],
};

describe('da-y-wrapper ySyncPlugin', () => {
  let view;
  let ydoc;

  function mount(content) {
    ydoc = prosemirrorToYDoc(schema.nodeFromJSON({ type: 'doc', content }));
    const dom = document.createElement('div');
    document.body.append(dom);
    const plugins = [ySyncPlugin(ydoc.getXmlFragment('prosemirror'))];
    view = new EditorView(dom, { state: EditorState.create({ schema, plugins }) });
  }

  afterEach(() => {
    const dom = view.dom.parentElement;
    view.destroy();
    dom.remove();
    ydoc.destroy();
  });

  function selectNode(index) {
    let pos = 0;
    for (let i = 0; i < index; i += 1) pos += view.state.doc.child(i).nodeSize;
    view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)));
  }

  function remoteDelete(index) {
    ydoc.transact(() => ydoc.getXmlFragment('prosemirror').delete(index, 1), 'remote');
  }

  it('applies a remote delete of the selected node when it is the last child', () => {
    mount([paragraph('before'), table]);
    selectNode(1);
    remoteDelete(1);
    expect(view.state.doc.childCount).to.equal(1);
    expect(view.state.doc.textContent).to.equal('before');
  });

  it('keeps a node selection when a remote edit leaves the node in place', () => {
    mount([paragraph('before'), table, paragraph('after')]);
    selectNode(1);
    remoteDelete(2);
    const { selection } = view.state;
    expect(selection instanceof NodeSelection).to.equal(true);
    expect(selection.node.type.name).to.equal('table');
  });

  it('moves the caret past text a collaborator inserts at the caret', () => {
    mount([paragraph('ab')]);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
    ydoc.transact(() => ydoc.getXmlFragment('prosemirror').get(0).get(0).insert(1, 'X'), 'remote');
    expect(view.state.doc.textContent).to.equal('aXb');
    expect(view.state.selection.head).to.equal(3);
  });
});
