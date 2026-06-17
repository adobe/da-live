import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let getPreviewOrigin;
let fetchWysiwygBranch;

before(async () => {
  const mod = await import('../../../../../blocks/canvas/editor-utils/editor-utils.js');
  getPreviewOrigin = mod.getPreviewOrigin;
  fetchWysiwygBranch = mod.fetchWysiwygBranch;
});

describe('getPreviewOrigin', () => {
  it('uses main branch by default', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo');
    expect(origin).to.include('main--myrepo--myorg');
  });

  it('uses the provided branch', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'feature');
    expect(origin).to.include('feature--myrepo--myorg');
  });

  it('uses main when branch is explicitly main', () => {
    const origin = getPreviewOrigin('myorg', 'myrepo', 'main');
    expect(origin).to.include('main--myrepo--myorg');
  });
});

describe('fetchWysiwygBranch', () => {
  let savedFetch;
  let testIndex = 0;

  beforeEach(() => {
    savedFetch = window.fetch;
    testIndex += 1;
  });

  afterEach(() => {
    window.fetch = savedFetch;
  });

  function ctx() { return { org: `org-wbr-${testIndex}`, site: `site-wbr-${testIndex}` }; }

  function mockConfig(flags) {
    window.fetch = () => Promise.resolve(new Response(JSON.stringify({ flags }), { status: 200 }));
  }

  it('returns main when org is missing', async () => {
    const branch = await fetchWysiwygBranch({ site: 'mysite' });
    expect(branch).to.equal('main');
  });

  it('returns main when site is missing', async () => {
    const branch = await fetchWysiwygBranch({ org: 'myorg' });
    expect(branch).to.equal('main');
  });

  it('returns the configured branch from site flags', async () => {
    mockConfig({ data: [{ key: 'ew.wysiwygBranch', value: 'feature' }] });
    const branch = await fetchWysiwygBranch(ctx());
    expect(branch).to.equal('feature');
  });

  it('trims whitespace from the configured branch value', async () => {
    mockConfig({ data: [{ key: 'ew.wysiwygBranch', value: '  staging  ' }] });
    const branch = await fetchWysiwygBranch(ctx());
    expect(branch).to.equal('staging');
  });

  it('returns main when ew.wysiwygBranch flag is absent', async () => {
    mockConfig({ data: [{ key: 'other.flag', value: 'true' }] });
    const branch = await fetchWysiwygBranch(ctx());
    expect(branch).to.equal('main');
  });

  it('returns main when flags sheet is missing', async () => {
    mockConfig(undefined);
    const branch = await fetchWysiwygBranch(ctx());
    expect(branch).to.equal('main');
  });

  it('returns main when flag value is empty string', async () => {
    mockConfig({ data: [{ key: 'ew.wysiwygBranch', value: '' }] });
    const branch = await fetchWysiwygBranch(ctx());
    expect(branch).to.equal('main');
  });
});
