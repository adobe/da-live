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

describe('MSM utils', () => {
  let savedFetch;
  let savedLocalStorage;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedLocalStorage = window.localStorage.getItem('nx-ims');
    window.localStorage.removeItem('nx-ims');
    // mergeFromBase loads the loc SDK from nx
    setNx('/test/fixtures/nx', { hostname: 'example.com' });
  });

  afterEach(() => {
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
    it('fetches base content and writes to satellite', async () => {
      const calls = [];
      window.fetch = (url, opts = {}) => {
        calls.push({ url, method: opts.method || 'GET' });
        if (url.includes('/mccs/')) {
          return Promise.resolve(new Response('<p>Base content</p>', { status: 200 }));
        }
        return Promise.resolve(new Response('', { status: 201 }));
      };

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.ok).to.be.true;

      const getCall = calls.find((c) => c.url.includes('/mccs/about'));
      expect(getCall).to.exist;

      const putCall = calls.find((c) => c.method === 'PUT');
      expect(putCall).to.exist;
      expect(putCall.url).to.include('/san-diego-mccs/about');
    });

    it('returns error when base fetch fails', async () => {
      window.fetch = () => Promise.resolve(new Response('', { status: 404 }));

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.include('base content');
    });

    it('returns error when satellite write fails', async () => {
      let callCount = 0;
      window.fetch = () => {
        callCount += 1;
        if (callCount === 1) {
          return Promise.resolve(new Response('<p>Content</p>', { status: 200 }));
        }
        return Promise.resolve(new Response('', { status: 500 }));
      };

      const result = await createOverride('org', 'mccs', 'san-diego-mccs', '/about');
      expect(result.error).to.include('create override');
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
});
