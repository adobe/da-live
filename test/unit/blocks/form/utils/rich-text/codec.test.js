/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import { createEngine, convertJsonToHtml, convertHtmlToJson } from '../../../../../../deps/da-sc-sdk/dist/index.js';
import { createSchema } from '../../../../../../blocks/form/utils/rich-text/schema.js';
import { createRichTextCodec } from '../../../../../../blocks/form/utils/rich-text/codec.js';
import { safeHref } from '../../../../../../blocks/form/utils/safe-href.js';

const schema = createSchema(proseMirror);
const { parse, serialize } = createRichTextCodec({ proseMirror, schema });
const roundTrip = (value) => serialize(parse(value));

const sdkSchema = { type: 'object', properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } } };
const sdkWrites = (body) => {
  const json = { metadata: { schemaName: 'x' }, data: { body } };
  const { model } = createEngine({ schema: sdkSchema, document: json }).getState();
  return convertJsonToHtml({ json, model }).html;
};
const sdkStores = (body) => convertHtmlToJson({ html: sdkWrites(body) }).json.data.body ?? '';

describe('rich-text codec', () => {
  describe('parse and serialize', () => {
    it('keeps the supported markup unchanged', () => {
      const html = '<p>A <strong>bold</strong>, <em>em</em>, <u>u</u>, <del>s</del> and <a href="https://x.y">link</a>.</p>'
        + '<ul><li><p>one</p><ol><li><p>nested</p></li></ol></li><li><p>two</p></li></ul><p>a<br>b</p>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('normalizes equivalent tags', () => {
      expect(roundTrip('<p><b>b</b><i>i</i><strike>s</strike><del>d</del></p>'))
        .to.equal('<p><strong>b</strong><em>i</em><del>sd</del></p>');
    });

    it('nests marks', () => {
      expect(roundTrip('<p><strong><a href="/a">x</a></strong></p>'))
        .to.equal('<p><strong><a href="/a">x</a></strong></p>');
      expect(roundTrip('<p><strong>a<em>b</em></strong><em>c</em></p>'))
        .to.equal('<p><strong>a</strong><em><strong>b</strong>c</em></p>');
    });

    it('keeps links to the same page and relative links', () => {
      const value = '<p><a href="#section">a</a> <a href="/page#section">b</a> <a href="?q=1">c</a> '
        + '<a href="/fragments/footer">d</a> <a href="/page#_blank">e</a> '
        + '<a href="https://www.youtube.com/watch?v=x">f</a></p>';
      expect(roundTrip(value)).to.equal(value);
      expect(sdkStores(value)).to.equal(value);
    });

    it('drops unsafe links and active content', () => {
      expect(roundTrip('<p><a href="javascript:x()">t</a><img src=x onerror="x()"><script>x()</script></p>'))
        .to.equal('<p>t</p>');
    });

    it('keeps custom app links and drops Follina-style links', () => {
      const value = '<p><a href="myprotocol://open/1">a</a> <a href="ms-msdt:/id x">b</a> '
        + '<a href="search-ms:query=x">c</a></p>';
      const expected = '<p><a href="myprotocol://open/1">a</a> b c</p>';
      expect(roundTrip(value)).to.equal(expected);
      expect(sdkStores(value)).to.equal(expected);
    });

    it('drops script links hidden with HTML entities', () => {
      const value = '<p><a href="&#106;avascript:x()">a</a><a href="jav&#x09;ascript:x()">b</a>'
        + '<a href="javascript&colon;x()">c</a></p>';
      expect(roundTrip(value)).to.equal('<p>abc</p>');
      expect(sdkStores(value)).to.equal('<p>abc</p>');
    });

    it('keeps nothing that runs script', () => {
      const payloads = [
        '<script>x()</script>',
        '<img src=x onerror=x()>',
        '<svg onload=x()><script>x()</script></svg>',
        '<iframe src="javascript:x()"></iframe>',
        '<object data="javascript:x()"></object>',
        '<embed src="data:text/html,<script>x()</script>">',
        '<p onclick="x()" style="background:url(javascript:x())">a</p>',
        '<a href="javascript:x()" onmouseover="x()">a</a>',
        '<a href="data:text/html;base64,PHNjcmlwdD54KCk8L3NjcmlwdD4=">a</a>',
        '<a href="vbscript:x">a</a>',
        ...['\u00a0', '\ufeff', '\u2003', '\u3000', '\u2028']
          .map((space) => `<a href="${space}javascript:x()">a</a>`),
        '<a href="/a" target="_blank" rel="opener">a</a>',
        '<form action="javascript:x()"><button formaction="javascript:x()">a</button></form>',
        '<input autofocus onfocus=x()>',
        '<details open ontoggle=x()><summary>a</summary></details>',
        '<math><a xlink:href="javascript:x()">a</a></math>',
        '<meta http-equiv="refresh" content="0;url=javascript:x()">',
        '<base href="javascript:x()//">',
        '<style>@import "javascript:x()";</style>',
        '<template><script>x()</script></template>',
        '<noscript><p title="</noscript><img src=x onerror=x()>"></noscript>',
        '<p title="a&quot; onclick=&quot;x()">a</p>',
        '<a href="/a" title=\'"><script>x()</script>\'>a</a>',
        '<!--<img src=x onerror=x()>-->',
        '<![CDATA[<script>x()</script>]]>',
      ];
      const allowed = new Set(['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'BLOCKQUOTE', 'UL', 'OL', 'LI',
        'BR', 'A', 'STRONG', 'EM', 'U', 'DEL', 'SUB', 'SUP', 'CODE']);
      const expectHarmless = (html, payload) => {
        const { body } = new DOMParser().parseFromString(html, 'text/html');
        body.querySelectorAll('*').forEach((element) => {
          expect(allowed.has(element.tagName), `${payload} keeps ${element.tagName}`).to.be.true;
          const names = element.getAttributeNames();
          const allowedNames = element.tagName === 'A' ? ['href', 'title'] : [];
          expect(names.every((name) => allowedNames.includes(name)), `${payload} keeps ${names}`).to.be.true;
          if (element.tagName === 'A') {
            expect(safeHref(element.getAttribute('href')), payload).to.not.equal(null);
          }
        });
      };
      payloads.forEach((payload) => {
        expectHarmless(roundTrip(payload), payload);
        expectHarmless(sdkStores(payload), payload);
        const { body } = new DOMParser().parseFromString(sdkWrites(payload), 'text/html');
        body.querySelectorAll('a[href]').forEach((link) => {
          expect(safeHref(link.getAttribute('href')), `${payload} writes ${link.getAttribute('href')}`).to.not.equal(null);
        });
      });
    });

    it('flattens unsupported blocks into paragraphs', () => {
      expect(roundTrip('<section>Title</section><div>Body</div><pre>x</pre>'))
        .to.equal('<p>Title</p><p>Body</p><p>x</p>');
    });

    it('reads a code block as a paragraph with its line breaks', () => {
      ['<pre><code>a\nb  c</code></pre>', '<pre>a <strong>b</strong>\nc</pre>'].forEach((value) => {
        expect(roundTrip(value)).to.equal(sdkStores(value));
      });
      expect(roundTrip('<pre><code>a\nb  c</code></pre>')).to.equal('<p>a<br>b c</p>');
    });

    it('keeps headings and blockquotes', () => {
      const html = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>'
        + '<blockquote><p>Quote</p><h2>Head</h2><ul><li><p>item</p></li></ul><blockquote><p>Nested</p></blockquote></blockquote>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('keeps inline code, superscript and subscript', () => {
      const html = '<p><code>x()</code> E=mc<sup>2</sup> H<sub>2</sub>O <strong><code>b</code></strong></p>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('does not combine superscript and subscript', () => {
      expect(roundTrip('<p><sup><sub>x</sub></sup></p>')).to.equal('<p><sub>x</sub></p>');
    });

    it('escapes text and attributes', () => {
      expect(roundTrip('<p>a &amp; &lt;b&gt; <a href="/?a=1&amp;b=&quot;2&quot;">l</a></p>'))
        .to.equal('<p>a &amp; &lt;b&gt; <a href="/?a=1&amp;b=&quot;2&quot;">l</a></p>');
    });

    it('converts plain text into paragraphs', () => {
      expect(roundTrip('line 1\nline 2\n\npara 2')).to.equal('<p>line 1<br>line 2</p><p>para 2</p>');
      expect(roundTrip('a < b')).to.equal('<p>a &lt; b</p>');
    });

    it('reads a less-than sign in plain text', () => {
      expect(roundTrip('if a<b then c')).to.equal('<p>if a&lt;b then c</p>');
      expect(sdkStores('if a<b then c')).to.equal('<p>if a&lt;b then c</p>');
    });

    it('serializes content without text as an empty string', () => {
      expect(roundTrip('')).to.equal('');
      expect(roundTrip(undefined)).to.equal('');
      expect(roundTrip('<p> </p><p><br></p><ul><li></li></ul>')).to.equal('');
    });
  });

  describe('schema', () => {
    it('drops unsafe links from markup that skips the sanitizer, like a paste', () => {
      const { body } = new DOMParser().parseFromString('<p><a href="javascript:x()">a</a><a href="/b" title=" T ">b</a></p>', 'text/html');
      const richTextDocument = proseMirror.DOMParser.fromSchema(schema).parse(body);
      expect(serialize(richTextDocument)).to.equal('<p>a<a href="/b" title="T">b</a></p>');
    });

    it('reads a numbered list without its start number', () => {
      expect(roundTrip('<ol start="3"><li>a</li></ol>')).to.equal('<ol><li><p>a</p></li></ol>');
    });

    it('keeps normal text normal when Google Docs wraps a paste in bold', () => {
      const paste = '<b style="font-weight:normal;"><p><span style="font-weight:400">a</span> <span style="font-weight:700">b</span></p></b>';
      expect(roundTrip(paste)).to.equal('<p>a <strong>b</strong></p>');
    });
  });

  describe('stored form', () => {
    const text = (value, marks = []) => ({ type: 'text', text: value, marks: marks.map((type) => (typeof type === 'string' ? { type } : type)) });
    const inline = (content) => content.map((item) => (typeof item === 'string' ? text(item) : item));
    const paragraph = (...content) => ({ type: 'paragraph', content: inline(content) });
    const heading = (level, ...content) => ({ type: 'heading', attrs: { level }, content: inline(content) });
    const hardBreak = { type: 'hard_break' };
    const listItem = (...content) => ({ type: 'list_item', content });
    const bulletList = (...content) => ({ type: 'bullet_list', content });
    const orderedList = (...content) => ({ type: 'ordered_list', content });
    const quote = (...content) => ({ type: 'blockquote', content });
    const link = (href, title = null) => ({ type: 'link', attrs: { href, title } });
    const documentOf = (content) => schema.nodeFromJSON({ type: 'doc', content });

    const canonical = {
      'an empty field': [paragraph()],
      'escaped characters': [paragraph('<a> & "q" \'s\'')],
      'non-breaking spaces': [paragraph('a\u00a0b')],
      'overlapping marks': [paragraph(text('a', ['strong']), text('b', ['strong', 'em']), text('c', ['em']))],
      'stacked marks in a titled link': [paragraph(text('x', [link('/a', 'A "b" & <c>'), 'strong', 'code']))],
      'scripts in links': [paragraph(text('x', [link('/a'), 'sup']))],
      'inner line breaks': [paragraph('a', hardBreak, hardBreak, 'b'), bulletList(listItem(paragraph('c', hardBreak, 'd')))],
      'nested lists': [bulletList(listItem(paragraph('a'), orderedList(listItem(paragraph('b'), bulletList(listItem(paragraph(text('c', ['em']))))))))],
      'quotes with lists': [quote(paragraph('q'), bulletList(listItem(paragraph('i'))), quote(paragraph('n')))],
      'heading marks': [heading(3, text('H', ['u', 'del']))],
      unicode: [paragraph('emoji 😀 ümlaut')],
    };

    const transient = {
      'repeated spaces': [paragraph('a  b')],
      tabs: [paragraph('a\tb')],
      'edge spaces': [paragraph(' a '), paragraph(text('x  y', ['code']))],
      'edge non-breaking spaces': [paragraph('\u00a0a\u2003')],
      'empty blocks': [paragraph('a'), paragraph(), heading(2), bulletList(listItem(paragraph('b')), listItem(paragraph()))],
      'edge line breaks': [paragraph(hardBreak, 'a', hardBreak)],
      'marks on spaces': [paragraph('a', text(' ', ['strong']), text(' ', [link('/x')]), 'b')],
      'a space after a break': [paragraph('a', hardBreak, ' b')],
      'a leading space in a mark': [paragraph(text(' a', ['strong']))],
      'a space split across a mark': [paragraph('a ', text(' b', ['em']))],
      'a trailing space in a mark before a break': [paragraph(text('a ', ['em']), hardBreak)],
    };

    const visibleText = (richTextDocument) => richTextDocument
      .textBetween(0, richTextDocument.content.size, ' ', ' ')
      .replace(/\s+/g, ' ')
      .trim();

    Object.entries(canonical).forEach(([name, content]) => {
      it(`reloads ${name} unchanged from what the SDK stores`, () => {
        const richTextDocument = documentOf(content);
        expect(parse(sdkStores(serialize(richTextDocument))).eq(richTextDocument)).to.be.true;
      });
    });

    Object.entries(transient).forEach(([name, content]) => {
      it(`keeps the text of ${name} when the SDK stores it`, () => {
        const richTextDocument = documentOf(content);
        const stored = parse(sdkStores(serialize(richTextDocument)));
        expect(visibleText(stored)).to.equal(visibleText(richTextDocument));
      });
    });

    it('nests every pair of marks and reloads them unchanged', () => {
      const names = Object.keys(schema.marks);
      const mark = (name) => (name === 'link' ? link('/a') : name);
      const pairs = names.flatMap((outer) => names.map((inner) => [outer, inner]))
        .filter(([outer, inner]) => !schema.marks[outer].excludes(schema.marks[inner]));
      expect(pairs).to.have.length(54);
      pairs.forEach(([outer, inner]) => {
        const both = [mark(outer), mark(inner)];
        const sameText = serialize(documentOf([paragraph(text('z', both))]));
        expect(sdkStores(sameText), `${outer} with ${inner}`).to.equal(sameText);
        const richTextDocument = documentOf([paragraph(text('x', [mark(outer)]), text('y', both))]);
        const reloaded = parse(sdkStores(serialize(richTextDocument)));
        expect(reloaded.eq(richTextDocument), `${outer} over ${inner}`).to.be.true;
      });
    });
  });
});
