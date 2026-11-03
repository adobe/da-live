/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { sendKeys } from '@web/test-runner-commands';
import { TextSelection, NodeSelection, keymap, tableEditing } from 'da-y-wrapper';
import menuPlugin from '../../../../../../../blocks/edit/prose/plugins/menu/menu.js';
import { linkItem, removeLinkItem } from '../../../../../../../blocks/edit/prose/plugins/menu/linkItem.js';
import { handleTableTab } from '../../../../../../../blocks/edit/prose/plugins/keyHandlers.js';
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
    const { state } = view;
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
    const { state } = editor.view;
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
    const { state } = editor.view;
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
    const { state } = editor.view;
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
    const { state } = editor.view;
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
    const { state } = editor.view;
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
  let shadowHost;

  beforeEach(async () => {
    editor = await createTestEditor({ additionalPlugins: [menuPlugin, keymap({ 'Shift-Tab': handleTableTab(-1) }), tableEditing()] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    shadowHost?.remove();
    shadowHost = null;
    delete window.view;
  });

  function setImage({ inTable = false, imageOnly = false, alt = 'Original' } = {}) {
    const { state, dispatch } = editor.view;
    const { schema } = state;
    const image = schema.nodes.image.create({ src: 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=', alt });
    const contents = imageOnly ? [image] : [schema.text('a'), image, schema.text('b')];
    const paragraph = schema.nodes.paragraph.create(null, contents);
    const content = inTable
      ? schema.nodes.table.create(null, schema.nodes.table_row.create(null, [
        schema.nodes.table_cell.create(null, schema.nodes.paragraph.create()),
        schema.nodes.table_cell.create(null, paragraph),
      ]))
      : paragraph;
    dispatch(state.tr.replaceWith(0, state.doc.content.size, content));
    let pos;
    editor.view.state.doc.descendants((node, nodePos) => {
      if (node.type.name === 'image') pos = nodePos;
    });
    return pos;
  }

  function button() {
    return editor.view.dom.parentElement.querySelector('.img-alt-text');
  }

  async function shiftTab() {
    await sendKeys({ down: 'Shift' });
    try {
      await sendKeys({ press: 'Tab' });
    } finally {
      await sendKeys({ up: 'Shift' });
    }
  }

  it('shows an enabled native button only when an image is selected', () => {
    const pos = setImage();
    expect(button().tagName).to.equal('BUTTON');
    expect(button().disabled).to.be.true;
    const selection = NodeSelection.create(editor.view.state.doc, pos);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
    expect(button().disabled).to.be.false;
    expect(button().textContent).to.equal('Alt text');
    const textSelection = TextSelection.create(editor.view.state.doc, pos);
    editor.view.dispatch(editor.view.state.tr.setSelection(textSelection));
    expect(button().disabled).to.be.true;
  });

  [false, true].forEach((inTable) => {
    it(`selects and edits an image with the keyboard${inTable ? ' inside a table' : ''}`, async () => {
      const pos = setImage({ inTable });
      editor.view.focus();
      const selection = TextSelection.create(editor.view.state.doc, pos);
      editor.view.dispatch(editor.view.state.tr.setSelection(selection));

      await sendKeys({ press: 'ArrowRight' });
      expect(editor.view.state.selection.node?.type.name).to.equal('image');
      await shiftTab();
      expect(document.activeElement).to.equal(button());
      await sendKeys({ press: 'Enter' });

      const palette = editor.view.dom.parentElement.querySelector('da-palette');
      expect(palette).to.exist;
      await palette.updateComplete;
      const input = palette.shadowRoot.querySelector('input');
      const label = palette.shadowRoot.querySelector('label');
      expect(label.htmlFor).to.equal(input.id);
      expect(input.value).to.equal('Original');
      expect(palette.shadowRoot.activeElement).to.equal(input);
      await sendKeys({ press: 'End' });
      await sendKeys({ down: 'Shift' });
      await sendKeys({ press: 'Home' });
      await sendKeys({ up: 'Shift' });
      await sendKeys({ type: 'Updated description' });
      await sendKeys({ press: 'Enter' });

      expect(editor.view.state.doc.nodeAt(pos).attrs.alt).to.equal('Updated description');
      expect(editor.view.hasFocus()).to.be.true;
      expect(editor.view.dom.parentElement.querySelector('da-palette')).to.not.exist;
    });
  });

  it('allows keyboard selection of an image that is alone in its paragraph', async () => {
    const pos = setImage({ imageOnly: true });
    editor.view.focus();
    const selection = TextSelection.create(editor.view.state.doc, pos);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
    await sendKeys({ press: 'ArrowRight' });
    expect(editor.view.state.selection.node?.type.name).to.equal('image');
    await shiftTab();
    expect(document.activeElement).to.equal(button());
  });

  describe('vertical arrow navigation', () => {
    const SRC = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"/>';
    const p = (...content) => editor.view.state.schema.nodes.paragraph.create(null, content);
    const text = (value) => editor.view.state.schema.text(value);
    const img = () => editor.view.state.schema.nodes.image.create({ src: SRC, alt: 'x' });
    const cell = (...content) => editor.view.state.schema.nodes.table_cell.create(null, content);
    const row = (...cells) => editor.view.state.schema.nodes.table_row.create(null, cells);

    async function setDoc(nodes, cursor) {
      const { state } = editor.view;
      editor.view.dispatch(state.tr.replaceWith(0, state.doc.content.size, nodes));
      await nextFrame();
      editor.view.focus();
      const caret = TextSelection.create(editor.view.state.doc, cursor);
      editor.view.dispatch(editor.view.state.tr.setSelection(caret));
    }

    async function press(key) {
      await sendKeys({ press: key });
      const { selection } = editor.view.state;
      return selection.node ? `image@${selection.from}` : `caret@${selection.from}`;
    }

    it('selects images alone in their paragraph with ArrowDown and ArrowUp', async () => {
      // first(0-7) img(7-10) img(10-13) last(13-19)
      await setDoc([p(text('first')), p(img()), p(img()), p(text('last'))], 3);
      expect(await press('ArrowDown')).to.equal('image@8');
      expect(button().disabled).to.be.false;
      expect(await press('ArrowDown')).to.equal('image@11');
      expect(await press('ArrowDown')).to.match(/^caret@1[4-8]$/);
      expect(await press('ArrowUp')).to.equal('image@11');
      expect(await press('ArrowUp')).to.equal('image@8');
      expect(await press('ArrowUp')).to.match(/^caret@[1-6]$/);
    });

    it('keeps the native caret for images inline with text', async () => {
      await setDoc([p(text('first')), p(text('a '), img(), text(' b')), p(text('last'))], 3);
      expect(await press('ArrowDown')).to.match(/^caret@/);
      expect(await press('ArrowDown')).to.match(/^caret@/);
    });

    it('selects images reached through table cell navigation', async () => {
      const table = editor.view.state.schema.nodes.table.create(null, [
        row(cell(p(text('hero'))), cell(p(text('x')))),
        row(cell(p(img())), cell(p(text('y')))),
        row(cell(p(text('z'))), cell(p(text('w')))),
      ]);
      await setDoc([table, p(text('after'))], 4);
      // table(0) row(1) cell(2) p(3) "hero"... row(16) cell(17) p(18) image(19)
      const imagePos = 19;
      expect(editor.view.state.doc.nodeAt(imagePos).type.name).to.equal('image');
      expect(await press('ArrowDown')).to.equal(`image@${imagePos}`);
      expect(await press('ArrowDown')).to.equal('caret@31');
      expect(editor.view.state.selection.$from.parent.textContent).to.equal('z');
      expect(await press('ArrowUp')).to.equal(`image@${imagePos}`);
    });

    it('selects an image reached by native caret movement into a table', async () => {
      const table = editor.view.state.schema.nodes.table.create(null, [
        row(cell(p(img())), cell(p(text('x')))),
      ]);
      // before(0-8) table(8) row(9) cell(10) p(11) image(12)
      await setDoc([p(text('before')), table], 1);
      expect(await press('ArrowDown')).to.equal('image@12');
    });
  });

  it('keeps Shift+Tab table navigation for a text selection', async () => {
    const pos = setImage({ inTable: true });
    editor.view.focus();
    const selection = TextSelection.create(editor.view.state.doc, pos - 1);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
    await shiftTab();
    expect(editor.view.hasFocus()).to.be.true;
    expect(editor.view.state.selection.from).to.be.lessThan(pos - 1);
  });

  it('exposes and visibly focuses the button with the editor shadow DOM and styles', async () => {
    const css = await (await fetch('/blocks/edit/da-editor/da-editor.css')).text();
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(css);
    shadowHost = document.createElement('div');
    document.body.append(shadowHost);
    const root = shadowHost.attachShadow({ mode: 'open' });
    root.adoptedStyleSheets = [sheet];
    root.append(editor.view.dom.parentElement);
    editor.view.updateRoot();
    const pos = setImage();
    expect(getComputedStyle(button().parentElement).display).to.equal('none');

    editor.view.focus();
    const selection = TextSelection.create(editor.view.state.doc, pos);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
    await sendKeys({ press: 'ArrowRight' });
    await shiftTab();
    expect(root.activeElement).to.equal(button());
    expect(getComputedStyle(button().parentElement).display).to.not.equal('none');
    expect(getComputedStyle(button()).outlineStyle).to.equal('solid');
    await sendKeys({ press: 'Enter' });
    const palette = root.querySelector('da-palette');
    expect(palette).to.exist;
    await palette.updateComplete;
    expect(palette.shadowRoot.activeElement.tagName).to.equal('INPUT');
    await sendKeys({ press: 'End' });
    await sendKeys({ type: ' updated' });
    await sendKeys({ press: 'Enter' });
    expect(editor.view.state.doc.nodeAt(pos).attrs.alt).to.equal('Original updated');
    expect(root.activeElement).to.equal(editor.view.dom);
  });

  it('opens with Space and keeps mouse activation working', async () => {
    const pos = setImage();
    const selection = NodeSelection.create(editor.view.state.doc, pos);
    editor.view.dispatch(editor.view.state.tr.setSelection(selection));
    button().focus();
    await sendKeys({ press: 'Space' });
    let palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    await palette.updateComplete;
    await sendKeys({ press: 'Escape' });
    expect(editor.view.hasFocus()).to.be.true;

    button().dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    button().click();
    palette = editor.view.dom.parentElement.querySelector('da-palette');
    expect(palette).to.exist;
    await palette.updateComplete;
    expect(palette.shadowRoot.querySelector('input').value).to.equal('Original');
  });
});
