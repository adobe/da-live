import { expect } from '@esm-bundle/chai';

// Setup Nx
const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const SINGLE_SHEET = {
  data: [
    {
      key: 'editor.path',
      value: '/aabsites/citisignal-ue=https://experience.adobe.com/#/@sitesinternal/',
    },
  ],
};

const MULTI_SHEET = { data: SINGLE_SHEET };

const { default: ueUrlHelper } = await import('../../../../../../blocks/edit/da-content/helpers/index.js');

describe('UE URLs', () => {
  it('Supports single sheet configs', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => (SINGLE_SHEET) });
    const orgFetch = window.fetch;

    try {
      window.fetch = mockFetch;
      const ueUrl = await ueUrlHelper('aabsites', 'gov', 'https://main--gov--geometrixx.aem.page/query-builder');
      expect(ueUrl).to.equal('https://experience.adobe.com/#/@sitesinternal/aem/editor/canvas/main--gov--geometrixx.ue.da.page/query-builder');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Supports multisheet configs', async () => {
    const mockFetch = async () => ({ ok: true, json: async () => (MULTI_SHEET) });
    const orgFetch = window.fetch;

    try {
      window.fetch = mockFetch;
      const ueUrl = await ueUrlHelper('aabsites', 'gov', 'https://main--gov--geometrixx.aem.page/query-builder');
      expect(ueUrl).to.equal('https://experience.adobe.com/#/@sitesinternal/aem/editor/canvas/main--gov--geometrixx.ue.da.page/query-builder');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Successfully dies gracefully', async () => {
    const mockFetch = async () => ({ ok: false });
    const orgFetch = window.fetch;

    try {
      window.fetch = mockFetch;
      const ueUrl = await ueUrlHelper('aabsites', 'gov', 'https://main--gov--geometrixx.aem.page/query-builder');
      expect(ueUrl).to.be.null;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Returns null when no editor.path or quick-edit config exists', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = async () => ({ ok: true, json: async () => ({ data: [{ key: 'other', value: 'x' }] }) });
      const url = await ueUrlHelper('org', 'repo', 'https://main--repo--org.aem.page/page');
      expect(url).to.equal(null);
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Builds a quick-edit URL when quick-edit config matches the repo', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ data: [{ key: 'quick-edit', value: 'repo' }] }),
      });
      const url = await ueUrlHelper('org', 'repo', 'https://main--repo--org.aem.live/page');
      expect(url).to.equal('https://main--repo--org.aem.page/page?quick-edit=on');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Strips trailing /index when building the quick-edit URL', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = async () => ({
        ok: true,
        json: async () => ({ data: [{ key: 'quick-edit', value: 'repo' }] }),
      });
      const url = await ueUrlHelper('org', 'repo', 'https://main--repo--org.aem.live/folder/index');
      expect(url).to.equal('https://main--repo--org.aem.page/folder/?quick-edit=on');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('getUeUrl returns null when ueConf has no value', async () => {
    const { getUeUrl } = await import('../../../../../../blocks/edit/da-content/helpers/index.js');
    const result = await getUeUrl({}, 'https://main--repo--org.aem.page/page');
    expect(result).to.equal(null);
  });

  it('getUeUrl returns null when no @org appears in the editor.path value', async () => {
    const { getUeUrl } = await import('../../../../../../blocks/edit/da-content/helpers/index.js');
    const result = await getUeUrl({ value: '/no-at-org' }, 'https://main--repo--org.aem.page/page');
    expect(result).to.equal(null);
  });
});
