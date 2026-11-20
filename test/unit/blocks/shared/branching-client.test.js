import { expect } from '@esm-bundle/chai';
import { createBranchingClient, BranchingError } from '../../../../blocks/shared/branching-client.js';

describe('Branching and log client', () => {
  let calls;
  let client;
  beforeEach(() => {
    calls = [];
    client = createBranchingClient({
      org: 'org',
      site: 'site',
      origin: 'https://rs.example',
      fetcher: async (url, opts) => {
        calls.push({ url, opts });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
  });

  it('implements the frozen branch routes and bodies', async () => {
    const cases = [
      [() => client.capabilities(), 'GET', '/branches/org/site/capabilities'],
      [() => client.enable(), 'POST', '/branches/org/site/enable'],
      [() => client.list(), 'GET', '/branches/org/site/'],
      [() => client.create('abc'), 'POST', '/branches/org/site/', { name: 'abc' }],
      [() => client.get('abc'), 'GET', '/branches/org/site/abc'],
      [() => client.delete('abc'), 'DELETE', '/branches/org/site/abc'],
      [() => client.changes('abc', 'a+b'), 'GET', '/branches/org/site/abc/changes?cursor=a%2Bb'],
      [() => client.changesDetail('abc', { path: '/x y', branchRevision: 3, defaultRevision: 4 }), 'GET', '/branches/org/site/abc/changes/detail?path=%2Fx+y&branchRevision=3&defaultRevision=4'],
      [() => client.sync('abc', 3), 'POST', '/branches/org/site/abc/sync', { expectedBranchRevision: 3 }],
      [() => client.getSync('abc', 's1'), 'GET', '/branches/org/site/abc/sync/s1'],
      [() => client.resolve('abc', 's1', 'e1', { expectedSessionRevision: 2, choice: 'edited', body: 'x', contentType: 'text/html' }), 'PUT', '/branches/org/site/abc/sync/s1/resolutions/e1', { expectedSessionRevision: 2, choice: 'edited', body: 'x', contentType: 'text/html' }],
      [() => client.completeSync('abc', 's1', 2), 'POST', '/branches/org/site/abc/sync/s1/complete', { expectedSessionRevision: 2 }],
      [() => client.cancelSync('abc', 's1'), 'DELETE', '/branches/org/site/abc/sync/s1'],
      [() => client.publish('abc', 3, 'key'), 'POST', '/branches/org/site/abc/publish', { expectedBranchRevision: 3 }],
    ];
    for (const [run, method, path, body] of cases) {
      await run();
      const { url, opts } = calls[calls.length - 1];
      expect(url).to.equal(`https://rs.example${path}`);
      expect(opts.method).to.equal(method);
      expect(opts.noRedirect).to.equal(true);
      expect(opts.redirect).to.equal('error');
      expect(opts.body && JSON.parse(opts.body)).to.deep.equal(body);
      if (body) expect(opts.headers['Content-Type']).to.equal('application/json');
    }
    expect(calls[calls.length - 1].opts.headers['Idempotency-Key']).to.equal('key');
    expect(() => client.publish('abc', 3, '')).to.throw(TypeError);
  });

  it('implements log routes and returns raw bytes without accepting server URLs', async () => {
    await client.listLog({ after: 2, limit: 10, kind: 'merge' });
    expect(calls[0].url).to.equal('https://rs.example/log/org/site/?after=2&limit=10&kind=merge');
    await client.getCommit(3);
    expect(calls[1].url).to.equal('https://rs.example/log/org/site/3');
    const value = await client.getLogValue(3, 0, 'before');
    expect(value).to.be.instanceOf(Response);
    expect(calls[2].url).to.equal('https://rs.example/log/org/site/3/changes/0/before');
    await client.revert(3, { expectedDefaultRevision: 4, resolutions: { '/a': 'current' } });
    expect(calls[3].url).to.equal('https://rs.example/log/org/site/3/revert');
    expect(JSON.parse(calls[3].opts.body)).to.deep.equal({ expectedDefaultRevision: 4, resolutions: { '/a': 'current' } });
    await client.restore({ revision: 3, expectedDefaultRevision: 4, dryRun: true });
    expect(calls[4].url).to.equal('https://rs.example/log/org/site/restore');
    expect(() => client.getLogValue(3, 0, 'https://evil.example')).to.throw(TypeError);
    expect(() => client.getLogValue('../x', 0, 'after')).to.throw(TypeError);
    await client.getSourceValue('/a b/file.html', 'abc');
    expect(calls[5].url).to.equal('https://rs.example/source/org/site~abc/a%20b/file.html');
    expect(() => client.getSourceValue('/../other')).to.throw(TypeError);
  });

  it('constructs pinned change value requests and rejects missing pins or invalid sides', async () => {
    const response = await client.getChangeValue('abc', { path: '/x y.html', branchRevision: 0, defaultRevision: 4, side: 'default' });
    expect(response).to.be.instanceOf(Response);
    expect(calls[0].url).to.equal('https://rs.example/branches/org/site/abc/changes/value?path=%2Fx+y.html&branchRevision=0&defaultRevision=4&side=default');
    expect(calls[0].opts.redirect).to.equal('error');
    expect(() => client.getChangeValue('abc', { path: '/x', defaultRevision: 4, side: 'branch' })).to.throw(TypeError);
    expect(() => client.getChangeValue('abc', { path: '/x', branchRevision: '', defaultRevision: 4, side: 'branch' })).to.throw(TypeError);
    expect(() => client.getChangeValue('abc', { path: '/x', branchRevision: 1, defaultRevision: 4, side: 'https://evil' })).to.throw(TypeError);
  });

  it('exposes the actual log response revision without changing the existing list shape', async () => {
    const pinned = createBranchingClient({
      org: 'org',
      site: 'site',
      origin: 'https://rs.example',
      fetcher: async (url, opts) => {
        calls.push({ url, opts });
        return new Response(JSON.stringify({ commits: [{ revision: 3 }], next: null }), { headers: { 'Branch-Revision': '8' } });
      },
    });
    const result = await pinned.listLogWithRevision({ limit: 10 });
    expect(result.data).to.deep.equal({ commits: [{ revision: 3 }], next: null });
    expect(result.defaultRevision).to.equal(8);
    expect(calls[0].url).to.equal('https://rs.example/log/org/site/?limit=10');
    expect((await pinned.getCommitWithRevision(3)).defaultRevision).to.equal(8);
    expect(calls[1].url).to.equal('https://rs.example/log/org/site/3');
    expect(await pinned.listLog()).to.deep.equal({ commits: [{ revision: 3 }], next: null });
  });

  it('rejects missing or unsafe revision headers rather than authorizing a stale write', async () => {
    for (const header of [null, '', '-1', '1.5', '9007199254740992', 'NaN']) {
      const headers = header === null ? {} : { 'Branch-Revision': header };
      const pinned = createBranchingClient({ org: 'org', site: 'site', fetcher: async () => new Response('{}', { headers }) });
      try {
        await pinned.listLogWithRevision();
        throw new Error('expected failure');
      } catch (error) {
        expect(error.message).to.equal('Missing or invalid default revision');
      }
    }
  });

  it('constructs session-pinned conflict value URLs without following server URLs', async () => {
    const value = await client.getSyncValue('abc', 'sync 1', 'entry 1', 'base');
    expect(value).to.be.instanceOf(Response);
    expect(calls[0].url).to.equal('https://rs.example/branches/org/site/abc/sync/sync%201/entries/entry%201/base');
    expect(calls[0].opts.redirect).to.equal('error');
    expect(() => client.getSyncValue('abc', 's', 'e', 'https://evil')).to.throw(TypeError);
    expect(() => client.getSyncValue('abc', 's', '../e', 'base')).to.throw(TypeError);
  });

  it('builds current document and configuration routes from validated item paths', async () => {
    await client.getCurrentValue('/a b/file.html');
    expect(calls[0].url).to.equal('https://rs.example/source/org/site/a%20b/file.html');
    await client.getCurrentValue('config:/');
    expect(calls[1].url).to.equal('https://rs.example/config/org/site');
    await client.getCurrentValue('config:/nested/path');
    expect(calls[2].url).to.equal('https://rs.example/config/org/site/nested/path');
    expect(() => client.getCurrentValue('/../other')).to.throw(TypeError);
    expect(() => client.getCurrentValue('https://evil.example')).to.throw(TypeError);
    expect(() => client.getCurrentValue('config:/../other')).to.throw(TypeError);
  });

  it('preserves structured HTTP errors and handles empty 204 responses', async () => {
    const errorClient = createBranchingClient({ org: 'o', site: 's', fetcher: async () => new Response(JSON.stringify({ error: { code: 'REVERT_CONFLICTS', message: 'conflict', conflicts: [{ path: '/a' }] } }), { status: 409 }) });
    try {
      await errorClient.revert(1, {});
      throw new Error('expected failure');
    } catch (error) {
      expect(error).to.be.instanceOf(BranchingError);
      expect(error.status).to.equal(409);
      expect(error.code).to.equal('REVERT_CONFLICTS');
      expect(error.details.conflicts).to.deep.equal([{ path: '/a' }]);
    }
    const empty = createBranchingClient({ org: 'o', site: 's', fetcher: async () => new Response(null, { status: 204 }) });
    expect(await empty.delete('abc')).to.equal(null);
  });
});
