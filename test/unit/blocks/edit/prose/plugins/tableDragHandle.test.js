import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';

describe('tableDragHandle Plugin', () => {
  let tableDragHandle;
  let plugin;

  before(async () => {
    const mod = await import('../../../../../../blocks/edit/prose/plugins/tableDragHandle.js');
    tableDragHandle = mod.default;
  });

  beforeEach(() => {
    plugin = tableDragHandle();
  });

  describe('Drop handler', () => {
    it('allows file drops to pass through (returns false)', () => {
      const mockView = {};
      const mockEvent = { dataTransfer: { files: [{ name: 'image.png' }] } };

      const result = plugin.props.handleDOMEvents.drop(mockView, mockEvent);
      expect(result).to.be.false;
    });

    it('allows table drops (returns false)', () => {
      const mockView = { dragging: { slice: { content: { firstChild: { type: { name: 'table' } } } } } };
      const mockEvent = { dataTransfer: { files: [] } };

      const result = plugin.props.handleDOMEvents.drop(mockView, mockEvent);
      expect(result).to.be.false;
    });

    it('blocks non-table internal drops (returns true)', () => {
      const mockView = { dragging: { slice: { content: { firstChild: { type: { name: 'paragraph' } } } } } };
      const mockEvent = { dataTransfer: { files: [] } };

      const result = plugin.props.handleDOMEvents.drop(mockView, mockEvent);
      expect(result).to.be.true;
    });

    it('blocks drops with no dragging context (returns true)', () => {
      const mockView = { dragging: null };
      const mockEvent = { dataTransfer: { files: [] } };

      const result = plugin.props.handleDOMEvents.drop(mockView, mockEvent);
      expect(result).to.be.true;
    });

    it('handles empty slice content gracefully', () => {
      const mockView = { dragging: { slice: { content: { firstChild: null } } } };
      const mockEvent = { dataTransfer: { files: [] } };

      const result = plugin.props.handleDOMEvents.drop(mockView, mockEvent);
      expect(result).to.be.true;
    });
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

    it('creates and appends drag handle element', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      const handle = container.querySelector('.table-drag-handle');
      expect(handle).to.exist;
      expect(handle.draggable).to.be.true;
      expect(handle.classList.contains('is-visible')).to.be.false;

      viewReturn.destroy();
    });

    it('removes handle on destroy', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      let handle = container.querySelector('.table-drag-handle');
      expect(handle).to.exist;

      viewReturn.destroy();

      handle = container.querySelector('.table-drag-handle');
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

      const handle = container.querySelector('.table-drag-handle');
      expect(handle.classList.contains('is-visible')).to.be.true;

      viewReturn.destroy();
    });

    it('hides handle on dragend', () => {
      const viewReturn = plugin.spec.view(mockEditorView);

      const tableWrapper = document.createElement('div');
      tableWrapper.className = 'tableWrapper';
      const table = document.createElement('table');
      tableWrapper.appendChild(table);
      editorDom.appendChild(tableWrapper);

      // Show the handle first
      const mouseoverEvent = new MouseEvent('mouseover', {
        bubbles: true,
        target: tableWrapper,
      });
      Object.defineProperty(mouseoverEvent, 'target', { value: tableWrapper });
      editorDom.dispatchEvent(mouseoverEvent);

      const handle = container.querySelector('.table-drag-handle');
      expect(handle.classList.contains('is-visible')).to.be.true;

      // Trigger dragend
      const dragendEvent = new Event('dragend', { bubbles: true });
      handle.dispatchEvent(dragendEvent);

      expect(handle.classList.contains('is-visible')).to.be.false;

      viewReturn.destroy();
    });
  });
});
