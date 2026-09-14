import { expect } from '@esm-bundle/chai';
import { baseSchema, Slice } from 'da-y-wrapper';
import { setNx } from '../../../../../../scripts/utils.js';

// Seed nx so the dynamic import inside showSpaceNormalizationDialog (triggered
// by the non-standard-space tests) resolves against the test fixture instead
// of failing with "Failed to resolve module specifier 'undefined/...'".
setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { default: sectionPasteHandler } = await import('../../../../../../blocks/edit/prose/plugins/sectionPasteHandler.js');

function normalizeHTML(html) {
  return html.replace(/[\n\s]+/g, ' ').replace(/></g, '> <').trim();
}

describe('Section paste handler', () => {
  it('Test paste from desktop Word inserts hr elements', () => {
    const plugin = sectionPasteHandler();
    const wordPasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="ProgId" content="Word.Document">
  </head>
  <body>
    <div>Section 1</div>
    <div>Section 2</div>
    <p>Section 3</p>
  </body>
</html>`;

    const result = normalizeHTML(wordPasteHandler(inputHTML));

    // transformPastedHTML returns the body content only; note the added <hr> tags.
    const expectedHTML = '<div>Section 1</div> <hr> <div>Section 2</div> <hr> <p>Section 3</p>';
    expect(result).to.equal(expectedHTML);
  });

  it('Test paste from desktop Word no hr after last element', () => {
    const plugin = sectionPasteHandler();
    const wordPasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="ProgId" content="Word.Document">
  </head>
  <body>
    <div>Section 1</div>
    <div>Section 2</div>
  </body>
</html>`;

    const result = normalizeHTML(wordPasteHandler(inputHTML));

    // transformPastedHTML returns the body content only; no <hr> after the last element.
    const expectedHTML = '<div>Section 1</div> <hr> <div>Section 2</div>';
    expect(result).to.equal(expectedHTML);
  });

  it('Test desktop Word handler ignores alien content', () => {
    const plugin = sectionPasteHandler();
    const wordPasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="foo" content="bar">
  </head>
  <body>
    <div>Section 1</div>
    <div>Section 2</div>
    <p>Section 3</p>
  </body>
</html>`;

    const result = wordPasteHandler(inputHTML);
    expect(result).to.equal(inputHTML);
  });

  it('Test paste from desktop Word ignores non-matching content', () => {
    const plugin = sectionPasteHandler();
    const wordPasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="ProgId" content="Word.Document">
  </head>
  <body>
    <div>Section 1</div>
  </body>
</html>`;

    const result = wordPasteHandler(inputHTML);
    expect(result).to.equal(inputHTML);
  });

  it('Test paste from online Word inserts hr elements', () => {
    const plugin = sectionPasteHandler();
    const wordPasteHandler = plugin.props.transformPastedHTML;

    // Note the 'special marker' is in the data-ccp-props attribute
    // the value "469789806":"single" in there indicates a section break
    const inputHTML = `
<html xmlns="http://www.w3.org/1999/xhtml">
  <body>
    <div><p>
      <span>Section 1</span>
      <span data-ccp-props="{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:279,&quot;335572079&quot;:6,&quot;335572080&quot;:1,&quot;335572081&quot;:0,&quot;469789806&quot;:&quot;single&quot;}"></span>
    </p></div>
    <div>Section 2</div>
  </body>
</html>`;

    const result = normalizeHTML(wordPasteHandler(inputHTML));

    // transformPastedHTML returns the body content only; note the added <hr> tag.
    const expectedHTML = normalizeHTML(`
    <div><p>
      <span>Section 1</span>
      <span data-ccp-props="{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:279,&quot;335572079&quot;:6,&quot;335572080&quot;:1,&quot;335572081&quot;:0,&quot;469789806&quot;:&quot;single&quot;}"></span>
    </p><hr></div>
    <div>Section 2</div>`);

    expect(result).to.equal(expectedHTML);
  });

  it('HTML paste with div line breaks preserves blank lines', () => {
    const plugin = sectionPasteHandler();
    const pasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `<div class="ewa-rteLine">Line one</div>
<div class="ewa-rteLine"><br /></div>
<div class="ewa-rteLine">Line three</div>`;

    const result = normalizeHTML(pasteHandler(inputHTML));

    expect(result).to.contain('<p>Line one</p>');
    expect(result).to.contain('</p> <p> </p> <p>');
    expect(result).to.contain('<p>Line three</p>');
  });

  it('HTML paste with generic divs preserves blank lines', () => {
    const plugin = sectionPasteHandler();
    const pasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = `<div>Alpha</div>
<div><br></div>
<div>Beta</div>`;

    const result = normalizeHTML(pasteHandler(inputHTML));

    expect(result).to.contain('<p>Alpha</p>');
    expect(result).to.contain('</p> <p> </p> <p>');
    expect(result).to.contain('<p>Beta</p>');
  });

  it('HTML paste with divs but no blank lines is not modified', () => {
    const plugin = sectionPasteHandler();
    const pasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = '<div>Just a div</div><div>Another div</div>';
    const result = pasteHandler(inputHTML);
    expect(result).to.equal(inputHTML);
  });

  it('HTML paste with only paragraphs is not modified', () => {
    const plugin = sectionPasteHandler();
    const pasteHandler = plugin.props.transformPastedHTML;

    const inputHTML = '<p>Just a paragraph</p>';
    const result = pasteHandler(inputHTML);
    expect(result).to.equal(inputHTML);
  });

  it('keeps copied table content parsable (no document wrapper breaking data-pm-slice)', () => {
    const plugin = sectionPasteHandler();
    const pasteHandler = plugin.props.transformPastedHTML;

    // A table cell copied from within the editor. transformPastedHTML must not
    // wrap the result in an <html>/<head>/<meta> document: the re-introduced
    // <meta> would become the first child element and derail ProseMirror's
    // data-pm-slice descent (table > tbody > tr), pasting nothing.
    const inputHTML = '<meta charset=\'utf-8\'><table data-pm-slice="2 4 -3 [&quot;table&quot;,{&quot;dataId&quot;:null,&quot;daDiffAdded&quot;:null},&quot;table_row&quot;,{}]"><tbody><tr><td><p>Columns block</p><ul><li><p>One</p></li><li><p>Two</p></li><li><p>Three</p></li></ul></td></tr></tbody></table>';
    const result = pasteHandler(inputHTML);

    expect(result).to.not.contain('<head');
    expect(result).to.contain('data-pm-slice');

    // Replicate ProseMirror's clipboard descent and confirm it lands on the
    // table row carrying the copied cell content (i.e. paste won't be empty).
    const div = document.createElement('div');
    div.innerHTML = result.replace(/^(\s*<meta [^>]*>)*/, '');
    const sliceData = /^(\d+) (\d+)(?: -(\d+))? (.*)/
      .exec(div.querySelector('[data-pm-slice]').getAttribute('data-pm-slice'));
    let dom = div;
    for (let i = +sliceData[3]; i > 0; i -= 1) {
      let child = dom.firstChild;
      while (child && child.nodeType !== 1) child = child.nextSibling;
      if (!child) break;
      dom = child;
    }
    expect(dom.nodeName).to.equal('TR');
    expect(dom.textContent).to.contain('Columns block');
    expect(dom.textContent).to.contain('One');
  });

  it('Plain text paste preserves blank lines', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const text = 'one\n\ntwo\n\nthree';
    const slice = textParser(text);

    const json = slice.content.toJSON();
    expect(json).to.have.lengthOf(5);
    expect(json[0]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'one' }] });
    expect(json[1]).to.deep.equal({ type: 'paragraph' });
    expect(json[2]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'two' }] });
    expect(json[3]).to.deep.equal({ type: 'paragraph' });
    expect(json[4]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'three' }] });
    expect(slice.openStart).to.equal(1);
    expect(slice.openEnd).to.equal(1);
  });

  it('Plain text paste with no blank lines', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const text = 'one\ntwo\nthree';
    const slice = textParser(text);

    const json = slice.content.toJSON();
    expect(json).to.have.lengthOf(3);
    expect(json[0]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'one' }] });
    expect(json[1]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'two' }] });
    expect(json[2]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'three' }] });
  });

  it('Plain text paste single line', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const text = 'hello world';
    const slice = textParser(text);

    const json = slice.content.toJSON();
    expect(json).to.have.lengthOf(1);
    expect(json[0]).to.deep.equal({ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] });
  });

  it('Plain text paste linkifies a bare URL', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const slice = textParser('https://example.com/foo');
    const json = slice.content.toJSON();
    expect(json).to.have.lengthOf(1);
    expect(json[0].content).to.have.lengthOf(1);
    expect(json[0].content[0].text).to.equal('https://example.com/foo');
    expect(json[0].content[0].marks[0].type).to.equal('link');
    expect(json[0].content[0].marks[0].attrs.href).to.equal('https://example.com/foo');
  });

  it('Plain text paste linkifies a URL embedded in text', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const slice = textParser('see https://example.com here');
    const json = slice.content.toJSON();
    expect(json[0].content).to.have.lengthOf(3);
    expect(json[0].content[0]).to.deep.equal({ type: 'text', text: 'see ' });
    expect(json[0].content[1].text).to.equal('https://example.com');
    expect(json[0].content[1].marks[0].attrs.href).to.equal('https://example.com');
    expect(json[0].content[2]).to.deep.equal({ type: 'text', text: ' here' });
  });

  it('Plain text paste trims trailing punctuation from URLs', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const slice = textParser('visit https://example.com.');
    const json = slice.content.toJSON();
    expect(json[0].content).to.have.lengthOf(3);
    expect(json[0].content[1].text).to.equal('https://example.com');
    expect(json[0].content[1].marks[0].attrs.href).to.equal('https://example.com');
    expect(json[0].content[2]).to.deep.equal({ type: 'text', text: '.' });
  });

  it('Plain text paste linkifies multiple URLs on one line', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const textParser = plugin.props.clipboardTextParser;

    const slice = textParser('a https://one.com b https://two.com c');
    const json = slice.content.toJSON();
    expect(json[0].content).to.have.lengthOf(5);
    expect(json[0].content[1].marks[0].attrs.href).to.equal('https://one.com');
    expect(json[0].content[3].marks[0].attrs.href).to.equal('https://two.com');
  });

  it('Test transform pasted dashes', () => {
    const json = {
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Aaa' }],
      }, {
        type: 'paragraph',
        content: [{ type: 'text', text: '---' }],
      }, {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bbb' }],
      }],
      openStart: 1,
      openEnd: 1,
    };
    const slice = Slice.fromJSON(baseSchema, json);

    const plugin = sectionPasteHandler(baseSchema);
    const pasteHandler = plugin.props.transformPasted;

    const newSlice = pasteHandler(slice);
    expect(newSlice.openStart).to.equal(slice.openStart);
    expect(newSlice.openEnd).to.equal(slice.openEnd);

    const expectedJSON = {
      content: [{
        type: 'paragraph',
        content: [{ type: 'text', text: 'Aaa' }],
      }, { type: 'horizontal_rule' }, {
        type: 'paragraph',
        content: [{ type: 'text', text: 'Bbb' }],
      }],
      openStart: 1,
      openEnd: 1,
    };

    const newJSON = JSON.stringify(newSlice.content.toJSON());
    expect(newJSON).to.equal(JSON.stringify(expectedJSON.content));
  });

  it('Test transform pasted dashes 2', () => {
    const json = {
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: 'Heading 1',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hard_break' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hi there',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: '---',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Goodbye',
            },
          ],
        },
      ],
      openStart: 1,
      openEnd: 1,
    };

    const slice = Slice.fromJSON(baseSchema, json);

    const plugin = sectionPasteHandler(baseSchema);
    const pasteHandler = plugin.props.transformPasted;

    const newSlice = pasteHandler(slice);
    expect(newSlice.openStart).to.equal(slice.openStart);
    expect(newSlice.openEnd).to.equal(slice.openEnd);

    const expectedJSON = {
      content: [
        {
          type: 'heading',
          attrs: { level: 1 },
          content: [
            {
              type: 'text',
              text: 'Heading 1',
            },
          ],
        },
        {
          type: 'paragraph',
          content: [{ type: 'hard_break' }],
        },
        {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Hi there',
            },
          ],
        }, { type: 'horizontal_rule' }, {
          type: 'paragraph',
          content: [
            {
              type: 'text',
              text: 'Goodbye',
            },
          ],
        },
      ],
      openStart: 1,
      openEnd: 1,
    };

    const newJSON = JSON.stringify(newSlice.content.toJSON());
    expect(newJSON).to.equal(JSON.stringify(expectedJSON.content));
  });
});

describe('Non-standard space detection on paste', () => {
  function mockEvent(text = '', html = '') {
    return {
      clipboardData: {
        getData: (type) => {
          if (type === 'text/plain') return text;
          if (type === 'text/html') return html;
          return '';
        },
      },
    };
  }

  const dummySlice = Slice.fromJSON(baseSchema, {
    content: [{ type: 'paragraph', content: [{ type: 'text', text: 'test' }] }],
    openStart: 1,
    openEnd: 1,
  });

  it('handlePaste returns false when no non-standard spaces in text', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handlePaste({}, mockEvent('hello world'), dummySlice);
    expect(result).to.be.false;
  });

  it('handlePaste returns true when NBSP found in plain text', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handlePaste({}, mockEvent('hello\u00A0world'), dummySlice);
    expect(result).to.be.true;
  });

  it('handlePaste returns true when non-standard space found in HTML', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handlePaste(
      {},
      mockEvent('hello world', '<p>hello\u2003world</p>'),
      dummySlice,
    );
    expect(result).to.be.true;
  });

  it('handlePaste detects all non-standard Unicode space types', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const spaces = [
      '\u00A0', '\u1680', '\u2000', '\u2001', '\u2002', '\u2003',
      '\u2004', '\u2005', '\u2006', '\u2007', '\u2008', '\u2009',
      '\u200A', '\u202F', '\u205F', '\u3000',
    ];
    spaces.forEach((sp) => {
      const result = plugin.props.handlePaste({}, mockEvent(`a${sp}b`), dummySlice);
      expect(result).to.be.true;
    });
  });

  it('handlePaste returns false when event has no clipboardData', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handlePaste({}, {}, dummySlice);
    expect(result).to.be.false;
  });
});
