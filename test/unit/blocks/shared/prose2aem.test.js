import { readFile } from '@web/test-runner-commands';
import { expect } from '@esm-bundle/chai';

import prose2aem, { getHtmlWithCursor } from '../../../../blocks/shared/prose2aem.js';
import { getLivePreviewUrl } from '../../../../blocks/shared/constants.js';

const htmlString = await readFile({ path: './mocks/prose2aem.html' });
const doc = new DOMParser().parseFromString(htmlString, 'text/html');

describe('aem2prose', () => {
  before('parse everything', () => {
    document.body.outerHTML = prose2aem(doc.body, true);
  });

  it('Removes extras', () => {
    const block = document.querySelector('.ProseMirror-yjs-selection');
    expect(block).to.not.exist;
  });

  it('Decorates basic block', () => {
    const block = document.querySelector('.marquee');
    expect(block).to.exist;
    expect(block.classList[0]).to.equal('marquee');
  });

  it('Decorates variant block', () => {
    const block = document.querySelector('.marquee.light.large');
    expect(block).to.exist;
  });

  it('Decorates images', () => {
    const pics = document.querySelectorAll('picture');
    const noPara = pics[0].closest('p');
    const para = pics[1].closest('p');

    expect(pics[0]).to.exist;
    expect(noPara).to.not.exist;

    expect(para).to.exist;
  });

  it('Decorates sections', () => {
    const hrs = document.querySelectorAll('hr');
    const hasParaBreak = document.body.innerHTML.search('<p>---<p/>');
    expect(hrs.length).to.equal(0);
    expect(hasParaBreak).to.equal(-1);
  });

  it('Decorates list items', () => {
    const liParas = document.querySelectorAll('li > p');
    expect(liParas.length).to.equal(0);
  });

  it('Removes metadata', () => {
    const meta = document.querySelector('.metadata');
    expect(meta).to.not.exist;
  });

  it('Wraps imgs with href attrs in a link tag', () => {
    const pictureEl = document.querySelector('a > picture');
    const parent = pictureEl.parentElement;
    expect(parent.href).to.equal('https://my.image.link/');
  });

  it('Wraps icons in span tags', () => {
    const icons = document.querySelectorAll('span.icon');
    expect(icons.length).to.equal(9);
  });
});

describe('prose2aem section-metadata handling', () => {
  function makeEditor(innerHtml) {
    const editor = document.createElement('div');
    editor.innerHTML = innerHtml;
    return editor;
  }

  function parseMain(html) {
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    return parsed.querySelector('main');
  }

  function renderSection(rows, previewOptions) {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          ${rows}
        </table>
      </div>
    `);
    return parseMain(prose2aem(editor, true, false, previewOptions)).querySelector(':scope > div');
  }

  [
    ['My Section!', 'my-section'],
    ['123 My.Section_Name:Part-2!', 'my.section_name:part-2'],
    ['---Leading---', 'leading'],
    ['', null],
    ['123!!!', null],
  ].forEach(([value, expected]) => {
    it(`normalizes section ID "${value}" to ${expected}`, () => {
      const section = renderSection(`<tr><td>Id</td><td>${value}</td></tr>`);
      expect(section.getAttribute('id')).to.equal(expected);
      expect(section.hasAttribute('data-id')).to.be.false;
    });
  });

  it('does not overwrite a section ID with an empty or invalid value', () => {
    const section = renderSection(`
      <tr><td>Id</td><td>First Section</td></tr>
      <tr><td>Id</td><td></td></tr>
      <tr><td>Id</td><td>123!</td></tr>
    `);
    expect(section.id).to.equal('first-section');
  });

  [
    ['wide dark', ['wide-dark']],
    ['columns wide, dark fancy', ['columns-wide', 'dark-fancy']],
    ['<p>two columns</p><p>centered, dark</p>', ['two-columns', 'centered', 'dark']],
    ['<p>two columns<br>centered, dark</p>', ['two-columns', 'centered', 'dark']],
    ['Columns (wide, dark)', ['columns', 'wide', 'dark']],
    ['<strong>wide</strong> dark', ['wide', 'dark']],
    ['', []],
  ].forEach(([value, expected]) => {
    it(`extracts style classes from "${value}"`, () => {
      const section = renderSection(`<tr><td>Style</td><td>${value}</td></tr>`);
      expect([...section.classList]).to.deep.equal(expected);
    });
  });

  [
    ['Custom_Key:Name', 'custom_key:name'],
    ['Two  Words', 'two--words'],
    ['-Edge-', '-edge-'],
    ['hreflang-en-US', 'hreflang:en-us'],
  ].forEach(([key, name]) => {
    it(`normalizes metadata key "${key}" to "${name}"`, () => {
      const section = renderSection(`<tr><td>${key}</td><td>value</td></tr>`);
      expect(section.getAttribute(`data-${name}`)).to.equal('value');
    });
  });

  it('collects mixed text, links and images in document order', () => {
    const section = renderSection(`
      <tr><td>Sources</td><td>first, second
        <img src="https://example.com/first.jpg">
        <a href="https://example.com/page"><strong>Label</strong></a>
        <p>third <em>fourth</em></p>
        <img src="https://example.com/last.jpg">
      </td></tr>
    `);
    expect(section.dataset.sources).to.equal(
      'first,second,https://example.com/first.jpg,https://example.com/page,third,fourth,https://example.com/last.jpg',
    );
  });

  it('uses the link URL rather than a linked image or label', () => {
    const section = renderSection(`
      <tr><td>Source</td><td>
        <a href="https://example.com/page"><img src="https://example.com/image.jpg">Label</a>
      </td></tr>
    `);
    expect(section.dataset.source).to.equal('https://example.com/page');
  });

  it('preserves browser resolution of relative metadata URLs', () => {
    const section = renderSection(`
      <tr><td>Source</td><td><a href="./page">Label</a></td></tr>
      <tr><td>Image</td><td><img src="./image.jpg"></td></tr>
    `);
    expect(section.dataset.source).to.equal(new URL('./page', document.baseURI).href);
    expect(section.dataset.image).to.equal(new URL('./image.jpg', document.baseURI).href);
  });

  it('resolves metadata URLs against the supplied DA preview page', () => {
    const url = 'https://main--site--org.preview.da.live/en/products/page';
    const section = renderSection(`
      <tr><td>Source</td><td><a href="./related?view=full#details">Label</a></td></tr>
      <tr><td>Image</td><td><img src="./image.jpg"></td></tr>
      <tr><td>Root</td><td><a href="/root">Root</a></td></tr>
      <tr><td>External</td><td><a href="https://example.com/page">External</a></td></tr>
    `, { url });
    expect(section.dataset.source).to.equal(
      'https://main--site--org.preview.da.live/en/products/related?view=full#details',
    );
    expect(section.dataset.image).to.equal(
      'https://main--site--org.preview.da.live/en/products/image.jpg',
    );
    expect(section.dataset.root).to.equal('https://main--site--org.preview.da.live/root');
    expect(section.dataset.external).to.equal('https://example.com/page');
  });

  it('uses a supplied local preview URL without changing its protocol or port', () => {
    const section = renderSection(`
      <tr><td>Source</td><td><a href="./related">Label</a></td></tr>
    `, { url: 'http://localhost:3001/en/page' });
    expect(section.dataset.source).to.equal('http://localhost:3001/en/related');
  });

  it('defaults to the site preview host and content path from the DA location', () => {
    const originalUrl = window.location.href;
    const originalName = window.name;
    history.replaceState(null, '', '/edit#/org/site/en/products/page');
    try {
      const section = renderSection(`
        <tr><td>Source</td><td><a href="./related">Label</a></td></tr>
        <tr><td>Image</td><td><img src="./image.jpg"></td></tr>
        <tr><td>Page</td><td><a href="https://main--site--org.aem.page/other">Page</a></td></tr>
        <tr><td>Live</td><td><a href="https://main--site--org.aem.live/other">Live</a></td></tr>
      `);
      const origin = getLivePreviewUrl('org', 'site');
      expect(section.dataset.source).to.equal(`${origin}/en/products/related`);
      expect(section.dataset.image).to.equal(`${origin}/en/products/image.jpg`);
      expect(section.dataset.page).to.equal(`${origin}/other`);
      expect(section.dataset.live).to.equal(`${origin}/other`);
    } finally {
      history.replaceState(null, '', originalUrl);
      window.name = originalName;
    }
  });

  it('forwards the preview page URL through cursor serialization', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Source</td><td><a href="./related">Label</a></td></tr>
        </table>
      </div>
    `);
    const original = editor.innerHTML;
    const view = {
      dom: editor,
      state: { selection: { from: 1 } },
      domAtPos: () => ({ node: editor.querySelector('p').firstChild, offset: 0 }),
    };
    const url = 'https://main--site--org.preview.da.live/en/page';
    const main = parseMain(getHtmlWithCursor(view, { url }));
    expect(main.querySelector(':scope > div').dataset.source).to.equal(
      'https://main--site--org.preview.da.live/en/related',
    );
    expect(main.querySelector('#da-cursor-position')).to.exist;
    expect(editor.innerHTML).to.equal(original);
  });

  it('skips rows with no value column or an empty key', () => {
    const section = renderSection(`
      <tr><td>Style</td></tr>
      <tr><td></td><td>value</td></tr>
    `);
    expect(section.attributes.length).to.equal(0);
  });

  it('applies style value as CSS class on the parent section', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Style</td><td>highlight</td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    const section = main.querySelector(':scope > div');
    expect(section.classList.contains('highlight')).to.be.true;
  });

  it('applies multiple style classes from comma-separated values', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Style</td><td>divider, light</td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    const section = main.querySelector(':scope > div');
    expect(section.classList.contains('divider')).to.be.true;
    expect(section.classList.contains('light')).to.be.true;
    expect(section.classList.contains('divider-light')).to.be.false;
  });

  it('removes the section-metadata block from the output', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Style</td><td>highlight</td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    expect(main.querySelector('.section-metadata')).to.not.exist;
  });

  it('sets non-style keys as data attributes on the parent section', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Background</td><td>dark</td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    const section = main.querySelector(':scope > div');
    expect(section.dataset.background).to.equal('dark');
  });

  it('uses link href as the data attribute value when the cell contains a link', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Source</td><td><a href="https://example.com/page">Label</a></td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    const section = main.querySelector(':scope > div');
    expect(section.dataset.source).to.equal('https://example.com/page');
  });

  it('uses image src as the data attribute value when the cell contains an image', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Image</td><td><img src="https://example.com/bg.jpg"></td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, true, false));
    const section = main.querySelector(':scope > div');
    expect(section.dataset.image).to.equal('https://example.com/bg.jpg');
  });

  it('does not apply section metadata when livePreview is false', () => {
    const editor = makeEditor(`
      <p>Content</p>
      <div class="tableWrapper">
        <table>
          <tr><td>Section Metadata</td></tr>
          <tr><td>Style</td><td>highlight</td></tr>
        </table>
      </div>
    `);
    const main = parseMain(prose2aem(editor, false, false));
    const section = main.querySelector(':scope > div');
    expect(main.querySelector('.section-metadata')).to.exist;
    expect(section.classList.contains('highlight')).to.be.false;
  });
});

describe('prose2aem with isFragment parameter', () => {
  let originalDoc;

  before(async () => {
    // Reload the HTML for fragment tests
    const htmlStr = await readFile({ path: './mocks/prose2aem.html' });
    originalDoc = new DOMParser().parseFromString(htmlStr, 'text/html');
  });

  it('Returns HTML string when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = '<div class="tableWrapper"><table><tr><td>Test</td></tr></table></div>';

    const result = prose2aem(fragment, true, true);

    expect(typeof result).to.equal('string');
    expect(result).to.be.a('string');
  });

  it('Returns full HTML document when isFragment is false', () => {
    const newDoc = originalDoc.cloneNode(true);
    const result = prose2aem(newDoc.body, true, false);

    expect(typeof result).to.equal('string');
    expect(result).to.include('<body>');
    expect(result).to.include('</body>');
  });

  it('Converts blocks correctly in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tr><td>marquee (light)</td></tr>
          <tr><td>Content here</td></tr>
        </table>
      </div>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('class="marquee light"');
    expect(result).to.include('Content here');
  });

  it('Does not create sections when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>First paragraph</p>
      <hr>
      <p>Second paragraph</p>
    `;

    const result = prose2aem(fragment, true, true);

    // Should not wrap content in sections
    expect(result).to.not.include('<div>');
    expect(result).to.include('<p>First paragraph</p>');
    expect(result).to.include('<p>Second paragraph</p>');
  });

  it('Creates sections when isFragment is false', () => {
    const newDoc = originalDoc.cloneNode(true);
    const result = prose2aem(newDoc.body, true, false);

    // Should include section divs
    expect(result).to.include('<div>');
  });

  it('Does not remove class attribute when isFragment is true', () => {
    const fragment = document.createElement('div');
    fragment.className = 'test-fragment';
    fragment.innerHTML = '<p>Content</p>';

    const result = prose2aem(fragment, true, true);

    // Class should remain on the fragment in isFragment mode
    expect(result).to.include('Content');
  });

  it('Processes table blocks correctly in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tr><td>columns (contained)</td></tr>
          <tr>
            <td><p>Column 1</p></td>
            <td><p>Column 2</p></td>
          </tr>
        </table>
      </div>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('class="columns contained"');
    expect(result).to.include('Column 1');
    expect(result).to.include('Column 2');
  });

  it('Handles empty fragment', () => {
    const fragment = document.createElement('div');

    const result = prose2aem(fragment, true, true);

    expect(result).to.equal('');
  });

  it('Preserves all images in each column when a column block has 3 columns with multiple images per column', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <div class="tableWrapper">
        <table>
          <tr><td>columns</td></tr>
          <tr>
            <td><p><img src="col1-img1.jpg"><img src="col1-img2.jpg"><img src="col1-img3.jpg"></p></td>
            <td><p><img src="col2-img1.jpg"><img src="col2-img2.jpg"><img src="col2-img3.jpg"></p></td>
            <td><p><img src="col3-img1.jpg"><img src="col3-img2.jpg"><img src="col3-img3.jpg"></p></td>
          </tr>
        </table>
      </div>
    `;

    const result = prose2aem(fragment, true, true);

    const container = document.createElement('div');
    container.innerHTML = result;

    const block = container.querySelector('.columns');
    expect(block).to.exist;

    const colDivs = block.querySelectorAll(':scope > div > div');
    expect(colDivs.length).to.equal(3);

    colDivs.forEach((col, i) => {
      const pictures = col.querySelectorAll('picture');
      expect(pictures.length, `column ${i + 1} should have 3 pictures`).to.equal(3);
    });
  });

  it('Preserves pictures in fragment mode', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <span class="img-wrapper">
          <img src="test.jpg" alt="Test image">
        </span>
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('<picture>');
    expect(result).to.include('alt="Test image"');
  });

  it('Converts focal point attributes to data-title', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <img src="test.jpg" data-focal-x="30.5" data-focal-y="70.2">
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.include('data-title="data-focal:30.5,70.2"');
  });

  it('Unwraps focal point image wrappers', () => {
    const fragment = document.createElement('div');
    fragment.innerHTML = `
      <p>
        <span class="focal-point-image-wrapper">
          <img src="test.jpg" data-focal-x="30.5" data-focal-y="70.2">
          <span class="focal-point-icon"></span>
        </span>
      </p>
    `;

    const result = prose2aem(fragment, true, true);

    expect(result).to.not.include('focal-point-image-wrapper');
    expect(result).to.not.include('focal-point-icon');
    expect(result).to.include('<picture>');
    expect(result).to.include('data-title="data-focal:30.5,70.2"');
  });
});

describe('prose2aem same-site URL conversion', () => {
  function makeEditor(innerHtml) {
    const editor = document.createElement('div');
    editor.innerHTML = innerHtml;
    return editor;
  }

  let originalHash;

  before(() => {
    originalHash = window.location.hash;
  });

  after(() => {
    window.location.hash = originalHash;
  });

  it('converts same-site URLs to relative when livePreview=true', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/fragments/tabs-homepage">Fragment</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('/fragments/tabs-homepage');
  });

  it('does not convert URLs when livePreview=false', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/fragments/tabs-homepage">Fragment</a></p>
    `);

    prose2aem(editor, false, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('https://main--repo--org.aem.live/fragments/tabs-homepage');
  });

  it('converts same-site URLs with nested paths', () => {
    window.location.hash = '#/org/site/path';
    const editor = makeEditor(`
      <p><a href="https://main--site--org.aem.live/en/fragments/footer">Fragment</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('/en/fragments/footer');
  });

  it('preserves search params and hash in converted URLs', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/fragments/tabs?param=value#section">Fragment</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('/fragments/tabs?param=value#section');
  });

  it('converts same-site non-fragment URLs to relative', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/products/page">Regular page</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('/products/page');
  });

  it('does not convert cross-site URLs', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--otherrepo--otherorg.aem.live/fragments/something">Different site</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('https://main--otherrepo--otherorg.aem.live/fragments/something');
  });

  it('does not convert non-EDS URLs', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://example.com/fragments/something">External</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('https://example.com/fragments/something');
  });

  it('converts both .aem.live and .aem.page same-site URLs', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/fragments/hero">Fragment 1</a></p>
      <p><a href="https://main--repo--org.aem.page/fragments/footer">Fragment 2</a></p>
    `);

    prose2aem(editor, true, false);
    const links = editor.querySelectorAll('a');

    expect(links[0].getAttribute('href')).to.equal('/fragments/hero');
    expect(links[1].getAttribute('href')).to.equal('/fragments/footer');
  });

  it('handles relative URLs without conversion', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="/fragments/tabs">Fragment</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('/fragments/tabs');
  });

  it('handles invalid URLs gracefully', () => {
    window.location.hash = '#/org/repo/path';
    const editor = makeEditor(`
      <p><a href="not-a-valid-url">Invalid</a></p>
    `);

    expect(() => prose2aem(editor, true, false)).to.not.throw();
    const link = editor.querySelector('a');
    expect(link.getAttribute('href')).to.equal('not-a-valid-url');
  });

  it('does not convert when org/site not in hash', () => {
    window.location.hash = '';
    const editor = makeEditor(`
      <p><a href="https://main--repo--org.aem.live/fragments/tabs">Fragment</a></p>
    `);

    prose2aem(editor, true, false);
    const link = editor.querySelector('a');

    expect(link.getAttribute('href')).to.equal('https://main--repo--org.aem.live/fragments/tabs');
  });
});
