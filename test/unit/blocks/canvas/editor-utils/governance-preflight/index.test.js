import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { buildPreviewUrl, evaluatePage } from '../../../../../../blocks/canvas/editor-utils/governance-preflight/index.js';

const EVALUATE_URL = 'https://enterprise-context.adobe.io/api/v0/evaluate/page';

describe('governance-preflight index', () => {
  describe('buildPreviewUrl', () => {
    it('builds the DA preview host url', () => {
      const url = buildPreviewUrl({ org: 'hmehta-adobe', site: 'az-poc-ch', path: '/en/heart-failure' });
      expect(url).to.equal('https://main--az-poc-ch--hmehta-adobe.preview.da.live/en/heart-failure');
    });
  });

  describe('evaluatePage', () => {
    let fetchStub;

    beforeEach(() => {
      fetchStub = sinon.stub(window, 'fetch');
    });

    afterEach(() => {
      fetchStub.restore();
    });

    it('POSTs the preview url with bearer + x-api-key and returns { json } on ok', async () => {
      const body = { pageUrl: 'x', brand_name: 'AstraZeneca', text_evaluation: {} };
      fetchStub.resolves(new Response(JSON.stringify(body), { status: 200 }));

      const result = await evaluatePage({
        org: 'hmehta-adobe',
        site: 'az-poc-ch',
        path: '/en/heart-failure',
        token: 'tok-123',
      });

      expect(result.json).to.deep.equal(body);

      const [calledUrl, opts] = fetchStub.firstCall.args;
      expect(calledUrl).to.equal(EVALUATE_URL);
      expect(opts.method).to.equal('POST');
      expect(opts.headers.Authorization).to.equal('Bearer tok-123');
      expect(opts.headers['x-api-key']).to.equal('darkalley');
      expect(JSON.parse(opts.body).url).to.equal('https://main--az-poc-ch--hmehta-adobe.preview.da.live/en/heart-failure');
    });

    it('returns { error, status } on a non-ok response', async () => {
      fetchStub.resolves(new Response('nope', { status: 403 }));

      const result = await evaluatePage({
        org: 'o',
        site: 's',
        path: '/p',
        token: 't',
      });

      expect(result.error).to.equal('Page evaluation failed.');
      expect(result.status).to.equal(403);
      expect(result.json).to.equal(undefined);
    });

    it('returns { error } when fetch throws (e.g. CORS/network)', async () => {
      fetchStub.rejects(new Error('CORS'));

      const result = await evaluatePage({
        org: 'o',
        site: 's',
        path: '/p',
        token: 't',
      });

      expect(result.error).to.equal('Page evaluation failed.');
      expect(result.status).to.equal(undefined);
    });
  });
});
