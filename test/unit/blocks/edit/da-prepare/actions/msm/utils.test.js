import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx, getNx2 } from '../../../../../../../scripts/utils.js';
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
import { DA_ORIGIN } from '../../../../../../../blocks/shared/constants.js';

const PING = 'https://admin.hlx.page/ping/';

// Switches nx2's DA environment in the module instance nx2's api.js uses.
async function setDaAdmin(origin) {
  (await import(`${getNx2()}/utils/utils.js`)).setDaAdmin(origin);
}

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
    setPaceOptions({ sleep: () => Promise.resolve(), maxStartsPerSecond: Infinity });
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
    it('copies a legacy page with a read and a write', async () => {
      const calls = [];
      window.fetch = hlx6Fetch([], (url, opts) => {
        if (opts.method === 'PUT') return Promise.resolve(new Response('', { status: 201 }));
        return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
      }, calls);

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;
      expect(calls.map((c) => `${c.method} ${c.url}`)).to.deep.equal([
        `GET ${DA_ORIGIN}/source/org/mccs/about.html`,
        `PUT ${DA_ORIGIN}/source/org/san-diego-mccs/about.html`,
      ]);
      expect(await calls[1].opts.body.get('data').text()).to.equal('<p>Base</p>');
    });

    it('returns error and writes nothing when the base page is missing', async () => {
      const calls = [];
      window.fetch = hlx6Fetch([], () => Promise.resolve(new Response('', { status: 404 })), calls);

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.include('404');
      expect(calls.some((c) => c.method !== 'GET')).to.be.false;
    });

    it('returns error when the satellite write fails', async () => {
      window.fetch = hlx6Fetch([], (url, opts) => {
        if (opts.method === 'PUT') return Promise.resolve(new Response('', { status: 409 }));
        return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
      });

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.include('create override');
      expect(result.error).to.include('409');
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

    it('throws when the status request fails', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 500 }));

      let error;
      try {
        await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.include('500');
    });

    it('throws when the status request keeps failing', async () => {
      window.fetch = () => Promise.reject(new TypeError('Failed to fetch'));

      let error;
      try {
        await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.include('Failed to fetch');
    });

    it('throws when a rendition reports neither 200 nor 404', async () => {
      window.fetch = () => Promise.resolve(
        new Response(JSON.stringify({
          preview: { status: 200 },
          live: { status: 403 },
        }), { status: 200 }),
      );

      let error;
      try {
        await getSatellitePageStatus('org', 'san-diego-mccs', '/about');
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.include('san-diego-mccs');
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

    it('calls mergeCopy with the public loc options and returns editUrl', async () => {
      let captured;
      setMergeCopy(async (options) => {
        captured = options;
        return { ok: true };
      });

      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;
      expect(result.editUrl).to.include('/edit#/org/san-diego-mccs/about');
      expect(captured.urlSource).to.equal('/org/mccs/about.html');
      expect(captured.urlTarget).to.equal('/org/san-diego-mccs/about.html');
      expect(captured.msg).to.equal('MSM Merge');
      expect(captured.fetch).to.be.a('function');
      expect(captured.daOrigin).to.be.a('string');
    });

    it('loads mergeCopy from the public loc SDK by default', async () => {
      window.locMergeCalls = [];
      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;
      expect(window.locMergeCalls).to.have.length(1);
      expect(window.locMergeCalls[0].urlTarget).to.equal('/org/san-diego-mccs/about.html');
      delete window.locMergeCalls;
    });

    it('loads the SDK from nx when the page runs on nx2', async () => {
      setNx('/test/fixtures/nx2', { hostname: 'example.com' });
      window.locMergeCalls = [];
      try {
        const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
        expect(result.ok).to.be.true;
        expect(window.locMergeCalls).to.have.length(1);
      } finally {
        setNx('/test/fixtures/nx', { hostname: 'example.com' });
        delete window.locMergeCalls;
      }
    });

    it('returns the error details of a failed merge', async () => {
      setMergeCopy(async () => ({ ok: false, status: 401, error: 'Source read failed (401)' }));

      const result = await mergeFromBase('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.equal('Source read failed (401)');
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

  describe('when nx2 runs on another DA environment than the editor', () => {
    beforeEach(async () => {
      await setDaAdmin('https://stage-admin.da.live');
    });

    afterEach(async () => {
      await setDaAdmin('https://admin.da.live');
    });

    it('copies a legacy page in the editor\'s DA environment', async () => {
      const calls = [];
      window.fetch = hlx6Fetch([], (url, opts) => {
        if (opts.method === 'PUT') return Promise.resolve(new Response('', { status: 201 }));
        return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
      }, calls);

      const result = await createOverride('org', 'env-base1', 'env-sat1', '/about');
      expect(result.ok).to.be.true;
      expect(calls).to.have.length(2);
      expect(calls.every((c) => c.url.startsWith(`${DA_ORIGIN}/source/`))).to.be.true;
    });

    it('deletes a legacy page in the editor\'s DA environment', async () => {
      const calls = [];
      const deleted = () => Promise.resolve(new Response(null, { status: 204 }));
      window.fetch = hlx6Fetch([], deleted, calls);

      const result = await deleteOverride('org', 'env-sat2', '/about');
      expect(result.ok).to.be.true;
      expect(calls[0].url).to.equal(`${DA_ORIGIN}/source/org/env-sat2/about.html`);
    });

    it('refuses to copy between a legacy and a Helix 6 site', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['env-h6-sat3'], () => Promise.resolve(new Response('<p>Base</p>', { status: 200 })), calls);

      const result = await createOverride('org', 'env-base3', 'env-h6-sat3', '/about');
      expect(result.error).to.include('DA environment');
      expect(calls).to.have.length(0);
    });

    it('still copies between two Helix 6 sites', async () => {
      const calls = [];
      window.fetch = hlx6Fetch(['env-h6-base4', 'env-h6-sat4'], (url, opts) => {
        if (opts.method === 'POST') return Promise.resolve(new Response('', { status: 201 }));
        return Promise.resolve(new Response('<p>Base</p>', { status: 200 }));
      }, calls);

      const result = await createOverride('org', 'env-h6-base4', 'env-h6-sat4', '/about');
      expect(result.ok).to.be.true;
      expect(calls.map((c) => c.method)).to.deep.equal(['GET', 'POST']);
    });
  });

  describe('pacing', () => {
    it('retries a 429 and honours x-retry-after', async () => {
      const clock = sinon.useFakeTimers({ now: Date.now(), toFake: ['Date'] });
      const waits = [];
      const sleep = (ms) => {
        waits.push(ms);
        clock.tick(ms);
        return Promise.resolve();
      };
      setPaceOptions({ sleep, maxStartsPerSecond: Infinity });
      let count = 0;
      window.fetch = hlx6Fetch(['h6-retry'], () => {
        count += 1;
        if (count === 1) {
          return Promise.resolve(new Response('', { status: 429, headers: { 'x-retry-after': '3' } }));
        }
        return Promise.resolve(new Response('{}', { status: 200 }));
      });

      let result;
      try {
        result = await previewSatellite('org', 'h6-retry', '/about');
      } finally {
        clock.restore();
      }
      expect(result.error).to.be.undefined;
      expect(count).to.equal(2);
      expect(waits.at(-1)).to.equal(3000);
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
      let count = 0;
      window.fetch = hlx6Fetch(['h6-giveup'], () => {
        count += 1;
        return Promise.resolve(new Response('', { status: 429 }));
      });

      const result = await previewSatellite('org', 'h6-giveup', '/about');
      expect(result.error).to.include('429');
      expect(count).to.equal(4);
    });

    it('does not retry before a Retry-After longer than a minute', async () => {
      const waits = [];
      setPaceOptions({
        sleep: (ms) => {
          waits.push(ms);
          return Promise.resolve();
        },
        maxStartsPerSecond: Infinity,
      });
      let count = 0;
      const limited = () => {
        count += 1;
        return Promise.resolve(new Response('', { status: 429, headers: { 'x-retry-after': '120' } }));
      };

      const resp = await paced(limited);
      expect(resp.status).to.equal(429);
      expect(count).to.equal(1);
      expect(waits).to.deep.equal([]);

      let error;
      try {
        await paced(() => Promise.resolve(new Response('', { status: 200 })));
      } catch (e) {
        error = e;
      }
      expect(error?.message).to.include('try again');
    });

    describe('on a clock', () => {
      let clock;
      const timerSleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

      beforeEach(() => {
        clock = sinon.useFakeTimers({ now: Date.now() });
        setPaceOptions({ sleep: timerSleep });
      });

      afterEach(() => {
        clock.restore();
        setPaceOptions({ sleep: () => Promise.resolve(), maxStartsPerSecond: Infinity });
      });

      it('starts at most eight calls in any second, retries included', async () => {
        const starts = [];
        const calls = Array.from({ length: 15 }, (_, i) => {
          let failed = false;
          return paced(async () => {
            starts.push(Date.now());
            if (i < 4 && !failed) {
              failed = true;
              return new Response('', { status: 503 });
            }
            return new Response('', { status: 200 });
          });
        });
        await clock.runAllAsync();
        await Promise.all(calls);

        const inSecond = (t) => starts.filter((s) => s >= t && s < t + 1000).length;
        expect(starts).to.have.length(19);
        expect(Math.max(...starts.map(inSecond))).to.be.at.most(8);
      });

      it('holds every queued call until a Retry-After has passed', async () => {
        let limitedAt;
        const limited = paced(async () => {
          if (limitedAt) return new Response('', { status: 200 });
          limitedAt = Date.now();
          return new Response('', { status: 429, headers: { 'x-retry-after': '5' } });
        });
        // eslint-disable-next-line no-await-in-loop
        while (!limitedAt) await clock.nextAsync();
        await clock.tickAsync(0);

        let laterStart;
        const later = paced(async () => {
          laterStart = Date.now();
          return new Response('', { status: 200 });
        });
        await clock.runAllAsync();
        await Promise.all([limited, later]);

        expect(laterStart - limitedAt).to.be.at.least(5000);
      });
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
