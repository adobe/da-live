import { expect } from '@esm-bundle/chai';

// Setup Nx
const { setNx } = await import('../../../../../../scripts/utils.js');
setNx('/bheuaark/', { hostname: 'localhost' });

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
});
