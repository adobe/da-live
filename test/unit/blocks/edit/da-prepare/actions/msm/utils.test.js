import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../../../scripts/utils.js';
import {
  previewSatellite,
  publishSatellite,
  createOverride,
  deleteOverride,
  mergeFromBase,
  setMergeCopy,
  getSatellitePageStatus,
} from '../../../../../../../blocks/edit/da-prepare/actions/msm/helpers/utils.js';
import paced, { setPaceOptions } from '../../../../../../../blocks/edit/da-prepare/actions/msm/helpers/pace.js';

const PING = 'https://admin.hlx.page/ping/';

// isHlx6 memoizes per org/site, so Helix 6 cases use their own site names.
// Pings for `hlx6Sites` answer with the upgrade header; every other call is
// recorded and handed to `handler`.
function hlx6Fetch(hlx6Sites, handler, calls = []) {
  return async (url, opts = {}) => {
    if (url.startsWith(PING)) {
      const site = url.slice(PING.length).split('/')[1];
      const headers = hlx6Sites.includes(site) ? { 'x-api-upgrade-available': 'true' } : {};
      return new Response('', { status: 200, headers });
    }
    calls.push({ url, method: opts.method || 'GET', opts });
    return handler(url, opts);
  };
}

describe('MSM utils', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
    // source and AEM calls go through the nx2 api (per-site Helix 6 routing)
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
    setPaceOptions({ sleep: () => Promise.resolve(), minIntervalMs: 0 });
  });

  afterEach(() => {
    window.localStorage.removeItem('hlx6-upgrade');
    window.fetch = savedFetch;
    if (savedLocalStorage) {
      window.localStorage.setItem('nx-ims', savedLocalStorage);
    } else {
      window.localStorage.removeItem('nx-ims');
    }
  });

  describe('previewSatellite', () => {
    it('POSTs to the correct AEM admin preview URL', async () => {
      let capturedUrl;
      let capturedMethod;
      window.fetch = (url, opts) => {
        capturedUrl = url;
        capturedMethod = opts.method;
        return Promise.resolve(
          new Response(JSON.stringify({ preview: { url: 'https://preview.example.com' } }), { status: 200 }),
        );
      };

      const result = await previewSatellite('org', 'san-diego-mccs', '/about');
      expect(capturedUrl).to.equal('https://admin.hlx.page/preview/org/san-diego-mccs/main/about');
      expect(capturedMethod).to.equal('POST');
      expect(result.preview).to.exist;
    });

    it('strips .html from the path', async () => {
      let capturedUrl;
      window.fetch = (url) => {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ preview: {} }), { status: 200 }),
        );
      };

      await previewSatellite('org', 'san-diego-mccs', '/about.html');
      expect(capturedUrl).to.not.include('.html');
    });

    it('returns error on failure', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));

      const result = await previewSatellite('org', 'san-diego-mccs', '/about');
      expect(result.error).to.exist;
    });
  });

  describe('publishSatellite', () => {
    it('POSTs to the correct AEM admin live URL', async () => {
      let capturedUrl;
      window.fetch = (url) => {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({ live: { url: 'https://live.example.com' } }), { status: 200 }),
        );
      };

      const result = await publishSatellite('org', 'san-diego-mccs', '/about');
      expect(capturedUrl).to.equal('https://admin.hlx.page/live/org/san-diego-mccs/main/about');
      expect(result.live).to.exist;
    });

    it('returns error on failure', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 403 }));

      const result = await publishSatellite('org', 'san-diego-mccs', '/about');
      expect(result.error).to.exist;
    });
  });

  describe('createOverride', () => {
    it('copies the base page to the satellite', async () => {
      const calls = [];
      window.fetch = hlx6Fetch([], () => Promise.resolve(new Response('', { status: 200 })), calls);

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;

      const copyCall = calls.find((c) => c.method === 'POST');
      expect(copyCall.url).to.equal('https://admin.da.live/copy/org/mccs/about.html');
      expect(copyCall.opts.body.get('destination')).to.equal('/org/san-diego-mccs/about.html');
    });

    it('returns error when the copy fails', async () => {
      window.fetch = hlx6Fetch([], () => Promise.resolve(new Response('', { status: 404 })));

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.include('create override');
      expect(result.error).to.include('404');
    });
  });

  describe('getSatellitePageStatus', () => {
    it('returns preview and live status from AEM admin', async () => {
      let capturedUrl;
      window.fetch = (url) => {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({
            preview: { status: 200 },
            live: { status: 200 },
          }), { status: 200 }),
        );
      };

      const status = await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      expect(capturedUrl).to.equal('https://admin.hlx.page/status/org/san-diego-mccs/main/about');
      expect(status.preview).to.be.true;
      expect(status.live).to.be.true;
    });

    it('returns preview-only when live is 404', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify({
          preview: { status: 200 },
          live: { status: 404 },
        }), { status: 200 }),
      );

      const status = await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      expect(status.preview).to.be.true;
      expect(status.live).to.be.false;
    });

    it('returns false for both when fetch fails', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));

      const status = await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      expect(status.preview).to.be.false;
      expect(status.live).to.be.false;
    });

    it('strips .html from the path', async () => {
      let capturedUrl;
      window.fetch = (url) => {
        capturedUrl = url;
        return Promise.resolve(
          new Response(JSON.stringify({
            preview: { status: 404 },
            live: { status: 404 },
          }), { status: 200 }),
        );
      };

      await getSatellitePageStatus('org', 'san-diego-mccs', '/about.html');
      expect(capturedUrl).to.not.include('.html');
    });
  });

  describe('deleteOverride', () => {
    it('DELETEs the satellite page', async () => {
      let capturedUrl;
      let capturedMethod;
      window.fetch = (url, opts) => {
        capturedUrl = url;
        capturedMethod = opts.method;
        return Promise.resolve(new Response(null, { status: 204 }));
      };

      const result = await deleteOverride('org', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;
      expect(capturedUrl).to.include('/san-diego-mccs/about.html');
      expect(capturedMethod).to.equal('DELETE');
    });

    it('returns error on failure', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));

      const result = await deleteOverride('org', 'san-diego-mccs', '/about');
      expect(result.error).to.include('delete override');
    });
  });

  describe('mergeFromBase', () => {
    afterEach(() => {
      setMergeCopy(null);
    });

    it('calls mergeCopy with correct url object and returns editUrl', async () => {
      let capturedUrl;
      let capturedTitle;
      setMergeCopy(async (url, title) => {
        capturedUrl = url;
        capturedTitle = title;
        return { ok: true };
      });

      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;
      expect(result.editUrl).to.include('/edit#/org/san-diego-mccs/about');
      expect(capturedUrl.source).to.equal('/org/mccs/about.html');
      expect(capturedUrl.destination).to.equal('/org/san-diego-mccs/about.html');
      expect(capturedTitle).to.equal('MSM Merge');
    });

    it('returns error when mergeCopy returns not ok', async () => {
      setMergeCopy(async () => ({ ok: false }));

      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.equal('Merge failed');
    });

    it('returns error when mergeCopy throws', async () => {
      setMergeCopy(async () => { throw new Error('Network error'); });

      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.equal('Network error');
    });
  });

  describe('on Helix 6 sites', () => {
    it('previews through api.aem.live', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['h6-prev'], () => Promise.resolve(new Response('{}', { status: 200 })), calls);

      const result = await previewSatellite('org', 'h6-prev', '/about');
      expect(result.error).to.be.undefined;
      expect(calls[0].url).to.equal('https://api.aem.live/org/sites/h6-prev/preview/about');
      expect(calls[0].method).to.equal('POST');
    });

    it('publishes through api.aem.live', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['h6-pub'], () => Promise.resolve(new Response('{}', { status: 200 })), calls);

      await publishSatellite('org', 'h6-pub', '/about');
      expect(calls[0].url).to.equal('https://api.aem.live/org/sites/h6-pub/live/about');
      expect(calls[0].method).to.equal('POST');
    });

    it('reads page status through api.aem.live', async () => {
      const calls = [];
      const body = JSON.stringify({ preview: { status: 200 }, live: { status: 404 } });
      window.fetch = hlx6Fetch(['h6-status'], () => Promise.resolve(new Response(body, { status: 200 })), calls);

      const status = await getSatellitePageStatus('org', 'h6-status', '/about');
      expect(calls[0].url).to.equal('https://api.aem.live/org/sites/h6-status/status/about');
      expect(status).to.deep.equal({ preview: true, live: false });
    });

    it('deletes the satellite page in the source bus', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['h6-del'], () => Promise.resolve(new Response(null, { status: 204 })), calls);

      const result = await deleteOverride('org', 'h6-del', '/about');
      expect(result.ok).to.be.true;
      expect(calls[0].url).to.equal('https://api.aem.live/org/sites/h6-del/source/about.html');
      expect(calls[0].method).to.equal('DELETE');
    });

    it('copies a Helix 6 base page to a legacy satellite', async () => {
      const calls = [];
      const html = '<body><main><img src="./media_1.png"></main></body>';
      window.fetch = hlx6Fetch(['h6-base1'], (url) => {
        if (url.startsWith('https://api.aem.live/')) return Promise.resolve(new Response(html, { status: 200 }));
        return Promise.resolve(new Response('', { status: 201 }));
      }, calls);

      const result = await createOverride('org', 'h6-base1', 'legacy-sat1', '/about');
      expect(result.ok).to.be.true;
      expect(calls[0].url).to.equal('https://api.aem.live/org/sites/h6-base1/source/about.html');
      const save = calls[1];
      expect(save.url).to.equal('https://admin.da.live/source/org/legacy-sat1/about.html');
      expect(save.method).to.equal('POST');
      const saved = await save.opts.body.get('data').text();
      expect(saved).to.include('src="https://main--h6-base1--org.aem.page/media_1.png"');
    });

    it('copies a legacy base page to a Helix 6 satellite', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['h6-sat2'], (url) => {
        if (url.startsWith('https://admin.da.live/')) return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
        return Promise.resolve(new Response('', { status: 201 }));
      }, calls);

      const result = await createOverride('org', 'legacy-base2', 'h6-sat2', '/about');
      expect(result.ok).to.be.true;
      expect(calls[0].url).to.equal('https://admin.da.live/source/org/legacy-base2/about.html');
      const save = calls[1];
      expect(save.url).to.equal('https://api.aem.live/org/sites/h6-sat2/source/about.html');
      expect(save.method).to.equal('POST');
      expect(save.opts.body).to.equal('<p>Base</p>');
      expect(save.opts.headers['Content-Type']).to.equal('text/html');
    });

    it('copies between two Helix 6 sites with a raw source write', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['h6-base3', 'h6-sat3'], (url, opts) => {
        if (opts.method === 'POST') return Promise.resolve(new Response('', { status: 201 }));
        return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
      }, calls);

      const result = await createOverride('org', 'h6-base3', 'h6-sat3', '/about');
      expect(result.ok).to.be.true;
      expect(calls.map((c) => `${c.method} ${c.url}`)).to.deep.equal([
        'GET https://api.aem.live/org/sites/h6-base3/source/about.html',
        'POST https://api.aem.live/org/sites/h6-sat3/source/about.html',
      ]);
    });

    it('refuses to merge when the satellite is on Helix 6', async () => {
      let mergeCalled = false;
      setMergeCopy(async () => {
        mergeCalled = true;
        return { ok: true };
      });
      window.fetch = hlx6Fetch(['h6-sat4'], () => Promise.resolve(new Response('', { status: 200 })));

      const result = await mergeFromBase('org', 'legacy-base4', 'h6-sat4', '/about');
      setMergeCopy(null);
      expect(mergeCalled).to.be.false;
      expect(result.error).to.include('Helix 6');
    });

    it('refuses to merge when the base is on Helix 6', async () => {
      let mergeCalled = false;
      setMergeCopy(async () => {
        mergeCalled = true;
        return { ok: true };
      });
      window.fetch = hlx6Fetch(['h6-base5'], () => Promise.resolve(new Response('', { status: 200 })));

      const result = await mergeFromBase('org', 'h6-base5', 'legacy-sat5', '/about');
      setMergeCopy(null);
      expect(mergeCalled).to.be.false;
      expect(result.error).to.include('Helix 6');
    });
  });

  describe('pacing', () => {
    it('retries a 429 and honours x-retry-after', async () => {
      const waits = [];
      const sleep = (ms) => {
        waits.push(ms);
        return Promise.resolve();
      };
      setPaceOptions({ sleep, minIntervalMs: 0 });
      let count = 0;
      window.fetch = hlx6Fetch(['h6-retry'], () => {
        count += 1;
        if (count === 1) {
          return Promise.resolve(new Response('', { status: 429, headers: { 'x-retry-after': '3' } }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const result = await previewSatellite('org', 'h6-retry', '/about');
      expect(result.error).to.be.undefined;
      expect(count).to.equal(2);
      expect(waits).to.deep.equal([3000]);
    });

    it('retries a network error (a 429 without CORS headers)', async () => {
      let count = 0;
      window.fetch = hlx6Fetch(['h6-cors'], () => {
        count += 1;
        if (count === 1) return Promise.reject(new TypeError('Failed to fetch'));
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      const result = await publishSatellite('org', 'h6-cors', '/about');
      expect(result.error).to.be.undefined;
      expect(count).to.equal(2);
    });

    it('gives up after three retries and reports the error', async () => {
      window.fetch = hlx6Fetch(['h6-giveup'], () => Promise.resolve(new Response('', { status: 429 })));

      const result = await previewSatellite('org', 'h6-giveup', '/about');
      expect(result.error).to.include('429');
    });

    it('reports a request that keeps failing instead of throwing', async () => {
      window.fetch = hlx6Fetch(['h6-throw'], () => Promise.reject(new TypeError('Failed to fetch')));

      const result = await deleteOverride('org', 'h6-throw', '/about');
      expect(result.error).to.exist;
    });

    it('keeps at most four requests in flight', async () => {
      let inFlight = 0;
      let max = 0;
      const task = async () => {
        inFlight += 1;
        max = Math.max(max, inFlight);
        await new Promise((resolve) => { setTimeout(resolve, 5); });
        inFlight -= 1;
        return new Response('', { status: 200 });
      };

      await Promise.all(Array.from({ length: 10 }, () => paced(task)));
      expect(max).to.equal(4);
    });
  });
});
