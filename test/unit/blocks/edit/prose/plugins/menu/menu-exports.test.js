import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import {
  getHeadingKeymap,
  insertSectionBreak,
} from '../../../../../../../blocks/edit/prose/plugins/menu/menu.js';
import { linkItem, removeLinkItem } from '../../../../../../../blocks/edit/prose/plugins/menu/linkItem.js';
import { createTestEditor, destroyEditor } from '../../test-helpers.js';

function setParagraph(view, text) {
  const { state, dispatch } = view;
  const tr = state.tr.replaceWith(
    0,
    state.doc.content.size,
    state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null),
  );
  dispatch(tr);
}

describe('menu/menu exports', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  describe('getHeadingKeymap', () => {
    it('Returns a keymap with Mod-Alt-0 .. Mod-Alt-6', () => {
      const km = getHeadingKeymap(editor.view.state.schema);
      expect(Object.keys(km)).to.deep.equal([
        'Mod-Alt-0', 'Mod-Alt-1', 'Mod-Alt-2', 'Mod-Alt-3', 'Mod-Alt-4', 'Mod-Alt-5', 'Mod-Alt-6',
      ]);
      Object.values(km).forEach((fn) => expect(typeof fn).to.equal('function'));
    });

    it('Mod-Alt-1 toggles current paragraph to a heading level 1', () => {
      setParagraph(editor.view, 'hello');
      const tr0 = editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 1, editor.view.state.doc.content.size - 1),
      );
      editor.view.dispatch(tr0);

      const km = getHeadingKeymap(editor.view.state.schema);
      let dispatched;
      const result = km['Mod-Alt-1'](editor.view.state, (tr) => { dispatched = tr; });
      expect(result).to.be.true;
      const newState = editor.view.state.apply(dispatched);
      const heading = newState.doc.firstChild;
      expect(heading.type.name).to.equal('heading');
      expect(heading.attrs.level).to.equal(1);
    });

    it('Mod-Alt-0 reverts a heading back to a paragraph', () => {
      const { schema } = editor.view.state;
      const tr = editor.view.state.tr.replaceWith(
        0,
        editor.view.state.doc.content.size,
        schema.nodes.heading.create({ level: 2 }, schema.text('hi')),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 1, editor.view.state.doc.content.size - 1),
      );
      editor.view.dispatch(tr2);

      const km = getHeadingKeymap(editor.view.state.schema);
      let dispatched;
      km['Mod-Alt-0'](editor.view.state, (t) => { dispatched = t; });
      const newState = editor.view.state.apply(dispatched);
      expect(newState.doc.firstChild.type.name).to.equal('paragraph');
    });
  });

  describe('insertSectionBreak', () => {
    it('Inserts a horizontal_rule + paragraph at the selection', () => {
      setParagraph(editor.view, 'one');
      let dispatched;
      insertSectionBreak(editor.view.state, (tr) => { dispatched = tr; });
      const newState = editor.view.state.apply(dispatched);
      let hasHr = false;
      newState.doc.descendants((node) => {
        if (node.type.name === 'horizontal_rule') hasHr = true;
      });
      expect(hasHr).to.be.true;
    });
  });
});

describe('menu/linkItem exports', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
  });

  afterEach(() => destroyEditor(editor));

  describe('linkItem', () => {
    it('active() reflects whether the cursor is on a link mark', () => {
      const { state, schema } = editor.view.state.schema
        ? { state: editor.view.state, schema: editor.view.state.schema }
        : { state: editor.view.state, schema: editor.view.state.schema };
      const linkMark = schema.marks.link;
      const tr = state.tr.replaceWith(
        0,
        state.doc.content.size,
        schema.nodes.paragraph.create(
          null,
          schema.text('linked', [linkMark.create({ href: 'https://x' })]),
        ),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2));
      editor.view.dispatch(tr2);

      const item = linkItem(linkMark);
      expect(item.spec.active(editor.view.state)).to.be.true;
    });

    it('enable() is false when an image is in the selection', () => {
      const { schema } = editor.view.state;
      const linkMark = schema.marks.link;
      const tr = editor.view.state.tr.replaceWith(
        0,
        editor.view.state.doc.content.size,
        schema.nodes.paragraph.create(null, [
          schema.text('hi'),
          schema.nodes.image.create({ src: '/x.png' }),
        ]),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(
        TextSelection.create(editor.view.state.doc, 1, editor.view.state.doc.content.size - 1),
      );
      editor.view.dispatch(tr2);
      const item = linkItem(linkMark);
      expect(item.spec.enable(editor.view.state)).to.be.false;
    });
  });

  describe('removeLinkItem', () => {
    it('active() returns true for a cursor on a linked text', () => {
      const { state } = editor.view;
      const { schema } = state;
      const linkMark = schema.marks.link;
      const tr = state.tr.replaceWith(
        0,
        state.doc.content.size,
        schema.nodes.paragraph.create(
          null,
          schema.text('linked', [linkMark.create({ href: 'https://x' })]),
        ),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2, 4));
      editor.view.dispatch(tr2);
      const item = removeLinkItem(linkMark);
      expect(item.spec.active(editor.view.state)).to.be.true;
    });

    it('active() returns false on plain text', () => {
      const { state } = editor.view;
      const linkMark = state.schema.marks.link;
      const tr = state.tr.replaceWith(
        0,
        state.doc.content.size,
        state.schema.nodes.paragraph.create(null, state.schema.text('plain')),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 1, 4));
      editor.view.dispatch(tr2);
      const item = removeLinkItem(linkMark);
      expect(item.spec.active(editor.view.state)).to.be.false;
    });

    it('run() removes the link mark from the linked range', () => {
      const { state } = editor.view;
      const { schema } = state;
      const linkMark = schema.marks.link;
      const tr = state.tr.replaceWith(
        0,
        state.doc.content.size,
        schema.nodes.paragraph.create(
          null,
          schema.text('linked', [linkMark.create({ href: 'https://x' })]),
        ),
      );
      editor.view.dispatch(tr);
      const tr2 = editor.view.state.tr.setSelection(TextSelection.create(editor.view.state.doc, 2, 4));
      editor.view.dispatch(tr2);
      const item = removeLinkItem(linkMark);
      // active() must run first to set isImage
      item.spec.active(editor.view.state);
      let dispatched;
      item.spec.run(editor.view.state, (t) => { dispatched = t; });
      const newState = editor.view.state.apply(dispatched);
      let foundLink = false;
      newState.doc.descendants((node) => {
        if (node.isText && (node.marks || []).some((m) => m.type.name === 'link')) {
          foundLink = true;
        }
      });
      expect(foundLink).to.be.false;
    });
  });
});
