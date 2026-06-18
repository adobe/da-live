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

  function ctx(extra = {}) {
    return { org: `org-wbr-${testIndex}`, site: `site-wbr-${testIndex}`, ...extra };
  }

  // Mocks the first sheet (json.data) — what getFirstSheet returns for a single-sheet config.
  function mockConfig(rows) {
    const body = JSON.stringify({ data: rows ?? [] });
    window.fetch = () => Promise.resolve(new Response(body, { status: 200 }));
  }

  it('returns main when org is missing', async () => {
    const branch = await fetchWysiwygBranch({ site: 'mysite' });
    expect(branch).to.equal('main');
  });

  it('returns main when site is missing', async () => {
    const branch = await fetchWysiwygBranch({ org: 'myorg' });
    expect(branch).to.equal('main');
  });

  it('returns the configured branch when path matches the prefix', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/org-wbr-3/site-wbr-3=feature' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-3/site-wbr-3/some/doc' }));
    expect(branch).to.equal('feature');
  });

  it('picks the longest prefix when multiple entries match', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: '/org-wbr-4/site-wbr-4=main' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-4/site-wbr-4/docs=develop' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-4/site-wbr-4/docs/page' }));
    expect(branch).to.equal('develop');
  });

  it('falls back to the shorter prefix when path is outside the longer one', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: '/org-wbr-5/site-wbr-5=main' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-5/site-wbr-5/docs=develop' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-5/site-wbr-5/blog/post' }));
    expect(branch).to.equal('main');
  });

  it('trims whitespace from the branch value', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/org-wbr-6/site-wbr-6=  staging  ' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-6/site-wbr-6/page' }));
    expect(branch).to.equal('staging');
  });

  it('returns main when no prefix matches the path', async () => {
    mockConfig([{ key: 'ew.wysiwygBranch', value: '/other-org/other-site=feature' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-7/site-wbr-7/page' }));
    expect(branch).to.equal('main');
  });

  it('returns main when ew.wysiwygBranch key is absent', async () => {
    mockConfig([{ key: 'other.key', value: 'true' }]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-8/site-wbr-8/page' }));
    expect(branch).to.equal('main');
  });

  it('returns main when the sheet is empty', async () => {
    mockConfig([]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-9/site-wbr-9/page' }));
    expect(branch).to.equal('main');
  });

  it('skips entries with no = separator', async () => {
    mockConfig([
      { key: 'ew.wysiwygBranch', value: 'malformed-no-equals' },
      { key: 'ew.wysiwygBranch', value: '/org-wbr-10/site-wbr-10=valid' },
    ]);
    const branch = await fetchWysiwygBranch(ctx({ path: 'org-wbr-10/site-wbr-10/page' }));
    expect(branch).to.equal('valid');
  });
});
