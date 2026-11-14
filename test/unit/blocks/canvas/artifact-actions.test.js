import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { readFile } from '@web/test-runner-commands';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';
import { handleArtifactAction } from '../../../../blocks/canvas/editor-utils/artifact-actions.js';

describe('proposal accept and reset', () => {
  const context = { org: 'example', site: 'site', path: 'current' };
  let artifact;
  let source;
  let onUpdate;
  let unsubscribe;

  function run(name, id = 'page1', options = {}) {
    const componentId = name === 'acceptChanges' ? 'accept' : `${id}-${name}`;
    const button = artifact.components.find((record) => record.id === componentId);
    return handleArtifactAction({
      artifact,
      action: { artifactId: artifact.id, componentId, ...structuredClone(button.action.event) },
      context,
      api: { source },
      onUpdate,
      ...options,
    });
  }

  beforeEach(() => {
    artifact = {
      id: 'proposal',
      dataModel: {
        proposals: {
          page1: '/example/site/.da/campaigns/one.html',
          page2: '/example/site/.da/campaigns/two.html',
        },
      },
      components: [
        { id: 'root', component: 'Column', children: ['page1-resetPage', 'page1-viewDiff', 'page2-resetPage', 'page2-viewDiff', 'accept'] },
        ...['page1', 'page2'].flatMap((id) => ['resetPage', 'viewDiff'].map((name) => ({
          id: `${id}-${name}`,
          component: 'ActionButton',
          label: name === 'resetPage' ? 'Reset page' : 'View diff',
          action: { event: { name: `editor.${name}`, context: { proposedPath: { path: `/proposals/${id}` } } } },
        }))),
        {
          id: 'accept',
          component: 'Button',
          label: 'Accept changes',
          action: { event: { name: 'editor.acceptChanges', context: { proposals: { path: '/proposals' } } } },
        },
      ],
    };
    source = {
      get: sinon.stub().callsFake(async ({ path }) => new Response(
        `<html><body>${path}</body></html>`,
      )),
      save: sinon.stub().resolves({ ok: true, status: 200 }),
      delete: sinon.stub().resolves({ ok: true, status: 204 }),
    };
    onUpdate = sinon.spy();
    unsubscribe = canvasBus.comparisonRequest.subscribe(({ resolve }) => resolve?.({ ok: true }));
  });

  afterEach(() => {
    unsubscribe();
    sinon.restore();
  });

  it('saves every draft verbatim to its original before deleting it, then disables completed controls', async () => {
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.get.firstCall.args[0]).to.deep.equal({ org: 'example', site: 'site', path: '/.da/campaigns/one.html', cachebust: true });
    expect(source.save.firstCall.args[0]).to.deep.equal({
      org: 'example',
      site: 'site',
      path: '/campaigns/one.html',
      body: '<html><body>/.da/campaigns/one.html</body></html>',
    });
    expect(source.save.secondCall.args[0].path).to.equal('/campaigns/two.html');
    expect(source.delete.args.map(([args]) => args.path)).to.deep.equal([
      '/.da/campaigns/one.html', '/.da/campaigns/two.html',
    ]);
    sinon.assert.callOrder(source.get, source.save, source.delete);
    expect(source.save.secondCall.calledBefore(source.delete.secondCall)).to.equal(true);
    expect(artifact.components.slice(1).every((record) => record.isDisabled)).to.equal(true);
    expect(artifact.components.at(-1).label).to.equal('Changes accepted');
    expect(onUpdate.callCount).to.equal(2);
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(2);
  });

  it('reset deletes only its own draft and accept skips that page', async () => {
    expect(await run('resetPage')).to.deep.equal({ ok: true });
    expect(source.get.called).to.equal(false);
    expect(source.save.called).to.equal(false);
    expect(source.delete.firstCall.args[0].path).to.equal('/.da/campaigns/one.html');
    expect(artifact.components.find((record) => record.id === 'page1-resetPage').label).to.equal('Draft discarded');
    expect(artifact.components.find((record) => record.id === 'page1-viewDiff').isDisabled).to.equal(true);
    expect(artifact.components.at(-1).isDisabled).to.equal(false);
    expect((await run('viewDiff')).ok).to.equal(false);
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.get.callCount).to.equal(1);
    expect(source.save.firstCall.args[0].path).to.equal('/campaigns/two.html');
    expect(source.delete.callCount).to.equal(2);
  });

  it('skips missing drafts after history reload and treats reset 404 as already removed', async () => {
    source.get.onFirstCall().resolves({ ok: false, status: 404 });
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(1);
    expect(source.save.firstCall.args[0].path).to.equal('/campaigns/two.html');
    expect(source.delete.callCount).to.equal(1);
  });

  it('disables accept when every draft is reset, including an already deleted draft', async () => {
    source.delete.onFirstCall().resolves({ ok: false, status: 404 });
    await run('resetPage');
    await run('resetPage', 'page2');
    expect(artifact.components.at(-1).isDisabled).to.equal(true);
    expect(artifact.components.at(-1).label).to.equal('No changes to accept');
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.get.called).to.equal(false);
    expect(source.save.called).to.equal(false);
  });

  it('retains the draft and stops the batch if a save fails', async () => {
    source.save.onFirstCall().resolves({ ok: false, status: 403 });
    const result = await run('acceptChanges');
    expect(result.ok).to.equal(false);
    expect(result.error).to.include('Draft retained');
    expect(source.delete.called).to.equal(false);
    expect(source.get.callCount).to.equal(1);
    expect(artifact.components.at(-1).isDisabled).to.equal(false);
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(3);
  });

  it('retries failed cleanup without overwriting the original again or repeating completed pages', async () => {
    source.delete.onSecondCall().resolves({ ok: false, status: 500 });
    const result = await run('acceptChanges');
    expect(result.ok).to.equal(false);
    expect(result.error).to.include('Saved /campaigns/two.html');
    expect(result.error).to.include('retry cleanup without saving again');
    expect(source.save.callCount).to.equal(2);
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.get.callCount).to.equal(2);
    expect(source.save.callCount).to.equal(2);
    expect(source.delete.thirdCall.args[0].path).to.equal('/.da/campaigns/two.html');
  });

  it('retains cleanup state after a network failure deleting a saved draft', async () => {
    source.delete.onFirstCall().rejects(new Error('Network unavailable'));
    const result = await run('acceptChanges');
    expect(result.ok).to.equal(false);
    expect(result.error).to.include('Saved /campaigns/one.html');
    expect(result.error).to.include('Network unavailable');
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(2);
    expect(source.delete.secondCall.args[0].path).to.equal('/.da/campaigns/one.html');
  });

  it('leaves a failed reset available for retry without excluding the page from accept', async () => {
    source.delete.onFirstCall().resolves({ ok: false, status: 403 });
    expect((await run('resetPage')).ok).to.equal(false);
    expect(artifact.components.find((record) => record.id === 'page1-resetPage').isDisabled).to.equal(false);
    expect(await run('acceptChanges')).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(2);
  });

  it('does not save or delete on a non-404 draft read failure', async () => {
    source.get.onFirstCall().resolves({ ok: false, status: 403 });
    expect((await run('acceptChanges')).ok).to.equal(false);
    expect(source.save.called).to.equal(false);
    expect(source.delete.called).to.equal(false);
  });

  it('validates every target before the first write, rejecting unsafe paths and duplicates', async () => {
    artifact.dataModel.proposals.page2 = '/example/other/.da/two.html';
    expect((await run('acceptChanges')).ok).to.equal(false);
    artifact.dataModel.proposals.page2 = artifact.dataModel.proposals.page1;
    expect((await run('acceptChanges')).ok).to.equal(false);
    expect(source.get.called).to.equal(false);
    expect(source.save.called).to.equal(false);
    expect(source.delete.called).to.equal(false);
  });

  it('rejects forged accept bindings without writes', async () => {
    const button = artifact.components.at(-1);
    for (const contextValue of [
      { proposals: { path: '/proposals/page1' } },
      { proposals: { path: '/proposals' }, extra: { path: '/proposals' } },
      { proposals: { path: '/proposals', extra: true } },
    ]) {
      // eslint-disable-next-line no-await-in-loop
      expect((await handleArtifactAction({
        action: { artifactId: artifact.id, componentId: button.id, name: 'editor.acceptChanges', context: contextValue },
        artifact,
        context,
        api: { source },
      })).ok).to.equal(false);
    }
    expect(source.save.called).to.equal(false);
    expect(source.delete.called).to.equal(false);
  });

  it('blocks repeated accept and reset, including another artifact targeting the same draft', async () => {
    let release;
    source.get.onFirstCall().returns(new Promise((resolve) => { release = resolve; }));
    const pending = run('acceptChanges');
    expect(artifact.components.at(-1).isDisabled).to.equal(true);
    expect((await run('acceptChanges')).ok).to.equal(false);
    expect((await run('resetPage')).ok).to.equal(false);
    const other = structuredClone(artifact);
    expect((await handleArtifactAction({
      action: { artifactId: other.id, componentId: 'page1-resetPage', ...other.components[1].action.event },
      artifact: other,
      context,
      api: { source },
    })).ok).to.equal(false);
    release(new Response('<p>Draft</p>'));
    expect(await pending).to.deep.equal({ ok: true });
    expect(source.save.callCount).to.equal(2);
  });

  it('cancels writes after navigation during a draft read', async () => {
    let active = context;
    source.get.onFirstCall().callsFake(async () => {
      active = { ...context, path: 'elsewhere' };
      return new Response('<p>Draft</p>');
    });
    expect((await run('acceptChanges', undefined, { getContext: () => active })).ok).to.equal(false);
    expect(source.save.called).to.equal(false);
    expect(source.delete.called).to.equal(false);
  });

  it('finishes cleanup after a successful save during navigation, but does not save the next page', async () => {
    let active = context;
    source.save.onFirstCall().callsFake(async () => {
      active = { ...context, site: 'other' };
      return { ok: true };
    });
    expect((await run('acceptChanges', undefined, { getContext: () => active })).ok).to.equal(false);
    expect(source.save.callCount).to.equal(1);
    expect(source.delete.callCount).to.equal(1);
    expect(source.delete.firstCall.args[0]).to.deep.equal({ org: 'example', site: 'site', path: '/.da/campaigns/one.html' });
  });

  it('executes the accept binding in the actual skill example', async () => {
    const skill = await readFile({ path: '../../../../skills/page-proposals/SKILL.md' });
    const examples = [...skill.matchAll(/```json\n([\s\S]*?)\n```/g)].map((match) => JSON.parse(match[1]));
    artifact = {
      id: 'skill-example',
      components: examples.find((example) => example.components).components,
      dataModel: examples.find((example) => example.proposals),
    };
    const accept = artifact.components.find((record) => record.id === 'accept');
    expect(accept.isDisabled).not.to.equal(true);
    expect(await handleArtifactAction({
      artifact,
      action: { artifactId: artifact.id, componentId: accept.id, ...accept.action.event },
      context,
      api: { source },
    })).to.deep.equal({ ok: true });
    expect(source.save.firstCall.args[0].path).to.equal('/campaigns/spring-2026.html');
    expect(source.delete.firstCall.args[0].path).to.equal('/.da/campaigns/spring-2026.html');
  });
});

describe('canvas artifact actions', () => {
  const context = { org: 'example', site: 'site', path: 'current' };
  let action;
  let artifact;
  let requests;
  let unsubscribe;

  beforeEach(() => {
    const event = {
      name: 'editor.viewDiff',
      context: { proposedPath: { path: '/proposals/page1' } },
    };
    artifact = {
      id: 'proposal',
      dataModel: { proposals: { page1: '/example/site/.da/campaigns/spring.html' } },
      components: [
        { id: 'root', component: 'Column', children: ['diff'] },
        { id: 'diff', component: 'ActionButton', label: 'Any label', action: { event } },
      ],
    };
    action = { artifactId: 'proposal', componentId: 'diff', ...structuredClone(event) };
    requests = [];
    unsubscribe = canvasBus.comparisonRequest.subscribe((request) => {
      requests.push(request);
      request.resolve?.({ ok: true });
    });
  });
  afterEach(() => unsubscribe());

  it('resolves an artifact data model reference and requests comparison on the existing bus', async () => {
    expect(await handleArtifactAction({ action, artifact, context })).to.deep.equal({ ok: true });
    expect(requests).to.have.length(1);
    expect(requests[0].context).to.deep.equal(context);
    expect(requests[0].details).to.deep.equal({ candidate: 'proposal', baseline: 'source', proposedPath: '/example/site/.da/campaigns/spring.html' });
  });

  const invalidCases = {
    'unknown event name': () => { action.name = 'editor.publish'; },
    'mismatched event name': () => { action.name = 'editor.resetPage'; },
    'missing artifact': () => { artifact = undefined; },
    'mismatched artifact': () => { action.artifactId = 'other'; },
    'mismatched component': () => { action.componentId = 'root'; },
    'missing record': () => { artifact.components.pop(); },
    'duplicate IDs': () => { artifact.components.push({ ...artifact.components[1] }); },
    'missing ID': () => { delete artifact.components[1].id; },
    'literal context value': () => { action.context.proposedPath = '/example/site/.da/page.html'; },
    'unsupported component reference': () => { action.context.proposedPath.path = '/components/proposal/text'; },
    'mismatched declared reference': () => { action.context.proposedPath.path = '/proposals/other'; },
    'additional context': () => { action.context.html = '<p>Arbitrary HTML</p>'; },
    'additional reference fields': () => { action.context.proposedPath.extra = 'unsupported'; },
    'missing data model': () => { delete artifact.dataModel; },
    'missing proposal value': () => { delete artifact.dataModel.proposals.page1; },
    'non-string data': () => { artifact.dataModel.proposals.page1 = { path: '/another' }; },
    'array proposals': () => { artifact.dataModel.proposals = ['/example/site/.da/page.html']; },
    'inherited proposals': () => {
      artifact.dataModel = Object.create({ proposals: { page1: '/example/site/.da/page.html' } });
    },
    'inherited proposal value': () => {
      artifact.dataModel.proposals = Object.create({ page1: '/example/site/.da/page.html' });
    },
  };
  Object.entries(invalidCases).forEach(([name, invalidate]) => {
    it(`rejects ${name} without dispatching`, async () => {
      invalidate();
      expect((await handleArtifactAction({ action, artifact, context })).ok).to.equal(false);
      expect(requests).to.deep.equal([]);
    });
  });

  [
    '/other/site/.da/page.html', '/example/other/.da/page.html',
    '/example/site/page.html', '/example/site/.da/../page.html',
    '/example/site/.da/%2e%2e/page.html', '/example/site/.da//page.html',
    '/example/site/.da/nested/.da/page.html', '/example/site/.da/page.html?x=1',
    '/example/site/.da/page.html#hash', '/example/site/.da/page.md',
    '/example/site/.da/.html', '/example/site/.da/folder/./page.html',
    'https://example.com/example/site/.da/page.html', '/example/site/.da/a\\page.html',
  ].forEach((path) => {
    it(`rejects unsafe staged path ${path}`, async () => {
      artifact.dataModel.proposals.page1 = path;
      expect((await handleArtifactAction({ action, artifact, context })).ok).to.equal(false);
      expect(requests).to.deep.equal([]);
    });
  });

  it('does not traverse prototype properties or nested arbitrary object paths', async () => {
    for (const path of ['/proposals/__proto__', '/proposals/constructor', '/proposals/page1/nested']) {
      action.context.proposedPath.path = path;
      artifact.components[1].action.event.context.proposedPath.path = path;
      // eslint-disable-next-line no-await-in-loop
      expect((await handleArtifactAction({ action, artifact, context })).ok).to.equal(false);
    }
    expect(requests).to.deep.equal([]);
  });
});
