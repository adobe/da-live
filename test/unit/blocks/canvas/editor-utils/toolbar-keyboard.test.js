import { expect } from '@esm-bundle/chai';
import {
  toolbarItems,
  syncRovingTabindex,
  focusFirstItem,
  handleToolbarNavKey,
  returnFocusFromPopup,
} from '../../../../../blocks/canvas/editor-utils/toolbar-keyboard.js';

describe('toolbar keyboard helpers', () => {
  let host;
  let wrap;

  beforeEach(() => {
    host = document.createElement('div');
    document.body.append(host);
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <div class="toolbar-wrap" role="toolbar">
        <button id="a">A</button>
        <button id="hidden" hidden>H</button>
        <button id="disabled" disabled>D</button>
        <nx-picker id="picker"></nx-picker>
        <nx-menu id="menu"><button id="trigger" slot="trigger">M</button></nx-menu>
        <button id="b">B</button>
      </div>`;
    wrap = root.querySelector('.toolbar-wrap');
    // A stand-in for nx-picker: focus() delegates to its trigger, like the real one.
    const picker = root.getElementById('picker');
    const pickerRoot = picker.attachShadow({ mode: 'open' });
    pickerRoot.innerHTML = '<button>P</button>';
    picker.focus = () => pickerRoot.querySelector('button').focus();
  });

  afterEach(() => host.remove());

  const ids = (els) => els.map((el) => el.id);
  const byId = (id) => wrap.querySelector(`#${id}`);
  const key = (k, init = {}) => new KeyboardEvent('keydown', { key: k, cancelable: true, ...init });
  const activeId = () => host.shadowRoot.activeElement?.id;

  it('lists visible, enabled controls in order, including pickers and menu triggers', () => {
    expect(ids(toolbarItems(wrap))).to.deep.equal(['a', 'picker', 'trigger', 'b']);
  });

  it('leaves exactly one Tab stop', () => {
    expect(syncRovingTabindex(wrap, byId('b'))).to.equal(byId('b'));
    expect(byId('b').getAttribute('tabindex')).to.equal('0');
    ['a', 'picker', 'trigger'].forEach((id) => expect(byId(id).getAttribute('tabindex')).to.equal('-1'));
  });

  it('keeps a picker reachable through its own trigger instead of the host', () => {
    syncRovingTabindex(wrap, byId('picker'));
    expect(byId('picker').hasAttribute('tabindex')).to.be.false;
  });

  it('resolves focus inside a menu to its trigger', () => {
    expect(syncRovingTabindex(wrap, byId('menu'))).to.equal(byId('trigger'));
  });

  it('falls back to the first control', () => {
    expect(syncRovingTabindex(wrap, null)).to.equal(byId('a'));
    expect(syncRovingTabindex(wrap, byId('disabled'))).to.equal(byId('a'));
  });

  it('focuses the first control', () => {
    expect(focusFirstItem(wrap)).to.be.true;
    expect(activeId()).to.equal('a');
  });

  it('reports a toolbar with no controls', () => {
    wrap.innerHTML = '<button disabled>x</button>';
    expect(focusFirstItem(wrap)).to.be.false;
  });

  it('moves with Left/Right (wrapping) and Home/End', () => {
    byId('a').focus();
    const right = key('ArrowRight');
    expect(handleToolbarNavKey(right, wrap)).to.be.true;
    expect(right.defaultPrevented).to.be.true;
    expect(activeId()).to.equal('picker');
    expect(byId('picker').hasAttribute('tabindex')).to.be.false;
    expect(byId('a').getAttribute('tabindex')).to.equal('-1');

    handleToolbarNavKey(key('End'), wrap);
    expect(activeId()).to.equal('b');
    handleToolbarNavKey(key('ArrowRight'), wrap);
    expect(activeId()).to.equal('a');
    handleToolbarNavKey(key('ArrowLeft'), wrap);
    expect(activeId()).to.equal('b');
    handleToolbarNavKey(key('Home'), wrap);
    expect(activeId()).to.equal('a');
  });

  it('ignores other keys, modified keys and already-handled events', () => {
    byId('a').focus();
    expect(handleToolbarNavKey(key('ArrowDown'), wrap)).to.be.false;
    expect(handleToolbarNavKey(key('ArrowRight', { shiftKey: true }), wrap)).to.be.false;
    const handled = key('ArrowRight');
    handled.preventDefault();
    expect(handleToolbarNavKey(handled, wrap)).to.be.false;
    expect(activeId()).to.equal('a');
  });

  it('ignores keys while focus is outside the toolbar', () => {
    expect(handleToolbarNavKey(key('ArrowRight'), wrap)).to.be.false;
  });

  describe('returnFocusFromPopup', () => {
    const closeEvent = (target) => ({ target });

    it('hands focus back to the menu trigger when the menu closes with an option focused', () => {
      const menu = byId('menu');
      const menuRoot = menu.attachShadow({ mode: 'open' });
      menuRoot.innerHTML = '<slot name="trigger"></slot><button role="menuitem">Item</button>';
      menuRoot.querySelector('[role="menuitem"]').focus();
      returnFocusFromPopup(closeEvent(menu), wrap);
      expect(activeId()).to.equal('trigger');
    });

    it('hands focus back to a picker closing with an option focused', () => {
      const picker = byId('picker');
      const option = document.createElement('button');
      picker.shadowRoot.append(option);
      option.focus();
      returnFocusFromPopup(closeEvent(picker), wrap);
      expect(picker.shadowRoot.activeElement).to.equal(picker.shadowRoot.querySelector('button'));
    });

    it('leaves focus alone when it already moved elsewhere (e.g. an outside click)', () => {
      const menu = byId('menu');
      menu.attachShadow({ mode: 'open' }).innerHTML = '<slot name="trigger"></slot>';
      byId('b').focus();
      returnFocusFromPopup(closeEvent(menu), wrap);
      expect(activeId()).to.equal('b');
    });

    it('ignores close events from anything that is not a toolbar control', () => {
      const stray = document.createElement('div');
      const strayRoot = stray.attachShadow({ mode: 'open' });
      strayRoot.innerHTML = '<button>x</button>';
      wrap.append(stray);
      strayRoot.querySelector('button').focus();
      expect(() => returnFocusFromPopup(closeEvent(stray), wrap)).to.not.throw();
      expect(strayRoot.activeElement).to.exist;
    });
  });
});
