import { expect } from '@esm-bundle/chai';
import { evaluatePage } from '../../../../../blocks/canvas/ew-preflight/api.js';

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
