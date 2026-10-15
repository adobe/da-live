/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { stub, spy } from 'sinon';
import { setNx, getNx2Api } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { default: DaBrowseSearch } = await import('../../../../../../blocks/browse/v2/da-browse-search/da-browse-search.js');

describe('browse-owned search combobox', () => {
  let field;
  let input;
  let snapshot;
  let navigate;
  let source;
  let list;
  let get;

  beforeEach(async () => {
    ({ source } = await getNx2Api());
    list = stub(source, 'list');
    get = stub(source, 'get');
    const items = [
      { path: '/o/r/plan.html', name: 'plan', ext: 'html', isChecked: true },
      { path: '/o/r/plan.json', name: 'plan', ext: 'json' },
      { path: '/o/r/plans', name: 'plans' },
    ];
    snapshot = { fullpath: '/o/r', items, version: items, complete: true };
    field = new DaBrowseSearch();
    field.fullpath = '/o/r';
    field.editor = '/edit#';
    field.label = 'Search files';
    field.getDirectory = stub().callsFake(async () => snapshot);
    navigate = stub(field, 'navigate');
    document.body.append(field);
    await field.updateComplete;
    input = field.input;
  });

  afterEach(async () => {
    field.closeSuggestions();
    await field.popover?.updateComplete;
    field.remove();
    list.restore();
    get.restore();
  });

  function key(value, extra = {}) {
    const event = new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra });
    input.dispatchEvent(event);
    return event;
  }

  async function open() {
    field.value = 'plan';
    await field.updateComplete;
    input.focus();
    await field.refreshSuggestions();
    await field.updateComplete;
    await field.showSuggestions();
    await field.updateComplete;
    await field.popover.updateComplete;
  }

  it('forwards input and change from the inner field with this element as target', async () => {
    const inputs = spy();
    const changes = spy();
    field.addEventListener('input', inputs);
    field.addEventListener('change', changes);
    input.value = 'new plan';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    expect(field.value).to.equal('new plan');
    expect(inputs.calledOnce).to.be.true;
    expect(inputs.firstCall.args[0].target).to.equal(field);
    input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
    expect(changes.calledOnce).to.be.true;
    expect(changes.firstCall.args[0].target).to.equal(field);
    expect(changes.firstCall.args[0].composed).to.be.true;
  });

  it('resets selection immediately on typing and removes options that no longer match', async () => {
    await open();
    key('ArrowDown');
    await field.updateComplete;
    input.value = 'json';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    expect(field._active).to.be.undefined;
    await field.updateComplete;
    await field.refreshSuggestions();
    await field.updateComplete;
    expect(input.hasAttribute('aria-activedescendant')).to.be.false;
    expect(field._suggestions.map((option) => option.label)).to.deep.equal(['plan.json', 'Search this folder and subfolders']);
  });

  it('loads missing pages once across drafts without changing visible rows or reading documents', async () => {
    snapshot.complete = false;
    snapshot.continuationToken = 'one';
    const original = snapshot.items;
    let finish;
    list.returns(new Promise((resolve) => { finish = resolve; }));
    field.value = 'late';
    await field.updateComplete;
    input.focus();
    const loading = field.refreshSuggestions();
    await new Promise((resolve) => { setTimeout(resolve); });
    expect(field._status).to.contain('Loading');
    expect(field._suggestions.at(-1).action).to.be.true;
    field.value = 'plan';
    await field.updateComplete;
    finish({ ok: true, items: [{ path: '/o/r/late.html', name: 'late', ext: 'html' }] });
    await loading;
    await field.refreshSuggestions();
    expect(list.calledOnceWithExactly('/o/r', { continuationToken: 'one' })).to.be.true;
    field.value = 'late';
    await field.updateComplete;
    await field.refreshSuggestions();
    expect(field._suggestions[0].label).to.equal('late.html');
    expect(snapshot.items).to.equal(original);
    expect(snapshot.items[0].isChecked).to.be.true;
    expect(snapshot.continuationToken).to.equal('one');
    expect(snapshot.complete).to.be.false;
    expect(get.called).to.be.false;
  });

  it('caps filename choices at five, matches case consistently, and safely renders names', async () => {
    snapshot.items = Array.from({ length: 8 }, (_, index) => ({ path: `/o/r/PLAN-${index}.html`, name: `PLAN-${index}`, ext: 'html' }));
    snapshot.items.push({ path: '/o/r/safe', name: 'plan <img src=x onerror=alert(1)>' });
    snapshot.version = snapshot.items;
    await open();
    expect(field._suggestions[0].label).to.contain('<img');
    expect(field.shadowRoot.querySelector('img')).to.be.null;
    field.matchCase = false;
    await field.updateComplete;
    await field.refreshSuggestions();
    expect(field._suggestions).to.have.length(6);
    expect(field._status).to.equal('Showing 5 of 9 matching filenames');
    expect(field._suggestions.at(-1).action).to.be.true;
  });

  it('shows page and seed errors without dropping the deeper-search action', async () => {
    snapshot.complete = false;
    snapshot.continuationToken = 'one';
    list.resolves({ error: 'Not permitted', status: 403 });
    await open();
    expect(field._status).to.contain('Not permitted');
    expect(field._status).not.to.contain('No matching');
    expect(field._suggestions.at(-1).action).to.be.true;
    field.resetCatalog();
    field.getDirectory.rejects(new Error('Directory not ready'));
    field._dismissed = false;
    await field.refreshSuggestions();
    expect(field._status).to.contain('Directory not ready');
    expect(field._suggestions.at(-1).action).to.be.true;
  });

  it('ignores stale folder responses and closes on blur, disable, clear, or disconnect', async () => {
    await open();
    input.dispatchEvent(new FocusEvent('focusout', { bubbles: true, composed: true }));
    expect(field.suggestionsOpen).to.be.false;
    input.focus();
    await field.showSuggestions();
    field.disabled = true;
    await field.updateComplete;
    expect(field.suggestionsOpen).to.be.false;
    field.disabled = false;
    await field.updateComplete;
    input.focus();
    let finish;
    field.getDirectory.returns(new Promise((resolve) => { finish = resolve; }));
    const pending = field.refreshSuggestions();
    field.fullpath = '/o/r/elsewhere';
    await field.updateComplete;
    finish(snapshot);
    await pending;
    expect(field._catalog).to.be.undefined;
    expect(field.suggestionsOpen).to.be.false;
    input.value = '';
    input.dispatchEvent(new InputEvent('input', { bubbles: true, composed: true }));
    await field.updateComplete;
    expect(field.value).to.equal('');
    const opening = field.showSuggestions();
    field.remove();
    await opening;
    expect(field.suggestionsOpen).to.be.false;
  });

  it('does not load filenames from unfocused panel-only drafts', async () => {
    field.value = 'panel draft';
    await field.updateComplete;
    expect(field.getDirectory.called).to.be.false;
    expect(list.called).to.be.false;
    expect(field.suggestionsOpen).to.be.false;
  });

  it('resolves links only on explicit activation and reports failures', async () => {
    snapshot.items = [{ path: '/o/r/plan.link', name: 'plan', ext: 'link' }];
    snapshot.version = snapshot.items;
    await open();
    expect(get.called).to.be.false;
    get.resolves(new Response(JSON.stringify({ externalUrl: 'https://example.com/plan' })));
    await field.selectSuggestion(field._suggestions[0]);
    expect(navigate.calledOnceWithExactly('https://example.com/plan')).to.be.true;
    get.resolves(new Response('', { status: 403 }));
    await field.selectSuggestion(field._suggestions[0]);
    expect(field._status).to.contain('Could not open file');
    expect(navigate.callCount).to.equal(1);
  });
});
