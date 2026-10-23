import { expect } from '@esm-bundle/chai';
import '../../../setup-nx.js';
import { loadSchemas } from '../../../../../blocks/form/utils/schemas.js';

// schemas.js has a module-level cache keyed by `${owner}/${repo}`. To keep
// tests isolated without exposing a reset hook, each test uses a unique
// (owner, repo) pair via this helper.
let suffix = 0;
const uniqueOrgRepo = () => {
  suffix += 1;
  return { owner: `org-${Date.now()}-${suffix}`, repo: `repo-${suffix}` };
};

// Helpers to build canned HTTP responses.
const listOk = (entries) => async () => ({ json: entries });
const listErr = (status = 500) => async () => ({ error: `HTTP ${status}`, status });

function buildSchemaHtml(json) {
  // Real schema HTML wraps the JSON in a single <code> element. parseFromString
  // tolerates fragments — the DOMParser wraps in html/body automatically.
  return `<code>${JSON.stringify(json)}</code>`;
}

const fetchFromMap = (byPath) => async ({ path }) => {
  if (byPath[path] === undefined) return { error: 'not found', status: 404 };
  return { html: byPath[path] };
};

describe('loadSchemas', () => {
  it('returns {} when owner is missing', async () => {
    const result = await loadSchemas({ repo: 'r' });
    expect(result).to.deep.equal({});
  });

  it('returns {} when repo is missing', async () => {
    const result = await loadSchemas({ owner: 'o' });
    expect(result).to.deep.equal({});
  });

  it('returns {} when neither owner nor repo is provided', async () => {
    const result = await loadSchemas();
    expect(result).to.deep.equal({});
  });

  it('returns {} when the listing call errors', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listErr(500),
      fetch: async () => ({ error: 'should never be called' }),
    });
    expect(result).to.deep.equal({});
  });

  it('builds a map of schemas keyed by entry.name on the happy path', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([
        { name: 'project', path: '/o/r/.da/forms/schemas/project.html' },
        { name: 'article', path: '/o/r/.da/forms/schemas/article.html' },
      ]),
      fetch: fetchFromMap({
        '/o/r/.da/forms/schemas/project.html': buildSchemaHtml({ type: 'object', title: 'Project' }),
        '/o/r/.da/forms/schemas/article.html': buildSchemaHtml({ type: 'object', title: 'Article' }),
      }),
    });
    expect(Object.keys(result).sort()).to.deep.equal(['article', 'project']);
    expect(result.project).to.deep.include({ id: 'project', title: 'Project', type: 'object' });
    expect(result.article).to.deep.include({ id: 'article', title: 'Article', type: 'object' });
  });

  it('builds the expected listing path: /<owner>/<repo>/.da/forms/schemas', async () => {
    const { owner, repo } = uniqueOrgRepo();
    let calledWithPath = null;
    await loadSchemas({
      owner,
      repo,
      list: async ({ path }) => { calledWithPath = path; return { json: [] }; },
      fetch: async () => ({ error: 'never called' }),
    });
    expect(calledWithPath).to.equal(`/${owner}/${repo}/.da/forms/schemas`);
  });

  it('skips entries whose fetch returns an error (does not poison the result)', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([
        { name: 'broken', path: '/broken.html' },
        { name: 'ok', path: '/ok.html' },
      ]),
      fetch: async ({ path }) => {
        if (path === '/broken.html') return { error: 'gone', status: 404 };
        return { html: buildSchemaHtml({ type: 'object', title: 'OK' }) };
      },
    });
    expect(Object.keys(result)).to.deep.equal(['ok']);
    expect(result.ok.title).to.equal('OK');
  });

  it('skips entries with no <code> tag in the HTML', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([
        { name: 'no-code', path: '/no-code.html' },
        { name: 'ok', path: '/ok.html' },
      ]),
      fetch: fetchFromMap({
        '/no-code.html': '<p>just a paragraph, no code element</p>',
        '/ok.html': buildSchemaHtml({ type: 'object', title: 'OK' }),
      }),
    });
    expect(Object.keys(result)).to.deep.equal(['ok']);
  });

  it('skips entries with invalid JSON inside <code>', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([
        { name: 'malformed', path: '/malformed.html' },
        { name: 'ok', path: '/ok.html' },
      ]),
      fetch: fetchFromMap({
        '/malformed.html': '<code>{ not valid json }</code>',
        '/ok.html': buildSchemaHtml({ type: 'object', title: 'OK' }),
      }),
    });
    expect(Object.keys(result)).to.deep.equal(['ok']);
  });

  it('skips entries whose fetch returns html=undefined / empty', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([
        { name: 'empty', path: '/empty.html' },
        { name: 'ok', path: '/ok.html' },
      ]),
      fetch: async ({ path }) => {
        if (path === '/empty.html') return { html: '' };
        return { html: buildSchemaHtml({ type: 'object' }) };
      },
    });
    expect(Object.keys(result)).to.deep.equal(['ok']);
  });

  it('returns {} (not throws) when the listing returns an empty array', async () => {
    const { owner, repo } = uniqueOrgRepo();
    const result = await loadSchemas({
      owner,
      repo,
      list: listOk([]),
      fetch: async () => ({ error: 'never called' }),
    });
    expect(result).to.deep.equal({});
  });

  describe('caching', () => {
    it('does not re-fetch on a second call with the same owner/repo', async () => {
      const { owner, repo } = uniqueOrgRepo(); // same key for both calls
      let listCalls = 0;
      let fetchCalls = 0;
      const list = async () => {
        listCalls += 1;
        return { json: [{ name: 'project', path: '/p.html' }] };
      };
      const fetch = async () => {
        fetchCalls += 1;
        return { html: buildSchemaHtml({ type: 'object', title: 'Project' }) };
      };

      const first = await loadSchemas({ owner, repo, list, fetch });
      const second = await loadSchemas({ owner, repo, list, fetch });

      expect(listCalls).to.equal(1); // listing happened once
      expect(fetchCalls).to.equal(1); // and the schema body was fetched once
      expect(second).to.equal(first); // same reference — cache returns identity
    });

    it('caches an empty result (no retry storm) when the listing fails', async () => {
      const { owner, repo } = uniqueOrgRepo();
      let listCalls = 0;
      const list = async () => {
        listCalls += 1;
        return { error: 'down', status: 500 };
      };

      const first = await loadSchemas({ owner, repo, list, fetch: async () => ({}) });
      const second = await loadSchemas({ owner, repo, list, fetch: async () => ({}) });

      expect(first).to.deep.equal({});
      expect(second).to.deep.equal({});
      // Cached empty result — the failed listing is not retried.
      expect(listCalls).to.equal(1);
    });

    it('caches separately per owner/repo pair', async () => {
      const a = uniqueOrgRepo();
      const b = uniqueOrgRepo();
      let listCalls = 0;
      const list = async ({ path }) => {
        listCalls += 1;
        return { json: [{ name: path.includes(a.owner) ? 'a-schema' : 'b-schema', path: '/x.html' }] };
      };
      const fetch = async () => ({ html: buildSchemaHtml({ type: 'object' }) });

      const resA = await loadSchemas({ owner: a.owner, repo: a.repo, list, fetch });
      const resB = await loadSchemas({ owner: b.owner, repo: b.repo, list, fetch });

      expect(Object.keys(resA)).to.deep.equal(['a-schema']);
      expect(Object.keys(resB)).to.deep.equal(['b-schema']);
      expect(listCalls).to.equal(2); // listed once per (owner, repo)
    });
  });
});
