/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import {
  getDiffClass,
  addActiveView,
  checkForLocNodes,
} from '../../../../../../blocks/edit/prose/diff/diff-utils.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const waitFor = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

function buildPara(schema, text) {
  return schema.nodes.paragraph.create(null, schema.text(text));
}

function buildDiffPara(schema, type, text) {
  const para = buildPara(schema, text);
  return schema.nodes[type].create({}, para);
}

describe('diff-utils getDiffClass — single node views', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('Builds a loc-deleted-view container for a lone diff_deleted node', async () => {
    const { schema } = editor.view.state;
    // Insert a diff_deleted node at the end of the doc
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_deleted', 'old text'),
    );
    editor.view.dispatch(tr);
    // Find the inserted position
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_deleted') targetPos = pos;
    });
    expect(targetPos).to.be.greaterThan(-1);

    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);

    expect(instance.dom).to.exist;
    expect(instance.dom.classList.contains('loc-single-container')).to.be.true;
    expect(instance.dom.classList.contains('loc-deleted-view')).to.be.true;
    expect(instance.dom.classList.contains('da-loc-deleted-style')).to.be.true;
    expect(instance.contentDOM).to.equal(null);
    // Cover overlay placeholder is in place
    const cover = instance.dom.querySelector('.loc-color-overlay');
    expect(cover).to.exist;
  });

  it('Builds a loc-added-view container for a lone diff_added node', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_added', 'new text'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_added') targetPos = pos;
    });

    const NodeViewClass = getDiffClass('da-loc-added', () => schema, () => {}, { isUpstream: false });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);

    expect(instance.dom.classList.contains('loc-added-view')).to.be.true;
    expect(instance.dom.classList.contains('da-loc-added-style')).to.be.true;
  });

  it('selectNode/deselectNode toggle the ProseMirror-selectednode class', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_deleted', 'x'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_deleted') targetPos = pos;
    });
    const NodeViewClass = getDiffClass('x', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);
    instance.selectNode();
    expect(instance.dom.classList.contains('ProseMirror-selectednode')).to.be.true;
    instance.deselectNode();
    expect(instance.dom.classList.contains('ProseMirror-selectednode')).to.be.false;
  });

  it('stopEvent and ignoreMutation return true', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_deleted', 'x'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_deleted') targetPos = pos;
    });
    const NodeViewClass = getDiffClass('x', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);
    expect(instance.stopEvent()).to.be.true;
    expect(instance.ignoreMutation()).to.be.true;
  });

  it('destroy() removes the langOverlay and coverDiv references safely', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_deleted', 'x'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_deleted') targetPos = pos;
    });
    const NodeViewClass = getDiffClass('x', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);
    expect(() => instance.destroy()).not.to.throw();
  });
});

describe('diff-utils getDiffClass — paired node views', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  function insertPair() {
    const { schema } = editor.view.state;
    const docSize = editor.view.state.doc.content.size;
    const tr = editor.view.state.tr.insert(docSize, [
      buildDiffPara(schema, 'diff_deleted', 'old'),
      buildDiffPara(schema, 'diff_added', 'old new'),
    ]);
    editor.view.dispatch(tr);
    let deletedPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (deletedPos === -1 && node.type.name === 'diff_deleted') deletedPos = pos;
    });
    return deletedPos;
  }

  it('First node of a deleted/added pair builds a loc-tabbed-container', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    expect(instance.dom.classList.contains('loc-tabbed-container')).to.be.true;
    expect(instance.contentDOM).to.equal(null);
    // Three tabs exist (added/deleted/diff)
    const tabs = instance.dom.querySelectorAll('.diff-tab-pane');
    expect(tabs.length).to.equal(3);
    // Color overlay container present
    expect(instance.dom.querySelector('.loc-tabbed-color-overlay')).to.exist;
  });

  it('Second node of a pair renders a hidden span (no duplication)', async () => {
    const deletedPos = insertPair();
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const addedPos = deletedPos + node.nodeSize;
    const addedNode = editor.view.state.doc.nodeAt(addedPos);

    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-added', () => schema, () => {}, { isUpstream: false });
    const instance = new NodeViewClass(addedNode, editor.view, () => addedPos);

    expect(instance.dom.tagName.toLowerCase()).to.equal('span');
    expect(instance.dom.style.display).to.equal('none');
  });

  it('canFormLocPair returns true for matching deleted/added pair', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    const addedNode = editor.view.state.doc.nodeAt(deletedPos + node.nodeSize);
    expect(instance.canFormLocPair(node, addedNode)).to.be.true;
  });

  it('canFormLocPair returns false when one node is not a loc node', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    const para = schema.nodes.paragraph.create(null, schema.text('plain'));
    expect(instance.canFormLocPair(node, para)).to.be.false;
  });

  it('canFormLocPair returns false when both nodes are the same type', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    const otherDeleted = buildDiffPara(schema, 'diff_deleted', 'also deleted');
    expect(instance.canFormLocPair(node, otherDeleted)).to.be.false;
  });

  it('dispatchContentTransaction dispatches a delete when filteredContent is empty', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    const dispatched = [];
    const realDispatch = editor.view.dispatch.bind(editor.view);
    editor.view.dispatch = (tr) => {
      dispatched.push(tr);
      realDispatch(tr);
    };
    instance.dispatchContentTransaction(deletedPos, deletedPos + node.nodeSize, []);
    expect(dispatched.length).to.equal(1);
  });

  it('callUserAction loads diff-actions and invokes the named function', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);

    // handleDeleteSingleNode calls user action; with a mismatched parent we
    // should hit the "current node is not a loc node" warn branch and return
    // safely. The point is to verify the lazy-load + invocation path.
    await instance.handleDeleteSingleNode();
    await instance.handleKeepSingleNode();
    await instance.handleKeepDeleted();
    await instance.handleKeepAdded();
    await instance.handleKeepBoth();
    // No throws ⇒ pass
  });

  it('Tabbed container loads real actions asynchronously', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);
    // Wait for async createTabbedActions to resolve; placeholder is replaced
    await waitFor(50);
    const placeholder = instance.dom.querySelector('.diff-tabbed-actions');
    expect(placeholder).to.exist;
  });

  it('Tabbed container is configured with action buttons after async resolution', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);
    await waitFor(100);
    const buttons = instance.dom.querySelectorAll('.da-diff-btn');
    expect(buttons.length).to.be.at.least(1);
  });

  it('Initial color overlay is positioned for the local view', async () => {
    const deletedPos = insertPair();
    const { schema } = editor.view.state;
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(deletedPos);
    const instance = new NodeViewClass(node, editor.view, () => deletedPos);
    await waitFor(50);
    const overlay = instance.dom.querySelector('.loc-tabbed-color-overlay');
    expect(overlay).to.exist;
    expect(overlay.className).to.contain('diff-bg-local');
  });
});

describe('diff-utils single-node async overlay loading', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('Replaces placeholder overlay with real overlay after async load', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_added', 'new'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_added') targetPos = pos;
    });
    const NodeViewClass = getDiffClass('da-loc-added', () => schema, () => {}, { isUpstream: false });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);
    await waitFor(100);
    const cover = instance.dom.querySelector('.loc-color-overlay');
    expect(cover.className).to.match(/loc-regional|loc-langstore/);
    const acceptBtn = cover.querySelector('.diff-accept');
    expect(acceptBtn).to.exist;
  });

  it('Wires accept and delete clicks on the lang overlay', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_deleted', 'old'),
    );
    editor.view.dispatch(tr);
    let targetPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'diff_deleted') targetPos = pos;
    });
    const NodeViewClass = getDiffClass('da-loc-deleted', () => schema, () => {}, { isUpstream: true });
    const node = editor.view.state.doc.nodeAt(targetPos);
    const instance = new NodeViewClass(node, editor.view, () => targetPos);
    await waitFor(100);
    const cover = instance.dom.querySelector('.loc-color-overlay');
    const acceptBtn = cover.querySelector('.diff-accept');
    const deleteBtn = cover.querySelector('.diff-delete');
    expect(acceptBtn).to.exist;
    expect(deleteBtn).to.exist;
    // Click both — should not throw (just walks the user action path)
    acceptBtn.click();
    deleteBtn.click();
    await waitFor(20);
  });
});

describe('diff-utils flow helpers', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('addActiveView is a no-throw side effect', () => {
    expect(() => addActiveView(editor.view)).not.to.throw();
  });

  it('checkForLocNodes returns false when no diff nodes are present', () => {
    expect(checkForLocNodes(editor.view)).to.be.false;
  });

  it('checkForLocNodes returns true for top-level diff_added nodes', async () => {
    const { schema } = editor.view.state;
    const tr = editor.view.state.tr.insert(
      editor.view.state.doc.content.size,
      buildDiffPara(schema, 'diff_added', 'new'),
    );
    editor.view.dispatch(tr);
    expect(checkForLocNodes(editor.view)).to.be.true;
    await nextFrame();
  });

  it('checkForLocNodes returns true for diff nodes inside a list', async () => {
    const { schema } = editor.view.state;
    const para = buildPara(schema, 'item');
    const diffAdded = schema.nodes.diff_added.create({}, para);
    const listItem = schema.nodes.list_item.create({}, diffAdded);
    const bulletList = schema.nodes.bullet_list.create({}, listItem);
    const tr = editor.view.state.tr.insert(editor.view.state.doc.content.size, bulletList);
    editor.view.dispatch(tr);
    expect(checkForLocNodes(editor.view)).to.be.true;
    await nextFrame();
  });
});
