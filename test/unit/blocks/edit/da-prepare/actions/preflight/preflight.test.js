/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../scripts/utils.js';

let render;
let DaPreflight;
let STATUS;
let SEVERITY;
let savedFetch;

before(async () => {
  savedFetch = window.fetch;
  window.fetch = async () => new Response('', { status: 200 });
  setNx('/test/fixtures/nx', { hostname: 'example.com' });

  const resultMod = await import(
    '../../../../../../../blocks/edit/da-prepare/actions/preflight/views/result.js'
  );
  ({ STATUS, SEVERITY } = resultMod);

  const preflightMod = await import(
    '../../../../../../../blocks/edit/da-prepare/actions/preflight/preflight.js'
  );
  render = preflightMod.default;
  DaPreflight = customElements.get('da-preflight');
});

after(() => {
  window.fetch = savedFetch;
});

describe('render export', () => {
  it('returns a da-preflight element with details set', () => {
    const details = { fullpath: '/org/site/page', org: 'org', site: 'site' };
    const cmp = render(details);

    expect(cmp.tagName.toLowerCase()).to.equal('da-preflight');
    expect(cmp.details).to.equal(details);
  });

  it('sets requestId when supplied', () => {
    const cmp = render({ fullpath: '/org/site/page' }, 'req-1');
    expect(cmp.requestId).to.equal('req-1');
  });
});

describe('DaPreflight', () => {
  it('is defined as a custom element', () => {
    expect(DaPreflight).to.exist;
  });

  it('expandCategory toggles open state', () => {
    const el = document.createElement('da-preflight');
    const cat = { title: 'Test', checks: [], open: false };
    el.expandCategory(cat);
    expect(cat.open).to.be.true;

    el.expandCategory(cat);
    expect(cat.open).to.be.false;
  });
});

describe('renderLabels', () => {
  it('excludes pending items so no undefined-badge label renders', () => {
    const el = document.createElement('da-preflight');
    const checks = [
      { title: 'H1', items: [{ status: STATUS.DONE, badge: SEVERITY.INFO }], done: true },
      { title: 'Links', items: [{ status: STATUS.PENDING, badge: undefined }], done: false },
    ];

    const labels = el.renderLabels(checks, () => {});

    expect(labels).to.have.length(1);
    expect(labels[0].values[1]).to.equal(SEVERITY.INFO);
    expect(labels[0].values[3]).to.equal(1);
  });

  it('orders labels by severity regardless of which item settled first', () => {
    const el = document.createElement('da-preflight');
    const checks = [
      { title: 'H1', items: [{ status: STATUS.DONE, badge: SEVERITY.SUCCESS }], done: true },
      { title: 'Title', items: [{ status: STATUS.DONE, badge: SEVERITY.ERROR }], done: true },
    ];

    const labels = el.renderLabels(checks, () => {});

    expect(labels.map((l) => l.values[1])).to.deep.equal([SEVERITY.ERROR, SEVERITY.SUCCESS]);
  });
});

describe('isItemSettled', () => {
  it('is false for a missing item', () => {
    expect(DaPreflight.isItemSettled(null)).to.be.false;
  });

  it('is false while pending', () => {
    expect(DaPreflight.isItemSettled({ status: STATUS.PENDING })).to.be.false;
  });

  it('is false for an unexpected status value', () => {
    expect(DaPreflight.isItemSettled({ status: 'bogus' })).to.be.false;
  });

  it('is true once done', () => {
    expect(DaPreflight.isItemSettled({ status: STATUS.DONE })).to.be.true;
  });
});

describe('nx-preflight-status emit bridge', () => {
  const item = (result) => ({ status: STATUS.DONE, result });
  const settledCats = (items) => [
    { title: 'Content', checks: [{ title: 'H1', items, done: true }] },
  ];

  it('emits success with path + requestId when no error results', async () => {
    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };
    el.requestId = 'req-1';
    el._categories = settledCats([item(SEVERITY.INFO), item(SEVERITY.SUCCESS)]);

    const event = await new Promise((resolve) => {
      document.addEventListener('nx-preflight-status', resolve, { once: true });
      el.maybeEmitStatus();
    });
    expect(event.detail.status).to.equal('success');
    expect(event.detail.path).to.equal('/org/site/page');
    expect(event.detail.requestId).to.equal('req-1');
  });

  it('emits fail when any result is an error', async () => {
    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };
    el._categories = settledCats([item(SEVERITY.INFO), item(SEVERITY.ERROR)]);

    const event = await new Promise((resolve) => {
      document.addEventListener('nx-preflight-status', resolve, { once: true });
      el.maybeEmitStatus();
    });
    expect(event.detail.status).to.equal('fail');
  });

  it('does not emit until every item is done', () => {
    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };
    el._categories = [
      { title: 'Content', checks: [{ title: 'H1', items: [{ status: STATUS.PENDING }], done: false }] },
    ];
    let fired = false;
    const onStatus = () => { fired = true; };
    document.addEventListener('nx-preflight-status', onStatus);
    el.maybeEmitStatus();
    document.removeEventListener('nx-preflight-status', onStatus);
    expect(fired).to.be.false;
  });

  it('does not emit while a check is marked done but an item is still pending', () => {
    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };
    el._categories = [
      { title: 'References', checks: [{ title: 'Links', items: [{ status: STATUS.PENDING }], done: true }] },
    ];
    let fired = false;
    const onStatus = () => { fired = true; };
    document.addEventListener('nx-preflight-status', onStatus);
    el.maybeEmitStatus();
    document.removeEventListener('nx-preflight-status', onStatus);
    expect(fired).to.be.false;
  });

  it('emits only once per run', () => {
    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };
    el._categories = settledCats([item(SEVERITY.INFO)]);
    let count = 0;
    const onStatus = () => { count += 1; };
    document.addEventListener('nx-preflight-status', onStatus);
    el.maybeEmitStatus();
    el.maybeEmitStatus();
    document.removeEventListener('nx-preflight-status', onStatus);
    expect(count).to.equal(1);
  });
});

describe('loadResults error fallback', () => {
  it('shows a visible error category and still emits a fail status when the load path throws', async () => {
    const originalTimeout = AbortSignal.timeout;
    AbortSignal.timeout = () => { throw new Error('boom'); };

    const el = document.createElement('da-preflight');
    el.details = { fullpath: '/org/site/page' };

    const eventPromise = new Promise((resolve) => {
      document.addEventListener('nx-preflight-status', resolve, { once: true });
    });

    try {
      document.body.appendChild(el);
      const event = await eventPromise;

      expect(event.detail.status).to.equal('fail');
      expect(el._categories[0].title).to.equal('Errors');
      expect(el._categories[0].checks[0].items[0].reason).to.equal('boom');
    } finally {
      AbortSignal.timeout = originalTimeout;
      el.remove();
    }
  });
});
