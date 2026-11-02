import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import '../../../setup-nx.js';
import { getNx2Api } from '../../../../../scripts/utils.js';
import '../../../../../blocks/shared/da-file-item/da-file-item.js';

const { versions } = await getNx2Api();
const statusResponse = (name = 'alex') => new Response(JSON.stringify([
  { timestamp: 1, url: '/versionsource/one', users: [{ email: `${name}@example.com` }] },
]));

describe('shared row modifier metadata', () => {
  let el;
  let observe;
  let observer;
  let list;

  beforeEach(async () => {
    sinon.stub(window, 'IntersectionObserver').callsFake((callback) => {
      observe = callback;
      observer = { observe: sinon.spy(), disconnect: sinon.spy() };
      return observer;
    });
    sinon.stub(window, 'fetch').resolves(new Response(null, { status: 404 }));
    list = sinon.stub(versions, 'list').callsFake(async () => statusResponse());
    el = document.createElement('da-file-item');
    Object.assign(el, {
      name: 'Page',
      ext: 'html',
      editor: '/edit#',
      path: '/rowtest/site/page.html',
      columns: ['name', 'folder', 'modified', 'modifiedBy', 'actions'],
    });
    document.body.append(el);
    await el.updateComplete;
  });

  afterEach(() => {
    el.remove();
    sinon.restore();
  });

  it('loads only when visible and shares the request with information details', async () => {
    expect(list.called).to.equal(false);
    observe([{ isIntersecting: true }]);
    await el.updateDAStatus();
    await el.updateComplete;
    expect(list.callCount).to.equal(1);
    expect(observer.disconnect.called).to.equal(true);
    expect(el.shadowRoot.querySelector('[data-column="modifiedBy"]').textContent).to.equal('alex');
    el.closeDetails();
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-column="modifiedBy"]').textContent).to.equal('alex');
    await el.updateDAStatus();
    expect(list.callCount).to.equal(1);
  });

  it('does not let an old path response overwrite the current modifier', async () => {
    let finish;
    list.onFirstCall().returns(new Promise((resolve) => { finish = resolve; }));
    list.onSecondCall().resolves(statusResponse('sam'));
    const pending = el.updateDAStatus();
    el.path = '/rowtest/site/other.html';
    await el.updateComplete;
    await el.updateDAStatus();
    finish(statusResponse('old'));
    await pending;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-column="modifiedBy"]').textContent).to.equal('sam');
  });

  it('invalidates pending metadata and observers when removed', async () => {
    let finish;
    list.returns(new Promise((resolve) => { finish = resolve; }));
    const pending = el.updateDAStatus();
    el.remove();
    finish(statusResponse('old'));
    await pending;
    expect(observer.disconnect.called).to.equal(true);
    expect(el._lastModifiedBy).not.to.equal('old');
  });

  it('refreshes changed files without sharing cached status between row instances', async () => {
    await el.updateDAStatus();
    const other = document.createElement('da-file-item');
    Object.assign(other, {
      name: 'Other',
      ext: 'html',
      path: '/rowtest/site/other.html',
      editor: '/edit#',
      columns: ['modifiedBy'],
    });
    document.body.append(other);
    try {
      await other.updateComplete;
      list.resolves(statusResponse('sam'));
      await other.updateDAStatus();
      el.date = 123;
      await el.updateComplete;
      list.resolves(statusResponse('new'));
      await el.updateDAStatus();
      expect(el._lastModifiedBy).to.equal('new');
      expect(other._lastModifiedBy).to.equal('sam');
      expect(list.callCount).to.equal(3);
    } finally {
      other.remove();
    }
  });

  it('keeps failure explicit in details without an unhandled rejection or fake modifier', async () => {
    list.rejects(new Error('Offline'));
    await el.updateDAStatus();
    await el.updateAEMStatus();
    el._detailsOpen = true;
    await el.updateComplete;
    expect(el.shadowRoot.querySelector('[data-column="modifiedBy"]').textContent).to.equal('—');
    expect(el.shadowRoot.querySelector('.da-list-item-da-details-modified').textContent).to.include('Unavailable');
  });

  it('does not observe ordinary Browse rows, supplied modifiers, folders or link files', async () => {
    el.remove();
    for (const props of [
      { columns: undefined, ext: 'html' },
      { columns: ['modifiedBy'], ext: 'html', modifiedBy: 'Supplied' },
      { columns: ['modifiedBy'], ext: '' },
      { columns: ['modifiedBy'], ext: 'link' },
    ]) {
      observer.observe.resetHistory();
      el = document.createElement('da-file-item');
      Object.assign(el, { path: '/rowtest/site/page', name: 'Page', editor: '/edit#', ...props });
      document.body.append(el);
      await el.updateComplete;
      expect(observer.observe.called).to.equal(false);
      el.remove();
    }
    expect(list.called).to.equal(false);
  });
});
