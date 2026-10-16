import { expect } from '@esm-bundle/chai';
import { createDraftReviewService } from '../../../../blocks/shared/draft-review-actions.js';

const page = { path: '/en/about.html', title: 'About', summary: 'New headline' };
const root = '/.da/ai-drafts/author';
const plan = { version: 1, type: 'plan', id: 'copy-01', summary: 'Warmer', pages: [page] };
const ready = { ...plan, type: 'ready', pages: [{ ...page, draftPath: `${root}${page.path}` }] };
const context = { org: 'org', site: 'site' };
const original = '/org/site/en/about.html';
const draft = `/org/site${root}/en/about.html`;

async function rejects(promise, text) {
  try {
    await promise;
    expect.fail('Expected rejection');
  } catch (error) {
    expect(error.message).to.include(text);
  }
}

function harness() {
  const files = new Map([[original, '<h1>Before</h1>'], [draft, '<h1>After</h1>']]);
  const store = new Map();
  const entries = [];
  const versions = new Map();
  const events = [];
  const options = {
    api: {
      source: {
        get: async (path) => {
          events.push(`get:${path}`);
          return new Response(files.get(path) ?? '', { status: files.has(path) ? 200 : 404 });
        },
      },
      versions: {
        create: async (path, { comment }) => {
          events.push(`version:${path}`);
          const version = `v${entries.length + 1}`;
          entries.push({ version, 'version-comment': comment });
          versions.set(version, files.get(path));
          return new Response('', { status: 201 });
        },
        list: async () => new Response(JSON.stringify(entries)),
        get: async (path, { versionId }) => new Response(versions.get(versionId)),
      },
    },
    storage: {
      getItem: (key) => store.get(key),
      setItem: (key, value) => store.set(key, value),
    },
    validateReview: () => {},
    draftRootForUser: () => root,
    getIdentity: async () => ({ userId: 'author' }),
    flush: async () => {},
    write: async ({ org, site, path, content }) => {
      events.push(`write:/${org}/${site}${path}`);
      files.set(`/${org}/${site}${path}`, content);
    },
    compare: async (data) => events.push(data),
    notify: () => events.push('notify'),
  };
  const service = createDraftReviewService(options);
  const act = (action, review = ready, paths = [page.path], extra = {}) => service({
    action, review, paths, context, episodeId: 'session', ...extra,
  });
  return {
    files,
    store,
    entries,
    versions,
    events,
    options,
    act,
    approve: () => act('approve-scope', plan),
  };
}

describe('DA draft review actions', () => {
  it('captures approved scope without writing originals or drafts', async () => {
    const h = harness();
    expect((await h.approve()).approvedPaths).to.deep.equal([page.path]);
    expect(h.events.some((e) => typeof e === 'string' && /^(write|version):/.test(e))).to.equal(false);
  });

  it('does not allow ready blocks without an approved plan', async () => {
    const h = harness();
    await rejects(h.act('apply'), 'Approve the matching plan');
    expect(h.files.get(original)).to.equal('<h1>Before</h1>');
  });

  it('saves a recoverable version before applying and offers state after reload', async () => {
    const h = harness();
    await h.approve();
    const result = await h.act('apply');
    expect(h.events.indexOf(`version:${original}`)).to.be.lessThan(h.events.indexOf(`write:${original}`));
    expect(h.files.get(original)).to.equal('<h1>After</h1>');
    expect(h.versions.get(result.results[page.path].versionId)).to.equal('<h1>Before</h1>');
    expect((await h.act('status')).results[page.path].status).to.equal('applied');
    await rejects(h.act('apply'), 'already been decided');
  });

  it('restores the exact pre-approval version', async () => {
    const h = harness();
    await h.approve();
    await h.act('apply');
    expect((await h.act('restore')).results[page.path].status).to.equal('restored');
    expect(h.files.get(original)).to.equal('<h1>Before</h1>');
  });

  it('rejects without changing the original or creating a version', async () => {
    const h = harness();
    await h.approve();
    expect((await h.act('reject')).results[page.path].status).to.equal('rejected');
    expect(h.entries).to.have.lengthOf(0);
    expect(h.files.get(original)).to.equal('<h1>Before</h1>');
  });

  it('refuses changed originals at apply and changed pages at restore', async () => {
    const h = harness();
    await h.approve();
    h.files.set(original, 'Newer human edit');
    await rejects(h.act('apply'), 'changed since scope approval');
    expect(h.entries).to.have.lengthOf(0);
    h.files.set(original, '<h1>Before</h1>');
    await h.act('apply');
    h.files.set(original, 'Another human edit');
    await rejects(h.act('restore'), 'changed after approval');
    expect(h.files.get(original)).to.equal('Another human edit');
  });

  it('binds approval to the draft that was actually reviewed', async () => {
    const h = harness();
    await h.approve();
    await h.act('diff');
    h.files.set(draft, '<h1>Changed draft</h1>');
    await rejects(h.act('apply'), 'changed after viewing its diff');
    expect(h.entries).to.have.lengthOf(0);
    await h.act('diff');
    await h.act('apply');
    expect(h.files.get(original)).to.equal('<h1>Changed draft</h1>');
  });

  it('leaves originals unchanged when version creation or identification fails', async () => {
    const h = harness();
    await h.approve();
    h.options.api.versions.create = async () => new Response('', { status: 500 });
    await rejects(h.act('apply'), 'Could not save a version');
    expect(h.files.get(original)).to.equal('<h1>Before</h1>');
    h.options.api.versions.create = async () => new Response('', { status: 201 });
    await rejects(h.act('apply'), 'Could not identify');
    expect(h.files.get(original)).to.equal('<h1>Before</h1>');
  });

  it('supports legacy version-list URLs as well as source-bus version ids', async () => {
    const h = harness();
    await h.approve();
    h.options.api.versions.list = async () => new Response(JSON.stringify(h.entries.map((e) => ({ label: e['version-comment'], url: `/versionsource/org/site/${e.version}` }))));
    const state = await h.act('apply');
    expect(state.results[page.path].versionId).to.equal('v1');
  });

  it('rejects draft paths outside the signed-in folder, extra pages and changed ids', async () => {
    const h = harness();
    await h.approve();
    await rejects(h.act('apply', { ...ready, pages: [{ ...ready.pages[0], draftPath: '/.da/ai-drafts/other/en/about.html' }] }), 'signed-in user');
    await rejects(h.act('apply', { ...ready, pages: [...ready.pages, { ...page, path: '/other.html', draftPath: `${root}/other.html` }] }), 'exactly match');
    await rejects(h.act('apply', { ...ready, id: 'other' }), 'Approve the matching plan');
    await rejects(h.act('status', { ...plan, summary: 'Changed' }), 'reused');
  });

  it('isolates approvals by site, user and episode', async () => {
    const h = harness();
    await h.approve();
    await rejects(h.act('apply', ready, [page.path], { episodeId: 'different' }), 'Approve the matching plan');
    await rejects(h.act('apply', ready, [page.path], { context: { org: 'org', site: 'other' } }), 'Approve the matching plan');
    h.options.getIdentity = async () => ({ userId: 'other' });
    // The running service captures its identity function; a second instance models another user.
    const other = createDraftReviewService({ ...h.options });
    await rejects(other({ action: 'apply', review: ready, paths: [page.path], context, episodeId: 'session' }), 'Approve the matching plan');
  });

  it('fails explicitly if a draft is missing or session storage is unavailable', async () => {
    const h = harness();
    await h.approve();
    h.files.delete(draft);
    await rejects(h.act('apply'), '404');
    expect(h.entries).to.have.lengthOf(0);
    const blocked = createDraftReviewService({ ...h.options, storage: { getItem: () => null, setItem: () => { throw new Error('Storage unavailable'); } } });
    await rejects(blocked({ action: 'approve-scope', review: plan, paths: [page.path], context, episodeId: 'session' }), 'Storage unavailable');
  });

  it('records uncertain writes honestly instead of reporting them as applied', async () => {
    const h = harness();
    const service = createDraftReviewService({ ...h.options, write: async () => { throw new Error('Connection lost'); } });
    const act = (action, review) => service({ action, review, paths: [page.path], context, episodeId: 'session' });
    await act('approve-scope', plan);
    await rejects(act('apply', ready), 'Connection lost');
    expect((await act('status', ready)).results[page.path].status).to.equal('applying');
    expect(h.versions.get('v1')).to.equal('<h1>Before</h1>');
  });

  it('does not report a successful but ineffective write as applied', async () => {
    const h = harness();
    const service = createDraftReviewService({ ...h.options, write: async () => {} });
    const act = (action, review) => service({ action, review, paths: [page.path], context, episodeId: 'session' });
    await act('approve-scope', plan);
    await rejects(act('apply', ready), 'Could not confirm');
    expect((await act('status', ready)).results[page.path].status).to.equal('applying');
  });

  it('keeps successful batch pages recorded if a later page fails', async () => {
    const h = harness();
    const second = { path: '/second.html', title: 'Second', summary: 'Second change' };
    const bothPlan = { ...plan, pages: [page, second] };
    const bothReady = { ...ready, pages: [...ready.pages, { ...second, draftPath: `${root}${second.path}` }] };
    h.files.set('/org/site/second.html', '<h1>Second before</h1>');
    await h.act('approve-scope', bothPlan, [page.path, second.path]);
    await rejects(h.act('apply', bothReady, [page.path, second.path]), '404');
    const state = await h.act('status', bothReady);
    expect(state.results[page.path].status).to.equal('applied');
    expect(state.results[second.path]).to.equal(undefined);
    expect(h.files.get('/org/site/second.html')).to.equal('<h1>Second before</h1>');
  });

  it('can continue a persisted approved scope after a connection failure', async () => {
    const h = harness();
    await h.approve();
    expect((await h.act('continue-scope', plan)).approvedPaths).to.deep.equal([page.path]);
    await h.act('diff');
    await rejects(h.act('continue-scope', plan), 'without completed drafts');
  });

  it('does not widen a rejected scope or reapprove a decided plan', async () => {
    const h = harness();
    await h.act('reject-scope', plan, []);
    await rejects(h.approve(), 'already been decided');
    await rejects(h.act('apply'), 'Approve the matching plan');
  });
});
