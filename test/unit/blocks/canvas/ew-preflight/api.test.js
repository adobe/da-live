import { expect } from '@esm-bundle/chai';
import { evaluatePage, getEcOrigin } from '../../../../../blocks/canvas/ew-preflight/api.js';

describe('ew-preflight evaluatePage errors', () => {
  let savedFetch;
  let savedIms;
  let savedNxIms;

  beforeEach(() => {
    savedFetch = window.fetch;
    savedIms = window.adobeIMS;
    savedNxIms = localStorage.getItem('nx-ims');
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'tok' }) };
  });

  afterEach(() => {
    window.fetch = savedFetch;
    window.adobeIMS = savedIms;
    if (savedNxIms === null) localStorage.removeItem('nx-ims');
    else localStorage.setItem('nx-ims', savedNxIms);
  });

  async function errorFor(body, status) {
    window.fetch = () => Promise.resolve(new Response(body, { status }));
    try {
      await evaluatePage('https://example.com/page');
    } catch (e) {
      return e;
    }
    throw new Error('expected evaluatePage to throw');
  }

  it('uses the error field when detail is missing', async () => {
    const e = await errorFor(JSON.stringify({ error: 'Forbidden' }), 403);
    expect(e.detail).to.equal('Forbidden (403)');
    expect(e.status).to.equal(403);
  });

  it('prefers detail over error', async () => {
    const e = await errorFor(JSON.stringify({ detail: 'No brand', error: 'x' }), 404);
    expect(e.detail).to.equal('No brand (404)');
  });

  it('ignores non-string detail values', async () => {
    const e = await errorFor(JSON.stringify({ detail: [{ msg: 'bad' }] }), 422);
    expect(e.detail).to.equal('Evaluate page failed (422)');
  });

  it('falls back to the status when the body is not JSON', async () => {
    const e = await errorFor('oops', 500);
    expect(e.detail).to.equal('Evaluate page failed (500)');
  });

  it('reports a missing token without calling the API', async () => {
    let called = false;
    window.fetch = () => { called = true; };
    window.adobeIMS = { getAccessToken: () => null };
    const e = await evaluatePage('https://example.com/page').catch((err) => err);
    expect(e.detail).to.equal('Not authenticated');
    expect(called).to.equal(false);
  });
});

describe('ew-preflight getEcOrigin', () => {
  const PROD = 'https://experience-context.adobe.io';
  const STAGE = 'https://experience-context-stage.adobe.io';
  const EPHEMERAL = 'https://adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io';
  const loc = (search = '', hostname = 'da.live') => ({ search, hostname });
  let savedEc;

  beforeEach(() => {
    savedEc = localStorage.getItem('ec');
    localStorage.removeItem('ec');
  });

  afterEach(() => {
    if (savedEc === null) localStorage.removeItem('ec');
    else localStorage.setItem('ec', savedEc);
  });

  it('defaults to prod, and to stage on branch previews and localhost', () => {
    expect(getEcOrigin(loc())).to.equal(PROD);
    expect(getEcOrigin(loc('', 'main--da-live--adobe.aem.live'))).to.equal(PROD);
    expect(getEcOrigin(loc('', 'main--da-live--adobe.aem.page'))).to.equal(STAGE);
    expect(getEcOrigin(loc('', 'localhost'))).to.equal(STAGE);
  });

  it('honours ec=prod and ec=stage', () => {
    expect(getEcOrigin(loc('?ec=stage'))).to.equal(STAGE);
    expect(getEcOrigin(loc('?ec=prod', 'localhost'))).to.equal(PROD);
  });

  it('accepts an ephemeral URL and keeps only its origin', () => {
    expect(getEcOrigin(loc(`?ec=${EPHEMERAL}/api/`))).to.equal(EPHEMERAL);
  });

  [
    'http://adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io',
    'https://other-team-app-deploy-1f1d86.stage.cloud.adobe.io',
    'https://adobe-aem-foundation-brand-governance-agent-deploy-1f1d8g.stage.cloud.adobe.io',
    'https://adobe-aem-foundation-brand-governance-agent-deploy-1f1d861.stage.cloud.adobe.io',
    'https://adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io.evil.com',
    'https://evil.com/adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io',
    'https://user:pw@adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io',
    'https://adobe-aem-foundation-brand-governance-agent-deploy-1f1d86.stage.cloud.adobe.io:8443',
    'https://adobe-aem-foundation-brand-governance-agent-deploy-51dc93.cloud.adobe.io',
    'constructor',
    'not a url',
  ].forEach((value) => {
    it(`rejects ${value}`, () => {
      expect(getEcOrigin(loc(`?ec=${encodeURIComponent(value)}`))).to.equal(PROD);
      // Stored as-is like getDaEnv, but still rejected on subsequent reads.
      expect(getEcOrigin(loc())).to.equal(PROD);
    });
  });

  it('persists the value until ec=reset', () => {
    getEcOrigin(loc(`?ec=${EPHEMERAL}`));
    expect(getEcOrigin(loc())).to.equal(EPHEMERAL);
    expect(getEcOrigin(loc('?ec=reset'))).to.equal(PROD);
    expect(getEcOrigin(loc())).to.equal(PROD);
  });

  it('evaluatePage calls the resolved origin', async () => {
    const savedFetch = window.fetch;
    const savedIms = window.adobeIMS;
    const savedNxIms = localStorage.getItem('nx-ims');
    localStorage.setItem('nx-ims', 'true');
    window.adobeIMS = { getAccessToken: () => ({ token: 'tok' }) };
    localStorage.setItem('ec', EPHEMERAL);
    let calledUrl;
    window.fetch = (url) => {
      calledUrl = url;
      return Promise.resolve(new Response('{}', { status: 200 }));
    };
    try {
      await evaluatePage('https://example.com/page');
    } finally {
      window.fetch = savedFetch;
      window.adobeIMS = savedIms;
      if (savedNxIms === null) localStorage.removeItem('nx-ims');
      else localStorage.setItem('nx-ims', savedNxIms);
    }
    expect(calledUrl).to.equal(`${EPHEMERAL}/api/v0/evaluate/page`);
  });
});
