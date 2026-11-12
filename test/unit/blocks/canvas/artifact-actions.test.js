import { expect } from '@esm-bundle/chai';
import { canvasBus } from '../../../../blocks/canvas/utils/canvas-bus.js';
import { handleArtifactAction } from '../../../../blocks/canvas/editor-utils/artifact-actions.js';

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
      request.resolve({ ok: true });
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
    'unknown event name': () => { action.name = 'editor.resetPage'; },
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
