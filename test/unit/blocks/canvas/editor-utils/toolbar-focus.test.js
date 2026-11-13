import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { NodeSelection, TextSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { canvasBus } = await import('../../../../../blocks/canvas/utils/canvas-bus.js');
const { toolbarController } = await import('../../../../../blocks/canvas/editor-utils/toolbar-controller.js');
const selectionToolbar = await import('../../../../../blocks/canvas/editor-utils/selection-toolbar.js');
await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');
await import('../../../../../blocks/canvas/ew-block-toolbar/ew-block-toolbar.js');

// Browsers fire focus events only in the focused page; tests dispatch the ones the
// code listens for so they don't depend on which test page has focus.
const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('toolbar keyboard access (#1542)', () => {
  let frame;
  let editor;
  let tb;
  let btb;
  let iframe;
  let surfaceRequests;
  let focusRequests;
  let unsubs;

  beforeEach(async () => {
    frame = sinon.stub(window, 'requestAnimationFrame').callsFake((cb) => {
      cb();
      return 0;
    });
    toolbarController.reset();
    canvasBus.blockEditState.emit({ open: false });
    canvasBus.editorViewState.emit({ view: 'split' });
    const plugin = selectionToolbar.createSelectionToolbarPlugin();
    editor = await createTestEditor({ additionalPlugins: [plugin] });
    toolbarController.setDocView(editor.view);
    iframe = document.createElement('iframe');
    document.body.append(iframe);
    toolbarController.setIframe(iframe);
    tb = toolbarController.ensureToolbar();
    btb = toolbarController.ensureBlockToolbar();
    surfaceRequests = [];
    focusRequests = 0;
    unsubs = [
      canvasBus.toolbarSurfaceRequest.subscribe((r) => surfaceRequests.push(r)),
      canvasBus.wysiwygFocusRequest.subscribe(() => { focusRequests += 1; }),
    ];
  });

  afterEach(() => {
    unsubs.forEach((unsub) => unsub());
    document.activeElement?.blur?.();
    destroyEditor(editor);
    toolbarController.reset();
    toolbarController.setIframe(null);
    iframe.remove();
    frame.restore();
  });

  function activateDoc() {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'doc', active: true });
    editor.view.dispatch(editor.view.state.tr.insertText('hello'));
  }

  function activateWysiwyg({ block = null } = {}) {
    canvasBus.toolbarSurfaceRequest.emit({ surface: 'wysiwyg', active: true, iframeEl: iframe });
    canvasBus.toolbarSelectionState.emit({ surface: 'wysiwyg', showable: !block, block });
  }

  async function insertBlock() {
    const { state } = editor.view;
    const { schema } = state;
    const cell = schema.nodes.table_cell.create(null, schema.nodes.paragraph.create(null, schema.text('cards')));
    const table = schema.nodes.table.create(null, schema.nodes.table_row.create(null, cell));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, table));
    editor.view.dispatch(editor.view.state.tr.setSelection(
      NodeSelection.create(editor.view.state.doc, 0),
    ));
  }

  const deepActive = () => {
    let el = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el;
  };

  describe('focusToolbar (Alt+F10)', () => {
    it('focuses the first control of the selection toolbar', async () => {
      activateDoc();
      await tb.updateComplete;
      // The doc toolbar starts with the block-type picker (a bare stub in tests).
      const picker = tb.shadowRoot.querySelector('nx-picker');
      picker.focus = sinon.spy();
      expect(toolbarController.focusToolbar()).to.be.true;
      await tb.updateComplete;
      await tick();
      const wrap = tb.shadowRoot.querySelector('.toolbar-wrap');
      expect(wrap.getAttribute('role')).to.equal('toolbar');
      expect(wrap.getAttribute('aria-label')).to.equal('Text formatting');
      expect(picker.focus.calledOnce).to.be.true;
    });

    it('focuses the first button of the wysiwyg toolbar', async () => {
      activateWysiwyg();
      expect(toolbarController.focusToolbar()).to.be.true;
      await tb.updateComplete;
      expect(tb.shadowRoot.activeElement?.localName).to.equal('button');
      expect(toolbarController.isFocusInToolbar()).to.be.true;
    });

    it('prefers the block toolbar when a block is selected', async () => {
      activateDoc();
      await insertBlock();
      expect(btb.open).to.be.true;
      expect(toolbarController.focusToolbar()).to.be.true;
      await btb.updateComplete;
      expect(btb.shadowRoot.activeElement).to.exist;
      expect(btb.shadowRoot.querySelector('.toolbar-wrap').getAttribute('role')).to.equal('toolbar');
    });

    it('lets the key fall through when no toolbar is showing', () => {
      expect(toolbarController.focusToolbar()).to.be.false;
      expect(toolbarController.isFocusInToolbar()).to.be.false;
    });
  });

  describe('surface stays active while focus is in a toolbar', () => {
    it('keeps the wysiwyg surface when the iframe blurs to the block toolbar', async () => {
      await import('../../../../../blocks/canvas/ew-editor-wysiwyg/ew-editor-wysiwyg.js');
      const wysiwyg = document.createElement('ew-editor-wysiwyg');
      activateWysiwyg({ block: { name: 'cards', variant: '' } });
      expect(btb.open).to.be.true;
      await btb.focusFirst();
      wysiwyg._onIframeBlur();
      await tick();
      expect(surfaceRequests.filter((r) => !r.active)).to.deep.equal([]);
      expect(toolbarController.activeSurface).to.equal('wysiwyg');
    });

    it('deactivates the surface when focus leaves the toolbar for another control', async () => {
      activateDoc();
      toolbarController.focusToolbar();
      await tb.updateComplete;
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      tb.dispatchEvent(new FocusEvent('focusout'));
      await tick();
      expect(toolbarController.activeSurface).to.equal(null);
      outside.remove();
    });

    it('keeps the surface when focus drops to <body>', async () => {
      activateDoc();
      toolbarController.focusToolbar();
      await tb.updateComplete;
      document.activeElement.blur();
      tb.dispatchEvent(new FocusEvent('focusout'));
      await tick();
      expect(toolbarController.activeSurface).to.equal('doc');
    });

    it('keeps the surface when focus moves back to the editor', async () => {
      activateDoc();
      await tb.updateComplete;
      tb.shadowRoot.querySelector('button[data-id]:not([hidden])').focus();
      editor.view.focus();
      tb.dispatchEvent(new FocusEvent('focusout'));
      await tick();
      expect(toolbarController.activeSurface).to.equal('doc');
    });

    it('keeps the wysiwyg surface when focus moves back to the iframe', async () => {
      activateWysiwyg();
      toolbarController.focusToolbar();
      await tb.updateComplete;
      iframe.focus();
      tb.dispatchEvent(new FocusEvent('focusout'));
      await tick();
      expect(toolbarController.activeSurface).to.equal('wysiwyg');
    });
  });

  describe('Escape returns focus to the editor', () => {
    const escape = (toolbar) => {
      const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, composed: true, cancelable: true });
      toolbar.shadowRoot.activeElement.dispatchEvent(event);
      return event;
    };

    it('refocuses the doc view', async () => {
      activateDoc();
      await tb.updateComplete;
      tb.shadowRoot.querySelector('button[data-id]:not([hidden])').focus();
      const focus = sinon.spy(editor.view, 'focus');
      const event = escape(tb);
      expect(event.defaultPrevented).to.be.true;
      expect(focus.calledOnce).to.be.true;
    });

    it('refocuses the iframe and asks it to restore the caret', async () => {
      activateWysiwyg();
      toolbarController.focusToolbar();
      await tb.updateComplete;
      escape(tb);
      expect(deepActive()).to.equal(iframe);
      expect(focusRequests).to.equal(1);
    });

    it('only refocuses the iframe from the block toolbar (no caret to restore)', async () => {
      activateWysiwyg({ block: { name: 'cards', variant: '' } });
      toolbarController.focusToolbar();
      await btb.updateComplete;
      escape(btb);
      expect(deepActive()).to.equal(iframe);
      expect(focusRequests).to.equal(0);
    });
  });

  describe('restoreFocus after a toolbar command', () => {
    it('does nothing in wysiwyg when focus never left the iframe (pointer users)', () => {
      activateWysiwyg();
      const outside = document.createElement('button');
      document.body.append(outside);
      outside.focus();
      toolbarController.restoreFocus();
      expect(document.activeElement).to.equal(outside);
      expect(focusRequests).to.equal(0);
      outside.remove();
    });

    it('returns a keyboard user to the iframe', async () => {
      activateWysiwyg();
      toolbarController.focusToolbar();
      await tb.updateComplete;
      toolbarController.restoreFocus();
      expect(deepActive()).to.equal(iframe);
      expect(focusRequests).to.equal(1);
    });
  });

  describe('focus never strands on <body>', () => {
    let restore;
    let dialogOpenAtRestore;

    // A modal dialog makes the editor inert, so focus can only go back once it is gone.
    const trackRestore = (isDialogOpen) => {
      dialogOpenAtRestore = [];
      restore = sinon.stub(toolbarController, 'restoreFocus')
        .callsFake(() => dialogOpenAtRestore.push(isDialogOpen()));
    };

    afterEach(() => restore?.restore());

    it('returns focus to a menu trigger when Escape closes the menu', async () => {
      activateDoc();
      await insertBlock();
      editor.view.dispatch(editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 4),
      ));
      await tb.updateComplete;
      const menu = tb.shadowRoot.querySelector('nx-menu');
      menu.pressEscape();
      expect(tb.shadowRoot.activeElement).to.equal(menu.querySelector('[slot="trigger"]'));
    });

    it('refocuses the editor only once the link dialog has closed', async () => {
      activateDoc();
      await tb.updateComplete;
      tb.openLinkDialog(editor.view);
      await tb.updateComplete;
      const dialog = tb.shadowRoot.querySelector('da-link-dialog');
      await dialog.updateComplete;
      const isOpen = () => !!dialog.shadowRoot.querySelector('nx-dialog');
      expect(isOpen()).to.be.true;
      trackRestore(isOpen);
      dialog.dispatchEvent(new CustomEvent('da-link-submit', { detail: { href: 'https://example.com', text: 'hello' } }));
      await tick();
      expect(dialogOpenAtRestore).to.deep.equal([false]);
    });

    it('refocuses the editor only once the delete confirmation has closed', async () => {
      activateDoc();
      await insertBlock();
      await btb._onDeleteBlock();
      await btb.updateComplete;
      const isOpen = () => !!btb.shadowRoot.querySelector('da-confirm-dialog');
      expect(isOpen()).to.be.true;
      trackRestore(isOpen);
      await btb._confirmDelete();
      expect(dialogOpenAtRestore).to.deep.equal([false]);
    });
  });
});
