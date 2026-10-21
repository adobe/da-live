import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let sessionErrorFromResponse;
let createdDocSession;

before(async () => {
  ({ sessionErrorFromResponse, createdDocSession } = await import('../../../../../blocks/canvas/ew-editor-doc/utils/load-editor-doc.js'));
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

  it('flags a missing document so the caller can prompt to create it', () => {
    expect(sessionErrorFromResponse(respond(404))).to.deep.equal({
      ok: false,
      notFound: true,
    });
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

describe('createdDocSession', () => {
  const notFound = { ok: false, notFound: true, token: 'tok', sourceUrl: 'https://s/doc.html' };

  it('takes the write grant from the save response, not the read-defaulted lookup', () => {
    const session = createdDocSession(notFound, { ok: true, permissions: ['read', 'write'] });
    expect(session).to.deep.equal({
      ok: true,
      token: 'tok',
      permissions: ['read', 'write'],
      sourceUrl: 'https://s/doc.html',
    });
  });

  it('carries the token and sourceUrl through from the not-found lookup', () => {
    const session = createdDocSession(notFound, { ok: true, permissions: ['write'] });
    expect(session.token).to.equal('tok');
    expect(session.sourceUrl).to.equal('https://s/doc.html');
  });

  it('falls back to read-only when the save response omits permissions', () => {
    expect(createdDocSession(notFound, { ok: true }).permissions).to.deep.equal(['read']);
  });
});
