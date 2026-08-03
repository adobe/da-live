import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { columnResizing, Y, TextSelection } from 'da-y-wrapper';
import { createTestEditor, destroyEditor } from '../test-helpers.js';
import insertTable from '../../../../../../blocks/edit/prose/table.js';

describe('tableCollapse Plugin', () => {
  let tableCollapse;
  let tableCollapseKey;
  let plugin;

  before(async () => {
    const mod = await import('../../../../../../blocks/edit/prose/plugins/tableCollapse.js');
    tableCollapse = mod.default;
    tableCollapseKey = mod.tableCollapseKey;
  });

  beforeEach(() => {
    plugin = tableCollapse();
  });

  describe('View initialization', () => {
    let mockEditorView;
    let container;

    beforeEach(() => {
      container = document.createElement('div');
      const editorDom = document.createElement('div');
      editorDom.className = 'ProseMirror';
      container.appendChild(editorDom);
      document.body.appendChild(container);

      mockEditorView = {
        dom: editorDom,
        state: {},
        dispatch: sinon.stub(),
        posAtDOM: () => 0,
      };
    });

    afterEach(() => {
      container.remove();
    });

    it('creates and appends handle element', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      const handle = container.querySelector('.table-collapse-handle');
      expect(handle).to.exist;
      expect(handle.classList.contains('is-visible')).to.be.false;

      viewReturn.destroy();
    });

    it('removes handle on destroy', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      let handle = container.querySelector('.table-collapse-handle');
      expect(handle).to.exist;

      viewReturn.destroy();

      handle = container.querySelector('.table-collapse-handle');
      expect(handle).to.be.null;
    });
  });

  describe('Mouse events', () => {
    let mockEditorView;
    let container;
    let editorDom;

    beforeEach(() => {
      container = document.createElement('div');
      editorDom = document.createElement('div');
      editorDom.className = 'ProseMirror';
      container.appendChild(editorDom);
      document.body.appendChild(container);

      mockEditorView = {
        dom: editorDom,
        state: {
          doc: {
            resolve: () => ({
              depth: 1,
              node: () => ({ type: { name: 'table' } }),
              before: () => 0,
            }),
          },
        },
        dispatch: sinon.stub(),
        posAtDOM: () => 0,
      };
    });

    afterEach(() => {
      container.remove();
    });

    it('shows handle on mouseover of tableWrapper', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'tableWrapper';
      const table = document.createElement('table');
      tableWrapper.appendChild(table);
      editorDom.appendChild(tableWrapper);

      const event = new MouseEvent('mouseover', { bubbles: true });
      Object.defineProperty(event, 'target', { value: tableWrapper });
      editorDom.dispatchEvent(event);

      const handle = container.querySelector('.table-collapse-handle');
      expect(handle.classList.contains('is-visible')).to.be.true;

      viewReturn.destroy();
    });
  });

  describe('State (collapsed set)', () => {
    it('initializes to an empty set', () => {
      const set = plugin.spec.state.init();
      expect(set).to.be.instanceOf(Set);
      expect(set.size).to.equal(0);
    });

    it('ignores transactions without a toggle meta', () => {
      const value = new Set();
      const tr = { getMeta: () => undefined };
      expect(plugin.spec.state.apply(tr, value)).to.equal(value);
    });
  });

  describe('Decorations', () => {
    it('returns an empty set when nothing is collapsed', () => {
      const decos = plugin.spec.props.decorations({});
      expect(decos.find().length).to.equal(0);
    });

    it('uses the plugin key for state lookups', () => {
      expect(tableCollapseKey).to.exist;
    });
  });

  describe('Integration with a real editor', () => {
    let editor;

    afterEach(() => {
      destroyEditor(editor);
      editor = null;
    });

    function getTablePos(view) {
      let tablePos = null;
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') tablePos = pos;
      });
      return tablePos;
    }

    it('applies is-collapsed to the .tableWrapper and toggles it off', async () => {
      editor = await createTestEditor({ additionalPlugins: [columnResizing(), tableCollapse()] });
      const { view } = editor;

      insertTable(view.state, view.dispatch);

      const tablePos = getTablePos(view);
      expect(tablePos, 'a table should have been inserted').to.not.be.null;

      // Collapse
      view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }));
      expect(view.dom.querySelector('.tableWrapper.is-collapsed')).to.exist;

      // Expand
      view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }));
      expect(view.dom.querySelector('.tableWrapper.is-collapsed')).to.be.null;
    });
  });

  describe('Collaboration', () => {
    let editorA;
    let editorB;

    afterEach(() => {
      destroyEditor(editorA);
      destroyEditor(editorB);
      editorA = null;
      editorB = null;
    });

    function firstTablePos(view) {
      let tablePos = null;
      view.state.doc.descendants((node, pos) => {
        if (tablePos === null && node.type.name === 'table') tablePos = pos;
      });
      return tablePos;
    }

    function firstParaPosInTable(view) {
      const tablePos = firstTablePos(view);
      const table = view.state.doc.nodeAt(tablePos);
      let paraPos = null;
      view.state.doc.nodesBetween(tablePos, tablePos + table.nodeSize, (node, pos) => {
        if (paraPos === null && node.type.name === 'paragraph') paraPos = pos;
      });
      return paraPos;
    }

    // Bidirectional Yjs sync so an edit in one editor lands in the other,
    // exactly as it would between two collaborators.
    function link(a, b) {
      const relay = (from, to) => from.ydoc.on('update', (update, origin) => {
        if (origin === to.ydoc) return;
        Y.applyUpdate(to.ydoc, update, from.ydoc);
      });
      relay(a, b);
      relay(b, a);
    }

    it('keeps a table collapsed when a collaborator edits it', async () => {
      editorA = await createTestEditor({ additionalPlugins: [columnResizing(), tableCollapse()] });
      editorB = await createTestEditor({ additionalPlugins: [columnResizing(), tableCollapse()] });
      link(editorA, editorB);

      // A inserts a table; it syncs to B.
      insertTable(editorA.view.state, editorA.view.dispatch);
      expect(firstTablePos(editorB.view), 'table should sync to B').to.not.be.null;

      // A collapses the table.
      const tablePosA = firstTablePos(editorA.view);
      editorA.view.dispatch(
        editorA.view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePosA }),
      );
      expect(editorA.view.dom.querySelector('.tableWrapper.is-collapsed')).to.exist;

      // B (the collaborator) edits inside the table -> full-doc rebuild in A.
      const paraPosB = firstParaPosInTable(editorB.view);
      editorB.view.dispatch(editorB.view.state.tr.insertText('hello', paraPosB + 1));

      // The table must remain collapsed for A, and stay expanded for B.
      expect(
        editorA.view.dom.querySelector('.tableWrapper.is-collapsed'),
        'A stays collapsed after B edits the table',
      ).to.exist;
      expect(
        editorB.view.dom.querySelector('.tableWrapper.is-collapsed'),
        'collapse is local to A',
      ).to.be.null;
    });
  });

  describe('Persistence (sessionStorage)', () => {
    const KEY = 'da-collapsed-tables:test-doc';
    let editorA;
    let editorB;

    beforeEach(() => sessionStorage.removeItem(KEY));

    afterEach(() => {
      destroyEditor(editorA);
      destroyEditor(editorB);
      editorA = null;
      editorB = null;
      sessionStorage.removeItem(KEY);
    });

    function firstTablePos(view) {
      let tablePos = null;
      view.state.doc.descendants((node, pos) => {
        if (tablePos === null && node.type.name === 'table') tablePos = pos;
      });
      return tablePos;
    }

    function makeEditor() {
      const additionalPlugins = [columnResizing(), tableCollapse(KEY)];
      return createTestEditor({ additionalPlugins });
    }

    it('restores collapsed tables after a reload', async () => {
      // Session 1: collapse a table, which writes to sessionStorage.
      editorA = await makeEditor();
      insertTable(editorA.view.state, editorA.view.dispatch);
      const tablePos = firstTablePos(editorA.view);
      editorA.view.dispatch(
        editorA.view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }),
      );
      expect(editorA.view.dom.querySelector('.tableWrapper.is-collapsed')).to.exist;
      expect(sessionStorage.getItem(KEY), 'collapse persisted').to.be.a('string');

      // Session 2 (reload): a fresh editor with the same storage key. Its plugin
      // seeds from sessionStorage before content arrives; then the same document
      // syncs back in (same Yjs item ids) and the table collapses automatically.
      editorB = await makeEditor();
      expect(
        editorB.view.dom.querySelector('.tableWrapper.is-collapsed'),
        'nothing collapsed before content loads',
      ).to.be.null;

      Y.applyUpdate(editorB.ydoc, Y.encodeStateAsUpdate(editorA.ydoc));

      expect(
        editorB.view.dom.querySelector('.tableWrapper.is-collapsed'),
        'table collapsed after reload',
      ).to.exist;
    });

    it('clears storage when the last table is expanded', async () => {
      editorA = await makeEditor();
      insertTable(editorA.view.state, editorA.view.dispatch);
      const tablePos = firstTablePos(editorA.view);
      const toggle = () => editorA.view.dispatch(
        editorA.view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }),
      );

      toggle();
      expect(sessionStorage.getItem(KEY), 'stored on collapse').to.be.a('string');

      toggle();
      expect(sessionStorage.getItem(KEY), 'cleared on expand').to.be.null;
    });

    it('does not throw when a position resolves outside the current doc', async () => {
      editorA = await makeEditor();
      const { view } = editorA;

      // Two tables so the second sits well past the start of the document.
      insertTable(view.state, view.dispatch);
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
      insertTable(view.state, view.dispatch);

      const tables = [];
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') tables.push(pos);
      });
      const tablePos = tables[tables.length - 1];
      view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: tablePos }));
      expect(view.dom.querySelectorAll('.tableWrapper.is-collapsed').length).to.equal(1);

      // Reproduce the mid-sync race: the binding still resolves the collapsed
      // table's position into the full document, but decorations runs against a
      // doc that is briefly just an empty paragraph (as on load). The resolved
      // position is past the small doc's end -> nodeAt would throw without the
      // bounds guard.
      const { schema } = view.state;
      const emptyDoc = schema.node('doc', null, [schema.node('paragraph')]);
      expect(tablePos, 'table sits past the empty doc end').to.be.greaterThan(emptyDoc.content.size);

      const staleState = Object.create(view.state);
      Object.defineProperty(staleState, 'doc', { value: emptyDoc });

      const collapsePlugin = view.state.plugins.find((p) => p.spec.key === tableCollapseKey);
      let decos;
      expect(() => { decos = collapsePlugin.props.decorations(staleState); }).to.not.throw();
      expect(decos.find().length, 'no decoration for the out-of-range table').to.equal(0);
    });

    it('prunes a deleted table from storage on the next toggle', async () => {
      editorA = await makeEditor();
      const { view } = editorA;

      // Two tables (each insert adds a leading paragraph, so they are separated).
      insertTable(view.state, view.dispatch);
      view.dispatch(view.state.tr.setSelection(TextSelection.atEnd(view.state.doc)));
      insertTable(view.state, view.dispatch);

      const tables = [];
      view.state.doc.descendants((node, pos) => {
        if (node.type.name === 'table') tables.push(pos);
      });
      expect(tables.length, 'two tables inserted').to.equal(2);

      // Collapse both -> two stored entries.
      tables.forEach((pos) => {
        view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos }));
      });
      expect(JSON.parse(sessionStorage.getItem(KEY)).length).to.equal(2);

      // Delete the first table's node.
      const firstNode = view.state.doc.nodeAt(tables[0]);
      view.dispatch(view.state.tr.delete(tables[0], tables[0] + firstNode.nodeSize));

      // Toggle the surviving table (expand then collapse). The prune on toggle
      // drops the deleted table's stale entry.
      view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: firstTablePos(view) }));
      view.dispatch(view.state.tr.setMeta(tableCollapseKey, { type: 'toggle', pos: firstTablePos(view) }));

      expect(
        JSON.parse(sessionStorage.getItem(KEY)).length,
        'stale entry pruned, only the surviving table remains',
      ).to.equal(1);
    });
  });
});
