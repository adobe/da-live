/* eslint-disable no-underscore-dangle */
import { expect } from '@esm-bundle/chai';
import { stub, spy, useFakeTimers } from 'sinon';
import { setNx, getNx2Api } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const { loadFilenames, matchFilenames } = await import('../../../../../../blocks/browse/v2/da-browse-search/utils.js');
const { getBrowseItemHref } = await import('../../../../../../blocks/browse/v2/shared/navigation.js');

describe('browse filename catalog', () => {
  const first = { path: '/o/r/plan.html', name: 'plan', ext: 'html', isChecked: true };
  const second = { path: '/o/r/PLAN.json', name: 'PLAN', ext: 'json' };
  let list;
  let onPage;
  let controller;
  let snapshot;

  beforeEach(() => {
    list = stub();
    onPage = spy();
    controller = new AbortController();
    snapshot = {
      fullpath: '/o/r',
      items: Object.freeze([Object.freeze({ ...first })]),
      continuationToken: 'one',
      complete: false,
    };
  });

  const load = () => loadFilenames({ snapshot, list, onPage, signal: controller.signal });

  it('matches names and extensions with the selected case rule', () => {
    const items = [first, second, { path: '/o/r/plans', name: 'plans' }];
    expect(matchFilenames({ items, query: ' plan ' })).to.deep.equal([first, items[2]]);
    expect(matchFilenames({ items, query: 'plan', matchCase: false })).to.deep.equal(items);
    expect(matchFilenames({ items, query: '.json' })).to.deep.equal([second]);
    expect(matchFilenames({ items, query: '.*' })).to.deep.equal([]);
  });

  it('fetches remaining metadata pages without changing seeded rows or paging state', async () => {
    list.onFirstCall().resolves({ ok: true, items: [first, second], continuationToken: 'two' });
    list.onSecondCall().resolves({ ok: true, items: [{ path: '/o/r/plans', name: 'plans' }, second] });
    const result = await load();
    expect(result.map((item) => item.path)).to.deep.equal([first.path, second.path, '/o/r/plans']);
    expect(list.args).to.deep.equal([
      ['/o/r', { continuationToken: 'one' }],
      ['/o/r', { continuationToken: 'two' }],
    ]);
    expect(onPage.callCount).to.equal(2);
    expect(snapshot.continuationToken).to.equal('one');
    expect(snapshot.complete).to.be.false;
    expect(snapshot.items).to.deep.equal([first]);
    expect(result[0].isChecked).to.be.true;
  });

  it('does not fetch when the seed includes the complete listing', async () => {
    snapshot.complete = true;
    snapshot.continuationToken = undefined;
    expect(await load()).to.deep.equal([first]);
    expect(list.called).to.be.false;
  });

  it('reports incomplete snapshots and stalled pagination rather than false completeness', async () => {
    snapshot.continuationToken = undefined;
    try {
      await load();
      expect.fail('Expected incomplete-list error');
    } catch (error) {
      expect(error.message).to.equal('Directory listing is incomplete');
    }
    snapshot.continuationToken = 'one';
    list.resolves({ ok: true, items: [second], continuationToken: 'one' });
    try {
      await load();
      expect.fail('Expected stalled-page error');
    } catch (error) {
      expect(error.message).to.equal('Directory pagination did not advance');
    }
    expect(list.calledOnce).to.be.true;
  });

  it('rejects denied, malformed, and failed page responses', async () => {
    for (const page of [
      { error: 'Not permitted', status: 403 },
      { ok: false, status: 500 },
      { ok: true, items: null },
    ]) {
      list.resolves(page);
      try {
        await load();
        expect.fail('Expected page error');
      } catch (error) {
        expect(error.message).to.match(/Not permitted|Directory request failed/);
      }
    }
    list.rejects(new Error('Offline'));
    try {
      await load();
      expect.fail('Expected network error');
    } catch (error) {
      expect(error.message).to.equal('bad result');
    }
    expect(onPage.called).to.be.false;
  });

  it('ignores late pages after cancellation and does not request another page', async () => {
    let finish;
    list.returns(new Promise((resolve) => { finish = resolve; }));
    const result = load().catch((error) => error);
    controller.abort();
    finish({ ok: true, items: [second], continuationToken: 'two' });
    expect((await result).name).to.equal('AbortError');
    expect(list.calledOnce).to.be.true;
    expect(onPage.called).to.be.false;
  });

  it('bounds each page request at the existing 30-second timeout', async () => {
    const clock = useFakeTimers();
    try {
      list.returns(new Promise(() => { }));
      const result = load().catch((error) => error);
      await clock.tickAsync(29999);
      expect(onPage.called).to.be.false;
      await clock.tickAsync(1);
      expect((await result).message).to.equal('timeout');
    } finally {
      clock.restore();
    }
  });
});

describe('browse suggestion navigation', () => {
  it('preserves folder, page, sheet, media, canvas, and custom editor routes', () => {
    expect(getBrowseItemHref({ path: '/o/r/folder' })).to.equal('#/o/r/folder');
    expect(getBrowseItemHref({ path: '/o/r/page.html', ext: 'html', editor: '/edit#' })).to.equal('/edit#/o/r/page');
    expect(getBrowseItemHref({ path: '/o/r/page.html', ext: 'html', editor: '/canvas#' })).to.equal('/canvas#/o/r/page');
    expect(getBrowseItemHref({ path: '/o/r/data.json', ext: 'json' })).to.equal('/sheet#/o/r/data');
    expect(getBrowseItemHref({ path: '/o/r/image.png', ext: 'png' })).to.equal('/media#/o/r/image.png');
    expect(getBrowseItemHref({ path: '/o/r/path/page.html', ext: 'html', editor: 'https://experience.adobe.com/editor' })).to.equal('https://experience.adobe.com/editor/path/page');
  });

  it('resolves external links only when asked and surfaces failed or empty destinations', async () => {
    const { source } = await getNx2Api();
    const get = stub(source, 'get');
    try {
      get.resolves(new Response(JSON.stringify({ externalUrl: 'https://example.com/page' })));
      expect(await getBrowseItemHref({ path: '/o/r/page.link', ext: 'link' })).to.equal('https://example.com/page');
      expect(get.calledOnceWithExactly('/o/r/page.link')).to.be.true;
      get.resolves(new Response('', { status: 403 }));
      try {
        await getBrowseItemHref({ path: '/o/r/page.link', ext: 'link' });
        expect.fail('Expected permission error');
      } catch (error) {
        expect(error.message).to.contain('403');
      }
      get.resolves(new Response('{}'));
      try {
        await getBrowseItemHref({ path: '/o/r/page.link', ext: 'link' });
        expect.fail('Expected missing destination error');
      } catch (error) {
        expect(error.message).to.equal('Link has no destination');
      }
    } finally {
      get.restore();
    }
  });
});
