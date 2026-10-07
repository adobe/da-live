import { expect } from '@esm-bundle/chai';
import { TextSelection, NodeSelection } from 'da-y-wrapper';
import { setNx } from '../../../../../scripts/utils.js';
import { createTestEditor, destroyEditor } from '../../edit/prose/test-helpers.js';
import { toolbarController } from '../../../../../blocks/canvas/editor-utils/toolbar-controller.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

describe('ew-selection-toolbar buttons', () => {
  let editor;
  let toolbar;

  before(async () => {
    await import('../../../../../blocks/canvas/ew-selection-toolbar/ew-selection-toolbar.js');
  });

  beforeEach(async () => {
    editor = await createTestEditor();
    toolbar = toolbarController.ensureToolbar();
    toolbar.view = editor.view;
  });

  afterEach(async () => {
    toolbar._hasAemAssets = false;
    await toolbar.updateComplete;
    toolbar.view = null;
    destroyEditor(editor);
  });

  function setText(text) {
    editor.view.dispatch(editor.view.state.tr.insertText(text));
  }

  function selectText(from, to) {
    const selection = TextSelection.create(editor.view.state.doc, from, to);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
  }

  async function clickToolbarButton(id) {
    const btn = toolbar.shadowRoot.querySelector(`button[data-id="${id}"]`);
    expect(btn, `${id} button`).to.exist;
    btn.click();
    await toolbar.updateComplete;
  }

  function selectionHasMark(name) {
    const { from, to } = editor.view.state.selection;
    return editor.view.state.doc.rangeHasMark(from, to, editor.view.state.schema.marks[name]);
  }

  it('applies superscript to the selected range', async () => {
    setText('hello');
    selectText(1, 6);

    await clickToolbarButton('sup');

    expect(selectionHasMark('sup')).to.be.true;
  });

  it('applies subscript to the selected range', async () => {
    setText('world');
    selectText(1, 6);

    await clickToolbarButton('sub');

    expect(selectionHasMark('sub')).to.be.true;
  });

  function selectImage(attrs = { src: '/x.png' }) {
    const { state } = editor.view;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create(attrs));
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const sel = NodeSelection.create(editor.view.state.doc, imgPos);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));
  }

  it('opens the alt dialog with the current alt when image-alt-text is clicked', async () => {
    selectImage({ src: '/x.png', alt: 'Existing alt' });

    await clickToolbarButton('image-alt-text');

    expect(toolbar.altDialogOpen).to.be.true;
    const dialog = toolbar.shadowRoot.querySelector('da-alt-dialog');
    expect(dialog.alt).to.equal('Existing alt');
  });

  it('writes the submitted alt back to the selected image', async () => {
    selectImage({ src: '/x.png', alt: 'Old' });
    await clickToolbarButton('image-alt-text');

    toolbar.shadowRoot.querySelector('da-alt-dialog').dispatchEvent(
      new CustomEvent('da-alt-submit', {
        detail: { alt: 'New alt' },
        bubbles: true,
        composed: true,
      }),
    );
    await toolbar.updateComplete;

    let imgNode;
    editor.view.state.doc.descendants((node) => {
      if (node.type.name === 'image') imgNode = node;
    });
    expect(imgNode.attrs.alt).to.equal('New alt');
    expect(toolbar.altDialogOpen).to.be.false;
  });

  it('shows Replace image with the image icon only when an image is selected', async () => {
    toolbar.activeSurface = 'doc';
    await toolbar.updateComplete;

    let button = toolbar.shadowRoot.querySelector('button[data-id="image-add"]');
    expect(button.getAttribute('aria-label')).to.equal('Add image');
    expect(button.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-imageadd-20-n.svg#icon');

    selectImage();
    toolbar.requestUpdate();
    await toolbar.updateComplete;

    button = toolbar.shadowRoot.querySelector('button[data-id="image-add"]');
    expect(button.getAttribute('aria-label')).to.equal('Replace image');
    expect(button.getAttribute('title')).to.equal('Replace image');
    expect(button.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-image-20-n.svg#icon');
  });

  it('shows Replace image on the AEM Assets menu trigger for a selected image', async () => {
    selectImage();
    toolbar.activeSurface = 'doc';
    toolbar._hasAemAssets = true;
    await toolbar.updateComplete;

    const button = toolbar.shadowRoot.querySelector('nx-menu button[slot="trigger"][aria-label="Replace image"]');
    expect(button).to.exist;
    expect(button.getAttribute('title')).to.equal('Replace image');
    expect(button.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-image-20-n.svg#icon');
  });

  it('closes a menu when the toolbar is hidden', async () => {
    toolbar.activeSurface = 'doc';
    toolbar._hasAemAssets = true;
    await toolbar.updateComplete;

    const menu = toolbar.shadowRoot.querySelector('nx-menu');
    expect(menu).to.exist;
    menu.open = true;
    toolbar.hide();
    expect(menu.open).to.be.false;
  });

  it('opens the link dialog with show-title enabled', async () => {
    setText('hello');
    selectText(1, 6);
    toolbar.openLinkDialog(editor.view);
    await toolbar.updateComplete;
    const dialog = toolbar.shadowRoot.querySelector('da-link-dialog');
    expect(dialog.showTitle).to.be.true;
  });

  it('pre-fills the link title from the current selection', async () => {
    const { state } = editor.view;
    const linkMark = state.schema.marks.link.create({
      href: 'https://x.com',
      title: 'Existing',
    });
    const para = state.schema.nodes.paragraph.create(
      null,
      state.schema.text('hello', [linkMark]),
    );
    editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, para));
    editor.view.dispatch(
      editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 3)),
    );
    toolbar.openLinkDialog(editor.view);
    await toolbar.updateComplete;
    const dialog = toolbar.shadowRoot.querySelector('da-link-dialog');
    expect(dialog.anchorTitle).to.equal('Existing');
  });

  it('pre-fills the link title from a selected image', async () => {
    selectImage({ src: '/x.png', href: 'https://x.com', title: 'Existing' });
    toolbar.openLinkDialog(editor.view);
    await toolbar.updateComplete;
    const dialog = toolbar.shadowRoot.querySelector('da-link-dialog');
    expect(dialog.anchorTitle).to.equal('Existing');
  });

  it('writes a submitted link title onto the mark', async () => {
    setText('hello');
    selectText(1, 6);
    toolbar.openLinkDialog(editor.view);
    await toolbar.updateComplete;
    toolbar.shadowRoot.querySelector('da-link-dialog').dispatchEvent(
      new CustomEvent('da-link-submit', {
        detail: { href: 'https://x.com', text: 'hello', title: 'Tip' },
        bubbles: true,
        composed: true,
      }),
    );
    await toolbar.updateComplete;
    let mark;
    editor.view.state.doc.descendants((node) => {
      const m = editor.view.state.schema.marks.link.isInSet(node.marks);
      if (m) mark = m;
    });
    expect(mark.attrs.title).to.equal('Tip');
  });

  it('shows block-level controls in the doc surface', async () => {
    setText('hello');
    selectText(1, 6);
    toolbar.activeSurface = 'doc';
    await toolbar.updateComplete;

    expect(toolbar.shadowRoot.querySelector('.toolbar-block-type'), 'block-type picker').to.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="bullet-list"]'), 'bullet-list').to.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="strong"]'), 'strong').to.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="image-add"]'), 'add image').to.exist;
  });

  it('drops block-level controls but keeps inline marks in the wysiwyg surface', async () => {
    setText('hello');
    selectText(1, 6);
    toolbar.activeSurface = 'wysiwyg';
    await toolbar.updateComplete;

    expect(toolbar.shadowRoot.querySelector('.toolbar-block-type'), 'block-type picker').to.not.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="bullet-list"]'), 'bullet-list').to.not.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="image-add"]'), 'add image').to.not.exist;
    expect(toolbar.shadowRoot.querySelector('button[data-id="strong"]'), 'strong').to.exist;
  });

  it('shows Replace image for a selected image in the wysiwyg surface', async () => {
    selectImage();
    toolbar.activeSurface = 'wysiwyg';
    toolbar.requestUpdate();
    await toolbar.updateComplete;

    const button = toolbar.shadowRoot.querySelector('button[data-id="image-add"]');
    expect(button).to.exist;
    expect(button.getAttribute('aria-label')).to.equal('Replace image');
    expect(button.getAttribute('title')).to.equal('Replace image');
    expect(button.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-image-20-n.svg#icon');
  });

  it('shows Replace image on the AEM Assets trigger in the wysiwyg surface', async () => {
    selectImage();
    toolbar.activeSurface = 'wysiwyg';
    toolbar._hasAemAssets = true;
    toolbar.requestUpdate();
    await toolbar.updateComplete;

    const button = toolbar.shadowRoot.querySelector('nx-menu button[slot="trigger"][aria-label="Replace image"]');
    expect(button).to.exist;
    expect(button.querySelector('use').getAttribute('href'))
      .to.equal('/img/icons/s2-icon-image-20-n.svg#icon');
  });
});
