/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { TextSelection } from 'da-y-wrapper';
import slashMenuPluginFactory from '../../../../../../../blocks/edit/prose/plugins/slashMenu/slashMenu.js';
import '../../../../../../../blocks/edit/prose/plugins/slashMenu/slash-menu.js';
import { createTestEditor, destroyEditor } from '../../test-helpers.js';

const nextFrame = () => new Promise((resolve) => { setTimeout(resolve, 0); });

function setParagraph(view, text) {
  const { state, dispatch } = view;
  const tr = state.tr.replaceWith(
    0,
    state.doc.content.size,
    state.schema.nodes.paragraph.create(null, text ? state.schema.text(text) : null),
  );
  dispatch(tr);
}

describe('slashMenu plugin mount', () => {
  let editor;
  let plugin;

  beforeEach(async () => {
    plugin = slashMenuPluginFactory();
    editor = await createTestEditor({ additionalPlugins: [plugin] });
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('Appends a slash-menu element to the editor parent on mount', () => {
    const slashMenu = editor.view.dom.parentNode.querySelector('slash-menu');
    expect(slashMenu).to.exist;
    expect(slashMenu.items?.length).to.be.greaterThan(0);
  });

  it('Resets to default items on reset-slashmenu event', async () => {
    const slashMenu = editor.view.dom.parentNode.querySelector('slash-menu');
    slashMenu.items = [{ title: 'temp', class: 'x' }];
    slashMenu.dispatchEvent(new CustomEvent('reset-slashmenu'));
    expect(slashMenu.items.length).to.be.greaterThan(1);
    expect(slashMenu.left).to.equal(0);
    expect(slashMenu.top).to.equal(0);
  });

  it('Shows menu when typing "/" inside a paragraph', async () => {
    setParagraph(editor.view, '/');
    await nextFrame();
    // Position cursor at end of "/"
    const tr = editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, editor.view.state.doc.content.size - 1),
    );
    editor.view.dispatch(tr);
    await nextFrame();
    const slashMenu = editor.view.dom.parentNode.querySelector('slash-menu');
    expect(slashMenu.visible).to.be.true;
  });

  it('Hides menu when no slash prefix is present', async () => {
    setParagraph(editor.view, 'plain');
    await nextFrame();
    const tr = editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, editor.view.state.doc.content.size - 1),
    );
    editor.view.dispatch(tr);
    await nextFrame();
    const slashMenu = editor.view.dom.parentNode.querySelector('slash-menu');
    expect(slashMenu.visible).to.equal(false);
  });

  it('handleKeyDown prevents default for navigation keys when menu is visible', async () => {
    setParagraph(editor.view, '/');
    await nextFrame();
    const tr = editor.view.state.tr.setSelection(
      TextSelection.create(editor.view.state.doc, editor.view.state.doc.content.size - 1),
    );
    editor.view.dispatch(tr);
    await nextFrame();
    const slashMenu = editor.view.dom.parentNode.querySelector('slash-menu');
    expect(slashMenu.visible).to.be.true;
    let prevented = false;
    let stopped = false;
    const handled = plugin.props.handleKeyDown(editor.view, {
      key: 'ArrowDown',
      preventDefault: () => { prevented = true; },
      stopPropagation: () => { stopped = true; },
    });
    expect(handled).to.be.true;
    expect(prevented).to.be.true;
    expect(stopped).to.be.true;
  });

  it('handleKeyDown does not block other keys when menu hidden', async () => {
    let prevented = false;
    const handled = plugin.props.handleKeyDown(editor.view, {
      key: 'a',
      preventDefault: () => { prevented = true; },
      stopPropagation: () => {},
    });
    expect(handled).to.be.false;
    expect(prevented).to.be.false;
  });
});

describe('slash-menu element behaviors', () => {
  let editor;

  beforeEach(async () => {
    editor = await createTestEditor();
    window.view = editor.view;
    await nextFrame();
  });

  afterEach(() => {
    destroyEditor(editor);
    delete window.view;
  });

  it('getFilteredItems narrows the list by command text', () => {
    const slashMenu = document.createElement('slash-menu');
    slashMenu.items = [
      { title: 'Heading 1', class: 'menu-item-h1' },
      { title: 'Bullet list', class: 'bullet-list' },
      { title: 'Block', class: 'insert-table' },
    ];
    slashMenu.command = 'head';
    expect(slashMenu.getFilteredItems()).to.have.length(1);
    expect(slashMenu.getFilteredItems()[0].title).to.equal('Heading 1');
  });

  it('getFilteredItems with empty command returns all items, sorted', () => {
    const slashMenu = document.createElement('slash-menu');
    slashMenu.items = [
      { title: 'Bullet list', class: 'bullet-list' },
      { title: 'Block', class: 'insert-table' },
    ];
    slashMenu.command = '';
    const filtered = slashMenu.getFilteredItems();
    expect(filtered).to.have.length(2);
  });

  it('hide dispatches reset-slashmenu and resets command', () => {
    const slashMenu = document.createElement('slash-menu');
    slashMenu.items = [{ title: 'Heading 1', class: 'menu-item-h1' }];
    slashMenu.command = 'head';
    let received = false;
    slashMenu.addEventListener('reset-slashmenu', () => { received = true; });
    slashMenu.hide();
    expect(received).to.be.true;
    expect(slashMenu.command).to.equal('');
  });
});
