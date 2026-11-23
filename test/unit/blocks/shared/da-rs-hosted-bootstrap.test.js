import { expect } from '@esm-bundle/chai';
import { isDaRsDemoEligible, loadDaRsDemoState, isDaRsSelected } from '../../../../blocks/shared/da-rs-bootstrap.js';

const DEMO = { apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' };
const at = (origin) => {
  const { protocol, hostname } = new URL(origin);
  return { protocol, hostname, origin };
};

describe('da-rs demo bootstrap eligibility', () => {
  it('is limited to loopback http(s) hosts', () => {
    [
      'http://localhost:3000', 'http://127.0.0.1:3000', 'http://[::1]:3000', 'https://localhost',
    ].forEach((origin) => {
      expect(isDaRsDemoEligible(at(origin)), origin).to.equal(true);
    });
    [
      'https://da.live', 'https://da.page', 'https://main--site--org.aem.page',
      'https://localhost.evil.example', 'https://da.example',
    ].forEach((origin) => {
      expect(isDaRsDemoEligible(at(origin)), origin).to.equal(false);
    });
    expect(isDaRsDemoEligible({ protocol: 'file:', hostname: '', origin: 'null' })).to.equal(false);
  });

  it('never fetches or fails on hosted pages, whatever the network does', async () => {
    const failures = [
      () => { throw new Error('offline'); },
      () => new Response('', { status: 503 }),
      () => new Response('<html>not json</html>'),
      () => new Response(JSON.stringify(DEMO)),
    ];
    await Promise.all(failures.map(async (failure) => {
      let fetched = 0;
      const state = await loadDaRsDemoState(at('https://da.live'), async () => {
        fetched += 1;
        return failure();
      });
      expect(fetched).to.equal(0);
      expect(state.status).to.equal('absent');
    }));
  });

  it('keeps ready and fail-closed semantics for an eligible local demo', async () => {
    const local = at('http://localhost:3000');
    const load = (respond) => loadDaRsDemoState(local, async (url) => {
      expect(url).to.equal('http://localhost:3000/da-rs-demo.json');
      return respond();
    });
    expect((await load(() => new Response('', { status: 404 }))).status).to.equal('absent');
    expect((await load(() => new Response(JSON.stringify(DEMO)))).config.org).to.equal('demo');
    expect((await load(() => new Response('', { status: 503 }))).status).to.equal('failed');
    expect((await load(() => new Response('<html>'))).status).to.equal('failed');
    expect((await load(() => { throw new Error('offline'); })).status).to.equal('failed');
  });

  it('selects da-rs explicitly on any host and never by default on a hosted href', () => {
    expect(isDaRsSelected('https://da.live/?da-source=da-rs')).to.equal(true);
    expect(isDaRsSelected('https://da.live/?da-source=other')).to.equal(false);
    expect(isDaRsSelected('https://da.live/')).to.equal(false);
    expect(isDaRsSelected('https://da.live/#/org/site')).to.equal(false);
  });

  it('does not leak a failed local bootstrap state onto a hosted href', async () => {
    const originalFetch = window.fetch;
    window.fetch = async () => new Response('', { status: 503 });
    try {
      const url = new URL('../../../../blocks/shared/da-rs-bootstrap.js?hosted-failed-context', import.meta.url);
      const { daRsDemoState, isDaRsSelected: selected } = await import(url.href);
      expect(daRsDemoState.status).to.equal('failed');
      expect(selected('http://localhost:3001/')).to.equal(true);
      expect(selected('https://da.live/')).to.equal(false);
    } finally {
      window.fetch = originalFetch;
    }
  });
});
