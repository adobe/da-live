import { expect } from '@esm-bundle/chai';
import sinon from 'sinon';
import { setNx } from '../../../../scripts/utils.js';
import { sanitizeImportedPage, sanitizeAuthorPage, serializeImportedPage, LIMITS, ImportedPageError } from '../../../../blocks/edit/imported-page/sanitize.js';
import { FRAME_CSS, WKND_FONT_STYLESHEET } from '../../../../blocks/edit/imported-page/styles.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });
const {
  routeDeps, hydrateImages, validatePageResponse, buildSrcdoc, mountImportedPage,
  unmountImportedPage, findImportedPageCaps, readBounded,
} = await import('../../../../blocks/edit/imported-page/imported-page.js');
const { default: getEditPath } = await import('../../../../blocks/shared/da-file-item/edit-path.js');

const SCOPE = { org: 'o', site: 's' };
const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAABCAIAAAB7QOjdAAAAD0lEQVR4nGP4z8DA8J8BAAf/Af8Bf4mnAAAAAElFTkSuQmCC';
const PNG_URL = `data:image/png;base64,${PNG}`;
const CARDS = `<main><section class="aem-component aem-component--container" aria-labelledby="c1">
<header class="aem-component__header"><p id="c1">AEM component · Container</p><code>wknd/components/container</code></header>
<div class="aem-component__children" aria-label="Child components">
<section class="aem-component aem-component--dynamic"><header class="aem-component__header"><p>x</p><code>wknd/components/carousel</code><p>Configuration only — behavior not executed</p></header>
<dl class="aem-component__properties" aria-label="Configuration"><dt>autoplay</dt><dd>false</dd></dl>
<div class="aem-component__content"><h1>Aloha</h1><table><tr><td>rich</td></tr></table>
<picture><source srcset="https://evil/x.png"><img src="https://evil/a.png" data-da-source-path="/o/s/img/a b.jpg" data-da-source-kind="image" alt="A" data-aem-crop="0,0,1,1" data-aem-image-crop="10%,20%,80%,90%"></picture></div>
<div class="aem-component__children"><section class="aem-component"><header class="aem-component__header"><code>leaf</code></header></section></div>
</section></div></section></main>`;

const clean = (html) => sanitizeImportedPage(html, SCOPE);
const out = (html) => serializeImportedPage(clean(html).root, new Map());

describe('imported page sanitizer', () => {
  it('styles only Franklin block headers light gray', () => {
    const markup = `<table class="aem-franklin-block"><thead><tr><th colspan="2">hero</th></tr></thead>
      <tbody><tr><td>text</td><td>value</td></tr></tbody></table>
      <table><thead><tr><th colspan="2">ordinary</th></tr></thead></table>
      <table class="aem-franklin-block untrusted"><tr><th>untrusted</th></tr></table>`;
    const { root } = clean(markup);
    const style = document.createElement('style');
    style.textContent = FRAME_CSS;
    document.head.append(style);
    document.body.append(root);
    try {
      const tables = root.querySelectorAll('table');
      expect(tables[0].className).to.equal('aem-franklin-block');
      expect(tables[2].className).to.equal('');
      expect(getComputedStyle(tables[0].querySelector('th')).backgroundColor).to.equal('rgb(243, 243, 243)');
      expect(getComputedStyle(tables[1].querySelector('th')).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
      expect(getComputedStyle(tables[0].querySelector('td')).backgroundColor).to.equal('rgba(0, 0, 0, 0)');
    } finally {
      root.remove();
      style.remove();
    }
  });

  it('keeps nested card vocabulary, tables inside cards and crop metadata', () => {
    const { root, images } = clean(CARDS);
    expect(root.querySelectorAll('section.aem-component').length).to.equal(3);
    expect(root.querySelector('section.aem-component--container > .aem-component__children > section.aem-component--dynamic')).to.exist;
    expect(root.querySelector('.aem-component__children .aem-component__children section')).to.exist;
    expect(root.querySelector('dl.aem-component__properties dt').textContent).to.equal('autoplay');
    expect(root.querySelector('.aem-component__content table')).to.exist;
    expect(root.querySelector('img').getAttribute('data-aem-crop')).to.equal('0,0,1,1');
    expect(root.querySelector('img').getAttribute('data-aem-image-crop')).to.equal('10%,20%,80%,90%');
    expect(root.querySelector('[aria-labelledby="c1"]')).to.exist;
    expect(images).to.deep.equal([{ path: '/o/s/img/a b.jpg', id: 'img-0' }]);
  });

  it('keeps component disclosures closed initially and toggles only their configuration', () => {
    const { root } = clean(`<section class="aem-component aem-component--dynamic" aria-labelledby="c1">
      <details open><summary class="aem-component__header" id="c1" onclick="evil()"><code>wknd/components/list</code></summary>
      <dl class="aem-component__properties"><dt>maxItems</dt><dd>4</dd></dl></details>
      <div class="aem-component__content"><p>Visible content</p></div>
      <div class="aem-component__children"><p>Visible child</p></div></section>`);
    document.body.append(root);
    try {
      const details = root.querySelector('details');
      const summary = details.querySelector('summary.aem-component__header');
      const properties = details.querySelector('dl');
      const child = root.querySelector('.aem-component__children');
      expect(details.open).to.equal(false);
      expect(summary.textContent).to.equal('wknd/components/list');
      expect(summary.hasAttribute('onclick')).to.equal(false);
      expect(properties.checkVisibility()).to.equal(false);
      expect(child.checkVisibility()).to.equal(true);
      summary.click();
      expect(details.open).to.equal(true);
      expect(properties.checkVisibility()).to.equal(true);
      expect(child.checkVisibility()).to.equal(true);
      summary.click();
      expect(details.open).to.equal(false);
      expect(properties.checkVisibility()).to.equal(false);
    } finally {
      root.remove();
    }
  });

  it('subtly outlines cards and highlights them on hover and keyboard focus', () => {
    const style = document.createElement('style');
    style.textContent = FRAME_CSS;
    const { root } = clean(`<section class="aem-component aem-component--dynamic">
      <details><summary class="aem-component__header"><code>wknd/components/list</code></summary>
      <dl class="aem-component__properties"><dt>maxItems</dt><dd>4</dd></dl></details>
      <div class="aem-component__content"><p>Visible content</p></div>
      <div class="aem-component__children"><p>Visible child</p></div></section>`);
    document.head.append(style);
    document.body.append(root);
    try {
      const card = root.querySelector('section');
      const header = card.querySelector('summary');
      const border = getComputedStyle(card).borderColor;
      const background = getComputedStyle(header).backgroundColor;
      expect(getComputedStyle(document.body).backgroundColor).to.equal('rgb(255, 255, 255)');
      expect(getComputedStyle(card).backgroundColor).to.equal('rgb(255, 255, 255)');
      expect(background).to.equal('rgb(243, 243, 243)');
      expect(getComputedStyle(header.querySelector('code')).fontSize).to.equal('10px');
      expect(getComputedStyle(root.querySelector('dt')).fontSize).to.equal('10px');
      expect(getComputedStyle(root.querySelector('dd')).fontSize).to.equal('10px');
      expect(getComputedStyle(root.querySelector('.aem-component__content p')).fontSize).to.equal('10px');
      expect(getComputedStyle(root.querySelector('.aem-component__children p')).fontSize).to.equal('15px');
      expect(FRAME_CSS).to.include('.aem-component:hover');
      header.focus();
      expect(getComputedStyle(card).borderColor).not.to.equal(border);
      expect(getComputedStyle(header).backgroundColor).not.to.equal(background);
      expect(getComputedStyle(root.querySelector('p')).opacity).to.equal('1');
      expect(getComputedStyle(root.querySelector('.aem-component__content'), '::before').content).to.equal('none');
    } finally {
      root.remove();
      style.remove();
    }
  });

  it('strips active content, handlers, styles, urls and unknown classes', () => {
    const html = out(`<script>alert(1)</script><style>*{}</style><iframe src="//x"></iframe><form action="x"><input></form>
      <svg onload="x()"></svg><p onclick="x()" style="color:red" class="evil" title="t">hi<a href="javascript:x()">link</a></p>
      <img src="https://x/y.png" srcset="https://x/z.png" onerror="x()" alt="a"><div class="aem-component__content" style="x">ok</div>
      <section class="aem-component aem-component--x y">no</section><span data-aem-in-between="a&quot;b">q</span><base href="//e"><object data="x"></object>`);
    expect(html).not.to.match(/script|style=|onclick|onerror|iframe|form|input|svg|javascript|srcset|https?:|href|<base|object|evil|class="aem-component aem-component--x y"/i);
    expect(html).to.contain('aem-component__content');
    expect(html).to.contain('hi');
    expect(html).not.to.contain('data-aem-in-between');
  });

  it('never keeps src; images without a same-site canonical identity are placeholders', () => {
    const doc = out('<img src="https://x/y.png" alt="remote"><img data-da-source-path="/o/other/a.png" data-da-source-kind="image" alt="cross">'
      + '<img data-da-source-path="/o/s/../x.png" data-da-source-kind="image"><img data-da-source-path="/o/s/a.png" data-da-source-kind="page">'
      + `<img src="${PNG_URL}"><img src="javascript:alert(1)">`);
    expect(doc).not.to.contain('<img');
    expect(doc.match(/aem-image-placeholder/g)).to.have.length(6);
  });

  it('neutralizes anchors and extracts typed same-site references only', () => {
    const { root, references } = clean(`<p><a href="https://evil" data-da-source-path="/o/s/m/model" data-da-source-kind="sheet">Model</a>
      <span data-da-source-path="/o/s/p/q.html" data-da-source-kind="page">Q</span>
      <a data-da-source-path="/o/t/p" data-da-source-kind="page">Other</a><a data-da-source-path="/x/s/p" data-da-source-kind="page">cross-org</a>
      <a href="//x" data-da-source-path="/o/s/a b/c" data-da-source-kind="bogus">bad</a></p>`);
    expect(root.querySelector('a')).to.equal(null);
    expect(references.map((r) => `${r.kind}:${r.path}`)).to.deep.equal(['sheet:/o/s/m/model', 'page:/o/s/p/q.html']);
    expect(references[0].label).to.equal('Model');
  });

  it('only restores app-generated routes for validated reference anchors', () => {
    const { root, references } = clean(`<a href="javascript:evil()" data-da-source-path="/o/s/model.json" data-da-source-kind="sheet">Sheet</a>
      <a href="https://evil" data-da-source-path="/o/s/model.json" data-da-source-kind="sheet">Again</a>
      <a href="https://evil" data-da-source-path="/o/other/model.json" data-da-source-kind="sheet">Other</a>
      <span data-ref-id="ref-0">Forged</span>`);
    expect(references).to.have.length(1);
    const html = serializeImportedPage(root, new Map(), undefined, new Map([['ref-0', '/sheet#/o/s/model']]));
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const links = [...doc.querySelectorAll('a')];
    expect(links).to.have.length(2);
    expect(links.every((link) => link.getAttribute('href') === '/sheet#/o/s/model'
      && link.getAttribute('target') === '_top')).to.equal(true);
    expect(doc.body.textContent).to.contain('Other');
    expect(doc.body.textContent).to.contain('Forged');
    expect(html).not.to.match(/javascript:|https:\/\/evil|data-ref-id/);
    expect(serializeImportedPage(root, new Map())).not.to.contain('<a ');
  });

  it('is limit-bounded', () => {
    const deep = '<div>'.repeat(LIMITS.maxDepth + 5);
    expect(() => clean(deep)).to.throw(ImportedPageError);
    expect(() => clean('<p>x</p>'.repeat(LIMITS.maxNodes))).to.throw(ImportedPageError);
    const many = Array.from({ length: LIMITS.maxImages + 10 }, (_, i) => `<img data-da-source-path="/o/s/${i}.png" data-da-source-kind="image">`).join('');
    expect(clean(many).images).to.have.length(LIMITS.maxImages);
  });

  it('applies only hydrated image data URLs, not network, blob or non-image URLs', () => {
    const urls = [PNG_URL, 'https://evil/b.png', 'blob:x', 'data:text/html;base64,WA=='];
    const markup = urls.map((_, i) => `<img data-da-source-path="/o/s/${i}.png" data-da-source-kind="image" src="data:image/png;base64,AUTHORED">`).join('');
    const { root } = clean(markup);
    const html = serializeImportedPage(root, new Map(urls.map((url, i) => [`img-${i}`, url])));
    expect(html).to.contain(`src="${PNG_URL}"`);
    expect(html).not.to.match(/evil|blob:|data:text|AUTHORED/);
    expect(html.match(/aem-image-placeholder/g)).to.have.length(3);
  });

  it('caps repeated serialized image data without dropping distinct approved images', () => {
    const markup = ['a', 'a', 'b'].map((name) => `<img data-da-source-path="/o/s/${name}.png" data-da-source-kind="image" alt="${name}">`).join('');
    const { root, images } = clean(markup);
    expect(images).to.have.length(2);
    const dataUrls = new Map(images.map(({ id }) => [id, PNG_URL]));
    const html = serializeImportedPage(root, dataUrls, PNG_URL.length * 2);
    expect(html.match(/src="data:image\/png/g)).to.have.length(2);
    expect(html).to.contain('Image unavailable: a');
    expect(html).to.contain(`alt="b" src="${PNG_URL}"`);
  });

  it('counts every picture image once and normal images once', () => {
    const filler = '<b></b>'.repeat(LIMITS.maxNodes - 5000);
    const picture = (n) => `<picture>${'<img>'.repeat(n)}</picture>`;
    expect(() => clean('<img>'.repeat(LIMITS.maxNodes))).not.to.throw();
    expect(() => clean(filler + picture(4900))).not.to.throw();
    expect(() => clean(filler + picture(5000))).to.throw(ImportedPageError);
  });

  it('keeps the explicit empty-page note only in its exact form', () => {
    const html = out('<p class="aem-empty-page" role="note">No readable authored components.</p><p class="aem-empty-page" role="button">x</p><div class="aem-empty-page">y</div>');
    expect(html).to.contain('<p class="aem-empty-page" role="note">No readable authored components.</p>');
    expect(html).not.to.contain('role="button"');
    expect(html.match(/aem-empty-page/g)).to.have.length(2);
  });

  it('makes no network request while parsing and sanitizing malicious markup', async () => {
    const marker = `__p2_no_load_${Date.now()}`;
    const before = performance.getEntriesByType('resource').length;
    clean(`<img src="/${marker}/a.png"><iframe src="/${marker}/b.html"></iframe><link rel="stylesheet" href="/${marker}/c.css"><picture><source srcset="/${marker}/d.png"><img srcset="/${marker}/e.png"></picture><script src="/${marker}/f.js"></script>`);
    await new Promise((resolve) => { setTimeout(resolve, 150); });
    const loaded = performance.getEntriesByType('resource').slice(before).filter((e) => e.name.includes(marker));
    expect(loaded).to.have.length(0);
  });

  it('wraps in a strict csp document', () => {
    const doc = buildSrcdoc('<p>x</p>');
    expect(doc).to.contain("default-src 'none'; img-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'");
    expect(doc).not.to.contain('<script');
  });

  it('allows only the specific Author font stylesheet and its font host in Layout', () => {
    const body = `<link rel="stylesheet" href="${WKND_FONT_STYLESHEET.replaceAll('&', '&amp;')}"><p>Text</p>`;
    const result = sanitizeAuthorPage(body);
    expect(result.allowWkndFonts).to.equal(true);
    const html = buildSrcdoc(serializeImportedPage(result.root, new Map()), 'layout', result.allowWkndFonts);
    const doc = new DOMParser().parseFromString(html, 'text/html');
    expect(doc.head.querySelector('link[rel="stylesheet"]').getAttribute('href')).to.equal(WKND_FONT_STYLESHEET);
    expect(doc.head.querySelector('link[rel="stylesheet"]').getAttribute('referrerpolicy')).to.equal('no-referrer');
    expect(doc.querySelectorAll('link')).to.have.length(1);
    expect(doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]').content)
      .to.contain("style-src 'unsafe-inline' https://fonts.googleapis.com/css2; font-src https://fonts.gstatic.com");
    expect(doc.head.querySelector('meta[http-equiv="Content-Security-Policy"]').content).to.contain("default-src 'none'");
    const content = buildSrcdoc('<p>Content</p>', 'content', true);
    expect(content).not.to.contain('fonts.googleapis.com');
    expect(content).not.to.contain('fonts.gstatic.com');
  });

  it('does not allow other stylesheet links or query parameters', () => {
    const urls = [
      'https://evil.example/css2?family=Asar',
      WKND_FONT_STYLESHEET.replace('https://', 'http://'),
      WKND_FONT_STYLESHEET.replace('fonts.googleapis.com', 'fonts.googleapis.com.evil.example'),
      WKND_FONT_STYLESHEET.replace('fonts.googleapis.com', 'user@fonts.googleapis.com'),
      WKND_FONT_STYLESHEET.replace('/css2?', '/other?'),
      `${WKND_FONT_STYLESHEET}&text=private`,
      `${WKND_FONT_STYLESHEET}#fragment`,
      WKND_FONT_STYLESHEET.replace('family=Asar', 'family=Other'),
      '/css2?family=Asar',
    ];
    urls.forEach((url) => {
      const { allowWkndFonts } = sanitizeAuthorPage(`<link rel="stylesheet" href="${url.replaceAll('&', '&amp;')}">`);
      expect(allowWkndFonts, url).to.equal(false);
    });
    ['alternate stylesheet', 'preload'].forEach((rel) => {
      expect(sanitizeAuthorPage(`<link rel="${rel}" href="${WKND_FONT_STYLESHEET.replaceAll('&', '&amp;')}">`).allowWkndFonts).to.equal(false);
    });
    expect(sanitizeAuthorPage(`<link rel="stylesheet" disabled href="${WKND_FONT_STYLESHEET.replaceAll('&', '&amp;')}">`).allowWkndFonts).to.equal(false);
  });

  it('does not load the approved stylesheet while sanitizing the Author response', () => {
    const { root, allowWkndFonts } = sanitizeAuthorPage(`<link rel="stylesheet" href="${WKND_FONT_STYLESHEET.replaceAll('&', '&amp;')}">`);
    expect(allowWkndFonts).to.equal(true);
    expect(root.querySelector('link')).to.equal(null);
  });

  it('keeps Author layout markup while refusing active content and arbitrary images', () => {
    const body = `<style>.cmp-layout { color: red }</style><style>@import url(https://evil/x)</style>
      <main><div class="cmp-layout" style="font-weight: bold" onclick="evil()"><script>evil()</script>
      <a href="https://evil">Visible text</a><img src="https://evil/x.jpg">
      <img src="/content/wknd/a/_jcr_content/root/image.coreimg.jpeg/123/a.jpeg" alt="Demo">
      <img src="/content/wknd/a/_jcr_content/../secret.coreimg.jpeg/123/a.jpeg"></div></main>`;
    const result = sanitizeAuthorPage(body);
    const serialized = serializeImportedPage(result.root, new Map());
    expect(result.images).to.deep.equal([{ id: 'img-0', path: '/content/wknd/a/_jcr_content/root/image.coreimg.jpeg/123/a.jpeg' }]);
    expect(serialized).to.contain('class="cmp-layout"');
    expect(serialized).to.contain('.cmp-layout { color: red }');
    expect(serialized).to.contain('style="font-weight: bold"');
    expect(serialized).to.contain('Visible text');
    ['script', 'onclick', 'https://evil', '_jcr_content', '../secret'].forEach((value) => expect(serialized).not.to.contain(value));
  });
});

describe('imported page responses and image hydration', () => {
  const page = (headers = {}, status = 200) => new Response('<p>x</p>', {
    status,
    headers: { 'content-type': 'text/html; charset=utf-8', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false', ...headers },
  });
  it('validates status and headers', () => {
    expect(() => validatePageResponse(page())).not.to.throw();
    [{ 'x-da-source-kind': 'sheet' }, { 'x-da-source-collaboration': 'true' }, { 'x-da-content-profile': 'native-da' },
      { 'content-type': 'application/json' }, { 'content-type': 'text/html; charset=latin1' }, { 'content-length': String(LIMITS.maxHtmlBytes + 1) }]
      .forEach((h) => expect(() => validatePageResponse(page(h))).to.throw(ImportedPageError));
    expect(() => validatePageResponse(page({}, 403))).to.throw(/permission/);
  });

  const img = (type = 'image/png', kind = 'image', size = 4, extra = {}) => new Response(new Uint8Array(size), { headers: { 'content-type': type, 'x-da-source-kind': kind, 'x-da-content-profile': 'aem-import', 'x-da-source-collaboration': 'false', ...extra } });
  it('validates kind/mime, bounds and concurrency before encoding original bytes', async () => {
    let running = 0;
    let max = 0;
    const source = {
      get: async (path) => {
        running += 1;
        max = Math.max(max, running);
        await new Promise((r) => { setTimeout(r, 5); });
        running -= 1;
        if (path.endsWith('bad-kind')) return img('image/png', 'asset');
        if (path.endsWith('bad-type')) return img('text/html');
        if (path.endsWith('bad-profile')) return img('image/png', 'image', 4, { 'x-da-content-profile': 'native-da' });
        if (path.endsWith('bad-collab')) return img('image/png', 'image', 4, { 'x-da-source-collaboration': 'true' });
        if (path.endsWith('no-collab')) return img('image/png', 'image', 4, { 'x-da-source-collaboration': '' });
        if (path.endsWith('denied')) return new Response('', { status: 403 });
        if (path.endsWith('boom')) throw new Error('x');
        if (path.endsWith('empty')) return img('image/png', 'image', 0);
        if (path.endsWith('big')) return img('image/png', 'image', 100);
        if (path.endsWith('ok2')) return img('image/svg+xml');
        return img();
      },
    };
    const images = ['ok', 'bad-kind', 'bad-type', 'bad-profile', 'bad-collab', 'no-collab', 'denied', 'boom', 'empty', 'ok2', 'big', 'ok3'].map((n) => ({ id: n, path: `/o/s/${n}` }));
    const result = await hydrateImages(images, {
      source,
      isCurrent: () => true,
      limits: { concurrency: 2, maxImageBytes: 50, maxTotalBytes: 8 },
    });
    expect(max).to.be.at.most(2);
    expect(result.get('ok')).to.equal('data:image/png;base64,AAAAAA==');
    expect(result.get('ok2')).to.equal('data:image/svg+xml;base64,AAAAAA==');
    ['bad-kind', 'bad-type', 'bad-profile', 'bad-collab', 'no-collab', 'denied', 'boom', 'empty', 'big'].forEach((n) => expect(result.get(n)).to.equal(null));
    expect(result.get('ok3')).to.equal(null);
  });

  it('cancels the body of a rejected image response', async () => {
    let cancelled = false;
    const body = new ReadableStream({
      pull() { /* never ends */ },
      cancel() { cancelled = true; },
    });
    const resp = new Response(body, { headers: { 'content-type': 'image/png', 'x-da-source-kind': 'image', 'x-da-content-profile': 'native-da', 'x-da-source-collaboration': 'false' } });
    const result = await hydrateImages([{ id: 'a', path: '/o/s/a' }], { source: { get: async () => resp }, isCurrent: () => true });
    expect(result.get('a')).to.equal(null);
    expect(cancelled).to.equal(true);
  });

  it('does not even request an image when stale', async () => {
    const get = sinon.spy(async () => img());
    const result = await hydrateImages([{ id: 'a', path: '/o/s/a' }], { source: { get }, isCurrent: () => false });
    expect(result.size).to.equal(0);
    expect(get.called).to.equal(false);
  });

  it('cancels the encoder and does not retain its result on abort', async () => {
    const controller = new AbortController();
    const abort = sinon.spy(FileReader.prototype, 'abort');
    const read = FileReader.prototype.readAsDataURL;
    const encode = sinon.stub(FileReader.prototype, 'readAsDataURL').callsFake(function start(blob) {
      read.call(this, blob);
      queueMicrotask(() => controller.abort());
    });
    try {
      const source = { get: async () => img() };
      const result = await hydrateImages([{ id: 'a', path: '/o/s/a' }], { source, isCurrent: () => true, signal: controller.signal });
      expect(encode.calledOnce).to.equal(true);
      expect(abort.calledOnce).to.equal(true);
      expect(result.get('a')).to.equal(null);
    } finally {
      encode.restore();
      abort.restore();
    }
  });
});

describe('bounded body reading', () => {
  const streamOf = (chunks, onCancel, state = {}) => new Response(new ReadableStream({
    pull(controller) {
      state.pulls = (state.pulls ?? 0) + 1;
      if (!chunks.length) controller.close();
      else controller.enqueue(chunks.shift());
    },
    cancel() { onCancel?.(); },
  }));

  it('stops and cancels at the limit when content-length is missing', async () => {
    const state = {};
    let cancelled = false;
    const chunks = Array.from({ length: 100 }, () => new Uint8Array(10));
    const resp = streamOf(chunks, () => {
      cancelled = true;
    }, state);
    let error;
    try {
      await readBounded(resp, 35);
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(ImportedPageError);
    expect(cancelled).to.equal(true);
    expect(state.pulls).to.be.below(20);
  });

  it('enforces the limit when content-length lies or is oversize', async () => {
    const lying = streamOf([new Uint8Array(40)]);
    await readBounded(lying, 100);
    const resp = new Response(new Uint8Array(200), { headers: { 'content-length': '5' } });
    let error;
    try {
      await readBounded(resp, 100);
    } catch (e) {
      error = e;
    }
    expect(error.code).to.equal('too-large');
    const big = new Response('x', { headers: { 'content-length': '999' } });
    try {
      await readBounded(big, 100);
      error = null;
    } catch (e) {
      error = e;
    }
    expect(error).to.be.instanceOf(ImportedPageError);
    expect((await readBounded(new Response(new Uint8Array([1, 2, 3])), 3)).byteLength).to.equal(3);
  });

  it('cancels the reader on abort', async () => {
    const controller = new AbortController();
    let cancelled = false;
    const resp = new Response(new ReadableStream({
      pull() { return new Promise(() => {}); },
      cancel() { cancelled = true; },
    }));
    const pending = readBounded(resp, 100, { signal: controller.signal });
    controller.abort();
    let error;
    try {
      await pending;
    } catch (e) {
      error = e;
    }
    expect(cancelled).to.equal(true);
    expect(error === undefined || error.code === 'aborted').to.equal(true);
  });
});

describe('imported page route', () => {
  const CAPS = { contentProfile: 'aem-import', readOnly: true, collaboration: false, branching: false, openKinds: ['page', 'image', 'sheet'] };
  let href;
  let saved;
  let el;
  const details = {
    org: 'o', site: 's', fullpath: '/o/s/a/b.html', parent: '/o/s/a', parentName: 'a', name: 'b',
  };
  beforeEach(() => {
    href = window.location.href;
    window.history.replaceState(null, '', '/edit?da-source=da-rs#/o/s/a/b');
    saved = { ...routeDeps };
    el = document.createElement('div');
    routeDeps.discover = async () => CAPS;
  });
  afterEach(() => {
    unmountImportedPage(el);
    el.remove();
    Object.assign(routeDeps, saved);
    window.history.replaceState(null, '', href);
    sinon.restore();
  });

  it('only dispatches unbranched imported pages whose caps open pages', async () => {
    expect(await findImportedPageCaps(details)).to.equal(CAPS);
    expect(await findImportedPageCaps({ ...details, site: 's~b' })).to.equal(null);
    routeDeps.discover = async () => ({ ...CAPS, openKinds: ['image'] });
    expect(await findImportedPageCaps(details)).to.equal(null);
    routeDeps.discover = async () => ({ ...CAPS, contentProfile: 'native-da', readOnly: false });
    expect(await findImportedPageCaps(details)).to.equal(null);
    routeDeps.discover = async () => { throw new Error('x'); };
    expect(await findImportedPageCaps(details)).to.equal(null);
  });

  it('mounts a sandboxed iframe and references without a banner, then cleans up', async () => {
    const gets = [];
    const body = `<section class="aem-component"><header class="aem-component__header"><code>t</code></header>
      <img data-da-source-path="/o/s/i.png" data-da-source-kind="image" alt="i"><a href="https://evil" data-da-source-path="/o/s/m/model a.json" data-da-source-kind="sheet">Model</a></section>`;
    routeDeps.source = async () => ({
      get: async (path) => {
        gets.push(path);
        if (path === details.fullpath) {
          return new Response(body, { headers: { 'content-type': 'text/html; charset=utf-8', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } });
        }
        const bytes = Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0));
        return new Response(bytes, { headers: { 'content-type': 'image/png', 'x-da-source-kind': 'image', 'x-da-content-profile': 'aem-import', 'x-da-source-collaboration': 'false' } });
      },
    });
    document.body.append(el);
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    el.querySelectorAll('button')[1].click();
    for (let i = 0; i < 50 && !el.querySelector('.da-imported-page-references'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(el.querySelector('.da-imported-page-banner')).to.equal(null);
    expect(el.querySelector('da-title').readOnly).to.equal(true);
    const frame = el.querySelector('iframe');
    expect(frame.getAttribute('sandbox')).to.equal('allow-top-navigation-by-user-activation');
    expect(frame.srcdoc).to.contain(`src="${PNG_URL}"`);
    const frameDoc = new DOMParser().parseFromString(frame.srcdoc, 'text/html');
    const sheetLink = frameDoc.querySelector('a.aem-ref');
    expect(sheetLink.getAttribute('href')).to.match(/^\/sheet(\?[^#]*)?#\/o\/s\/m\/model%20a$/);
    expect(sheetLink.getAttribute('target')).to.equal('_top');
    expect(frame.srcdoc).not.to.contain('https://evil');
    if (frame.contentDocument) {
      await new Promise((resolve) => { frame.addEventListener('load', resolve, { once: true }); });
    }
    expect(frame.contentDocument).to.equal(null);
    expect(gets).to.deep.equal(['/o/s/a/b.html', '/o/s/a/b.html', '/o/s/i.png']);
    expect(el.querySelector('.da-imported-page-references a').getAttribute('href')).to.match(/^\/sheet(\?[^#]*)?#\/o\/s\/m\/model%20a$/);
    expect([...el.querySelectorAll('button')].map((button) => button.textContent)).to.deep.equal(['Layout', 'Content']);
    expect(el.querySelector('input')).to.equal(null);
    unmountImportedPage(el);
    expect(frame.isConnected).to.equal(false);
    expect(el.querySelector('[data-imported-page]')).to.equal(null);
  });

  it('defaults to Layout and switches views with the matching Source mode and safe Author images', async () => {
    const gets = [];
    const headers = { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' };
    const imagePath = '/content/wknd/a/_jcr_content/root/image.coreimg.jpeg/123/a.jpeg';
    routeDeps.source = async () => ({
      get: async (path, extra, options) => {
        gets.push({ path, render: options.render, resource: options.resource });
        if (options.render === 'author-image') return new Response(Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)), { headers: { ...headers, 'content-type': 'image/png', 'x-da-source-kind': 'image' } });
        if (options.render === 'author') return new Response(`<link rel="stylesheet" href="${WKND_FONT_STYLESHEET.replaceAll('&', '&amp;')}"><main><h1>Author layout</h1><img src="${imagePath}" alt="Demo"><script>evil()</script></main>`, { headers });
        return new Response('<main><h1>DA content</h1></main>', { headers });
      },
    });
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    const [layout, content] = el.querySelectorAll('button');
    expect(layout.getAttribute('aria-pressed')).to.equal('true');
    expect(content.getAttribute('aria-pressed')).to.equal('false');
    expect(el.querySelector('iframe').srcdoc).to.contain('Author layout');
    expect(el.querySelector('iframe').srcdoc).to.contain('fonts.googleapis.com/css2');
    expect(el.querySelector('iframe').srcdoc).to.contain(`src="${PNG_URL}"`);
    expect(el.querySelector('iframe').srcdoc).not.to.contain('evil()');
    expect(gets.map((call) => call.render)).to.deep.equal(['author', 'author-image']);
    expect(gets[1].resource).to.equal(imagePath);
    content.click();
    for (let i = 0; i < 50 && !el.querySelector('iframe'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(el.querySelector('iframe').srcdoc).to.contain('DA content');
    expect(el.querySelector('iframe').srcdoc).not.to.contain('fonts.googleapis.com');
    expect(content.getAttribute('aria-pressed')).to.equal('true');
    expect(gets.map((call) => call.render)).to.deep.equal(['author', 'author-image', undefined]);
    layout.click();
    for (let i = 0; i < 50 && !el.querySelector('iframe'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    expect(layout.getAttribute('aria-pressed')).to.equal('true');
    expect(el.querySelector('iframe').srcdoc).to.contain('Author layout');
    expect(gets.map((call) => call.render)).to.deep.equal(['author', 'author-image', undefined, 'author', 'author-image']);
  });

  it('displays Franklin block table content and authenticated images in Content view', async () => {
    const headers = { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' };
    const paths = [];
    const block = `<table class="aem-franklin-block"><thead><tr><th colspan="2">hero</th></tr></thead><tbody>
      <tr><td>image</td><td><img data-da-source-path="/o/s/assets/hero.png" data-da-source-kind="image" data-aem-image-path="/content/dam/frescopa/hero.png" alt="Hero"></td></tr>
      <tr><td>text</td><td><h1>Café Vibes, Anywhere</h1></td></tr></tbody></table>`;
    routeDeps.source = async () => ({
      get: async (path, extra, options) => {
        paths.push(path);
        if (path === details.fullpath) return new Response(options.render === 'author' ? '<p>Layout</p>' : block, { headers });
        return new Response(Uint8Array.from(atob(PNG), (c) => c.charCodeAt(0)), { headers: { ...headers, 'content-type': 'image/png', 'x-da-source-kind': 'image' } });
      },
    });
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    el.querySelectorAll('button')[1].click();
    for (let i = 0; i < 50 && !el.querySelector('iframe'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    const frameDoc = new DOMParser().parseFromString(el.querySelector('iframe').srcdoc, 'text/html');
    expect(frameDoc.querySelector('table.aem-franklin-block')).to.exist;
    expect(frameDoc.querySelector('th[colspan="2"]').textContent).to.equal('hero');
    expect(frameDoc.querySelectorAll('tbody tr')).to.have.length(2);
    expect(frameDoc.querySelector('tbody img').getAttribute('src')).to.equal(PNG_URL);
    expect(frameDoc.querySelector('tbody img').hasAttribute('data-aem-image-path')).to.equal(false);
    expect(frameDoc.querySelector('tbody h1').textContent).to.equal('Café Vibes, Anywhere');
    expect(paths).to.deep.equal([details.fullpath, details.fullpath, '/o/s/assets/hero.png']);
  });

  it('displays the authored path as inert text when a Franklin block image cannot load', async () => {
    const headers = { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' };
    const block = `<table><tr><td>image</td><td><img data-da-source-path="/o/s/assets/hero.png"
      data-da-source-kind="image" data-aem-image-path="/content/dam/frescopa/&lt;img&gt;.png"></td></tr></table>`;
    routeDeps.source = async () => ({
      get: async (path, extra, options) => {
        if (path === details.fullpath) return new Response(options.render === 'author' ? '<p>Layout</p>' : block, { headers });
        return new Response('', { status: 404 });
      },
    });
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    el.querySelectorAll('button')[1].click();
    for (let i = 0; i < 50 && !el.querySelector('iframe'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    const frameDoc = new DOMParser().parseFromString(el.querySelector('iframe').srcdoc, 'text/html');
    expect(frameDoc.querySelector('.aem-image-placeholder').textContent).to.equal('/content/dam/frescopa/<img>.png');
    expect(frameDoc.querySelector('tbody img')).to.equal(null);
    expect(frameDoc.querySelector('tbody a')).to.equal(null);
  });

  it('does not display unsafe fallback paths or query strings', () => {
    const markup = '<img data-da-source-path="/o/s/hero.png" data-da-source-kind="image" data-aem-image-path="/content/dam/hero.png?token=secret">';
    const { root } = sanitizeImportedPage(markup, SCOPE);
    const html = serializeImportedPage(root, new Map());
    expect(html).to.contain('Image unavailable');
    expect(html).not.to.contain('token=secret');
  });

  it('keeps reference text inert if sheet navigation is not supported', async () => {
    const body = '<a data-da-source-path="/o/s/model.json" data-da-source-kind="sheet" href="https://evil">Open model Sheet</a>';
    routeDeps.source = async () => ({ get: async () => new Response(body, { headers: { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } }) });
    await mountImportedPage({ el, details, caps: { ...CAPS, openKinds: ['page'] }, isCurrent: () => true });
    el.querySelectorAll('button')[1].click();
    for (let i = 0; i < 50 && !el.querySelector('iframe'); i += 1) {
      await new Promise((resolve) => { setTimeout(resolve, 10); });
    }
    const frame = el.querySelector('iframe');
    expect(frame.srcdoc).to.contain('Open model Sheet');
    expect(frame.srcdoc).not.to.contain('<a ');
    expect(frame.srcdoc).not.to.contain('https://evil');
  });

  it('aborts the page and image requests when unmounted and never falls back to a URL', async () => {
    const signals = [];
    const pending = [];
    routeDeps.source = async () => ({
      get: (path, extra, opts) => {
        signals.push(opts?.signal);
        if (path === details.fullpath) {
          if (opts.render === 'author') {
            return Promise.resolve(new Response('<p>Layout</p>', { headers: { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } }));
          }
          return Promise.resolve(new Response('<img data-da-source-path="/o/s/i.png" data-da-source-kind="image">', { headers: { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' } }));
        }
        return new Promise((resolve, reject) => {
          opts.signal.addEventListener('abort', () => {
            pending.push('aborted');
            reject(new DOMException('x', 'AbortError'));
          });
        });
      },
    });
    const fetchSpy = sinon.spy(window, 'fetch');
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    el.querySelectorAll('button')[1].click();
    await new Promise((resolve) => { setTimeout(resolve, 30); });
    unmountImportedPage(el);
    expect(signals.length).to.equal(3);
    expect(signals.every((s) => s instanceof AbortSignal && s.aborted)).to.equal(true);
    expect(pending).to.deep.equal(['aborted']);
    expect(el.querySelector('iframe')).to.equal(null);
    expect(fetchSpy.called).to.equal(false);
  });

  it('shows an error without a frame for invalid responses and ignores stale mounts', async () => {
    routeDeps.source = async () => ({ get: async () => new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } }) });
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => true });
    expect(el.querySelector('[role=alert]')).to.exist;
    expect(el.querySelector('iframe')).to.equal(null);
    const ok = { 'content-type': 'text/html', 'x-da-content-profile': 'aem-import', 'x-da-source-kind': 'page', 'x-da-source-collaboration': 'false' };
    routeDeps.source = async () => ({ get: async () => new Response('<p>x</p>', { headers: ok }) });
    await mountImportedPage({ el, details, caps: CAPS, isCurrent: () => false });
    expect(el.querySelector('iframe')).to.equal(null);
  });

  it('resolves routing for items with or without listing capabilities', async () => {
    const { resolveFileItemHref } = await import('../../../../blocks/shared/da-file-item/navigation.js');
    const item = { path: '/o/s/a/b.html', ext: 'html', editor: '/canvas#' };
    const withCaps = await resolveFileItemHref({ ...item, capabilities: { view: 'page-readonly' } });
    expect(withCaps).to.match(/^\/edit(\?[^#]*)?#\/o\/s\/a\/b$/);
    sinon.stub(window, 'fetch').resolves(new Response('', { status: 500 }));
    expect(await resolveFileItemHref(item)).to.match(/^\/canvas/);
    expect(await resolveFileItemHref({ ...item, path: '/o/s~b/a.html' })).to.match(/^\/canvas/);
  });

  it('routes imported page links to the read-only viewer regardless of editor preference', () => {
    const path = '/o/s/a/b.html';
    expect(getEditPath({ path, ext: 'html', editor: '/canvas#', capabilities: { view: 'page-readonly' } })).to.match(/^\/edit(\?[^#]*)?#\/o\/s\/a\/b$/);
    expect(getEditPath({ path, ext: 'html', editor: '/canvas#' })).to.match(/^\/canvas(\?[^#]*)?#\/o\/s\/a\/b$/);
  });
});
