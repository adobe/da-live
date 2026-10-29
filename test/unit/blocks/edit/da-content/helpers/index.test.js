import { expect } from '@esm-bundle/chai';
import config, { createConfig } from '../../../../../../scripts/config.js';

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

// getNx2Api's config.get pings isHlx6 first (HLX_ADMIN/ping/{org}/{site}); answer that with a
// real Response (so its headers.get() call is safe) and defer everything else to `respond`.
function pingSafe(respond) {
  return async (url, opts) => {
    if (String(url).includes('/ping/')) return new Response('', { status: 200 });
    return respond(url, opts);
  };
}

describe('UE URLs', () => {
  it('uses the editor site context for static custom UE and quick-edit domains', async () => {
    const original = { ...config };
    const originalFetch = window.fetch;
    try {
      Object.assign(config, createConfig({
        aem: {
          liveUrl: 'https://live.customer.example',
          previewUrl: 'https://preview.customer.example',
          ueUrl: 'https://ue.customer.example',
        },
      }));
      const input = 'https://live.customer.example/folder/index?foo=bar#part';
      window.fetch = pingSafe(async () => ({ ok: true, json: async () => ({ data: [{ key: 'editor.path', value: '/@customer/' }] }) }));
      expect(await ueUrlHelper('static-ue', 'site', input))
        .to.equal('https://experience.adobe.com/#/@customer/aem/editor/canvas/ue.customer.example/folder/index?foo=bar#part');
      window.fetch = pingSafe(async () => ({ ok: true, json: async () => ({ data: [{ key: 'quick-edit', value: 'site' }] }) }));
      expect(await ueUrlHelper('static-qe', 'site', input))
        .to.equal('https://preview.customer.example/folder/?foo=bar&quick-edit=on#part');
    } finally {
      Object.assign(config, original);
      window.fetch = originalFetch;
    }
  });

  it('uses custom UE and quick-edit routes without dropping document query or fragment', async () => {
    const original = { ...config };
    try {
      Object.assign(config, createConfig({
        aem: {
          liveUrl: 'https://publish.example/sites/{org}/{site}/{branch}',
          previewUrl: 'https://preview.example/render/{org}/{site}/{branch}',
          ueUrl: 'https://ue.example/edit/{org}/{site}/{branch}',
        },
      }));
      const { getUeUrl, getQeUrl } = await import('../../../../../../blocks/edit/da-content/helpers/index.js');
      const input = 'https://publish.example/sites/org/site/main/folder/page?foo=bar#part';
      expect(await getUeUrl({ value: '/@customer/' }, input))
        .to.equal('https://experience.adobe.com/#/@customer/aem/editor/canvas/ue.example/edit/org/site/main/folder/page?foo=bar#part');
      expect(await getQeUrl(input))
        .to.equal('https://preview.example/render/org/site/main/folder/page?foo=bar&quick-edit=on#part');
    } finally {
      Object.assign(config, original);
    }
  });

  it('Supports single sheet configs', async () => {
    const mockFetch = pingSafe(async () => ({ ok: true, json: async () => (SINGLE_SHEET) }));
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
    const mockFetch = pingSafe(async () => ({ ok: true, json: async () => (MULTI_SHEET) }));
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
    const mockFetch = pingSafe(async () => ({ ok: false }));
    const orgFetch = window.fetch;

    try {
      window.fetch = mockFetch;
      const ueUrl = await ueUrlHelper('aabsites-gone', 'gov', 'https://main--gov--geometrixx.aem.page/query-builder');
      expect(ueUrl).to.be.null;
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Returns null when no editor.path or quick-edit config exists', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = pingSafe(async () => ({ ok: true, json: async () => ({ data: [{ key: 'other', value: 'x' }] }) }));
      const url = await ueUrlHelper('org', 'repo', 'https://main--repo--org.aem.page/page');
      expect(url).to.equal(null);
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Builds a quick-edit URL when quick-edit config matches the repo', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = pingSafe(async () => ({
        ok: true,
        json: async () => ({ data: [{ key: 'quick-edit', value: 'repo' }] }),
      }));
      const url = await ueUrlHelper('org-qe', 'repo', 'https://main--repo--org.aem.live/page');
      expect(url).to.equal('https://main--repo--org.aem.page/page?quick-edit=on');
    } finally {
      window.fetch = orgFetch;
    }
  });

  it('Strips trailing /index when building the quick-edit URL', async () => {
    const orgFetch = window.fetch;
    try {
      window.fetch = pingSafe(async () => ({
        ok: true,
        json: async () => ({ data: [{ key: 'quick-edit', value: 'repo' }] }),
      }));
      const url = await ueUrlHelper('org-qe-strip', 'repo', 'https://main--repo--org.aem.live/folder/index');
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
