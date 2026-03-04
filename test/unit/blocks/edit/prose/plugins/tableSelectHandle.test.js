import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('tableSelectHandle Plugin', () => {
  let tableSelectHandle;
  let plugin;

  before(async () => {
    const mod = await import('../../../../../../blocks/edit/prose/plugins/tableSelectHandle.js');
    tableSelectHandle = mod.default;
  });

  beforeEach(() => {
    plugin = tableSelectHandle();
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
        state: {
          doc: {
            resolve: () => ({
              depth: 1,
              node: () => ({ type: { name: 'table' } }),
              before: () => 0,
            }),
          },
          tr: { setSelection: sinon.stub().returnsThis() },
          selection: { content: () => ({ content: {} }) },
        },
        dispatch: sinon.stub(),
        posAtDOM: () => 0,
      };
    });

    afterEach(() => {
      container.remove();
    });

    it('creates and appends handle element', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      const handle = container.querySelector('.table-select-handle');
      expect(handle).to.exist;
      expect(handle.classList.contains('is-visible')).to.be.false;

      viewReturn.destroy();
    });

    it('removes handle on destroy', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      let handle = container.querySelector('.table-select-handle');
      expect(handle).to.exist;

      viewReturn.destroy();

      handle = container.querySelector('.table-select-handle');
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
          tr: { setSelection: sinon.stub().returnsThis() },
          selection: { content: () => ({ content: {} }) },
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

      const event = new MouseEvent('mouseover', {
        bubbles: true,
        target: tableWrapper,
      });
      Object.defineProperty(event, 'target', { value: tableWrapper });
      editorDom.dispatchEvent(event);

      const handle = container.querySelector('.table-select-handle');
      expect(handle.classList.contains('is-visible')).to.be.true;

      viewReturn.destroy();
    });
  });
});
