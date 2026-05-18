import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const {
  andMatch,
  getMetadata,
  getPreviewUrl,
  getAemUrlVars,
  aemToContentUrl,
  daFetchLibrary,
  getItemDetails,
  getItems,
  getPreviewStatus,
  OOTB_PLUGINS,
  ref,
} = await import('../../../../../blocks/edit/da-library/helpers/helpers.js');

describe('da-library/helpers exports', () => {
  describe('OOTB_PLUGINS', () => {
    it('Lists the OOTB plugin names in the expected order', () => {
      expect(OOTB_PLUGINS).to.deep.equal(['blocks', 'templates', 'icons', 'placeholders']);
    });
  });

  describe('ref', () => {
    it('Defaults to "main" when no ref query param is set', () => {
      expect(ref).to.equal('main');
    });
  });

  describe('andMatch', () => {
    it('Returns true when every space-separated term is in the target', () => {
      expect(andMatch('hero big', 'a big hero block')).to.be.true;
    });

    it('Returns false when any term is missing', () => {
      expect(andMatch('hero compact', 'a big hero block')).to.be.false;
    });

    it('Treats single-term input as substring search', () => {
      expect(andMatch('hero', 'big hero block')).to.be.true;
      expect(andMatch('zzz', 'big hero block')).to.be.false;
    });
  });

  describe('getMetadata', () => {
    it('Builds a key→{content,text} map from a metadata table', () => {
      const meta = document.createElement('div');
      meta.innerHTML = `
        <div><div>Title</div><div>Hi There</div></div>
        <div><div>Description</div><div>Some text</div></div>
      `;
      const result = getMetadata(meta);
      expect(Object.keys(result)).to.deep.equal(['title', 'description']);
      expect(result.title.text).to.equal('hi there');
      expect(result.description.text).to.equal('some text');
      expect(result.title.content).to.exist;
    });

    it('Skips rows without children', () => {
      const meta = document.createElement('div');
      meta.appendChild(document.createTextNode('plain text'));
      const child = document.createElement('div');
      child.innerHTML = '<div>x</div><div>y</div>';
      meta.appendChild(child);
      const result = getMetadata(meta);
      expect(result.x.text).to.equal('y');
    });
  });

  describe('getPreviewUrl', () => {
    it('Returns the URL unchanged when origin contains "--"', () => {
      const url = 'https://main--repo--org.aem.live/page';
      expect(getPreviewUrl(url)).to.equal(url);
    });

    it('Rewrites a content.da.live URL to aem.page', () => {
      expect(getPreviewUrl('https://content.da.live/org/site/folder/page'))
        .to.equal('https://main--site--org.aem.page/folder/page');
    });

    it('Rewrites an admin.da.live URL to aem.page', () => {
      expect(getPreviewUrl('https://admin.da.live/source/org/site/folder/page'))
        .to.equal('https://main--site--org.aem.page/folder/page');
    });

    it('Returns false for an unrelated origin', () => {
      expect(getPreviewUrl('https://example.com/page')).to.be.false;
    });

    it('Returns false for a non-URL string', () => {
      expect(getPreviewUrl('not a url')).to.be.false;
    });
  });

  describe('getAemUrlVars', () => {
    it('Extracts org, site, branch from an aem.live hostname', () => {
      expect(getAemUrlVars('https://main--repo--org.aem.live/page'))
        .to.deep.equal(['org', 'repo', 'main']);
    });

    it('Extracts org, site from a content.da.live URL with main branch', () => {
      expect(getAemUrlVars('https://content.da.live/org/site/folder/page'))
        .to.deep.equal(['org', 'site', 'main']);
    });

    it('Extracts org, site from an admin.da.live URL with main branch', () => {
      expect(getAemUrlVars('https://admin.da.live/source/org/site/page'))
        .to.deep.equal(['org', 'site', 'main']);
    });

    it('Returns false for an unrelated origin', () => {
      expect(getAemUrlVars('https://example.com/foo')).to.be.false;
    });

    it('Returns false for a non-URL string', () => {
      expect(getAemUrlVars('not a url')).to.be.false;
    });
  });

  describe('aemToContentUrl', () => {
    it('Rewrites aem.page preview URLs to content.da.live', () => {
      expect(aemToContentUrl('https://main--site--org.aem.page/blocks/cards'))
        .to.equal('https://content.da.live/org/site/blocks/cards');
    });

    it('Rewrites aem.live, hlx.page and hlx.live URLs the same way', () => {
      expect(aemToContentUrl('https://main--site--org.aem.live/blocks/cards'))
        .to.equal('https://content.da.live/org/site/blocks/cards');
      expect(aemToContentUrl('https://main--site--org.hlx.page/blocks/cards'))
        .to.equal('https://content.da.live/org/site/blocks/cards');
      expect(aemToContentUrl('https://feature--site--org.hlx.live/deep/nested/path'))
        .to.equal('https://content.da.live/org/site/deep/nested/path');
    });

    it('Leaves content.da.live and admin.da.live URLs unchanged', () => {
      const con = 'https://content.da.live/org/site/blocks/cards';
      expect(aemToContentUrl(con)).to.equal(con);
      const admin = 'https://admin.da.live/source/org/site/blocks/cards';
      expect(aemToContentUrl(admin)).to.equal(admin);
    });

    it('Leaves unrelated origins, relative paths and non-URL strings unchanged', () => {
      expect(aemToContentUrl('https://example.com/blocks/cards')).to.equal('https://example.com/blocks/cards');
      expect(aemToContentUrl('/blocks/cards.json')).to.equal('/blocks/cards.json');
      expect(aemToContentUrl('not a url')).to.equal('not a url');
    });
  });

  describe('getItemDetails', () => {
    it('Parses an aem.live URL', () => {
      const result = getItemDetails({ path: 'https://main--repo--org.aem.live/folder/page' });
      expect(result).to.deep.equal({ org: 'org', site: 'repo', pathname: '/folder/page' });
    });

    it('Parses a content.da.live URL', () => {
      const result = getItemDetails({ path: 'https://content.da.live/org/site/folder/page' });
      expect(result).to.deep.equal({ org: 'org', site: 'site', pathname: '/folder/page' });
    });

    it('Falls back to admin.da.live shape', () => {
      const result = getItemDetails({ path: 'https://admin.da.live/source/org/site/folder/page' });
      expect(result).to.deep.equal({ org: 'org', site: 'site', pathname: '/folder/page' });
    });

    it('Reads value when no path is provided (templates path)', () => {
      const result = getItemDetails({ value: 'https://main--repo--org.aem.live/page' });
      expect(result.org).to.equal('org');
    });
  });

  describe('daFetchLibrary', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Skips the rewrite-and-retry when the URL is not an AEM host', async () => {
      const calls = [];
      window.fetch = (url) => {
        calls.push(url);
        return Promise.resolve(new Response('nope', { status: 404 }));
      };
      const { resp, usedFallback } = await daFetchLibrary('https://example.com/page');
      expect(resp.status).to.equal(404);
      expect(usedFallback).to.be.false;
      expect(calls).to.deep.equal(['https://example.com/page']);
    });

    it('Returns the rewritten response when it succeeds (no fallback)', async () => {
      const calls = [];
      window.fetch = (url) => {
        calls.push(url);
        return Promise.resolve(new Response('ok', { status: 200 }));
      };
      const { resp, usedFallback } = await daFetchLibrary('https://main--repo--org.aem.live/page');
      expect(resp.status).to.equal(200);
      expect(usedFallback).to.be.false;
      expect(calls).to.deep.equal(['https://content.da.live/org/repo/page']);
    });

    it('Falls back to the original URL on 404 from the rewrite', async () => {
      const calls = [];
      window.fetch = (url) => {
        calls.push(url);
        const status = url.startsWith('https://content.da.live/') ? 404 : 200;
        return Promise.resolve(new Response('', { status }));
      };
      const { resp, usedFallback } = await daFetchLibrary('https://main--repo--org.aem.live/page');
      expect(resp.status).to.equal(200);
      expect(usedFallback).to.be.true;
      expect(calls).to.deep.equal([
        'https://content.da.live/org/repo/page',
        'https://main--repo--org.aem.live/page',
      ]);
    });

    it('Does not fall back on non-404 failures from the rewrite', async () => {
      const calls = [];
      window.fetch = (url) => {
        calls.push(url);
        return Promise.resolve(new Response('boom', { status: 500 }));
      };
      const { resp, usedFallback } = await daFetchLibrary('https://main--repo--org.aem.live/page');
      expect(resp.status).to.equal(500);
      expect(usedFallback).to.be.false;
      expect(calls).to.deep.equal(['https://content.da.live/org/repo/page']);
    });

    it('With skipRewrite, goes straight to the original URL and reports usedFallback', async () => {
      const calls = [];
      window.fetch = (url) => {
        calls.push(url);
        return Promise.resolve(new Response('ok', { status: 200 }));
      };
      const { resp, usedFallback } = await daFetchLibrary(
        'https://main--repo--org.aem.live/page',
        { skipRewrite: true },
      );
      expect(resp.status).to.equal(200);
      expect(usedFallback).to.be.true;
      expect(calls).to.deep.equal(['https://main--repo--org.aem.live/page']);
    });

    it('Forwards opts to daFetch on both attempts', async () => {
      const optsSeen = [];
      window.fetch = (url, opts) => {
        optsSeen.push(opts);
        return Promise.resolve(new Response('', { status: 404 }));
      };
      await daFetchLibrary('https://main--repo--org.aem.live/page');
      expect(optsSeen.length).to.equal(2);
      expect(optsSeen[0]?.noRedirect).to.be.true;
      expect(optsSeen[1]?.noRedirect).to.be.true;
    });
  });

  describe('getItems', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Pushes raw arrays from non-data responses', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify([{ k: 'a' }, { k: 'b' }]),
        { status: 200 },
      ));
      const result = await getItems(['/source.json']);
      expect(result.length).to.equal(2);
    });

    it('Handles multi-sheet responses by reading the first sheet', async () => {
      const savedView = window.view;
      window.view = { state: { schema: { text: (s) => ({ text: s }) } } };
      try {
        window.fetch = () => Promise.resolve(new Response(
          JSON.stringify({
            ':type': 'multi-sheet',
            ':names': ['default'],
            default: { data: [{ key: 'one' }, { key: 'two' }] },
          }),
          { status: 200 },
        ));
        const result = await getItems(['/source.json']);
        expect(result.map((i) => i.key)).to.deep.equal(['one', 'two']);
      } finally {
        window.view = savedView;
      }
    });

    it('Skips a source whose fetch fails (catch branch)', async () => {
      window.fetch = () => Promise.reject(new Error('boom'));
      const result = await getItems(['/source.json']);
      expect(result).to.deep.equal([]);
    });

    it('Concatenates items across multiple sources', async () => {
      const responses = {
        '/a.json': [{ k: 'one' }],
        '/b.json': [{ k: 'two' }],
      };
      window.fetch = (url) => Promise.resolve(
        new Response(JSON.stringify(responses[url]), { status: 200 }),
      );
      const result = await getItems(['/a.json', '/b.json']);
      expect(result.map((i) => i.k)).to.deep.equal(['one', 'two']);
    });
  });

  describe('getPreviewStatus', () => {
    let savedFetch;
    beforeEach(() => { savedFetch = window.fetch; });
    afterEach(() => { window.fetch = savedFetch; });

    it('Returns true when AEM preview status is 200', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ preview: { status: 200 } }),
        { status: 200 },
      ));
      const result = await getPreviewStatus({ org: 'o', site: 's', pathname: '/p' });
      expect(result).to.be.true;
    });

    it('Returns false when AEM preview status is not 200', async () => {
      window.fetch = () => Promise.resolve(new Response(
        JSON.stringify({ preview: { status: 404 } }),
        { status: 200 },
      ));
      const result = await getPreviewStatus({ org: 'o', site: 's', pathname: '/p' });
      expect(result).to.be.false;
    });

    it('Returns null when the AEM admin call fails', async () => {
      window.fetch = () => Promise.resolve(new Response('{}', { status: 500 }));
      const result = await getPreviewStatus({ org: 'o', site: 's', pathname: '/p' });
      expect(result).to.equal(null);
    });
  });
});

describe('da-library/helpers/index getBlocks', () => {
  let savedFetch;
  let getBlocks;
  let urlCache;

  before(async () => {
    const mod = await import('../../../../../blocks/edit/da-library/helpers/index.js');
    getBlocks = mod.getBlocks;
    urlCache = mod.urlCache;
  });

  beforeEach(() => {
    savedFetch = window.fetch;
    urlCache.clear();
  });
  afterEach(() => { window.fetch = savedFetch; });

  it('Returns an empty array when source data has no items', async () => {
    window.fetch = () => Promise.resolve(new Response(
      JSON.stringify({ ':type': 'sheet', data: [] }),
      { status: 200 },
    ));
    const result = await getBlocks(['/blocks.json']);
    expect(result).to.deep.equal([]);
  });

  it('Returns an empty array when source fetch fails', async () => {
    window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
    const result = await getBlocks(['/blocks.json']);
    expect(result).to.deep.equal([]);
  });

  it('Rewrites an AEM source URL to content.da.live before fetching', async () => {
    let captured;
    window.fetch = (url) => {
      captured = url;
      return Promise.resolve(new Response(
        JSON.stringify({ ':type': 'sheet', data: [] }),
        { status: 200 },
      ));
    };
    await getBlocks(['https://main--repo--org.aem.page/blocks.json']);
    expect(captured).to.equal('https://content.da.live/org/repo/blocks.json');
  });

  it('Falls back to the original AEM URL when content.da.live 404s', async () => {
    const calls = [];
    window.fetch = (url) => {
      calls.push(url);
      if (url.startsWith('https://content.da.live/')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(new Response(
        JSON.stringify({ ':type': 'sheet', data: [] }),
        { status: 200 },
      ));
    };
    await getBlocks(['https://main--repo--org.aem.page/blocks.json']);
    expect(calls).to.deep.equal([
      'https://content.da.live/org/repo/blocks.json',
      'https://main--repo--org.aem.page/blocks.json',
    ]);
  });

  it('Does not fall back on non-404 failures', async () => {
    const calls = [];
    window.fetch = (url) => {
      calls.push(url);
      return Promise.resolve(new Response('boom', { status: 500 }));
    };
    await getBlocks(['https://main--repo--org.aem.page/blocks.json']);
    expect(calls).to.deep.equal(['https://content.da.live/org/repo/blocks.json']);
  });

  it('When the source falls back, variants skip the content.da.live attempt', async () => {
    const calls = [];
    window.fetch = (url) => {
      calls.push(url);
      if (url === 'https://content.da.live/org/repo/blocks.json') {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      if (url === 'https://main--repo--org.aem.page/blocks.json') {
        return Promise.resolve(new Response(
          JSON.stringify({
            ':type': 'sheet',
            data: [{ name: 'hero', path: 'https://main--repo--org.aem.page/blocks/hero' }],
          }),
          { status: 200 },
        ));
      }
      return Promise.resolve(new Response('', { status: 500 }));
    };
    const result = await getBlocks(['https://main--repo--org.aem.page/blocks.json']);
    await Promise.all(result.map((b) => b.loadVariants));
    expect(calls).to.deep.equal([
      'https://content.da.live/org/repo/blocks.json',
      'https://main--repo--org.aem.page/blocks.json',
      'https://main--repo--org.aem.page/blocks/hero.plain.html',
    ]);
  });

  it('Caches fetched source data so subsequent calls do not refetch', async () => {
    let calls = 0;
    window.fetch = () => {
      calls += 1;
      return Promise.resolve(new Response(
        JSON.stringify({ ':type': 'sheet', data: [] }),
        { status: 200 },
      ));
    };
    await getBlocks(['/cached-blocks.json']);
    await getBlocks(['/cached-blocks.json']);
    expect(calls).to.equal(1);
  });
});

describe('da-library/helpers/index getBlockVariants', () => {
  let savedFetch;
  let getBlockVariants;

  before(async () => {
    const mod = await import('../../../../../blocks/edit/da-library/helpers/index.js');
    getBlockVariants = mod.getBlockVariants;
  });

  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('Returns an empty array when the doc fetch fails', async () => {
    window.fetch = () => Promise.resolve(new Response('boom', { status: 500 }));
    const result = await getBlockVariants('/relative-path');
    expect(result).to.deep.equal([]);
  });

  it('Treats a non-AEM URL as relative (still fetches without .plain.html)', async () => {
    let captured;
    window.fetch = (url) => {
      captured = url;
      return Promise.resolve(new Response('boom', { status: 500 }));
    };
    await getBlockVariants('https://example.com/page');
    expect(captured).to.equal('https://example.com/page');
  });

  it('Tries content.da.live first, then falls back to original AEM URL with .plain.html on 404', async () => {
    const calls = [];
    window.fetch = (url) => {
      calls.push(url);
      const status = url.startsWith('https://content.da.live/') ? 404 : 500;
      return Promise.resolve(new Response('', { status }));
    };
    await getBlockVariants('https://main--repo--org.aem.live/page');
    expect(calls[0]).to.equal('https://content.da.live/org/repo/page');
    expect(calls[1]).to.equal('https://main--repo--org.aem.live/page.plain.html');
  });

  it('Does not fall back when content.da.live returns non-404', async () => {
    const calls = [];
    window.fetch = (url) => {
      calls.push(url);
      return Promise.resolve(new Response('boom', { status: 500 }));
    };
    const result = await getBlockVariants('https://main--repo--org.aem.live/page');
    expect(result).to.deep.equal([]);
    expect(calls).to.deep.equal(['https://content.da.live/org/repo/page']);
  });
});
