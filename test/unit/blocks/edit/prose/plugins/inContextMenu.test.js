/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import InContextMenu from '../../../../../../blocks/edit/prose/plugins/inContextMenu.js';

class TestMenu extends InContextMenu {}
customElements.define('test-incontext-menu', TestMenu);

describe('inContextMenu', () => {
  let el;
  let host;

  beforeEach(async () => {
    host = document.createElement('div');
    host.className = 'da-prose-mirror';
    Object.assign(host.style, { position: 'absolute', left: '0', top: '0', width: '500px', height: '400px' });
    document.body.append(host);
    el = document.createElement('test-incontext-menu');
    el.items = [{ title: 'a' }, { title: 'b' }, { title: 'c' }];
    Object.assign(el.style, { position: 'absolute', width: '100px', height: '50px' });
    host.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    host.remove();
  });

  it('show sets visible and stores coordinates', () => {
    el.show({ left: 50, top: 60 });
    expect(el.visible).to.be.true;
    expect(el.left).to.equal(50);
    expect(el.top).to.equal(60);
  });

  it('show falls back to bottom + 5 when top is missing', () => {
    el.show({ left: 10, bottom: 100 });
    expect(el.top).to.equal(105);
  });

  it('hide resets visible and selectedIndex', () => {
    el.visible = true;
    el.selectedIndex = 2;
    el.hide();
    expect(el.visible).to.be.false;
    expect(el.selectedIndex).to.equal(0);
  });

  it('next/previous wrap around items', () => {
    el.next();
    expect(el.selectedIndex).to.equal(1);
    el.next();
    el.next();
    expect(el.selectedIndex).to.equal(0); // wrap
    el.previous();
    expect(el.selectedIndex).to.equal(2);
  });

  it('handleItemClick fires item-selected and hides', () => {
    el.visible = true;
    let received;
    el.addEventListener('item-selected', (e) => { received = e.detail.item; });
    el.handleItemClick({ title: 'foo' });
    expect(received).to.deep.equal({ title: 'foo' });
    expect(el.visible).to.be.false;
  });

  it('updatePosition is a no-op when no .da-prose-mirror ancestor', () => {
    el.remove();
    document.body.append(el);
    expect(() => el.updatePosition()).not.to.throw();
  });

  it('handleKeyDown ignored when invisible', () => {
    el.visible = false;
    let prevented = false;
    el.handleKeyDown({ key: 'ArrowDown', preventDefault: () => { prevented = true; } });
    expect(prevented).to.be.false;
  });

  it('handleKeyDown ArrowDown advances selection', () => {
    el.visible = true;
    el.handleKeyDown({ key: 'ArrowDown', preventDefault: () => {} });
    expect(el.selectedIndex).to.equal(1);
  });

  it('handleKeyDown ArrowUp moves selection back', () => {
    el.visible = true;
    el.selectedIndex = 1;
    el.handleKeyDown({ key: 'ArrowUp', preventDefault: () => {} });
    expect(el.selectedIndex).to.equal(0);
  });

  it('handleKeyDown Enter triggers item-selected for current index', () => {
    el.visible = true;
    el.selectedIndex = 1;
    let item;
    el.addEventListener('item-selected', (e) => { item = e.detail.item; });
    el.handleKeyDown({ key: 'Enter', preventDefault: () => {} });
    expect(item).to.deep.equal({ title: 'b' });
  });

  it('handleKeyDown Escape hides the menu', () => {
    el.visible = true;
    el.handleKeyDown({ key: 'Escape', preventDefault: () => {} });
    expect(el.visible).to.be.false;
  });
});
