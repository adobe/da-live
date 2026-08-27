import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let sessionErrorFromResponse;

before(async () => {
  ({ sessionErrorFromResponse } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/load-editor-doc.js'));
});

const respond = (status, { headers = {}, ok } = {}) => ({
  status,
  ok: ok ?? (status >= 200 && status < 300),
  headers: new Headers(headers),
});

describe('sessionErrorFromResponse', () => {
  it('lets a document that loaded through', () => {
    expect(sessionErrorFromResponse(respond(200))).to.equal(null);
  });

  it('lets a missing document through, so it can be created', () => {
    expect(sessionErrorFromResponse(respond(404))).to.equal(null);
  });

  it('asks for a sign-in on 401', () => {
    expect(sessionErrorFromResponse(respond(401))).to.deep.equal({
      ok: false,
      error: 'Sign in required',
    });
  });

  it('reports a refusal on 403', () => {
    expect(sessionErrorFromResponse(respond(403))).to.deep.equal({
      ok: false,
      error: 'Not permitted',
    });
  });

  it('names the status instead of blaming permissions on 503', () => {
    expect(sessionErrorFromResponse(respond(503))).to.deep.equal({
      ok: false,
      error: 'Could not load the document (503)',
    });
  });

  it('adds the reason the store gave', () => {
    const resp = respond(500, { headers: { 'x-error': 'source lookup failed' } });
    expect(sessionErrorFromResponse(resp)).to.deep.equal({
      ok: false,
      error: 'Could not load the document (500): source lookup failed',
    });
  });

  it('says so when the store was never reached', () => {
    // nx2 daFetch answers {} when it has no token to send, which carries no status.
    expect(sessionErrorFromResponse({})).to.deep.equal({
      ok: false,
      error: 'Could not reach the content store',
    });
    expect(sessionErrorFromResponse(null)).to.deep.equal({
      ok: false,
      error: 'Could not reach the content store',
    });
  });
});
