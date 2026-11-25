import { expect } from '@esm-bundle/chai';
import { Y } from 'da-y-wrapper';
import { createSaveQueue } from '../../../../blocks/shared/single-author-session.js';
import { validateDaRsDemoConfig } from '../../../../blocks/shared/da-rs-bootstrap.js';

describe('single-author demo configuration', () => {
  const config = { apiVersion: 1, provider: 'da-rs', org: 'demo', adminEnv: 'local', collabEnv: 'local' };
  it('requires an explicit supported authoring mode', () => {
    expect(validateDaRsDemoConfig(config).authoringMode).to.equal(undefined);
    expect(validateDaRsDemoConfig({ ...config, authoringMode: 'single' }).authoringMode).to.equal('single');
    expect(() => validateDaRsDemoConfig({ ...config, authoringMode: 'other' })).to.throw();
  });
});

describe('single-author save queue', () => {
  let doc;
  let queue;
  let text;
  let calls;
  let errors;
  const target = { url: 'http://localhost/source', branch: 'draft', instance: 'instance' };
  const result = (status, etag = '"v2"', branch = 'draft', instance = 'instance') => new Response('', { status, headers: { ETag: etag, 'Content-Branch': branch, 'X-DA-Branch-Instance': instance } });

  beforeEach(() => {
    doc = new Y.Doc();
    text = doc.getText('body');
    text.insert(0, 'old');
    calls = [];
    errors = [];
  });
  afterEach(() => {
    queue?.disconnect();
    queue = undefined;
    doc.destroy();
  });
  function make(fetchSource) {
    queue = createSaveQueue({
      ydoc: doc,
      target,
      etag: '"v1"',
      current: 'old',
      unloadTarget: new EventTarget(),
      serialize: () => text.toString(),
      report: (error) => errors.push(error),
      fetchSource: async (url, opts) => { calls.push({ url, ...opts }); return fetchSource(); },
    });
    queue.setWritable(true);
  }
  function edit(value) {
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, value);
    });
  }

  it('saves with an exact validator and advances its baseline', async () => {
    make(() => result(201));
    edit('new');
    expect((await queue.save()).ok).to.equal(true);
    expect(calls[0].method).to.equal('PUT');
    expect(calls[0].headers['If-Match']).to.equal('"v1"');
    expect(calls[0].body).to.equal('new');
    expect((await queue.save()).ok).to.equal(true);
    expect(calls).to.have.length(1);
  });

  it('keeps unsaved edits after a conflict and never retries against a new baseline', async () => {
    make(() => result(412));
    edit('draft');
    expect((await queue.save()).ok).to.equal(false);
    expect((await queue.save()).ok).to.equal(false);
    expect(text.toString()).to.equal('draft');
    expect(calls).to.have.length(1);
    expect(errors[0]).to.include('412');
  });

  it('refuses to proceed when the saved branch instance is different', async () => {
    make(() => result(201, '"v2"', 'draft', 'other'));
    edit('draft');
    expect((await queue.save()).ok).to.equal(false);
    expect((await queue.save()).ok).to.equal(false);
    expect(calls).to.have.length(1);
  });

  it('does not send a write when the editor lacks write permission', async () => {
    make(() => result(201));
    queue.setWritable(false);
    edit('read only');
    expect((await queue.save()).ok).to.equal(false);
    expect(calls).to.have.length(0);
  });

  it('refuses another save when the server omits the new validator', async () => {
    make(() => new Response('', { status: 201 }));
    edit('draft');
    expect((await queue.save()).ok).to.equal(false);
    expect((await queue.save()).ok).to.equal(false);
    expect(calls).to.have.length(1);
    expect(text.toString()).to.equal('draft');
  });

  it('serializes an edit made while a save is in flight', async () => {
    let release;
    let count = 0;
    make(() => {
      count += 1;
      if (count === 1) return new Promise((resolve) => { release = resolve; });
      return result(201, '"v3"');
    });
    edit('first');
    const saving = queue.save();
    edit('second');
    release(result(201));
    expect((await saving).ok).to.equal(true);
    expect(calls).to.have.length(2);
    expect(calls[1].body).to.equal('second');
    expect(calls[1].headers['If-Match']).to.equal('"v2"');
  });
});
