import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import * as proseMirror from 'da-y-wrapper';
import FormRichText from '../../../../../blocks/form/fields/rich-text.js';

const { loadEditor } = FormRichText;

// Concurrent test pages run in the background, where animation frames never fire.
const tick = () => new Promise((resolve) => { setTimeout(resolve); });

const until = (check, tries = 100) => (check() || !tries
  ? Promise.resolve()
  : new Promise((resolve) => { setTimeout(resolve, 20); }).then(() => until(check, tries - 1)));

async function mount({ value = '', loadEditor: loader, width, ...properties } = {}) {
  if (loader) FormRichText.loadEditor = loader;
  const richText = document.createElement('form-rich-text');
  Object.assign(richText, { value, ...properties });
  if (width) richText.style.width = width;
  document.body.append(richText);
  await richText.updateComplete;
  await tick();
  await richText.updateComplete;
  return richText;
}

const content = (richText) => richText.shadowRoot.querySelector('.form-rich-text-content');
const toolbar = (richText) => richText.shadowRoot.querySelector('form-rich-text-toolbar:not([floating])');
const tool = (richText, id) => toolbar(richText).shadowRoot.querySelector(`[data-tool="${id}"]`);
const blockPicker = (richText) => toolbar(richText).shadowRoot.querySelector('nx-picker');

async function openMenu(richText, host = toolbar(richText)) {
  host.shadowRoot.querySelector('[data-more]').click();
  await until(() => host.shadowRoot.querySelector('.form-rich-text-menu [data-tool]'));
  await richText.updateComplete;
}

// Concurrent test pages can blur the window, so tests refocus before reading focus state.
async function refocus(richText) {
  content(richText).dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
  await richText.updateComplete;
}

async function pressed(richText, id) {
  await refocus(richText);
  return tool(richText, id).getAttribute('aria-pressed');
}

async function holdFocus(richText) {
  Object.defineProperty(richText, '_focused', { get: () => true, set: () => {} });
  richText.requestUpdate();
  await richText.updateComplete;
}

const floating = (richText) => richText.shadowRoot.querySelector('.form-rich-text-bubble');
const floatingTool = (richText, id) => floating(richText).shadowRoot.querySelector(`[data-tool="${id}"]`);
const visibleIds = (host) => [...host.shadowRoot.querySelectorAll('[data-tool]:not(.is-hidden)')]
  .map((button) => button.dataset.tool);

function selectRange(richText, from, to = from) {
  const { state } = richText._view;
  const selection = proseMirror.TextSelection.create(state.doc, from, to);
  richText._view.dispatch(state.tr.setSelection(selection));
}

function selectAll(richText) {
  selectRange(richText, 1, richText._view.state.doc.content.size - 1);
}

describe('form-rich-text', () => {
  afterEach(() => {
    FormRichText.loadEditor = loadEditor;
    document.body.querySelectorAll('form-rich-text').forEach((richText) => richText.remove());
  });

  it('renders the value into an accessible editor', async () => {
    const richText = await mount({ value: '<p>Hello <strong>world</strong></p>', label: 'Body' });
    const editor = content(richText);
    expect(editor.getAttribute('contenteditable')).to.equal('true');
    expect(editor.getAttribute('role')).to.equal('textbox');
    expect(editor.getAttribute('aria-labelledby')).to.equal('form-rich-text-label');
    expect(editor.innerHTML).to.contain('<strong>world</strong>');
  });

  it('emits canonical HTML on input without resetting the editor', async () => {
    const richText = await mount({ value: '<p>Hi</p>' });
    let emitted;
    richText.addEventListener('input', (event) => { emitted = event.target.value; });
    const view = richText._view;
    view.dispatch(view.state.tr.insertText('!', 3));
    expect(emitted).to.equal('<p>Hi!</p>');
    const stateAfterInput = view.state;
    await richText.updateComplete;
    expect(view.state).to.equal(stateAfterInput);
  });

  it('emits only its own input events', async () => {
    const richText = await mount({ value: '<p>Hi</p>' });
    const values = [];
    richText.addEventListener('input', (event) => values.push(event.target.value));
    content(richText).dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    richText._view.dispatch(richText._view.state.tr.insertText('!', 3));
    expect(values).to.deep.equal(['<p>Hi!</p>']);
  });

  it('replaces the document when the value changes externally', async () => {
    const richText = await mount({ value: '<p>One</p>' });
    richText.value = '<ul><li>Two</li></ul>';
    await richText.updateComplete;
    expect(content(richText).innerHTML).to.contain('<li>');
    expect(content(richText).textContent).to.equal('Two');
  });

  it('applies marks and lists from the toolbar', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    selectAll(richText);
    tool(richText, 'strong').click();
    expect(richText.value).to.equal('<p><strong>text</strong></p>');
    await richText.updateComplete;
    expect(await pressed(richText, 'strong')).to.equal('true');
    tool(richText, 'ordered_list').click();
    expect(richText.value).to.equal('<ol><li><p><strong>text</strong></p></li></ol>');
  });

  it('toggles every mark on and off from the toolbar', async () => {
    const marks = {
      strong: 'strong', em: 'em', code: 'code', u: 'u', del: 'del', sup: 'sup', sub: 'sub',
    };
    const richText = await mount({ value: '<p>text</p>' });
    richText.focus();
    await openMenu(richText);
    for (const [id, tag] of Object.entries(marks)) {
      selectAll(richText);
      tool(richText, id).click();
      expect(richText.value, id).to.equal(`<p><${tag}>text</${tag}></p>`);
      await richText.updateComplete; // eslint-disable-line no-await-in-loop
      expect(await pressed(richText, id), id).to.equal('true');
      tool(richText, id).click();
      expect(richText.value, id).to.equal('<p>text</p>');
      await richText.updateComplete; // eslint-disable-line no-await-in-loop
      expect(await pressed(richText, id), id).to.equal('false');
    }
  });

  it('toggles and switches both list types from the toolbar', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    richText.focus();
    selectAll(richText);
    tool(richText, 'bullet_list').click();
    expect(richText.value).to.equal('<ul><li><p>text</p></li></ul>');
    await richText.updateComplete;
    expect(await pressed(richText, 'bullet_list')).to.equal('true');
    tool(richText, 'ordered_list').click();
    expect(richText.value).to.equal('<ol><li><p>text</p></li></ol>');
    await richText.updateComplete;
    expect(await pressed(richText, 'bullet_list')).to.equal('false');
    expect(await pressed(richText, 'ordered_list')).to.equal('true');
    tool(richText, 'ordered_list').click();
    expect(richText.value).to.equal('<p>text</p>');
  });

  it('applies every block type from the picker', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    const picker = blockPicker(richText);
    const pick = (value) => picker.dispatchEvent(new CustomEvent('change', { detail: { value } }));
    [1, 2, 3, 4, 5, 6].forEach((level) => {
      pick(`heading-${level}`);
      expect(richText.value).to.equal(`<h${level}>text</h${level}>`);
    });
    pick('paragraph');
    expect(richText.value).to.equal('<p>text</p>');
  });

  const isMac = /Mac|iPhone|iPad/.test(navigator.platform);

  function press(richText, key, { shift = false, control = false, primary = !control } = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      shiftKey: shift,
      ctrlKey: control || (primary && !isMac),
      metaKey: primary && isMac,
      bubbles: true,
      cancelable: true,
    });
    content(richText).dispatchEvent(event);
    return event.defaultPrevented;
  }

  it('applies marks from keyboard shortcuts', async () => {
    const shortcuts = [['b', 'strong'], ['i', 'em'], ['`', 'code']];
    const richText = await mount({ value: '<p>text</p>' });
    shortcuts.forEach(([key, tag]) => {
      selectAll(richText);
      expect(press(richText, key), key).to.be.true;
      expect(richText.value, key).to.equal(`<p><${tag}>text</${tag}></p>`);
      press(richText, key);
      expect(richText.value, key).to.equal('<p>text</p>');
    });
  });

  it('changes blocks, lists and quotes from keyboard shortcuts', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    selectAll(richText);
    const controlShift = { control: true, shift: true };
    press(richText, '3', controlShift);
    expect(richText.value).to.equal('<h3>text</h3>');
    press(richText, '0', controlShift);
    expect(richText.value).to.equal('<p>text</p>');
    press(richText, '>', controlShift);
    expect(richText.value).to.equal('<blockquote><p>text</p></blockquote>');
    press(richText, '>', controlShift);
    expect(richText.value).to.equal('<p>text</p>');
    press(richText, '8', controlShift);
    expect(richText.value).to.equal('<ul><li><p>text</p></li></ul>');
    press(richText, '9', controlShift);
    expect(richText.value).to.equal('<ol><li><p>text</p></li></ol>');
    press(richText, '9', controlShift);
    expect(richText.value).to.equal('<p>text</p>');
  });

  it('indents and outdents list items with Tab', async () => {
    const richText = await mount({ value: '<ul><li>a</li><li>b</li></ul>' });
    selectRange(richText, 8);
    expect(press(richText, 'Tab', { primary: false })).to.be.true;
    expect(richText.value).to.equal('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
    press(richText, 'Tab', { shift: true, primary: false });
    expect(richText.value).to.equal('<ul><li><p>a</p></li><li><p>b</p></li></ul>');
  });

  it('inserts a line break from the keyboard', async () => {
    const richText = await mount({ value: '<p>site</p>' });
    selectRange(richText, 3);
    press(richText, 'Enter', { shift: true, primary: false });
    expect(richText.value).to.equal('<p>si<br>te</p>');
  });

  it('applies code, superscript, subscript and blockquote from the toolbar', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    await openMenu(richText);
    selectAll(richText);
    tool(richText, 'code').click();
    expect(richText.value).to.equal('<p><code>text</code></p>');
    tool(richText, 'sup').click();
    expect(richText.value).to.equal('<p><sup><code>text</code></sup></p>');
    tool(richText, 'sub').click();
    expect(richText.value).to.equal('<p><sub><code>text</code></sub></p>');
    tool(richText, 'blockquote').click();
    expect(richText.value).to.equal('<blockquote><p><sub><code>text</code></sub></p></blockquote>');
    await richText.updateComplete;
    expect(await pressed(richText, 'blockquote')).to.equal('true');
    tool(richText, 'blockquote').click();
    expect(richText.value).to.equal('<p><sub><code>text</code></sub></p>');
  });

  it('changes the block type from the picker', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    const picker = blockPicker(richText);
    expect(picker.value).to.equal('paragraph');
    picker.dispatchEvent(new CustomEvent('change', { detail: { value: 'heading-2' } }));
    expect(richText.value).to.equal('<h2>text</h2>');
    await refocus(richText);
    expect(picker.value).to.equal('heading-2');
    expect(picker.inert).to.be.false;
  });

  it('reflects the selection in the toolbar only while focused', async () => {
    const richText = await mount({ value: '<h1><u>Title</u></h1><p><a href="/a">x</a></p>' });
    const picker = blockPicker(richText);
    const underline = () => tool(richText, 'u').getAttribute('aria-pressed');
    expect(underline()).to.equal('false');
    expect(picker.value).to.equal('paragraph');
    await refocus(richText);
    expect(underline()).to.equal('true');
    expect(picker.value).to.equal('heading-1');
    content(richText).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await richText.updateComplete;
    expect(underline()).to.equal('false');
    expect(tool(richText, 'unlink').classList.contains('is-hidden')).to.be.true;
  });

  it('disables the block type picker inside lists', async () => {
    const richText = await mount({ value: '<ul><li>text</li></ul>' });
    content(richText).dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    await richText.updateComplete;
    const picker = blockPicker(richText);
    expect(picker.inert).to.be.true;
    expect(picker.closest('.form-rich-text-picker').classList.contains('is-disabled')).to.be.true;
  });

  it('keeps the selection when a toolbar button is pressed', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    const event = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    tool(richText, 'em').dispatchEvent(event);
    expect(event.defaultPrevented).to.be.true;
  });

  async function openLinkDialog(richText, trigger = () => tool(richText, 'link').click()) {
    trigger();
    const find = () => richText.shadowRoot.querySelector('da-link-dialog');
    for (let attempt = 0; attempt < 50 && !find(); attempt += 1) {
      await tick(); // eslint-disable-line no-await-in-loop
    }
    const dialog = find();
    await dialog?.updateComplete;
    const field = (name) => dialog.shadowRoot.querySelector(`[name="${name}"]`);
    const button = (label) => [...dialog.shadowRoot.querySelectorAll('button')]
      .find((candidate) => candidate.textContent.trim() === label);
    return { dialog, field, button };
  }

  it('adds a link from the shared link dialog', async () => {
    const richText = await mount({ value: '<p>site</p>' });
    selectAll(richText);
    let closes = 0;
    richText.addEventListener('close', () => { closes += 1; });
    const { dialog, field, button } = await openLinkDialog(richText);
    expect(dialog.open).to.be.true;
    expect(field('link-href').value).to.equal('');
    expect(field('link-text').value).to.equal('site');
    expect(field('link-title').value).to.equal('');
    expect(await pressed(richText, 'link')).to.equal('true');
    field('link-href').value = 'https://example.com';
    field('link-title').value = 'Example';
    button('Save').click();
    await richText.updateComplete;
    expect(richText.value).to.equal('<p><a href="https://example.com" title="Example">site</a></p>');
    expect(richText.shadowRoot.querySelector('da-link-dialog')).to.equal(null);
    expect(closes).to.equal(0);
  });

  it('edits the link under the caret with Mod-K', async () => {
    const richText = await mount({ value: '<p>a <a href="/a" title="Old">site</a></p>' });
    selectRange(richText, 5);
    const shortcut = new KeyboardEvent('keydown', { key: 'k', ctrlKey: !isMac, metaKey: isMac, bubbles: true, cancelable: true });
    const pressShortcut = () => content(richText).dispatchEvent(shortcut);
    const { field, button } = await openLinkDialog(richText, pressShortcut);
    expect(shortcut.defaultPrevented).to.be.true;
    expect(field('link-href').value).to.equal('/a');
    expect(field('link-text').value).to.equal('site');
    expect(field('link-title').value).to.equal('Old');
    field('link-text').value = 'page';
    button('Save').click();
    expect(richText.value).to.equal('<p>a <a href="/a" title="Old">page</a></p>');
  });

  it('rejects unsafe links in the dialog and keeps the content', async () => {
    const richText = await mount({ value: '<p><a href="/a">site</a></p>' });
    selectAll(richText);
    const { dialog, field, button } = await openLinkDialog(richText);
    field('link-href').value = `${'javascript'}:x()`;
    button('Save').click();
    await dialog.updateComplete;
    expect(dialog.shadowRoot.querySelector('.nx-input-error-msg').textContent).to.contain('Invalid URL protocol');
    expect(richText.value).to.equal('<p><a href="/a">site</a></p>');
    button('Cancel').click();
    await richText.updateComplete;
    expect(richText.shadowRoot.querySelector('da-link-dialog')).to.equal(null);
  });

  it('removes a link from the toolbar', async () => {
    const richText = await mount({ value: '<p><a href="/a">site</a> x</p>' });
    await holdFocus(richText);
    selectRange(richText, 8);
    await richText.updateComplete;
    expect(tool(richText, 'unlink').disabled).to.be.true;
    expect(tool(richText, 'unlink').classList.contains('is-hidden')).to.be.true;
    expect(getComputedStyle(tool(richText, 'unlink')).display).to.equal('none');
    selectRange(richText, 2);
    await richText.updateComplete;
    expect(tool(richText, 'unlink').disabled).to.be.false;
    expect(tool(richText, 'unlink').classList.contains('is-hidden')).to.be.false;
    expect(tool(richText, 'unlink').hasAttribute('aria-pressed')).to.be.false;
    tool(richText, 'unlink').click();
    await richText.updateComplete;
    expect(richText.value).to.equal('<p>site x</p>');
    expect(tool(richText, 'unlink').disabled).to.be.true;
    expect(tool(richText, 'unlink').classList.contains('is-hidden')).to.be.true;
  });

  it('creates a list from several selected rows', async () => {
    const richText = await mount({ value: '<p>a</p><p>b</p>' });
    selectAll(richText);
    tool(richText, 'ordered_list').click();
    await richText.updateComplete;
    expect(richText.value).to.equal('<ol><li><p>a</p></li><li><p>b</p></li></ol>');
  });

  it('removes the list from every selected item', async () => {
    const richText = await mount({ value: '<ul><li>a</li><li>b</li><li>c</li></ul>' });
    richText.focus();
    selectRange(richText, 3, 9);
    expect(await pressed(richText, 'bullet_list')).to.equal('true');
    tool(richText, 'bullet_list').click();
    await richText.updateComplete;
    expect(richText.value).to.equal('<p>a</p><p>b</p><ul><li><p>c</p></li></ul>');
  });

  it('has no indent buttons, since Tab nests list items', async () => {
    const richText = await mount({ value: '<ul><li>a</li></ul>' });
    await openMenu(richText);
    expect(tool(richText, 'indent')).to.equal(null);
    expect(tool(richText, 'outdent')).to.equal(null);
  });

  it('fires change when focus leaves after an edit', async () => {
    const richText = await mount({ value: '<p>a</p>' });
    let changes = 0;
    richText.addEventListener('change', () => { changes += 1; });
    const view = richText._view;
    content(richText).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    expect(changes).to.equal(0);
    view.dispatch(view.state.tr.insertText('b', 2));
    content(richText).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    expect(changes).to.equal(1);
  });

  it('is read-only when disabled', async () => {
    const richText = await mount({ value: '<p>a</p>', disabled: true });
    expect(content(richText).getAttribute('contenteditable')).to.equal('false');
    expect(tool(richText, 'strong').disabled).to.be.true;
  });

  it('renders the error and description like other fields', async () => {
    const richText = await mount({ error: 'Required', description: 'Help' });
    expect(richText.shadowRoot.querySelector('.form-field').classList.contains('has-error')).to.be.true;
    expect(content(richText).getAttribute('aria-invalid')).to.equal('true');
    expect(richText.shadowRoot.querySelector('.form-field-description')).to.equal(null);
  });

  it('recreates the editor when reconnected', async () => {
    const richText = await mount({ value: '<p>a</p>' });
    richText.remove();
    expect(richText._view).to.equal(undefined);
    document.body.append(richText);
    await richText.updateComplete;
    expect(content(richText).textContent).to.equal('a');
  });

  it('opens the link dialog from the more menu', async () => {
    const richText = await mount({ value: '<p>site</p>', width: '260px' });
    const bar = toolbar(richText);
    await until(() => bar._overflowAt < 7);
    richText.focus();
    selectAll(richText);
    await openMenu(richText);
    const { dialog, field, button } = await openLinkDialog(
      richText,
      () => bar.shadowRoot.querySelector('.form-rich-text-menu [data-tool="link"]').click(),
    );
    expect(bar._menuOpen).to.be.false;
    expect(field('link-text').value).to.equal('site');
    field('link-href').value = '/page';
    button('Save').click();
    await richText.updateComplete;
    expect(richText.value).to.equal('<p><a href="/page">site</a></p>');
    expect(dialog.isConnected).to.be.false;
  });

  it('shows the floating toolbar only for a focused, non-empty selection', async () => {
    const richText = await mount({ value: '<p>Some text</p>' });
    await refocus(richText);
    expect(floating(richText)).to.equal(null);
    selectAll(richText);
    await refocus(richText);
    expect(floating(richText)).to.not.equal(null);
    content(richText).dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    await richText.updateComplete;
    expect(floating(richText)).to.equal(null);
    selectRange(richText, 2);
    await refocus(richText);
    expect(floating(richText)).to.equal(null);
  });

  it('floats above the selection, or below it next to the toolbar', async () => {
    const value = [1, 2, 3, 4, 5].map((lineNumber) => `<p>Line ${lineNumber}</p>`).join('');
    const richText = await mount({ value, width: '400px' });
    await holdFocus(richText);
    const view = richText._view;
    const select = async (from, to) => {
      selectRange(richText, from, to);
      await richText.updateComplete;
      return floating(richText).getBoundingClientRect();
    };
    const frame = richText.shadowRoot.querySelector('.form-rich-text').getBoundingClientRect();
    const last = await select(33, 37);
    expect(last.bottom).to.be.at.most(view.coordsAtPos(33).top);
    expect(last.left).to.be.at.least(frame.left);
    expect(last.right).to.be.at.most(frame.right);
    const first = await select(1, 5);
    const bar = toolbar(richText).getBoundingClientRect();
    expect(first.top).to.be.at.least(view.coordsAtPos(5).bottom);
    expect(first.top).to.be.at.least(bar.bottom);
  });

  it('formats from the floating toolbar', async () => {
    const richText = await mount({ value: '<p>text</p>' });
    await holdFocus(richText);
    selectAll(richText);
    await richText.updateComplete;
    expect(visibleIds(floating(richText))).to.deep.equal(['strong', 'em', 'u', 'del', 'link', 'bullet_list', 'ordered_list']);
    floatingTool(richText, 'strong').click();
    expect(richText.value).to.equal('<p><strong>text</strong></p>');
    await richText.updateComplete;
    expect(floatingTool(richText, 'strong').getAttribute('aria-pressed')).to.equal('true');
  });

  it('offers unlink in the floating toolbar only inside a link', async () => {
    const richText = await mount({ value: '<p><a href="/a">site</a></p>' });
    await holdFocus(richText);
    selectAll(richText);
    await richText.updateComplete;
    expect(visibleIds(floating(richText))).to.include('unlink');
    floatingTool(richText, 'unlink').click();
    expect(richText.value).to.equal('<p>site</p>');
    await richText.updateComplete;
    expect(visibleIds(floating(richText))).to.not.include('unlink');
  });

  it('hides the floating toolbar while the link dialog is open', async () => {
    const richText = await mount({ value: '<p>site</p>' });
    await holdFocus(richText);
    selectAll(richText);
    await richText.updateComplete;
    const { button } = await openLinkDialog(richText, () => floatingTool(richText, 'link').click());
    expect(floating(richText)).to.equal(null);
    button('Cancel').click();
    await richText.updateComplete;
    expect(floating(richText)).to.not.equal(null);
  });

  it('reports a load failure', async () => {
    const richText = await mount({ loadEditor: async () => { throw new Error('offline'); } });
    await richText.updateComplete;
    expect(richText.shadowRoot.querySelector('.form-field-error').textContent).to.contain('could not be loaded');
    const { shadowRoot } = toolbar(richText);
    expect(shadowRoot.querySelector('[data-tool]')).to.equal(null);
    expect(shadowRoot.querySelector('[data-more]').disabled).to.be.true;
  });
});
