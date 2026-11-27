import { expect } from '@esm-bundle/chai';
import { referencedOrgIds, listDirectoryOrgs, connectDirectory, disconnectDirectory } from '../../../../blocks/shared/directory.js';

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('shared directory', () => {
  let originalFetch;
  let calls;

  const stubFetch = (handler) => {
    window.fetch = (url, opts) => {
      calls.push({ url: url.toString(), opts });
      return Promise.resolve(handler(url.toString(), opts));
    };
  };

  beforeEach(() => {
    originalFetch = window.fetch;
    calls = [];
  });

  afterEach(() => {
    window.fetch = originalFetch;
  });

  describe('referencedOrgIds', () => {
    it('collects unique IMS org IDs from org and group entries, skipping emails', () => {
      const rules = [
        { path: 'CONFIG', groups: 'ukhalid@adobe.com, 138A07885EE042D20A495CFA/da-demosite-admins', actions: 'write' },
        { path: '/ + **', groups: '138a07885ee042d20a495cfa, 613E19736765B4B80A494030/Readers', actions: 'read' },
        { path: '/x/**', groups: '613E19736765B4B80A494030/dana@example.com', actions: 'read' },
        { path: '', groups: '', actions: '' },
        { path: '/y/**' },
      ];
      expect(referencedOrgIds(rules)).to.deep.equal([
        '138A07885EE042D20A495CFA', '613E19736765B4B80A494030',
      ]);
    });
  });

  describe('listDirectoryOrgs', () => {
    it("returns the caller's orgs without redirecting on failure", async () => {
      stubFetch(() => json(200, { orgs: [{ orgIdent: 'A', orgName: 'Alpha', connected: true }] }));
      expect(await listDirectoryOrgs()).to.deep.equal([{ orgIdent: 'A', orgName: 'Alpha', connected: true }]);
      expect(calls[0].url).to.match(/\/imsorg$/);
      expect(calls[0].opts.noRedirect).to.equal(true);
    });

    it('returns null when the route is unavailable', async () => {
      stubFetch(() => new Response('', { status: 404 }));
      expect(await listDirectoryOrgs()).to.equal(null);
    });
  });

  describe('connectDirectory', () => {
    it('posts the credential for the org', async () => {
      stubFetch(() => json(200, { connected: true }));
      const result = await connectDirectory('ORG1', { clientId: 'cid', clientSecret: 's' });
      expect(result).to.deep.equal({ connected: true });
      expect(calls[0].url).to.match(/\/imsorg\/ORG1$/);
      expect(calls[0].opts.method).to.equal('POST');
      expect(JSON.parse(calls[0].opts.body)).to.deep.equal({ clientId: 'cid', clientSecret: 's' });
    });

    it('returns the directory error', async () => {
      stubFetch(() => json(400, { error: 'wrong_org' }));
      expect(await connectDirectory('ORG1', { clientId: 'a', clientSecret: 'b' })).to.deep.equal({ error: 'wrong_org' });
    });

    it('maps a forbidden connect to not_member', async () => {
      stubFetch(() => new Response('', { status: 403 }));
      expect(await connectDirectory('ORG1', { clientId: 'a', clientSecret: 'b' })).to.deep.equal({ error: 'not_member' });
    });
  });

  describe('disconnectDirectory', () => {
    it('deletes the org connection', async () => {
      stubFetch(() => json(200, { connected: false }));
      expect(await disconnectDirectory('ORG1')).to.equal(true);
      expect(calls[0].url).to.match(/\/imsorg\/ORG1$/);
      expect(calls[0].opts.method).to.equal('DELETE');
    });
  });
});
