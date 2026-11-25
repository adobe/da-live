import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { Y } from 'da-y-wrapper';
import { aem2doc, doc2aem, getSchema, yDocToProsemirror } from 'da-parser';
import { BranchingError } from '../../../../../blocks/shared/branching-client.js';
import { branchEditingLocked, unlockBranchEditing } from '../../../../../blocks/shared/branch-conflicts/editing-lock.js';
import { switchContentBranch } from '../../../../../blocks/shared/branch-selector/navigation.js';
import '../../../../../blocks/shared/branch-conflicts/branch-conflicts.js';

const tick = () => new Promise((resolve) => { setTimeout(resolve, 0); });
const validHtml = '<body><header></header><main><div><p>new</p></div></main><footer></footer></body>';
const entry = {
  entryId: 'entry1',
  path: '/page.html',
  itemKind: 'html',
  conflictKind: 'edit-edit',
  base: { state: 'absent' },
  branch: { state: 'present', url: 'https://evil.example' },
  default: { state: 'present' },
};

describe('branch sync and publish', () => {
  let element;
  let editor;
  let client;
  let calls;
  let session;

  beforeEach(async () => {
    calls = [];
    session = { syncId: 'sync1', revision: 1, targetRevision: 4, entries: [{ ...entry }] };
    client = {
      get: async (id) => { calls.push(['get', id]); return { id, revision: 7, activeSyncId: null }; },
      sync: async (...args) => { calls.push(['sync', ...args]); return { status: 'completed', branch: { id: 'work' } }; },
      publish: async (...args) => { calls.push(['publish', ...args]); return { status: 'published', branch: { id: 'work' } }; },
      getSync: async (...args) => { calls.push(['getSync', ...args]); return session; },
      getSyncValue: async (...args) => {
        calls.push(['value', ...args]);
        return new Response('<script>unsafe</script>', { headers: { 'Content-Type': 'text/html' } });
      },
      resolve: async (...args) => {
        calls.push(['resolve', ...args]);
        session = {
          ...session,
          revision: session.revision + 1,
          entries: [{ ...entry, choice: args[3].choice }],
        };
        return { revision: session.revision };
      },
      completeSync: async (...args) => {
        calls.push(['complete', ...args]);
        return { branch: { id: 'work' } };
      },
      cancelSync: async (...args) => { calls.push(['cancel', ...args]); },
    };
    editor = document.createElement('da-content');
    editor.forceSave = async () => {
      calls.push(['flush', editor.inert]);
      return { ok: true };
    };
    document.body.append(editor);
    element = document.createElement('da-branch-conflicts');
    element.branchId = 'work';
    element.client = client;
    document.body.append(element);
    await element.updateComplete;
    await tick();
    calls.length = 0;
  });

  afterEach(() => {
    element.remove();
    editor.remove();
    unlockBranchEditing();
  });

  it('flushes before fetching the revision and starting sync', async () => {
    await element.sync();
    expect(calls).to.deep.equal([['flush', true], ['get', 'work'], ['sync', 'work', 7]]);
    expect(element._status).to.equal('Sync completed. You can now merge to default.');
    expect(editor.inert).to.equal(false);
  });

  it('uses merge wording for branch actions while distinguishing AEM publishing', async () => {
    const action = element.shadowRoot.querySelector('[part~="publish-action"]');
    expect(action.textContent.trim()).to.equal('Merge to default');
    action.click();
    await element.updateComplete;
    const dialog = element.shadowRoot.querySelector('[role="dialog"]');
    expect(dialog.querySelector('h3').textContent).to.equal('Merge to default');
    expect(dialog.textContent).to.include('Merge all branch changes to default?');
    expect(dialog.textContent).to.include('This does not publish to AEM preview or live.');
    expect(dialog.textContent).to.include('Delete this branch after merging');
    dialog.querySelector('input[type="checkbox"]').click();
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('After merging, you’ll return to Default');
  });

  it('marks the saved resolution and updates it when a different option is saved', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    await element.updateComplete;
    const buttons = [...element.shadowRoot.querySelectorAll('.choices button')];
    expect(buttons.every((button) => button.getAttribute('aria-pressed') === 'false')).to.equal(true);

    for (const choice of buttons) {
      choice.click();
      // Wait for the save and the refreshed session before checking the saved state.
      await tick(); // eslint-disable-line no-await-in-loop
      expect(buttons.filter((button) => button.getAttribute('aria-pressed') === 'true'))
        .to.deep.equal([choice]);
      expect(getComputedStyle(choice.querySelector('svg')).visibility).to.equal('visible');
      expect(element.shadowRoot.querySelector('.conflict-list').textContent)
        .to.include(choice.textContent.trim());
    }

    client.resolve = async () => { throw new Error('Could not save'); };
    buttons[0].click();
    await tick();
    expect(buttons[2].getAttribute('aria-pressed')).to.equal('true');
    expect(element.shadowRoot.querySelector('[role="alert"]').textContent).to.equal('Could not save');
  });

  it('displays sync completion without moving the toolbar and dismisses it after five seconds', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const { height } = element.getBoundingClientRect();
      await element.sync();
      await element.updateComplete;
      const notice = element.shadowRoot.querySelector('.notice');
      expect(notice.matches(':popover-open')).to.equal(true);
      expect(notice.textContent).to.include('Sync completed');
      expect(element.getBoundingClientRect().height).to.equal(height);
      clock.tick(5000);
      await element.updateComplete;
      expect(element.shadowRoot.querySelector('.notice')).to.equal(null);
    } finally {
      clock.restore();
    }
  });

  it('keeps actionable sync feedback visible instead of auto-dismissing it', async () => {
    const clock = sinon.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      client.sync = async () => { throw new Error('Connection lost'); };
      await element.sync();
      clock.tick(5000);
      await element.updateComplete;
      const notice = element.shadowRoot.querySelector('.notice');
      expect(notice.textContent).to.include('Reload branch');
      expect(notice.querySelector('.dismiss')).to.equal(null);
    } finally {
      clock.restore();
    }
  });

  it('does not fetch a revision or mutate after a negative acknowledgement', async () => {
    editor.forceSave = async () => ({ ok: false, error: 'persist failed' });
    await element.sync();
    expect(calls).to.deep.equal([]);
    expect(element._error).to.include('persist failed');
    await element.publish();
    expect(calls).to.deep.equal([]);
  });

  it('retries an uncertain publish with the original key and revision', async () => {
    let attempts = 0;
    client.publish = async (...args) => {
      calls.push(['publish', ...args]);
      attempts += 1;
      if (attempts === 1) throw new TypeError('network lost');
      return { status: 'published' };
    };
    await element.publish();
    const first = calls.find((call) => call[0] === 'publish');
    expect(first[2]).to.equal(7);
    expect(first[3]).to.be.a('string');
    expect(editor.inert).to.equal(true);
    expect(element._status).to.include('Merge result unknown');
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('Retry merge');
    await element.publish();
    expect(calls.filter((call) => call[0] === 'publish')).to.deep.equal([first, first]);
    expect(calls.filter((call) => call[0] === 'flush')).to.have.length(1);
    expect(branchEditingLocked()).to.equal(false);
    expect(editor.inert).to.equal(false);
    expect(element._status).to.include('not published to live');
    expect(element.branchId).to.equal('work');
  });

  it('clears a terminal replay and requires fresh confirmation with a new revision and key', async () => {
    let attempts = 0;
    let reads = 0;
    client.get = async (id) => {
      reads += 1;
      calls.push(['get', id]);
      return { id, revision: reads === 1 ? 7 : 8, activeSyncId: null };
    };
    client.publish = async (...args) => {
      calls.push(['publish', ...args]);
      attempts += 1;
      if (attempts === 1) throw new TypeError('response lost');
      if (attempts === 2) throw new BranchingError(409, { code: 'REVISION_CHANGED' });
      return { status: 'published' };
    };
    element._confirm = true;
    await element.publish();
    const first = calls.find((call) => call[0] === 'publish');
    await element.publish();
    await element.updateComplete;
    expect(calls.filter((call) => call[0] === 'publish')).to.deep.equal([first, first]);
    expect(reads).to.equal(2);
    expect(element._retry).to.equal(undefined);
    expect(element._confirm).to.equal(false);
    expect(element._status).to.include('confirm a new merge');
    expect(element.shadowRoot.querySelector('[role="dialog"]')).to.equal(null);
    expect(editor.inert).to.equal(false);
    const publishButton = [...element.shadowRoot.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Merge to default');
    publishButton.click();
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('[role="dialog"]')).to.exist;
    const confirm = [...element.shadowRoot.querySelectorAll('button')]
      .find((button) => button.textContent.trim() === 'Confirm merge to default');
    confirm.click();
    await tick();
    const published = calls.filter((call) => call[0] === 'publish');
    expect(published).to.have.length(3);
    expect(published[2][2]).to.equal(8);
    expect(published[2][3]).to.not.equal(first[3]);
    expect(calls.filter((call) => call[0] === 'flush')).to.have.length(2);
  });

  it('retains the same replay for network, 5xx and response uncertainty', async () => {
    let attempts = 0;
    client.publish = async (...args) => {
      calls.push(['publish', ...args]);
      attempts += 1;
      if (attempts === 1) throw new BranchingError(409);
      if (attempts === 2) throw new TypeError('network lost');
      if (attempts === 3) throw new BranchingError(503, { code: 'UNAVAILABLE' });
      if (attempts === 4) return { status: 'unexpected' };
      return { status: 'published' };
    };
    await element.publish();
    const first = calls.find((call) => call[0] === 'publish');
    await element.publish();
    expect(element._retry).to.deep.equal({ expected: first[2], key: first[3] });
    expect(editor.inert).to.equal(true);
    await element.publish();
    expect(element._retry).to.deep.equal({ expected: first[2], key: first[3] });
    expect(editor.inert).to.equal(true);
    await element.publish();
    expect(element._retry).to.deep.equal({ expected: first[2], key: first[3] });
    expect(editor.inert).to.equal(true);
    await element.publish();
    expect(calls.filter((call) => call[0] === 'publish')).to.deep.equal([first, first, first, first, first]);
    expect(calls.filter((call) => call[0] === 'get')).to.have.length(1);
    expect(calls.filter((call) => call[0] === 'flush')).to.have.length(1);
    expect(editor.inert).to.equal(false);
  });

  it('refreshes after an initial definitive revision rejection without publishing again', async () => {
    client.publish = async (...args) => {
      calls.push(['publish', ...args]);
      throw new BranchingError(409, { code: 'REVISION_CHANGED' });
    };
    element._confirm = true;
    await element.publish();
    expect(calls.map((call) => call[0])).to.deep.equal(['flush', 'get', 'publish', 'get']);
    expect(element._retry).to.equal(undefined);
    expect(element._confirm).to.equal(false);
    expect(element._ready).to.equal(true);
    expect(element._status).to.include('confirm a new merge');
    expect(editor.inert).to.equal(false);
  });

  it('keeps editing locked if terminal-rejection metadata cannot be refreshed', async () => {
    let reads = 0;
    client.get = async (id) => {
      reads += 1;
      if (reads === 2) throw new Error('metadata unavailable');
      return { id, revision: 8, activeSyncId: null };
    };
    client.publish = async () => { throw new BranchingError(409, { code: 'REVISION_CHANGED' }); };
    await element.publish();
    expect(element._retry).to.equal(undefined);
    expect(element._ready).to.equal(false);
    expect(editor.inert).to.equal(true);
    expect(element._error).to.include('metadata unavailable');
    await element.loadMetadata();
    expect(element._ready).to.equal(true);
    expect(element._confirm).to.equal(false);
    expect(editor.inert).to.equal(false);
  });

  it('resumes an active sync discovered during terminal-rejection refresh', async () => {
    let reads = 0;
    client.get = async (id) => {
      reads += 1;
      return { id, revision: 8, activeSyncId: reads === 2 ? 'sync1' : null };
    };
    client.publish = async () => { throw new BranchingError(409, { code: 'REVISION_CHANGED' }); };
    await element.publish();
    expect(element._syncId).to.equal('sync1');
    expect(element._session.revision).to.equal(1);
    expect(element._retry).to.equal(undefined);
    expect(editor.inert).to.equal(true);
    expect(element._status).to.include('Sync needs resolution');
  });

  it('opens and locks a session returned by publish, with pinned escaped values and explicit resolutions', async () => {
    client.publish = async () => ({ status: 'needs-resolution', syncId: 'sync1' });
    await element.publish();
    expect(editor.inert).to.equal(true);
    await element.select(session.entries[0]);
    await element.updateComplete;
    expect(calls.filter((call) => call[0] === 'value')).to.deep.equal([
      ['value', 'work', 'sync1', 'entry1', 'branch'],
      ['value', 'work', 'sync1', 'entry1', 'default'],
    ]);
    const diff = element.shadowRoot.querySelector('da-branch-diff');
    await diff.updateComplete;
    [...diff.shadowRoot.querySelectorAll('button')].find((button) => button.textContent === 'Source').click();
    await diff.updateComplete;
    expect(diff.shadowRoot.querySelector('pre').textContent).to.equal('<script>unsafe</script>');
    expect(diff.shadowRoot.querySelector('script')).to.equal(null);
    element._draft = validHtml;
    await element.resolve('edited');
    expect(calls.find((call) => call[0] === 'resolve')[4]).to.deep.equal({ expectedSessionRevision: 1, choice: 'edited', body: validHtml, contentType: 'text/html' });
    await element.complete();
    expect(calls.find((call) => call[0] === 'complete')).to.deep.equal(['complete', 'work', 'sync1', 2]);
    expect(branchEditingLocked()).to.equal(false);
    expect(editor.inert).to.equal(false);
  });

  it('accepts editor source that reopens through the production parser and serializer', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    element._draft = validHtml;
    await element.resolve('edited');
    const sent = calls.find((call) => call[0] === 'resolve')[4].body;
    const first = new Y.Doc();
    const reopened = new Y.Doc();
    try {
      const schema = getSchema();
      aem2doc(sent, first);
      aem2doc(doc2aem(first), reopened);
      const doc = yDocToProsemirror(schema, reopened);
      doc.check();
      expect(doc.textContent).to.include('new');
    } finally {
      first.destroy();
      reopened.destroy();
    }
  });

  it('rejects malformed, unsupported and non-document HTML without saving or losing the draft', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    const invalid = [
      '',
      '<p>not a document</p>',
      '<body><main><div><p>unclosed</div></main></body>',
      '<body><main><p>missing section</p></main></body>',
      '<body><main><div><script src="https://invalid.example/x.js"></script></div></main></body>',
      '<body><main><div><p title="unclosed></p></div></main></body>',
      '<body><main><div><p><img></p></div></main></body>',
      '<body><main><div><div class="hero"><p>lost content</p></div></div></main></body>',
      '<body><main><div><p>ok</p></div></main><div class="da-metadata"><div><div>k</div><div>&lt;img src="https://invalid.example/leak"&gt;</div></div></div></body>',
      '<body><main><div><!-- --!><img src="https://invalid.example/leak">--></div></main></body>',
      '<body><main><div></div></main><div class="da-metadata"><div><div>k</div><div>a<!-- -->b</div></div></div></body>',
    ];
    for (const draft of invalid) {
      element._draft = draft;
      // eslint-disable-next-line no-await-in-loop
      await element.resolve('edited');
      expect(element._error).to.include('Invalid editor HTML');
      expect(element._draft).to.equal(draft);
      expect(element._session.revision).to.equal(1);
    }
    expect(calls.filter((call) => call[0] === 'resolve')).to.have.length(0);
    expect(performance.getEntriesByType('resource').some((item) => item.name.includes('invalid.example/leak')))
      .to.equal(false);
  });

  it('accepts a structured block, section names and document metadata', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    const draft = '<body><header></header><main><div data-section-name="One &amp; Two">'
      + '<div class="hero dark"><div><div><p>Text</p></div></div></div>'
      + '</div><div><p>Next</p></div></main><footer></footer>'
      + '<div class="da-metadata"><div><div>title</div><div>Example</div></div></div></body>';
    element._draft = draft;
    await element.resolve('edited');
    expect(element._error).to.equal(undefined);
    expect(calls.find((call) => call[0] === 'resolve')[4].body).to.equal(draft);
  });

  it('accepts a main-only source document supported by the production parser', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    const draft = '<main><div><p>Fragment</p></div></main>';
    element._draft = draft;
    await element.resolve('edited');
    expect(element._error).to.equal(undefined);
    expect(calls.find((call) => call[0] === 'resolve')[4].body).to.equal(draft);
  });

  it('does not save a draft changed while validation is loading', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    element._draft = validHtml;
    const pending = element.resolve('edited');
    element._draft = `${validHtml} `;
    await pending;
    expect(element._error).to.include('resolution changed');
    expect(calls.filter((call) => call[0] === 'resolve')).to.have.length(0);
    expect(element._draft).to.equal(`${validHtml} `);
  });

  it('validates media-bearing HTML without requesting the referenced resource', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    const url = `https://branch-validation.invalid/${crypto.randomUUID()}.png`;
    const draft = `<body><main><div><p><img src="${url}" alt="sample"></p></div></main></body>`;
    element._draft = draft;
    await element.resolve('edited');
    await tick();
    expect(element._error).to.equal(undefined);
    expect(calls.find((call) => call[0] === 'resolve')[4].body).to.equal(draft);
    expect(performance.getEntriesByType('resource').some((item) => item.name.includes(url))).to.equal(false);
  });

  it('checks sheet and config JSON syntax and editor shape before submitting', async () => {
    const sheet = { ':type': 'sheet', data: [{ key: 'value' }], ':colWidths': [100] };
    for (const kind of ['json', 'config']) {
      const conflict = { ...entry, itemKind: kind };
      session = { ...session, entries: [conflict] };
      // eslint-disable-next-line no-await-in-loop
      await element.openSession(element.capture(), 'sync1');
      // eslint-disable-next-line no-await-in-loop
      await element.select(conflict);
      const invalid = [
        '{', 'null', '[]', '{}', '{":type":"sheet","data":[null]}',
        '{":type":"sheet","data":[{"a":"1"},{"b":"2"}]}',
        '{":type":"sheet","data":[],":colWidths":{}}',
        '{":type":"multi-sheet",":names":["missing"]}',
      ];
      for (const draft of invalid) {
        element._draft = draft;
        // eslint-disable-next-line no-await-in-loop
        await element.resolve('edited');
        expect(element._error).to.match(/Invalid/);
        expect(element._draft).to.equal(draft);
      }
      expect(calls.filter((call) => call[0] === 'resolve')).to.have.length(kind === 'json' ? 0 : 1);
      element._draft = JSON.stringify(sheet);
      // eslint-disable-next-line no-await-in-loop
      await element.resolve('edited');
      expect(calls.filter((call) => call[0] === 'resolve').at(-1)[4].body).to.equal(JSON.stringify(sheet));
    }
  });

  it('accepts multi-sheet config with private sheets and refuses edited media', async () => {
    const config = { ...entry, itemKind: 'config' };
    const data = { data: [{ key: 'value' }], ':colWidths': [120] };
    const source = JSON.stringify({ ':type': 'multi-sheet', ':names': ['public'], public: data, ':private': { 'private-secret': data } });
    session = { ...session, entries: [config] };
    await element.openSession(element.capture(), 'sync1');
    await element.select(config);
    element._draft = source;
    await element.resolve('edited');
    expect(calls.filter((call) => call[0] === 'resolve').at(-1)[4].body).to.equal(source);

    const media = { ...entry, itemKind: 'media' };
    session = { ...session, entries: [media] };
    await element.openSession(element.capture(), 'sync1');
    await element.select(media);
    element._draft = 'not media';
    await element.resolve('edited');
    expect(element._error).to.include('Enter edited source text');
    expect(calls.filter((call) => call[0] === 'resolve')).to.have.length(1);
    expect(element._draft).to.equal('not media');
  });

  it('reads all three pinned inputs in Base, Branch, Default order and supports explicit deletion', async () => {
    session = { ...session, entries: [{ ...entry, base: { state: 'present' } }] };
    await element.openSession(element.capture(), 'sync1');
    await element.select(session.entries[0]);
    expect(calls.filter((call) => call[0] === 'value').map((call) => call[4]))
      .to.deep.equal(['base', 'branch', 'default']);
    await element.resolve('delete');
    expect(calls.find((call) => call[0] === 'resolve')[4]).to.deep.equal({ expectedSessionRevision: 1, choice: 'delete' });
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('1 / 1 resolved');
  });

  it('does not render an unsafe media MIME type as an image', async () => {
    const media = { ...entry, itemKind: 'media', base: { state: 'present' } };
    session = { ...session, entries: [media] };
    client.getSyncValue = async () => new Response('<svg onload="alert(1)"></svg>', { headers: { 'Content-Type': 'image/svg+xml' } });
    await element.openSession(element.capture(), 'sync1');
    await element.select(media);
    await element.updateComplete;
    expect(element.shadowRoot.querySelector('img')).to.equal(null);
    expect(element.shadowRoot.textContent).to.include('image/svg+xml');
  });

  it('resumes an active session from metadata and restores the edit lock', async () => {
    client.get = async (id) => ({ id, revision: 7, activeSyncId: 'sync1' });
    await element.loadMetadata();
    expect(element._syncId).to.equal('sync1');
    expect(element._session.revision).to.equal(1);
    expect(editor.inert).to.equal(true);
    await element.cancel();
    expect(editor.inert).to.equal(false);
    expect(element._status).to.include('unchanged');
  });

  it('discovers a session started in another tab on focus', async () => {
    client.get = async (id) => ({ id, revision: 7, activeSyncId: 'sync1' });
    window.dispatchEvent(new Event('focus'));
    await tick();
    expect(element._syncId).to.equal('sync1');
    expect(editor.inert).to.equal(true);
  });

  it('retains the old session on target movement and restarts without reusing choices', async () => {
    session = { ...session, entries: [{ ...entry, choice: 'branch' }] };
    await element.openSession(element.capture(), 'sync1');
    client.completeSync = async () => { throw new BranchingError(409, { code: 'SYNC_TARGET_MOVED' }); };
    await element.complete();
    expect(element._moved).to.equal(true);
    expect(element._session.entries[0].choice).to.equal('branch');
    client.sync = async (...args) => {
      calls.push(['sync', ...args]);
      session = { ...session, syncId: 'sync2', entries: [{ ...entry }] };
      return { status: 'needs-resolution', syncId: 'sync2' };
    };
    await element.cancel(true);
    expect(element._syncId).to.equal('sync2');
    expect(element._session.entries[0].choice).to.equal(undefined);
    expect(calls.findIndex((call) => call[0] === 'flush')).to.be.lessThan(calls.findIndex((call) => call[0] === 'cancel'));
    expect(branchEditingLocked()).to.equal(true);
  });

  it('keeps the original session when restart flush is rejected', async () => {
    await element.openSession(element.capture(), 'sync1');
    element._moved = true;
    editor.forceSave = async () => ({ ok: false, error: 'no ack' });
    await element.cancel(true);
    expect(element._syncId).to.equal('sync1');
    expect(calls.some((call) => call[0] === 'cancel')).to.equal(false);
    expect(editor.inert).to.equal(true);
  });

  it('does not navigate away from a locked branch after a negative flush', async () => {
    await element.openSession(element.capture(), 'sync1');
    editor.forceSave = async () => ({ ok: false, error: 'pending stale edits' });
    let navigated = false;
    try {
      await switchContentBranch(null, {
        location: { hash: '#/org/site~work/page', pathname: '/edit', search: '' },
        root: document,
        defaultMatches: async () => true,
        navigate: () => { navigated = true; },
      });
    } catch (error) {
      expect(error.message).to.equal('pending stale edits');
    }
    expect(navigated).to.equal(false);
    expect(editor.inert).to.equal(true);
  });

  it('handles nothing-to-publish without changing the branch', async () => {
    client.publish = async () => ({ status: 'nothing-to-publish' });
    await element.publish();
    expect(element._status).to.equal('Nothing to merge.');
    expect(element.branchId).to.equal('work');
  });

  it('locks editing and offers reload when sync has an uncertain network result', async () => {
    client.sync = async () => { throw new TypeError('network lost'); };
    await element.sync();
    expect(element._uncertain).to.equal(true);
    expect(editor.inert).to.equal(true);
    await element.updateComplete;
    expect(element.shadowRoot.textContent).to.include('Reload branch');
  });

  it('locks new editor surfaces created after a session is opened', async () => {
    await element.openSession(element.capture(), 'sync1');
    const newEditor = document.createElement('ew-editor-wysiwyg');
    document.body.append(newEditor);
    await tick();
    expect(newEditor.inert).to.equal(true);
    await element.cancel();
    expect(newEditor.inert).to.equal(false);
    newEditor.remove();
  });

  it('restarts to completion and restores the original editor mode', async () => {
    await element.openSession(element.capture(), 'sync1');
    element._moved = true;
    await element.cancel(true);
    expect(element._status).to.include('Sync completed');
    expect(element._uncertain).to.equal(false);
    expect(editor.inert).to.equal(false);
  });

  it('refreshes a stale session revision without losing unsaved edited text', async () => {
    await element.openSession(element.capture(), 'sync1');
    await element.select(entry);
    element._draft = validHtml;
    client.resolve = async () => {
      session = { ...session, revision: 3 };
      throw new BranchingError(409, { code: 'REVISION_CHANGED', message: 'Session changed' });
    };
    await element.resolve('edited');
    expect(element._session.revision).to.equal(3);
    expect(element._draft).to.equal(validHtml);
    expect(element._error).to.equal('Session changed');
  });

  it('does not let a delayed metadata response overwrite a newer sync result', async () => {
    let release;
    client.get = () => new Promise((resolve) => { release = resolve; });
    const pending = element.loadMetadata();
    client.get = async (id) => ({ id, revision: 7 });
    await element.sync();
    release({ id: 'work', revision: 7, activeSyncId: 'sync1' });
    await pending;
    expect(element._syncId).to.equal(undefined);
    expect(element._status).to.include('Sync completed');
  });

  it('ignores a delayed response after changing branch', async () => {
    let release;
    client.sync = () => new Promise((resolve) => { release = resolve; });
    const pending = element.sync();
    await tick();
    element.branchId = 'other';
    await element.updateComplete;
    release({ status: 'needs-resolution', syncId: 'sync1' });
    await pending;
    expect(element._syncId).to.equal(undefined);
    expect(branchEditingLocked()).to.equal(false);
  });
});
