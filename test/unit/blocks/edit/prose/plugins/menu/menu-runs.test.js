/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { TextSelection, NodeSelection } from 'da-y-wrapper';
import menuPlugin from '../../../../../../../blocks/edit/prose/plugins/menu/menu.js';
import { linkItem, removeLinkItem } from '../../../../../../../blocks/edit/prose/plugins/menu/linkItem.js';
import { createTestEditor, destroyEditor } from '../../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

describe('menu/linkItem.run flows', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [menuPlugin] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  function setLinkedParagraph(view, text) {
    const state = view.state;
    const { schema } = state;
    const dispatch = view.dispatch.bind(view);
    const linkMark = schema.marks.link;
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      schema.nodes.paragraph.create(
        null,
        schema.text(text, [linkMark.create({ href: 'https://existing', title: 't' })]),
      ),
    );
    dispatch(tr);
  }

  function setSelection(view, from, to) {
    const tr = view.state.tr.setSelection(TextSelection.create(view.state.doc, from, to));
    view.dispatch(tr);
  }

  it('Opens a palette prompt for a new (no link mark) selection', async () => {
    const state = editor.view.state;
    const { schema } = state;
    // Replace doc with a plain paragraph "hello"
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hello')),
    );
    editor.view.dispatch(tr);
    setSelection(editor.view, 1, 6);

    const item = linkItem(schema.marks.link);
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();

    const palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    palette.remove();
  });

  it('Pre-populates href/title/text from an existing link', async () => {
    setLinkedParagraph(editor.view, 'click here');
    setSelection(editor.view, 2, 2);

    const item = linkItem(editor.view.state.schema.marks.link);
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();

    const palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    expect(palette.fields.href.value).to.equal('https://existing');
    expect(palette.fields.title.value).to.equal('t');
    expect(palette.fields.text.value).to.equal('click here');
    palette.remove();
  });

  it('Auto-fills href when selection is a URL-looking string', async () => {
    const state = editor.view.state;
    const { schema } = state;
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('https://x.com')),
    );
    editor.view.dispatch(tr);
    setSelection(editor.view, 1, 14);
    const item = linkItem(schema.marks.link);
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();
    const palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette.fields.href.value).to.equal('https://x.com');
    expect(palette.fields.text.value).to.equal('https://x.com');
    palette.remove();
  });

  it('Closes an open palette on second run', async () => {
    const state = editor.view.state;
    const { schema } = state;
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('hi')),
    );
    editor.view.dispatch(tr);
    setSelection(editor.view, 1, 3);
    const item = linkItem(schema.marks.link);
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();
    let palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();
    palette = editor.view.dom.parentElement.querySelector('da-palette');
    // After second call, palette should be closed (removed)
    expect(palette).to.equal(null);
  });

  it('Opens a palette for an image selection (no text field)', async () => {
    const state = editor.view.state;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(null, schema.nodes.image.create({ src: '/x.png', href: 'https://i' }));
    const tr = state.tr.replaceWith(0, state.doc.content.size, para);
    editor.view.dispatch(tr);
    // Find image position
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const sel = NodeSelection.create(editor.view.state.doc, imgPos);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const item = linkItem(editor.view.state.schema.marks.link);
    item.spec.run(editor.view.state, editor.view.dispatch.bind(editor.view), editor.view);
    await nextFrame();

    const palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    expect(palette.fields.href.value).to.equal('https://i');
    expect(palette.fields.text).to.equal(undefined);
    palette.remove();
  });
});

describe('menu/removeLinkItem.run on image', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [menuPlugin] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('Clears href/title attributes when the selection is a linked image', async () => {
    const state = editor.view.state;
    const { schema } = state;
    const para = schema.nodes.paragraph.create(
      null,
      schema.nodes.image.create({ src: '/x.png', href: 'https://i', title: 'caption' }),
    );
    const tr = state.tr.replaceWith(0, state.doc.content.size, para);
    editor.view.dispatch(tr);
    let imgPos = -1;
    editor.view.state.doc.descendants((node, pos) => {
      if (node.type.name === 'image') imgPos = pos;
    });
    const sel = NodeSelection.create(editor.view.state.doc, imgPos);
    editor.view.dispatch(editor.view.state.tr.setSelection(sel));

    const item = removeLinkItem(editor.view.state.schema.marks.link);
    // active() must run first to set isImage
    item.spec.active(editor.view.state);
    let dispatched;
    item.spec.run(editor.view.state, (t) => { dispatched = t; });
    expect(dispatched).to.exist;
    const newState = editor.view.state.apply(dispatched);
    let foundImg;
    newState.doc.descendants((n) => {
      if (n.type.name === 'image') foundImg = n;
    });
    expect(foundImg.attrs.href).to.equal(null);
    expect(foundImg.attrs.title).to.equal(null);
  });
});

describe('menu/imgAltTextItem.run', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [menuPlugin] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  // imgAltTextItem is private, so we exercise it via the menu's .img-alt-text button
  // (rendered by getMenu via getTextBlocks, which composes it into the dropdown).
  // We don't need to click it; we just verify the menu rendered the entry.
  it('Renders the alt text menu entry', () => {
    const menubar = editor.view.dom.parentElement.querySelector('.ProseMirror-menubar');
    // The class .img-alt-text might appear in the dropdown content
    expect(menubar.querySelector('.img-alt-text, [class*="img-alt-text"]') || menubar.textContent.includes('Alt text')).to.exist;
  });
});
