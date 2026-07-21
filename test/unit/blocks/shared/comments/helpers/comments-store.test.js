import { expect } from '@esm-bundle/chai';
import { createCommentsStore } from '../../../../../../blocks/shared/comments/helpers/comments-store.js';

let originalFetch;

function mockFetch(handler) {
  if (!originalFetch) originalFetch = window.fetch;
  window.fetch = (url, opts) => Promise.resolve(handler({ url: url.toString(), opts }));
}

function restoreFetch() {
  if (originalFetch) window.fetch = originalFetch;
  originalFetch = null;
}

function makeServerMock({ failNext = false, onCall } = {}) {
  const serverData = new Map();
  let shouldFail = failNext;
  mockFetch(async ({ url, opts }) => {
    const method = opts?.method || 'GET';
    onCall?.({ url, method });
    const id = url.split('/').pop().replace('.json', '');

    if (method === 'POST') {
      if (shouldFail) {
        shouldFail = false;
        return new Response(null, { status: 500 });
      }
      const text = await opts.body.get('data').text();
      serverData.set(id, JSON.parse(text));
      return new Response(null, { status: 200 });
    }
    if (method === 'DELETE') {
      if (shouldFail) {
        shouldFail = false;
        return new Response(null, { status: 500 });
      }
      serverData.delete(id);
      return new Response(null, { status: 200 });
    }
    if (url.includes('/list/')) {
      const list = [...serverData.keys()].map((k) => ({ name: `${k}.json` }));
      return new Response(JSON.stringify(list), { status: 200 });
    }
    if (serverData.has(id)) {
      return new Response(JSON.stringify(serverData.get(id)), { status: 200 });
    }
    return new Response(null, { status: 404 });
  });
  return serverData;
}

describe('comments-store: store basics', () => {
  let store;

  beforeEach(() => {
    makeServerMock();
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
  });
  afterEach(() => restoreFetch());

  it('starts empty', () => {
    expect(store.size).to.equal(0);
    let count = 0;
    store.forEach(() => { count += 1; });
    expect(count).to.equal(0);
  });

  it('is not loaded until the first load completes', async () => {
    expect(store.loaded).to.equal(false);
    await store.load();
    expect(store.loaded).to.equal(true);
  });

  it('notifies once on the first load even when there are no comments', async () => {
    let fired = 0;
    store.observe(() => { fired += 1; });
    await store.load();
    expect(fired).to.equal(1);
    expect(store.loaded).to.equal(true);
  });

  it('get returns undefined for missing ids', () => {
    expect(store.get('missing')).to.be.undefined;
  });

  it('observe fires after successful set', async () => {
    let fired = 0;
    store.observe(() => { fired += 1; });
    await store.set('a', { id: 'a', body: 'hi' });
    expect(fired).to.equal(1);
  });

  it('unobserve stops the callback', async () => {
    let fired = 0;
    const fn = () => { fired += 1; };
    store.observe(fn);
    store.unobserve(fn);
    await store.set('a', { id: 'a', body: 'hi' });
    expect(fired).to.equal(0);
  });

  it('forEach iterates with (value, id, map) signature', async () => {
    await store.set('a', { id: 'a', body: '1' });
    await store.set('b', { id: 'b', body: '2' });
    const seen = [];
    store.forEach((_value, id, map) => {
      seen.push({ id, isMap: map === store });
    });
    expect(seen.length).to.equal(2);
    expect(seen[0].id).to.equal('a');
    expect(seen[0].isMap).to.be.true;
    expect(seen[1].id).to.equal('b');
  });
});

describe('comments-store: store writes', () => {
  let store;
  let fetchCalls;

  beforeEach(() => {
    fetchCalls = [];
  });
  afterEach(() => restoreFetch());

  it('set POSTs to the correct URL then reloads — value is in store after await', async () => {
    makeServerMock({ onCall: ({ url, method }) => fetchCalls.push({ url, method }) });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    let fired = 0;
    store.observe(() => { fired += 1; });

    await store.set('a', { id: 'a', body: 'hi' });

    expect(store.get('a')).to.deep.equal({ id: 'a', body: 'hi' });
    expect(fired).to.equal(1);
    const postCall = fetchCalls.find((c) => c.method === 'POST');
    expect(postCall.url).to.include('/source/o/r/.da/comments/doc-1/a.json');
  });

  it('set on failure throws and leaves cache unchanged', async () => {
    makeServerMock({ failNext: true });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    let fired = 0;
    store.observe(() => { fired += 1; });

    let thrown;
    try {
      await store.set('a', { id: 'a', body: 'hi' });
    } catch (err) {
      thrown = err;
    }

    expect(thrown).to.be.an('error');
    expect(thrown.message).to.include('[comments]');
    expect(store.get('a')).to.be.undefined;
    expect(fired).to.equal(0);
  });

  it('delete DELETEs the correct URL then reloads — value removed after await', async () => {
    makeServerMock({ onCall: ({ url, method }) => fetchCalls.push({ url, method }) });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.set('a', { id: 'a', body: 'hi' });
    fetchCalls.length = 0;

    let fired = 0;
    store.observe(() => { fired += 1; });

    await store.delete('a');

    expect(store.get('a')).to.be.undefined;
    expect(fired).to.equal(1);
    const deleteCall = fetchCalls.find((c) => c.method === 'DELETE');
    expect(deleteCall.url).to.include('/source/o/r/.da/comments/doc-1/a.json');
  });

  it('delete on failure throws and leaves cache unchanged', async () => {
    makeServerMock();
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.set('a', { id: 'a', body: 'hi' });

    makeServerMock({ failNext: true });
    let thrown;
    try {
      await store.delete('a');
    } catch (err) {
      thrown = err;
    }

    expect(thrown).to.be.an('error');
    expect(thrown.message).to.include('[comments]');
    expect(store.get('a')).to.deep.equal({ id: 'a', body: 'hi' });
  });
});

describe('comments-store: store load and refresh', () => {
  let store;
  let fetchCalls;

  function track(handler) {
    mockFetch(({ url, opts }) => {
      fetchCalls.push({ url, method: opts?.method || 'GET' });
      return handler({ url, opts });
    });
  }

  beforeEach(() => { fetchCalls = []; });
  afterEach(() => restoreFetch());

  it('load lists then fetches each comment in parallel', async () => {
    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([
          { name: 'a.json' },
          { name: 'b.json' },
        ]), { status: 200 });
      }
      if (url.endsWith('/a.json')) {
        return new Response(JSON.stringify({ id: 'a', body: 'A' }), { status: 200 });
      }
      if (url.endsWith('/b.json')) {
        return new Response(JSON.stringify({ id: 'b', body: 'B' }), { status: 200 });
      }
      return new Response(null, { status: 404 });
    });

    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.load();

    expect(store.size).to.equal(2);
    expect(store.get('a').body).to.equal('A');
    expect(store.get('b').body).to.equal('B');

    const urls = fetchCalls.map((c) => c.url);
    expect(urls.some((u) => u.includes('/list/o/r/.da/comments/doc-1/'))).to.be.true;
    expect(urls.some((u) => u.endsWith('/a.json'))).to.be.true;
    expect(urls.some((u) => u.endsWith('/b.json'))).to.be.true;
  });

  it('load fires observer once after the full load', async () => {
    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'a.json' }, { name: 'b.json' }]), { status: 200 });
      }
      const id = url.split('/').pop().replace('.json', '');
      return new Response(JSON.stringify({ id, body: id.toUpperCase() }), { status: 200 });
    });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    let fired = 0;
    store.observe(() => { fired += 1; });
    await store.load();
    expect(fired).to.equal(1);
  });

  it('refresh fetches new ids and drops removed ids', async () => {
    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'a.json' }, { name: 'b.json' }]), { status: 200 });
      }
      const id = url.split('/').pop().replace('.json', '');
      return new Response(JSON.stringify({ id, body: `${id}-v1` }), { status: 200 });
    });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.load();
    expect(store.size).to.equal(2);

    let fired = 0;
    store.observe(() => { fired += 1; });

    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'b.json' }, { name: 'c.json' }]), { status: 200 });
      }
      if (url.endsWith('/c.json')) {
        return new Response(JSON.stringify({ id: 'c', body: 'c-v1' }), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'b', body: 'b-v1' }), { status: 200 });
    });

    await store.refresh();
    expect(store.get('a')).to.be.undefined;
    expect(store.get('b')).to.exist;
    expect(store.get('c')).to.exist;
    expect(fired).to.equal(1);
  });

  it('refresh re-fetches existing ids and picks up remote edits', async () => {
    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'a.json' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'a', body: 'A-v1' }), { status: 200 });
    });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.load();
    expect(store.get('a').body).to.equal('A-v1');

    let fired = 0;
    store.observe(() => { fired += 1; });

    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'a.json' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'a', body: 'A-v2' }), { status: 200 });
    });
    await store.refresh();
    expect(store.get('a').body).to.equal('A-v2');
    expect(fired).to.equal(1);
  });

  it('refresh does not fire observers when nothing changed', async () => {
    track(({ url }) => {
      if (url.includes('/list/')) {
        return new Response(JSON.stringify([{ name: 'a.json' }]), { status: 200 });
      }
      return new Response(JSON.stringify({ id: 'a', body: 'A-v1' }), { status: 200 });
    });
    store = createCommentsStore({ docId: 'doc-1', owner: 'o', repo: 'r' });
    await store.load();

    let fired = 0;
    store.observe(() => { fired += 1; });
    await store.refresh();
    expect(fired).to.equal(0);
  });
});
