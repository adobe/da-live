import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import * as proseMirror from 'da-y-wrapper';
import '../../../../../blocks/form/fields/rich-text-toolbar.js';
import { TOOL_IDS, createToolset, listTools } from '../../../../../blocks/form/utils/rich-text/tools.js';
import { schema, stateFor, run } from '../helpers/rich-text-states.js';

const toolset = createToolset({ proseMirror, schema, onLink: () => {} });

const tools = Object.fromEntries(listTools(toolset).map((candidate) => [candidate.id, candidate]));

const MENU_IDS = ['blockquote', 'code', 'sup', 'sub'];

// Concurrent test pages run in the background, where animation frames never fire.
const tick = () => new Promise((resolve) => { setTimeout(resolve); });

const until = (check, tries = 100) => (check() || !tries
  ? Promise.resolve()
  : new Promise((resolve) => { setTimeout(resolve, 20); }).then(() => until(check, tries - 1)));

async function mount({ width = '900px', ...properties } = {}) {
  const toolbar = document.createElement('form-rich-text-toolbar');
  Object.assign(toolbar, { editorState: stateFor('<p>a</p>'), toolset, ...properties });
  toolbar.style.width = width;
  document.body.append(toolbar);
  await toolbar.updateComplete;
  await tick();
  await toolbar.updateComplete;
  return toolbar;
}

const tool = (toolbar, id) => toolbar.shadowRoot.querySelector(`[data-tool="${id}"]`);

const moreButton = (toolbar) => toolbar.shadowRoot.querySelector('[data-more]');

const menu = (toolbar) => toolbar.shadowRoot.querySelector('.form-rich-text-menu');

const picker = (toolbar) => toolbar.shadowRoot.querySelector('nx-picker');

const visibleIds = (root, scope = '') => [...root.querySelectorAll(`${scope} [data-tool]:not(.is-hidden)`)]
  .map((button) => button.dataset.tool);

async function openMenu(toolbar) {
  moreButton(toolbar).click();
  await until(() => menu(toolbar).querySelector('[data-tool]'));
  await toolbar.updateComplete;
}

function listen(toolbar, type) {
  const details = [];
  toolbar.addEventListener(type, (event) => details.push(event.detail));
  return details;
}

describe('form-rich-text-toolbar', () => {
  afterEach(() => {
    document.body.replaceChildren();
  });

  it('orders the bar and keeps the quote, code and scripts in the more menu', async () => {
    const toolbar = await mount();
    await until(() => toolbar._overflowAt === 10);
    const { shadowRoot } = toolbar;
    expect(visibleIds(shadowRoot, '.form-rich-text-toolbar >')).to.deep.equal(['undo', 'redo', 'strong', 'em', 'u', 'del', 'link', 'bullet_list', 'ordered_list']);
    const pickerBox = shadowRoot.querySelector('.form-rich-text-toolbar > .form-rich-text-picker');
    expect(pickerBox.previousElementSibling.classList.contains('form-rich-text-separator')).to.be.true;
    expect(pickerBox.previousElementSibling.previousElementSibling).to.equal(tool(toolbar, 'redo'));
    await openMenu(toolbar);
    expect(visibleIds(menu(toolbar))).to.deep.equal(MENU_IDS);
  });

  it('renders the S2 sprite of each tool', async () => {
    const toolbar = await mount();
    const href = (button) => button.querySelector('use').getAttribute('href');
    expect(href(tool(toolbar, 'strong'))).to.match(/\/img\/icons\/s2-icon-tagbold-20-n\.svg#icon$/);
    expect(href(moreButton(toolbar))).to.match(/\/img\/icons\/s2-icon-more-20-n\.svg#icon$/);
  });

  it('names the shortcut of a tool in its title', async () => {
    const toolbar = await mount();
    const modifier = /Mac|iP(hone|[oa]d)/.test(navigator.platform) ? '⌘' : 'Ctrl';
    expect(tool(toolbar, 'redo').title).to.equal(`Redo (${modifier}+Shift+Z)`);
    expect(tool(toolbar, 'link').title).to.equal(`Link (${modifier}+K)`);
    expect(tool(toolbar, 'del').title).to.equal(`Strikethrough (${modifier}+Shift+S)`);
    expect(tool(toolbar, 'unlink').title).to.equal('Remove link');
  });

  it('renders an empty bar until the toolset loads', async () => {
    const toolbar = await mount({ toolset: undefined, editorState: undefined });
    expect(tool(toolbar, 'strong')).to.equal(null);
    expect(picker(toolbar)).to.equal(null);
    expect(moreButton(toolbar).disabled).to.be.true;

    toolbar.toolset = toolset;
    await until(() => toolbar._overflowAt === 10);
    expect(tool(toolbar, 'strong').disabled).to.be.true;
    toolbar.editorState = stateFor('<p>a</p>');
    await toolbar.updateComplete;
    expect(tool(toolbar, 'strong').disabled).to.be.false;
    expect(moreButton(toolbar).disabled).to.be.false;
  });

  it('moves bar tools that do not fit into the more menu', async () => {
    const toolbar = await mount({ width: '260px' });
    await until(() => toolbar._overflowAt < 10);
    expect(toolbar._overflowAt).to.be.above(0);
    expect(tool(toolbar, 'link').classList.contains('is-overflow')).to.be.true;
    expect(tool(toolbar, 'strong').classList.contains('is-overflow')).to.be.false;
    expect(moreButton(toolbar).getAttribute('aria-expanded')).to.equal('false');

    await openMenu(toolbar);
    expect(moreButton(toolbar).getAttribute('aria-expanded')).to.equal('true');
    const menuIds = visibleIds(menu(toolbar));
    expect(menuIds).to.include('link');
    expect(menuIds).to.include('ordered_list');
    expect(menuIds).to.not.include('strong');

    menu(toolbar).close();
    await toolbar.updateComplete;
    expect(moreButton(toolbar).getAttribute('aria-expanded')).to.equal('false');

    toolbar.style.width = '900px';
    // The ResizeObserver does not run in a background test page, so measure as it would.
    toolbar._measureBar();
    await until(() => toolbar._overflowAt === 10);
    await toolbar.updateComplete;
    expect(tool(toolbar, 'link').classList.contains('is-overflow')).to.be.false;
  });

  it('asks the field to run the command of a tool and keeps the editor focused', async () => {
    const toolbar = await mount();
    const details = listen(toolbar, 'form-rich-text-command');
    const mousedown = new MouseEvent('mousedown', { bubbles: true, cancelable: true });
    tool(toolbar, 'strong').dispatchEvent(mousedown);
    expect(mousedown.defaultPrevented).to.be.true;
    tool(toolbar, 'strong').click();
    expect(details).to.deep.equal([{ command: tools[TOOL_IDS.bold].command }]);
  });

  it('opens a dialog without a menu to close', async () => {
    const toolbar = await mount();
    menu(toolbar).close = () => { throw new Error('The menu is not open'); };
    toolbar.openTool = TOOL_IDS.link;
    await toolbar.updateComplete;
    expect(tool(toolbar, 'link').getAttribute('aria-pressed')).to.equal('true');
  });

  it('keeps the more menu open for tools, but closes it when a dialog opens', async () => {
    const toolbar = await mount({ width: '260px' });
    await until(() => toolbar._overflowAt < 10);
    const details = listen(toolbar, 'form-rich-text-command');
    await openMenu(toolbar);
    tool(toolbar, 'bullet_list').click();
    await toolbar.updateComplete;
    expect(toolbar._menuOpen).to.be.true;
    expect(details).to.deep.equal([{ command: tools[TOOL_IDS.bulletList].command }]);

    toolbar.openTool = TOOL_IDS.link;
    await toolbar.updateComplete;
    expect(toolbar._menuOpen).to.be.false;
  });

  it('asks the field to apply the value picked without leaking the picker change', async () => {
    const toolbar = await mount();
    const details = listen(toolbar, 'form-rich-text-command');
    const leaked = listen(toolbar, 'change');
    picker(toolbar).dispatchEvent(new CustomEvent('change', {
      bubbles: true,
      composed: true,
      detail: { value: 'heading-2' },
    }));
    expect(leaked).to.be.empty;
    expect(details).to.have.length(1);
    const { html } = run(details[0].command, stateFor('<p>a</p>', { from: 1 }));
    expect(html).to.equal('<h2>a</h2>');
  });

  it('reflects the selection only while the field or a dialog has the focus', async () => {
    const editorState = stateFor('<h2><a href="/a"><strong>ab</strong></a></h2>', { from: 1, to: 3 });
    const toolbar = await mount({ editorState });
    expect(tool(toolbar, 'strong').getAttribute('aria-pressed')).to.equal('false');
    expect(tool(toolbar, 'link').getAttribute('aria-pressed')).to.equal('false');
    expect(tool(toolbar, 'undo').hasAttribute('aria-pressed')).to.be.false;
    expect(picker(toolbar).value).to.equal('paragraph');
    expect(tool(toolbar, 'unlink').classList.contains('is-hidden')).to.be.true;

    toolbar.focused = true;
    await toolbar.updateComplete;
    expect(tool(toolbar, 'strong').getAttribute('aria-pressed')).to.equal('true');
    expect(tool(toolbar, 'link').getAttribute('aria-pressed')).to.equal('true');
    expect(picker(toolbar).value).to.equal('heading-2');
    expect(tool(toolbar, 'unlink').classList.contains('is-hidden')).to.be.false;

    Object.assign(toolbar, { focused: false, openTool: TOOL_IDS.link, editorState: stateFor('<p>a</p>') });
    await toolbar.updateComplete;
    expect(tool(toolbar, 'link').getAttribute('aria-pressed')).to.equal('true');
  });

  it('keeps the text style of list items', async () => {
    const toolbar = await mount({ focused: true, editorState: stateFor('<ul><li>a</li></ul>', { from: 3 }) });
    expect(picker(toolbar).inert).to.be.true;
    expect(toolbar.shadowRoot.querySelector('.form-rich-text-picker.is-disabled')).to.not.equal(null);
  });

  it('disables the tools whose command does not apply, even while the selection does not show', async () => {
    const state = stateFor('');
    const toolbar = await mount({ editorState: state.apply(state.tr.insertText('a', 1)) });
    expect(tool(toolbar, 'undo').disabled).to.be.false;
    expect(tool(toolbar, 'redo').disabled).to.be.true;
    expect(tool(toolbar, 'unlink').disabled).to.be.true;
  });

  it('disables every tool of a field that cannot be edited', async () => {
    const toolbar = await mount({ disabled: true, focused: true });
    const buttons = [...toolbar.shadowRoot.querySelectorAll('button')];
    expect(buttons.every((button) => button.disabled)).to.be.true;
    expect(picker(toolbar).inert).to.be.true;
  });

  it('floats with the bar groups only and adds no tab stops', async () => {
    const toolbar = await mount({ floating: true, focused: true });
    const { shadowRoot } = toolbar;
    expect(toolbar.hasAttribute('floating')).to.be.true;
    expect(shadowRoot.querySelector('[role="toolbar"]').getAttribute('aria-label')).to.equal('Selection formatting');
    expect(picker(toolbar)).to.equal(null);
    expect(visibleIds(shadowRoot, '.form-rich-text-toolbar >')).to.deep.equal(['strong', 'em', 'u', 'del', 'link', 'bullet_list', 'ordered_list']);
    const buttons = [...shadowRoot.querySelectorAll('button')];
    expect(buttons.every((button) => button.tabIndex === -1)).to.be.true;
  });

  it('opens only the menu groups from the floating toolbar', async () => {
    const toolbar = await mount({ floating: true, focused: true, width: '260px' });
    await openMenu(toolbar);
    expect(moreButton(toolbar).getAttribute('aria-expanded')).to.equal('true');
    expect(visibleIds(menu(toolbar))).to.deep.equal(MENU_IDS);
    moreButton(toolbar).click();
    await toolbar.updateComplete;
    expect(moreButton(toolbar).getAttribute('aria-expanded')).to.equal('false');
  });
});
