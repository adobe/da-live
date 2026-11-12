import { expect } from '@esm-bundle/chai';
import { readFile } from '@web/test-runner-commands';
import { setNx } from '../../../../scripts/utils.js';
import { handleArtifactAction } from '../../../../blocks/canvas/editor-utils/artifact-actions.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let installComparison;
let readProposedContent;
before(async () => {
  ({ installComparison, readProposedContent } = await import('../../../../blocks/canvas/ew-comparison/comparison.js'));
});

describe('staged proposal comparison', () => {
  const proposedPath = '/example/site/.da/campaigns/spring.html';
  const options = { candidate: 'proposal', baseline: 'live', proposedPath };
  let root;
  let editor;
  let controller;
  let context;
  let reads;
  let proposalReads;
  let proposal;
  let live;
  let saveCalls;
  let serializeCalls;
  let pendingRead;
  let onProposalRead;

  beforeEach(() => {
    context = { org: 'example', site: 'site', path: 'current' };
    reads = [];
    proposalReads = [];
    saveCalls = 0;
    serializeCalls = 0;
    pendingRead = undefined;
    onProposalRead = undefined;
    live = { html: '<p>Live content</p>' };
    proposal = '<p>Proposed content</p><script>bad()</script><a href="javascript:bad()">Unsafe</a><img src="./media.jpg" onerror="bad()">';
    root = document.createElement('div');
    editor = document.createElement('textarea');
    editor.value = 'Unsaved edits';
    root.append(editor);
    document.body.append(root);
    controller = installComparison({
      mountRoot: root,
      getContext: () => context,
      getDocument: () => { serializeCalls += 1; return '<p>Editor content</p>'; },
      saveDocument: async () => { saveCalls += 1; return { ok: true }; },
      loadContent: async (partition, target) => {
        reads.push({ partition, target });
        return live;
      },
      loadProposal: async (target) => {
        proposalReads.push(target);
        onProposalRead?.();
        if (pendingRead) return pendingRead;
        if (proposal instanceof Error) throw proposal;
        return { html: proposal };
      },
    });
  });

  afterEach(() => {
    controller.destroy();
    root.remove();
  });

  it('compares another page against live without saving, serializing, previewing or navigating', async () => {
    const event = { name: 'editor.viewDiff', context: { proposedPath: { path: '/components/proposal-path/text' } } };
    const artifact = {
      id: 'proposal',
      components: [
        { id: 'root', component: 'ActionButton', label: 'View diff', action: { event } },
        { id: 'proposal-path', component: 'Text', text: proposedPath, visible: false },
      ],
    };
    const action = { artifactId: artifact.id, componentId: 'root', ...event };
    expect(await handleArtifactAction({ action, artifact, context })).to.deep.equal({ ok: true });
    expect(reads).to.deep.equal([{
      partition: 'live',
      target: { org: 'example', site: 'site', path: 'campaigns/spring', proposalPath: '/.da/campaigns/spring.html' },
    }]);
    expect(proposalReads).to.deep.equal([reads[0].target]);
    expect(saveCalls).to.equal(0);
    expect(serializeCalls).to.equal(0);
    expect(context.path).to.equal('current');
    expect(editor.value).to.equal('Unsaved edits');
    const surface = root.querySelector('ew-comparison');
    expect(surface.path).to.equal('/campaigns/spring');
    expect(surface.diffDom.textContent).to.include('Proposed content');
    expect(surface.diffDom.querySelector('script, [onerror], [href^="javascript:"]')).to.equal(null);
    expect(surface.diffDom.querySelector('img').src).to.equal('https://main--site--example.aem.live/campaigns/media.jpg');
    await surface.updateComplete;
    const view = surface.shadowRoot.querySelector('ew-canvas-compare');
    await view.updateComplete;
    expect(view.label).to.equal('Proposed changes');
    expect(view.currentLabel).to.equal('Live');
    controller.close();
    expect(editor.inert).to.equal(false);
    expect(editor.isConnected).to.equal(true);
  });

  it('rereads both versions on refresh and treats missing live as an empty baseline', async () => {
    live = { html: '', missing: true };
    await controller.open(options);
    let surface = root.querySelector('ew-comparison');
    expect(surface.missingLive).to.equal(true);
    proposal = '<p>Updated staged content</p>';
    await surface.onRefresh();
    surface = root.querySelector('ew-comparison');
    expect(reads).to.have.length(2);
    expect(proposalReads).to.have.length(2);
    expect(surface.diffDom.textContent).to.include('Updated staged content');
    expect(saveCalls).to.equal(0);
  });

  it('accepts the exact composed artifact documented in the Coworker skill', async () => {
    const skill = await readFile({ path: '../../../../skills/page-proposals/SKILL.md' });
    const example = skill.match(/```json\n(\[[\s\S]*?\])\n```/)[1];
    const artifact = { id: 'skill-example', components: JSON.parse(example) };
    const button = artifact.components.find((record) => record.id === 'page1-diff');
    const action = { artifactId: artifact.id, componentId: button.id, ...button.action.event };
    expect(await handleArtifactAction({ action, artifact, context })).to.deep.equal({ ok: true });
    expect(proposalReads[0].proposalPath).to.equal('/.da/campaigns/spring-2026.html');
    expect(reads[0].target.path).to.equal('campaigns/spring-2026');
    expect(saveCalls).to.equal(0);
  });

  it('shows staged read failures without falling back to saving the current document', async () => {
    proposal = new Error('Could not load proposed content (404).');
    expect(await controller.open(options)).to.deep.equal({ ok: false, error: proposal.message });
    const surface = root.querySelector('ew-comparison');
    await surface.updateComplete;
    expect(surface.shadowRoot.textContent).to.include(proposal.message);
    expect(surface.loading).to.equal(false);
    expect(surface.diffDom).to.equal(undefined);
    expect(saveCalls).to.equal(0);
    expect(serializeCalls).to.equal(0);
  });

  it('validates staged paths again at the comparison boundary', async () => {
    const result = await controller.open({ ...options, proposedPath: '/example/site/current.html' });
    expect(result.ok).to.equal(false);
    expect(reads).to.deep.equal([]);
    expect(proposalReads).to.deep.equal([]);
    expect(root.querySelector('ew-comparison')).to.equal(null);
  });

  ['close', 'navigation', 'replacement'].forEach((change) => {
    it(`discards pending proposal reads after ${change}`, async () => {
      let complete;
      pendingRead = new Promise((resolve) => { complete = resolve; });
      const opened = new Promise((resolve) => {
        onProposalRead = resolve;
      });
      const pending = controller.open(options);
      await opened;
      if (change === 'close') controller.close();
      else if (change === 'navigation') {
        context = { ...context, path: 'next' };
        controller.contextChanged();
      } else {
        pendingRead = undefined;
        proposal = '<p>Replacement proposal</p>';
        await controller.open(options);
      }
      const surface = root.querySelector('ew-comparison');
      complete({ html: '<p>Obsolete proposal</p>' });
      expect(await pending).to.deep.equal({ ok: false, error: 'stale-context' });
      expect(root.querySelector('ew-comparison')).to.equal(surface);
      if (surface) expect(surface.diffDom.textContent).to.include('Replacement proposal');
      expect(saveCalls).to.equal(0);
    });
  });
});

describe('staged source loader', () => {
  it('reads source HTML through the authenticated API with cache busting', async () => {
    let args;
    const target = { org: 'example', site: 'site', proposalPath: '/.da/page.html' };
    const api = {
      source: {
        get: async (value) => {
          args = value;
          return new Response('<p>Staged content</p>');
        },
      },
    };
    expect(await readProposedContent(target, { api })).to.deep.equal({ html: '<p>Staged content</p>' });
    expect(args).to.deep.equal({ org: 'example', site: 'site', path: target.proposalPath, cachebust: true });
  });

  [401, 403, 404, 500].forEach((status) => {
    it(`reports staged source ${status} instead of comparing an error response`, async () => {
      const api = { source: { get: async () => new Response('Error response', { status }) } };
      let error;
      try {
        await readProposedContent({ proposalPath: '/.da/page.html' }, { api });
      } catch (e) { error = e; }
      expect(error.message).to.equal(`Could not load proposed content (${status}).`);
    });
  });
});
