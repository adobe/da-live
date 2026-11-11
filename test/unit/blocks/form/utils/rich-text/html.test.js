/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import { createEngine, convertJsonToHtml, convertHtmlToJson } from '../../../../../../deps/da-sc-sdk/dist/index.js';
import { SCHEMA_SPEC } from '../../../../../../blocks/form/utils/rich-text/schema.js';
import { parseRichText, serializeRichText, getCanonicalChange } from '../../../../../../blocks/form/utils/rich-text/html.js';

const schema = new proseMirror.Schema(SCHEMA_SPEC);
const parse = (value) => parseRichText({ proseMirror, schema, value });
const roundTrip = (value) => serializeRichText({ richTextDocument: parse(value) });

const sdkSchema = { type: 'object', properties: { body: { type: 'string', 'x-semantic-type': 'rich-text' } } };
const sdkStores = (body) => {
  const json = { metadata: { schemaName: 'x' }, data: { body } };
  const { model } = createEngine({ schema: sdkSchema, document: json }).getState();
  const { html } = convertJsonToHtml({ json, model });
  return convertHtmlToJson({ html }).json.data.body ?? '';
};
const rawHtml = (richTextDocument) => {
  const container = document.createElement('div');
  const serializer = proseMirror.DOMSerializer.fromSchema(schema);
  container.append(serializer.serializeFragment(richTextDocument.content));
  return container.innerHTML;
};

describe('rich-text html', () => {
  describe('parse and serialize', () => {
    it('keeps the canonical subset unchanged', () => {
      const html = '<p>A <strong>bold</strong>, <em>em</em>, <u>u</u>, <s>s</s> and <a href="https://x.y">link</a>.</p>'
        + '<ul><li>one<ol><li>nested</li></ol></li><li>two</li></ul><p>a<br>b</p>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('normalizes equivalent tags', () => {
      expect(roundTrip('<p><b>b</b><i>i</i><strike>s</strike><del>d</del></p>'))
        .to.equal('<p><strong>b</strong><em>i</em><s>sd</s></p>');
    });

    it('keeps a trimmed link title', () => {
      expect(roundTrip('<p><a href="/a" title="  A  &quot;b&quot;\n c ">x</a><a href="/b" title=" ">y</a></p>'))
        .to.equal('<p><a href="/a" title="A &quot;b&quot; c">x</a><a href="/b">y</a></p>');
      expect(roundTrip('<p><a href="/a" title="t">x</a><a href="/a">y</a></p>'))
        .to.equal('<p><a href="/a" title="t">x</a><a href="/a">y</a></p>');
    });

    it('nests marks with links outermost', () => {
      expect(roundTrip('<p><strong><a href="/a">x</a></strong></p>'))
        .to.equal('<p><a href="/a"><strong>x</strong></a></p>');
      expect(roundTrip('<p><strong>a<em>b</em></strong><em>c</em></p>'))
        .to.equal('<p><strong>a<em>b</em></strong><em>c</em></p>');
    });

    it('drops unsafe links and active content', () => {
      expect(roundTrip('<p><a href="javascript:x()">t</a><img src=x onerror="x()"><script>x()</script></p>'))
        .to.equal('<p>t</p>');
    });

    it('flattens unsupported blocks into paragraphs', () => {
      expect(roundTrip('<section>Title</section><div>Body</div><pre>x</pre>'))
        .to.equal('<p>Title</p><p>Body</p><p>x</p>');
    });

    it('keeps headings and blockquotes', () => {
      const html = '<h1>One</h1><h2>Two</h2><h3>Three</h3><h4>Four</h4><h5>Five</h5><h6>Six</h6>'
        + '<blockquote><p>Quote</p><h2>Head</h2><ul><li>item</li></ul><blockquote><p>Nested</p></blockquote></blockquote>';
      expect(roundTrip(html)).to.equal(html);
    });

    it('drops empty headings and blockquotes', () => {
      expect(roundTrip('<h2> </h2><blockquote><p><br></p></blockquote><p>a</p>')).to.equal('<p>a</p>');
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

    it('produces values the SDK keeps unchanged', () => {
      const values = [
        '<h2>Title</h2><p><a href="/a"><strong>b<em>i</em></strong></a> <u>u</u><s>s</s></p>',
        '<blockquote><p>q<sup>1</sup></p><ol><li>a<ul><li>b</li></ul></li></ol></blockquote>',
        '<p>H<sub>2</sub>O <code>c</code><br>next</p>',
        '<p><a href="/a" title="A &quot;b&quot; &amp; &lt;c&gt;">l</a></p>',
      ];
      values.forEach((value) => {
        const body = roundTrip(value);
        expect(sdkStores(body)).to.equal(body);
      });
    });

    it('serializes empty content as an empty string', () => {
      expect(roundTrip('')).to.equal('');
      expect(roundTrip(undefined)).to.equal('');
      expect(roundTrip('<p> </p><p><br></p><ul><li></li></ul>')).to.equal('');
    });

    it('trims edge whitespace and breaks', () => {
      expect(roundTrip('<p><br> a  b <br></p>')).to.equal('<p>a b</p>');
    });

    it('trims non-breaking and em spaces at the edges like the SDK', () => {
      const value = '<p>\u00a0\u2003a\u00a0b\u2003\u00a0</p>';
      expect(roundTrip(value)).to.equal('<p>a\u00a0b</p>');
      expect(sdkStores(value)).to.equal('<p>a\u00a0b</p>');
    });
  });

  describe('schema', () => {
    it('drops unsafe links from markup that skips the sanitizer, like a paste', () => {
      const { body } = new DOMParser().parseFromString('<p><a href="javascript:x()">a</a><a href="/b" title=" T ">b</a></p>', 'text/html');
      const richTextDocument = proseMirror.DOMParser.fromSchema(schema).parse(body);
      expect(serializeRichText({ richTextDocument })).to.equal('<p>a<a href="/b" title="T">b</a></p>');
    });
  });

  describe('canonical change', () => {
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
    const normalize = (richTextDocument) => {
      const change = getCanonicalChange({ proseMirror, richTextDocument });
      if (!change) return richTextDocument;
      return richTextDocument.replace(change.from, change.to, change.slice);
    };
    const stored = (richTextDocument) => parse(serializeRichText({ richTextDocument }));

    const canonical = {
      'an empty field': [paragraph()],
      'escaped characters': [paragraph('<a> & "q" \'s\'')],
      'non-breaking spaces': [paragraph('a\u00a0b')],
      'overlapping marks': [paragraph(text('a', ['strong']), text('b', ['strong', 'em']), text('c', ['em']))],
      'stacked marks in a titled link': [paragraph(text('x', [link('/a', 'T'), 'strong', 'code']))],
      'scripts in links': [paragraph(text('x', [link('/a'), 'sup']))],
      'inner line breaks': [paragraph('a', hardBreak, hardBreak, 'b'), bulletList(listItem(paragraph('c', hardBreak, 'd')))],
      'nested lists': [bulletList(listItem(paragraph('a'), orderedList(listItem(paragraph('b'), bulletList(listItem(paragraph(text('c', ['em']))))))))],
      'quotes with lists': [quote(paragraph('q'), bulletList(listItem(paragraph('i'))), quote(paragraph('n')))],
      'heading marks': [heading(3, text('H', ['u', 's']))],
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

    const visibleText = (html) => new DOMParser()
      .parseFromString(html.replaceAll('<br>', '\n'), 'text/html')
      .body.textContent.replace(/\s+/g, ' ').trim();

    Object.entries({ ...canonical, ...transient }).forEach(([name, content]) => {
      it(`stores ${name} in a form the SDK and a reload keep`, () => {
        const richTextDocument = documentOf(content);
        const value = serializeRichText({ richTextDocument });
        expect(sdkStores(value)).to.equal(value);
        expect(roundTrip(value)).to.equal(value);
        expect(visibleText(value)).to.equal(visibleText(sdkStores(rawHtml(richTextDocument))));
      });
    });

    Object.entries(canonical).forEach(([name, content]) => {
      it(`leaves ${name} unchanged`, () => {
        const richTextDocument = documentOf(content);
        expect(getCanonicalChange({ proseMirror, richTextDocument })).to.equal(null);
        expect(stored(richTextDocument).eq(richTextDocument)).to.be.true;
      });
    });

    Object.entries(transient).forEach(([name, content]) => {
      it(`replaces ${name} with what is stored`, () => {
        const richTextDocument = documentOf(content);
        const shown = normalize(richTextDocument);
        expect(shown.eq(richTextDocument)).to.be.false;
        expect(shown.eq(stored(richTextDocument))).to.be.true;
        expect(stored(shown).eq(shown)).to.be.true;
        const expected = serializeRichText({ richTextDocument });
        expect(serializeRichText({ richTextDocument: shown })).to.equal(expected);
      });
    });

    it('replaces only the differing range', () => {
      const richTextDocument = documentOf([paragraph('keep'), paragraph(), paragraph('also')]);
      const { from, to } = getCanonicalChange({ proseMirror, richTextDocument });
      expect(richTextDocument.textBetween(0, from)).to.equal('keep');
      expect(richTextDocument.textBetween(to, richTextDocument.content.size)).to.equal('also');
    });
  });
});
