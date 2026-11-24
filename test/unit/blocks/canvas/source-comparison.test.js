import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
let installComparison;
let readSourceContent;
const page = { org: 'example', site: 'site', path: 'page' };
const options = {
  candidate: '/example/site/.da/proposals/campaigns/demo.html',
  baseline: '/example/site/campaigns/demo.html',
};

before(async () => {
  ({ installComparison, readSourceContent } = await import('../../../../blocks/canvas/ew-comparison/comparison.js'));
});

describe('saved DA source comparison', () => {
  let mountRoot;
  let controller;
  let context;
  let sources;
  let reads;
  let saveCalls;
  let documentCalls;
  let deliveryCalls;

  beforeEach(() => {
    context = { ...page };
    sources = new Map([
      [options.baseline, '<body><main><p>Current content</p></main></body>'],
      [options.candidate, '<body><main><p>Proposed content</p><script>window.pwned = true</script></main></body>'],
    ]);
    reads = [];
    saveCalls = 0;
    documentCalls = 0;
    deliveryCalls = 0;
    mountRoot = document.createElement('div');
    mountRoot.append(document.createElement('div'));
    document.body.append(mountRoot);
    controller = installComparison({
      mountRoot,
      getContext: () => context,
      getDocument: () => { documentCalls += 1; return '<p>Unsaved editor content</p>'; },
      saveDocument: async () => { saveCalls += 1; return { ok: true }; },
      loadContent: async () => { deliveryCalls += 1; return { html: '<p>Live content</p>' }; },
      loadSource: async (target) => {
        const path = `/${target.org}/${target.site}${target.path}`;
        reads.push(path);
        if (!sources.has(path)) throw new Error(`Could not load source content for ${target.path} (404).`);
        return { html: sources.get(path) };
      },
    });
  });

  afterEach(() => {
    controller.destroy();
    mountRoot.remove();
  });

  it('compares saved source paths without saving the editor or reading delivered content', async () => {
    expect(await controller.open(options)).to.deep.equal({ ok: true });
    expect(reads).to.deep.equal([options.baseline, options.candidate]);
    expect([saveCalls, documentCalls, deliveryCalls]).to.deep.equal([0, 0, 0]);
    const surface = mountRoot.querySelector('ew-comparison');
    await surface.updateComplete;
    const view = surface.shadowRoot.querySelector('ew-canvas-compare');
    expect(view.currentLabel).to.equal('Current content');
    expect(view.label).to.equal('Proposed changes');
    expect(surface.diffDom.textContent).to.include('Current');
    expect(surface.diffDom.textContent).to.include('Proposed');
    expect(surface.diffDom.querySelector('script')).to.equal(null);
    expect(surface.diffDom.textContent).not.to.include('Unsaved editor content');
    expect(surface.diffDom.textContent).not.to.include('Live content');
  });

  it('rereads both saved sources when the comparison is refreshed', async () => {
    await controller.open(options);
    sources.set(options.baseline, '<p>New saved original</p>');
    sources.set(options.candidate, '<p>New saved proposal</p>');
    await mountRoot.querySelector('ew-comparison').onRefresh();
    expect(reads).to.deep.equal([
      options.baseline, options.candidate, options.baseline, options.candidate,
    ]);
    const surface = mountRoot.querySelector('ew-comparison');
    expect(surface.diffDom.textContent).to.include('original');
    expect(surface.diffDom.textContent).to.include('proposal');
    expect(saveCalls).to.equal(0);
  });

  it('reports a missing source instead of using an empty or published baseline', async () => {
    sources.delete(options.baseline);
    const result = await controller.open(options);
    expect(result.ok).to.equal(false);
    expect(result.error).to.include('404');
    const surface = mountRoot.querySelector('ew-comparison');
    expect(surface.error).to.include('404');
    expect(surface.diffDom).to.equal(undefined);
    expect(deliveryCalls).to.equal(0);
  });

  it('resolves each source operand independently of the open page and site', async () => {
    const candidate = '/another-org/another-site/alternate.html';
    sources.set(candidate, '<p>Other source</p>');
    expect(await controller.open({ ...options, candidate })).to.deep.equal({ ok: true });
    expect(reads).to.deep.equal([options.baseline, candidate]);
  });

  it('retains the named live baseline with a source-path candidate without saving the editor', async () => {
    expect(await controller.open({ ...options, baseline: 'live' })).to.deep.equal({ ok: true });
    expect(reads).to.deep.equal([options.candidate]);
    expect(deliveryCalls).to.equal(1);
    expect(saveCalls).to.equal(0);
  });

  it('closes the source comparison when the host page changes', async () => {
    await controller.open(options);
    context = { ...page, path: 'another-page' };
    controller.contextChanged();
    expect(mountRoot.querySelector('ew-comparison')).to.equal(null);
    expect(mountRoot.firstElementChild.inert).to.equal(false);
  });

  it('rejects invalid source operands before reading or saving anything', async () => {
    expect(await controller.open({ ...options, baseline: 'https://example.com/page' }))
      .to.deep.equal({ ok: false, error: 'invalid-comparison' });
    expect(await controller.open({ ...options, candidate: '/example/site/../page' }))
      .to.deep.equal({ ok: false, error: 'invalid-comparison' });
    expect(reads).to.have.length(0);
    expect([saveCalls, documentCalls, deliveryCalls]).to.deep.equal([0, 0, 0]);
  });
});

describe('DA source loading', () => {
  ['campaigns/demo', '/campaigns/demo.html'].forEach((path) => {
    it(`reads saved HTML for ${path} without using published content`, async () => {
      let args;
      const api = {
        source: {
          get: async (request) => {
            args = request;
            return new Response('<body><main><p>Saved</p></main></body>');
          },
        },
      };
      expect(await readSourceContent({ ...page, path }, { api }))
        .to.deep.equal({ html: '<body><main><p>Saved</p></main></body>' });
      expect(args).to.deep.equal({ org: 'example', site: 'site', path: '/campaigns/demo.html', cachebust: true });
    });
  });

  it('does not hide source read failures', async () => {
    const api = { source: { get: async () => new Response(null, { status: 403 }) } };
    let error;
    try {
      await readSourceContent(page, { api });
    } catch (caught) {
      error = caught;
    }
    expect(error?.message).to.include('403');
  });
});
