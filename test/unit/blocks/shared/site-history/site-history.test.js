import { expect } from '@esm-bundle/chai';
import { BranchingError } from '../../../../../blocks/shared/branching-client.js';
import '../../../../../blocks/shared/site-history/site-history.js';

const commit = {
  revision: 3,
  kind: 'merge',
  users: [{ email: 'author@example.com' }],
  createdAt: '2026-01-01',
  branchId: 'work',
  paths: ['/page.html'],
};
const change = {
  index: 0,
  path: '/page.html',
  itemKind: 'html',
  op: 'modify',
  before: { state: 'present', url: 'https://evil.example/before' },
  after: { state: 'present', url: 'https://evil.example/after' },
};
const response = (text, type = 'text/html', pin = 8) => new Response(text, { headers: { 'Content-Type': type, 'Branch-Revision': String(pin) } });

describe('site history', () => {
  let element;
  let client;
  let calls;
  let pin;
  let oldUrl;

  beforeEach(async () => {
    oldUrl = window.location.href;
    history.replaceState(null, '', '#/org/site/');
    pin = 8;
    calls = [];
    client = {
      listLogWithRevision: async (params) => {
        calls.push(['list', params]);
        return { data: { commits: [commit], next: params.after ? null : 3 }, defaultRevision: pin };
      },
      getCommitWithRevision: async (id) => {
        const data = { commit: { ...commit, revision: id }, changes: [change] };
        return { data, defaultRevision: pin };
      },
      getLogValue: async (...args) => { calls.push(['value', ...args]); return response('<img src=x onerror=alert(1)>', 'text/html', pin); },
      getCurrentValue: async (path) => { calls.push(['current', path]); return response('current', 'text/html', pin); },
      revert: async (...args) => { calls.push(['revert', ...args]); return { revertRevision: 9 }; },
      restore: async (body) => { calls.push(['restore', body]); return body.dryRun ? { paths: ['/page.html'] } : { revertRevision: 9 }; },
    };
    element = document.createElement('da-site-history');
    Object.assign(element, { org: 'org', site: 'site', client });
    document.body.append(element);
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    await element.updateComplete;
  });

  afterEach(() => {
    element.remove();
    history.replaceState(null, '', oldUrl);
  });

  it('lists users, merge branch and paths, pages, and renders log values as escaped text', async () => {
    expect(element.shadowRoot.textContent).to.include('author@example.com');
    expect(element.shadowRoot.textContent).to.include('work');
    expect(element.shadowRoot.textContent).to.include('/page.html');
    await element.loadMore();
    expect(calls).to.deep.include(['list', { after: 3, limit: 25 }]);
    await element.select(commit);
    await element.updateComplete;
    expect(calls).to.deep.include(['value', 3, 0, 'before']);
    expect(calls).to.deep.include(['value', 3, 0, 'after']);
    expect(element.shadowRoot.querySelector('pre').textContent).to.equal('<img src=x onerror=alert(1)>');
    expect(element.shadowRoot.querySelector('img')).to.be.null;
  });

  it('reverts a merge using the actual default pin instead of the commit id', async () => {
    await element.select(commit);
    await element.revert();
    expect(calls).to.deep.include(['revert', 3, { expectedDefaultRevision: 8 }]);
  });

  it('resolves conflicts at the original pin and validates edited content', async () => {
    client.revert = async (...args) => {
      calls.push(['revert', ...args]);
      if (calls.filter(([name]) => name === 'revert').length === 1) {
        throw new BranchingError(409, { code: 'REVERT_CONFLICTS', conflicts: [{ path: '/page.html', before: { state: 'present' }, after: { state: 'present' }, current: { state: 'present', url: 'https://evil.example/current' } }] });
      }
      return { revertRevision: 9 };
    };
    await element.select(commit);
    await element.revert();
    await element.updateComplete;
    expect(calls).to.deep.include(['current', '/page.html']);
    expect(element.shadowRoot.textContent).to.include('Resolve revert conflicts');
    element.updateConflict(0, 'choice', 'edited');
    element.updateConflict(0, 'draft', '<script>bad</script>');
    await element.revert();
    expect(element._error).to.include('Invalid editor HTML');
    expect(calls.filter(([name]) => name === 'revert')).to.have.length(1);
    element.updateConflict(0, 'choice', 'current');
    await element.revert();
    const body = calls.filter(([name]) => name === 'revert')[1][2];
    expect(body.expectedDefaultRevision).to.equal(8);
    expect(body.resolutions['/page.html']).to.equal('current');
  });

  it('previews restore before explicit confirmation using the same target and pin', async () => {
    await element.select(commit);
    await element.previewRestore();
    expect(calls).to.deep.include(['restore', { revision: 3, expectedDefaultRevision: 8, dryRun: true }]);
    expect(calls.filter(([name]) => name === 'restore')).to.have.length(1);
    await element.confirmRestore();
    expect(calls).to.deep.include(['restore', { revision: 3, expectedDefaultRevision: 8, dryRun: false }]);
  });

  it('blocks stale restore and revert previews and asks for refresh', async () => {
    await element.select(commit);
    await element.previewRestore();
    pin = 9;
    await element.confirmRestore();
    await element.updateComplete;
    expect(calls.filter(([name]) => name === 'restore')).to.have.length(1);
    expect(element._detail).to.be.undefined;
    expect(element.shadowRoot.textContent).to.include('Refresh history');
    await element.revert();
    expect(calls.filter(([name]) => name === 'revert')).to.have.length(0);
  });

  it('discards a preview when the server reports a moved revision', async () => {
    await element.select(commit);
    client.revert = async () => { throw new BranchingError(409, { code: 'REVISION_CHANGED' }); };
    await element.revert();
    expect(element._detail).to.be.undefined;
    expect(element._notice).to.include('Refresh history');
  });

  it('does not repin conflicts when default moves before resolution', async () => {
    client.revert = async (...args) => {
      calls.push(['revert', ...args]);
      throw new BranchingError(409, { code: 'REVERT_CONFLICTS', conflicts: [{ path: '/page.html', before: { state: 'present' }, after: { state: 'present' }, current: { state: 'absent' } }] });
    };
    await element.select(commit);
    await element.revert();
    element.updateConflict(0, 'choice', 'reverted');
    pin = 9;
    await element.revert();
    expect(calls.filter(([name]) => name === 'revert')).to.have.length(1);
    expect(element._conflicts).to.be.undefined;
    expect(element._notice).to.include('Refresh history');
  });

  it('does not offer revert for label or bootstrap commits', async () => {
    const label = { ...commit, kind: 'label' };
    client.getCommitWithRevision = async () => {
      const data = { commit: label, changes: [change] };
      return { data, defaultRevision: pin };
    };
    await element.select(label);
    await element.updateComplete;
    expect(element.shadowRoot.textContent).not.to.include('Revert commit');
    await element.revert();
    expect(calls.filter(([name]) => name === 'revert')).to.have.length(0);
  });

  it('requires a new restore preview after selecting another target', async () => {
    await element.select(commit);
    await element.previewRestore();
    await element.select({ ...commit, revision: 2 });
    await element.confirmRestore();
    expect(calls.filter(([name]) => name === 'restore')).to.have.length(1);
    await element.previewRestore();
    await element.confirmRestore();
    expect(calls).to.deep.include(['restore', { revision: 2, expectedDefaultRevision: 8, dryRun: false }]);
  });

  it('allows validated edited config resolutions at the original pin', async () => {
    const config = { ...change, path: 'config:/nested', itemKind: 'config' };
    client.getCommitWithRevision = async () => {
      const data = { commit, changes: [config] };
      return { data, defaultRevision: pin };
    };
    client.getLogValue = async () => response('{"old":true}', 'application/json', pin);
    client.getCurrentValue = async () => response('{"current":true}', 'application/json', pin);
    client.revert = async (...args) => {
      calls.push(['revert', ...args]);
      if (calls.filter(([name]) => name === 'revert').length === 1) {
        throw new BranchingError(409, { code: 'REVERT_CONFLICTS', conflicts: [{ path: config.path, before: { state: 'present' }, after: { state: 'present' }, current: { state: 'present' } }] });
      }
      return { revertRevision: 9 };
    };
    await element.select(commit);
    await element.revert();
    element.updateConflict(0, 'choice', 'edited');
    element.updateConflict(0, 'draft', '{"data":[{"a":"b"}],":type":"sheet"}');
    await element.revert();
    const body = calls.filter(([name]) => name === 'revert')[1][2];
    expect(body.expectedDefaultRevision).to.equal(8);
    expect(body.resolutions[config.path]).to.deep.equal({ edited: '{"data":[{"a":"b"}],":type":"sheet"}', contentType: 'application/json' });
  });

  it('previews only allowlisted media MIME types and revokes object URLs', async () => {
    const media = { ...change, itemKind: 'media', path: '/x.svg' };
    client.getCommitWithRevision = async () => {
      const data = { commit, changes: [media] };
      return { data, defaultRevision: pin };
    };
    client.getLogValue = async () => response('<svg onload="alert(1)"></svg>', 'image/svg+xml', pin);
    await element.select(commit);
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('img')).to.be.null;
    client.getLogValue = async () => response('binary', 'image/png', pin);
    await element.select(commit);
    await element.updateComplete;
    const url = element.shadowRoot.querySelector('img').getAttribute('src');
    expect(url).to.match(/^blob:/);
    expect(element._urls).to.include(url);
    element.clearPreview();
    expect(element._urls).to.have.length(0);
  });

  it('never writes after navigating to a branch, even before hashchange fires', async () => {
    await element.select(commit);
    history.replaceState(null, '', '#/org/site~work/');
    await element.revert();
    await element.previewRestore();
    expect(calls.filter(([name]) => ['revert', 'restore'].includes(name))).to.have.length(0);
  });

  it('discards delayed detail when the branch context changes', async () => {
    let finish;
    client.getCommitWithRevision = () => new Promise((resolve) => { finish = resolve; });
    const pending = element.select(commit);
    history.replaceState(null, '', '#/org/site~work/');
    finish({ data: { commit, changes: [change] }, defaultRevision: 8 });
    await pending;
    expect(element._detail).to.be.undefined;
    expect(calls.filter(([name]) => name === 'value')).to.have.length(0);
  });

  it('does not append a page from a different default revision', async () => {
    pin = 9;
    await element.loadMore();
    expect(element._page.commits).to.have.length(1);
    expect(element._notice).to.include('Refresh history');
  });

  it('refuses to open outside the bare default site', async () => {
    element.remove();
    history.replaceState(null, '', '#/org/site~work/');
    const count = calls.length;
    element = document.createElement('da-site-history');
    Object.assign(element, { org: 'org', site: 'site', client });
    document.body.append(element);
    await element.updateComplete;
    expect(element.isConnected).to.be.false;
    expect(calls).to.have.length(count);
  });
});
