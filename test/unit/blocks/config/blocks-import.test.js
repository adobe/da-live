import { expect } from '@esm-bundle/chai';

const { setNx } = await import('../../../../scripts/utils.js');
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { parseRepo, createGitHub, cssVariants, jsShape, analyzeBlock } = await import('../../../../blocks/config/blocks-import/github.js');
const {
  findBlocks, blockExamples, blockDoc, displayName, mergeBlockRows, isBlockName,
} = await import('../../../../blocks/config/blocks-import/blocks.js');
const { docFolder, parsePages, readPages, runImport } = await import('../../../../blocks/config/blocks-import/dialog.js');

const json = (value, init) => new Response(JSON.stringify(value), init);

const PAGE = `<body><header></header><main>
  <div><div class="hero dark"><div><div><h1>Hi</h1></div></div></div><p>Text</p></div>
  <div><div class="cards"><div><div>A</div><div>B</div></div></div>
    <div class="metadata"><div><div>title</div><div>x</div></div></div></div>
</main><footer></footer></body>`;

describe('blocks import: github', () => {
  let savedFetch;
  beforeEach(() => { savedFetch = window.fetch; });
  afterEach(() => { window.fetch = savedFetch; });

  it('parses repository URLs and owner/repo', () => {
    const expected = { owner: 'adobe', repo: 'aem-boilerplate' };
    expect(parseRepo('https://github.com/adobe/aem-boilerplate')).to.deep.equal(expected);
    expect(parseRepo('https://github.com/adobe/aem-boilerplate.git')).to.deep.equal(expected);
    expect(parseRepo('git@github.com:adobe/aem-boilerplate.git')).to.deep.equal(expected);
    expect(parseRepo(' adobe/aem-boilerplate ')).to.deep.equal(expected);
    expect(parseRepo('https://example.com/adobe/x')).to.equal(null);
    expect(parseRepo('')).to.equal(null);
  });

  it('reads variants from CSS and the row/column shape from JS', () => {
    expect(cssVariants('.cards.wide {} .cards.dark .x {} .cards.wide a {} .cards.Big_One {}', 'cards')).to.deep.equal(['wide', 'dark']);
    expect(jsShape(null)).to.deep.equal({ rows: 1, columns: 1 });
    expect(jsShape('[...block.children].forEach((row) => { row.children[2]; })')).to.deep.equal({ rows: 2, columns: 3 });
    expect(jsShape('[...row.children].forEach(() => {})')).to.deep.equal({ rows: 1, columns: 2 });
  });

  it('finds the folders inside blocks/ and sends the token', async () => {
    const calls = [];
    window.fetch = async (url, opts) => {
      calls.push({ url: String(url), auth: opts.headers.Authorization });
      return json({
        tree: [
          { path: 'blocks', type: 'tree' },
          { path: 'blocks/hero', type: 'tree' },
          { path: 'blocks/hero/hero.js', type: 'blob' },
          { path: 'blocks/cards', type: 'tree' },
          { path: 'blocks/cards/img', type: 'tree' },
          { path: 'blocks/Bad"Name', type: 'tree' },
        ],
      });
    };
    const github = createGitHub({ owner: 'o', repo: 'r', token: 't' });
    expect(await github.discoverBlocks()).to.deep.equal([
      { name: 'cards', path: 'blocks/cards' },
      { name: 'hero', path: 'blocks/hero' },
    ]);
    expect(calls[0].url).to.equal('https://api.github.com/repos/o/r/git/trees/main?recursive=1');
    expect(calls[0].auth).to.equal('Bearer t');
  });

  it('reports why a repository cannot be read', async () => {
    const access = async (resp, token = '') => {
      window.fetch = async () => resp;
      return createGitHub({ owner: 'o', repo: 'r', token }).checkAccess();
    };
    expect(await access(json({}))).to.equal(null);
    expect(await access(new Response('', { status: 404 }))).to.equal('needs-token');
    expect(await access(new Response('', { status: 404 }), 't')).to.equal('not-found');
    const limited = new Response('', { status: 403, headers: { 'X-RateLimit-Remaining': '0' } });
    expect(await access(limited)).to.equal('rate-limit');
  });

  it('analyzes a block from its code files', async () => {
    window.fetch = async (url) => {
      const content = String(url).includes('.css') ? '.hero.dark {}' : 'row.children[1]';
      return json({ content: btoa(content) });
    };
    const github = createGitHub({ owner: 'o', repo: 'r' });
    expect(await analyzeBlock(github, { name: 'hero', path: 'blocks/hero' }))
      .to.deep.equal({ rows: 1, columns: 2, variants: ['dark'] });
  });
});

describe('blocks import: content', () => {
  it('finds blocks and variants in a page, skipping metadata', () => {
    const found = findBlocks(PAGE);
    expect([...found.keys()]).to.deep.equal(['hero', 'cards']);
    expect([...found.get('hero')]).to.deep.equal(['dark']);
  });

  it('skips class names that are not block names, so markup cannot reach a generated doc', () => {
    const page = `<body><main><div>
      <div class='x"><img src=x onerror=alert(1)>'><div><div>A</div></div></div>
      <div class="Cards"><div><div>B</div></div></div>
      <div class='tabs evil"x dark'><div><div>C</div></div></div>
    </div></main></body>`;
    const found = findBlocks(page);
    expect([...found.keys()]).to.deep.equal(['tabs']);
    expect([...found.get('tabs')]).to.deep.equal(['dark']);
    expect(isBlockName('hero-banner')).to.equal(true);
    expect(['Hero', 'a_b', '-a', 'a--b', 'a"b'].some(isBlockName)).to.equal(false);
  });

  it('extracts examples of a block', () => {
    const [example] = blockExamples(PAGE, 'hero');
    expect(example.variant).to.equal('dark');
    expect(example.html).to.include('<h1>Hi</h1>');
    expect(blockExamples(PAGE, 'missing')).to.deep.equal([]);
  });

  it('builds a doc from examples, with one section per variant', () => {
    const doc = blockDoc('hero', { examples: blockExamples(PAGE, 'hero') });
    expect(doc).to.include('<div class="hero dark"><div><div><h1>Hi</h1>');
    expect(doc.startsWith('<body><header></header><main>')).to.equal(true);
  });

  it('builds a placeholder doc from the code analysis', () => {
    const doc = blockDoc('cards', { analysis: { rows: 2, columns: 2, variants: ['wide'] } });
    expect(doc).to.include('<div class="cards wide">');
    expect(doc.match(/Column 2 content/g)).to.have.length(2);
    expect(blockDoc('x')).to.include('<div class="x"><div><div><p>Column 1 content</p>');
  });

  it('names blocks and merges them into a list', () => {
    expect(displayName('hero-banner')).to.equal('Hero Banner');
    const rows = [{ name: 'Hero', path: '/old', note: 'keep' }, { name: 'Cards', path: '/c' }];
    expect(mergeBlockRows(rows, [{ name: 'Hero', path: '/new' }, { name: 'Tabs', path: '/t' }])).to.deep.equal([
      { name: 'Hero', path: '/new', note: 'keep' },
      { name: 'Cards', path: '/c' },
      { name: 'Tabs', path: '/t' },
    ]);
    expect(rows[0].path).to.equal('/old');
  });
});

describe('blocks import: run', () => {
  let savedFetch;
  let saves;
  beforeEach(() => {
    savedFetch = window.fetch;
    saves = [];
    const list = {
      blocks: { data: [{ name: 'Hero', path: 'https://content.da.live/o/s/docs/library/blocks/hero' }] },
      options: { data: [] },
      ':names': ['blocks', 'options'],
      ':type': 'multi-sheet',
    };
    window.fetch = async (url, opts = {}) => {
      const href = String(url);
      if (href.includes('/ping/')) return new Response('', { status: 200 });
      const path = href.split('/source/o/s')[1]?.split('?')[0];
      if (opts.method === 'POST') {
        saves.push({ path, body: await opts.body.get('data').text() });
        return new Response('', { status: path.endsWith('broken.html') ? 500 : 200 });
      }
      if (path === '/index.html') return new Response(PAGE);
      if (path === '/docs/library/blocks.json') return json(list);
      return new Response('', { status: 404 });
    };
  });
  afterEach(() => { window.fetch = savedFetch; });

  it('derives the doc folder and page lists', () => {
    expect(docFolder('/docs/library/blocks.json')).to.equal('/docs/library/blocks/');
    expect(parsePages('/a\n /b , /a,')).to.deep.equal(['/a', '/b']);
  });

  it('reads pages, skipping missing ones', async () => {
    const pages = await readPages('o', 's', ['/index', '/missing']);
    expect([...pages.keys()]).to.deep.equal(['/index']);
  });

  it('uploads a doc per block and adds them to the list, keeping its other sheets', async () => {
    const htmls = await readPages('o', 's', ['/index']);
    const result = await runImport({ org: 'o', site: 's', listPath: '/docs/library/blocks.json', blocks: [{ name: 'hero' }, { name: 'cards' }, { name: 'broken' }], htmls });
    expect(result).to.deep.equal({ imported: ['Hero', 'Cards'], failed: ['broken'], listStatus: null });
    expect(saves.map((s) => s.path)).to.deep.equal([
      '/docs/library/blocks/hero.html', '/docs/library/blocks/cards.html', '/docs/library/blocks/broken.html', '/docs/library/blocks.json',
    ]);
    expect(saves[0].body).to.include('<h1>Hi</h1>');
    const list = JSON.parse(saves[3].body);
    expect(list.blocks.data).to.deep.equal([
      { name: 'Hero', path: 'https://content.da.live/o/s/docs/library/blocks/hero' },
      { name: 'Cards', path: 'https://content.da.live/o/s/docs/library/blocks/cards' },
    ]);
    expect(list.options).to.deep.equal({ data: [] });
  });

  it('does not touch the list when nothing was created', async () => {
    const result = await runImport({ org: 'o', site: 's', listPath: '/docs/library/blocks.json', blocks: [{ name: 'broken' }] });
    expect(result).to.deep.equal({ imported: [], failed: ['broken'], listStatus: null });
    expect(saves).to.have.length(1);
  });
});

describe('blocks import: dialog with GitHub', () => {
  let savedFetch;
  let el;
  let saves;
  const b64 = (text) => btoa(text);

  beforeEach(() => {
    savedFetch = window.fetch;
    saves = [];
    el = document.createElement('da-config-blocks-import');
    Object.assign(el, { org: 'o', site: 's', listPath: '/docs/library/blocks.json', existing: [] });
    document.body.append(el);
  });

  afterEach(() => {
    el.remove();
    window.fetch = savedFetch;
  });

  // GitHub answers `repoStatus` for the repo, a tree with cards/ and hero/, and code for cards.
  const mockGitHub = (repoStatus = 200) => {
    window.fetch = async (url, opts = {}) => {
      const href = String(url);
      if (href.includes('/ping/')) return new Response('', { status: 200 });
      if (href === 'https://api.github.com/repos/o/r') return new Response('{}', { status: repoStatus });
      if (href.includes('/git/trees/')) {
        return json({ tree: [{ path: 'blocks/cards', type: 'tree' }, { path: 'blocks/hero', type: 'tree' }] });
      }
      if (href.includes('/contents/blocks/cards/cards.css')) return json({ content: b64('.cards.wide {}') });
      if (href.includes('/contents/')) return new Response('', { status: 404 });
      if (opts.method === 'POST') {
        saves.push(href.split('/source/o/s')[1].split('?')[0]);
        return new Response('', { status: 200 });
      }
      return new Response('', { status: 404 });
    };
  };

  // Error text under each field, and the whole-import alert, as rendered.
  const shownErrors = async () => {
    await el.updateComplete;
    const under = [...el.querySelectorAll('.nx-form-field')]
      .filter((f) => f.querySelector('.nx-input-error-msg'))
      .map((f) => [f.querySelector('.config-field-label').textContent.replace(/[\s*]+/g, ''), f.querySelector('.nx-input-error-msg').textContent.trim()]);
    const alert = [...el.querySelectorAll('.config-alert p')].map((p) => p.textContent.trim());
    return { under, alert };
  };

  it('shows a bad repository under its field, and clears it on edit', async () => {
    el._form = { ...el._form, repo: 'not a repo' };
    await el._find();
    expect(el._step).to.equal('source');
    expect(await shownErrors()).to.deep.equal({ under: [['Repository', 'Enter a GitHub repository, e.g. https://github.com/org/repo.']], alert: [] });
    el._set('branch', 'dev');
    expect((await shownErrors()).under).to.have.length(1);
    el._set('repo', 'o/r');
    expect(await shownErrors()).to.deep.equal({ under: [], alert: [] });
  });

  it('reports a list that could not be updated instead of claiming success', async () => {
    const done = async (result) => {
      el._result = result;
      el._step = 'done';
      await el.updateComplete;
      return el.textContent.replace(/\s+/g, ' ');
    };
    const ok = await done({ imported: ['Hero'], failed: [], listStatus: null });
    expect(ok).to.include('and added them to /docs/library/blocks.json');
    const offline = await done({ imported: ['Hero'], failed: [], listStatus: 0 });
    expect([offline.includes('added them'), offline.includes('Could not update the blocks list (network error)')])
      .to.deep.equal([false, true]);
    const denied = await done({ imported: ['Hero'], failed: ['x'], listStatus: 403 });
    expect([denied.includes('(403)'), denied.includes('Could not create: x')]).to.deep.equal([true, true]);
  });

  it('asks for page paths of this site in pages mode', async () => {
    el._mode = 'pages';
    el._form = { ...el._form, pages: 'index' };
    await el._find();
    expect(el._step).to.equal('source');
    expect((await shownErrors()).under).to.deep.equal([['Pages', 'Enter page paths of this site, one per line, e.g. /index.']]);
  });

  it('explains when the repository cannot be read', async () => {
    mockGitHub(404);
    el._form = { ...el._form, repo: 'o/r' };
    await el._find();
    const { under, alert } = await shownErrors();
    expect([el._step, under, alert[0], alert.length]).to.deep.equal(['source', [], 'Could not find blocks', 2]);
  });

  // nx-dialog ignores Esc and outside clicks while `busy` is set.
  it('cannot be closed while it works', async () => {
    await el.updateComplete;
    const busy = () => el.querySelector('nx-dialog').hasAttribute('busy');
    expect(busy()).to.equal(false);
    el._step = 'busy';
    await el.updateComplete;
    expect(busy()).to.equal(true);
    el._step = 'source';
    await el.updateComplete;
    expect(busy()).to.equal(false);
  });

  it('finds the blocks, lets the user pick, and imports them from the code', async () => {
    mockGitHub();
    el._form = { ...el._form, repo: 'https://github.com/o/r', branch: ' ' };
    await el._find();
    expect([el._step, [...el._selected]]).to.deep.equal(['select', ['cards', 'hero']]);
    el._toggle('hero', false);
    el._toggle('hero', true);
    el._toggle('cards', false);
    await el._import();
    expect(el._step).to.equal('done');
    expect(saves).to.deep.equal(['/docs/library/blocks/hero.html', '/docs/library/blocks.json']);
    expect(el._result.imported).to.deep.equal(['Hero']);
  });
});
