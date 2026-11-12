/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import { createEngine, convertJsonToHtml, convertHtmlToJson } from '../../../../../../deps/da-sc-sdk/dist/index.js';
import { createSchema } from '../../../../../../blocks/form/utils/rich-text/schema.js';
import { createRichTextCodec } from '../../../../../../blocks/form/utils/rich-text/codec.js';

const schema = createSchema(proseMirror);
const { parse, serialize } = createRichTextCodec({ proseMirror, schema });
const roundTrip = (value) => serialize(parse(value));

const sdkSchema = { type: 'object', properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } } };
const sdkStores = (body) => {
  const json = { metadata: { schemaName: 'x' }, data: { body } };
  const { model } = createEngine({ schema: sdkSchema, document: json }).getState();
  const { html } = convertJsonToHtml({ json, model });
  return convertHtmlToJson({ html }).json.data.body ?? '';
};

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

    it('nests marks like the SDK', () => {
      expect(roundTrip('<p><strong><a href="/a">x</a></strong></p>'))
        .to.equal('<p><strong><a href="/a">x</a></strong></p>');
      expect(roundTrip('<p><strong>a<em>b</em></strong><em>c</em></p>'))
        .to.equal('<p><strong>a</strong><em><strong>b</strong>c</em></p>');
    });

    it('drops unsafe links and active content', () => {
      expect(roundTrip('<p><a href="javascript:x()">t</a><img src=x onerror="x()"><script>x()</script></p>'))
        .to.equal('<p>t</p>');
    });

    it('flattens unsupported blocks into paragraphs', () => {
      expect(roundTrip('<section>Title</section><div>Body</div><pre>x</pre>'))
        .to.equal('<p>Title</p><p>Body</p><p>x</p>');
    });

    it('reads a code block as a paragraph with its line breaks like the SDK', () => {
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

    it('reads a less-than sign in plain text like the SDK', () => {
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

    it('reads a numbered list without its start number like the SDK', () => {
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

    it('nests every pair of marks like the SDK and reloads them unchanged', () => {
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
