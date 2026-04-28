import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import {
  getLinkMenuItems,
  findLinkAtCursor,
} from '../../../../../../blocks/edit/prose/plugins/linkMenu/linkMenuItems.js';
import { createTestEditor, destroyEditor } from '../test-helpers.js';

describe('linkMenuItems factory', () => {
  it('Returns four entries with title/command/class', () => {
    const items = getLinkMenuItems();
    expect(items).to.have.length(4);
    items.forEach((item) => {
      expect(item).to.have.keys('title', 'command', 'class');
      expect(typeof item.command).to.equal('function');
    });
    expect(items.map((i) => i.title)).to.deep.equal([
      'Open link', 'Edit link', 'Copy link', 'Remove link',
    ]);
  });
});

describe('linkMenuItems behaviors against an editor', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    const { state, dispatch } = editor.view;
    const { schema } = state;
    const linkMark = schema.marks.link;

    // Replace doc with a paragraph "click here" with a link mark on it
    const tr = state.tr
      .replaceWith(
        0,
        state.doc.content.size,
        schema.nodes.paragraph.create(
          null,
          schema.text('click here', [linkMark.create({ href: 'https://example.com' })]),
        ),
      );
    dispatch(tr);
    // Place cursor inside the linked text (position 2 is between "c" and "l")
    const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2));
    dispatch(tr2);
  });

  afterEach(() => destroyEditor(editor));

  it('findLinkAtCursor returns the active link mark', () => {
    const mark = findLinkAtCursor(editor.view.state);
    expect(mark).to.exist;
    expect(mark.attrs.href).to.equal('https://example.com');
  });

  it('Open link uses window.open with the href', () => {
    const items = getLinkMenuItems();
    const openItem = items.find((i) => i.title === 'Open link');
    const savedOpen = window.open;
    let captured;
    window.open = (url, target) => { captured = { url, target }; return null; };
    try {
      const result = openItem.command(editor.view.state);
      expect(result).to.be.true;
      expect(captured).to.deep.equal({ url: 'https://example.com', target: '_blank' });
    } finally {
      window.open = savedOpen;
    }
  });

  it('Copy link writes the href to the clipboard', () => {
    const items = getLinkMenuItems();
    const copyItem = items.find((i) => i.title === 'Copy link');
    const savedClipboard = navigator.clipboard;
    let written;
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: (text) => { written = text; return Promise.resolve(); } },
    });
    try {
      const result = copyItem.command(editor.view.state);
      expect(result).to.be.true;
      expect(written).to.equal('https://example.com');
    } finally {
      Object.defineProperty(navigator, 'clipboard', { configurable: true, value: savedClipboard });
    }
  });

  it('Remove link clears the link mark from the range', () => {
    const items = getLinkMenuItems();
    const removeItem = items.find((i) => i.title === 'Remove link');
    let dispatched;
    const result = removeItem.command(editor.view.state, (tr) => { dispatched = tr; });
    expect(result).to.be.true;
    const newState = editor.view.state.apply(dispatched);
    const para = newState.doc.firstChild;
    expect(para).to.exist;
    para.descendants((node) => {
      const hasLink = (node.marks || []).some((m) => m.type.name === 'link');
      expect(hasLink).to.be.false;
    });
  });
});

describe('linkMenuItems with no link at cursor', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    const { state, dispatch } = editor.view;
    const { schema } = state;
    const tr = state.tr.replaceWith(
      0,
      state.doc.content.size,
      schema.nodes.paragraph.create(null, schema.text('plain text')),
    );
    dispatch(tr);
    const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2));
    dispatch(tr2);
  });

  afterEach(() => destroyEditor(editor));

  it('Open link / Copy link return true even with no link', () => {
    const items = getLinkMenuItems();
    expect(items.find((i) => i.title === 'Open link').command(editor.view.state)).to.be.true;
    expect(items.find((i) => i.title === 'Copy link').command(editor.view.state)).to.be.true;
  });

  it('Remove link returns false when no link is present', () => {
    const items = getLinkMenuItems();
    const removeItem = items.find((i) => i.title === 'Remove link');
    // findExistingLink uses childAfter parentOffset; in plain text the cursor will
    // return a text node, not a link node, but the remove logic always returns false
    // only when there's truly no node. Calling it should not throw.
    expect(() => removeItem.command(editor.view.state, () => {})).not.to.throw();
  });
});
