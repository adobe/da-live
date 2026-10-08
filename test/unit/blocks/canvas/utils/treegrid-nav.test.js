import { expect } from '@esm-bundle/chai';
import {
  rowControls,
  treegridEnsureTabStop,
  treegridFocusIn,
  treegridKeydown,
  treegridRows,
} from '../../../../../blocks/canvas/utils/treegrid-nav.js';

const GRID = `
  <div role="treegrid">
    <div role="row" id="s1" aria-level="1" tabindex="-1">
      <div role="gridcell"><button id="s1-a"></button><span>S1</span><button id="s1-b"></button></div>
    </div>
    <div role="row" id="b1" aria-level="2" tabindex="-1">
      <div role="gridcell"><button id="b1-a"></button><button id="b1-b" disabled></button></div>
    </div>
    <div role="row" id="g1" aria-level="2" aria-expanded="false" tabindex="-1">
      <div role="gridcell">Group</div>
    </div>
    <div role="row" id="g2" aria-level="2" aria-expanded="true" tabindex="-1">
      <div role="gridcell">Group</div>
    </div>
    <div role="row" id="c1" aria-level="3" tabindex="-1">
      <div role="gridcell"><button id="c1-a"></button><input id="c1-input"></div>
    </div>
    <div role="row" id="s2" aria-level="1" tabindex="-1">
      <div role="gridcell"><button id="s2-a"></button><button id="s2-b"></button></div>
    </div>
  </div>`;

describe('treegrid-nav', () => {
  let host;
  let root;
  let calls;

  const $ = (id) => root.getElementById(id);
  const active = () => root.activeElement;
  const press = (key) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, composed: true, cancelable: true });
    active().dispatchEvent(event);
    return event;
  };

  beforeEach(() => {
    calls = [];
    host = document.createElement('div');
    document.body.append(host);
    root = host.attachShadow({ mode: 'open' });
    root.innerHTML = GRID;
    const grid = root.querySelector('[role="treegrid"]');
    grid.addEventListener('keydown', (e) => treegridKeydown(e, root, {
      toggle: (row) => calls.push(['toggle', row.id]),
      activate: (row) => calls.push(['activate', row.id]),
    }));
    grid.addEventListener('focusin', (e) => treegridFocusIn(e, root));
  });

  afterEach(() => { host.remove(); });

  it('lists rows and enabled controls of a row only', () => {
    expect(treegridRows(root).map((r) => r.id)).to.deep.equal(['s1', 'b1', 'g1', 'g2', 'c1', 's2']);
    expect(rowControls($('s1')).map((c) => c.id)).to.deep.equal(['s1-a', 's1-b']);
    expect(rowControls($('b1')).map((c) => c.id)).to.deep.equal(['b1-a']);
  });

  it('keeps one tab stop that follows focus', () => {
    treegridEnsureTabStop(root);
    expect($('s1').tabIndex).to.equal(0);
    $('b1-a').dispatchEvent(new FocusEvent('focusin', { bubbles: true, composed: true }));
    expect(treegridRows(root).filter((r) => r.tabIndex === 0).map((r) => r.id)).to.deep.equal(['b1']);
    treegridEnsureTabStop(root);
    expect($('s1').tabIndex).to.equal(-1);
  });

  it('moves between rows with arrows, Home and End', () => {
    $('s1').focus();
    expect(press('ArrowDown').defaultPrevented).to.be.true;
    expect(active().id).to.equal('b1');
    press('End');
    expect(active().id).to.equal('s2');
    press('ArrowDown');
    expect(active().id).to.equal('s2');
    press('Home');
    expect(active().id).to.equal('s1');
    press('ArrowUp');
    expect(active().id).to.equal('s1');
  });

  it('ArrowRight expands a collapsed row, enters controls, or moves to the first child', () => {
    $('g1').focus();
    press('ArrowRight');
    expect(calls).to.deep.equal([['toggle', 'g1']]);
    expect(active().id).to.equal('g1');

    $('s1').focus();
    press('ArrowRight');
    expect(active().id).to.equal('s1-a');

    $('g2').focus();
    press('ArrowRight');
    expect(active().id).to.equal('c1');
  });

  it('ArrowLeft collapses an expanded row, otherwise moves to the parent', () => {
    $('g2').focus();
    press('ArrowLeft');
    expect(calls).to.deep.equal([['toggle', 'g2']]);

    $('c1').focus();
    press('ArrowLeft');
    expect(active().id).to.equal('g2');
    $('b1').focus();
    press('ArrowLeft');
    expect(active().id).to.equal('s1');
  });

  it('activates a row with Enter or Space', () => {
    $('b1').focus();
    press('Enter');
    expect(press(' ').defaultPrevented).to.be.true;
    expect(calls).to.deep.equal([['activate', 'b1'], ['activate', 'b1']]);
  });

  it('moves between controls and back to the row', () => {
    $('s1-a').focus();
    press('ArrowRight');
    expect(active().id).to.equal('s1-b');
    press('ArrowRight');
    expect(active().id).to.equal('s1-b');
    press('ArrowLeft');
    expect(active().id).to.equal('s1-a');
    press('ArrowLeft');
    expect(active().id).to.equal('s1');
  });

  it('moves to the same control in the adjacent row, or the row itself', () => {
    $('s1-a').focus();
    press('ArrowDown');
    expect(active().id).to.equal('b1-a');
    press('ArrowDown');
    expect(active().id).to.equal('g1');

    $('s1-b').focus();
    press('ArrowDown');
    expect(active().id).to.equal('b1');
  });

  it('Escape in a control returns to its row', () => {
    $('s2-b').focus();
    press('Escape');
    expect(active().id).to.equal('s2');
  });

  it('leaves text entry keys alone', () => {
    $('c1-input').focus();
    expect(press('ArrowLeft').defaultPrevented).to.be.false;
    expect(active().id).to.equal('c1-input');
  });
});
