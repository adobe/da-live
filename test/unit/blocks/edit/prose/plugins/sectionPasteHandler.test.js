import { expect } from '@esm-bundle/chai';
import { baseSchema, Slice } from 'da-y-wrapper';
import sectionPasteHandler from '../../../../../../blocks/edit/prose/plugins/sectionPasteHandler.js';

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

    // Note the added <hr /> tags
    const expectedHTML = normalizeHTML(`
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="ProgId" content="Word.Document" />
  </head>
  <body>
    <div>Section 1</div><hr />
    <div>Section 2</div><hr />
    <p>Section 3</p>
  </body>
</html>`);
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

    // Note the added <hr /> tags
    const expectedHTML = normalizeHTML(`
<html xmlns="http://www.w3.org/1999/xhtml">
  <head>
     <meta name="ProgId" content="Word.Document" />
  </head>
  <body>
    <div>Section 1</div><hr />
    <div>Section 2</div>
  </body>
</html>`);
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

    // Note the added <hr /> tag
    const expectedHTML = normalizeHTML(`
<html xmlns="http://www.w3.org/1999/xhtml">
  <head></head>
  <body>
    <div><p>
      <span>Section 1</span>
      <span data-ccp-props="{&quot;201341983&quot;:0,&quot;335559739&quot;:160,&quot;335559740&quot;:279,&quot;335572079&quot;:6,&quot;335572080&quot;:1,&quot;335572081&quot;:0,&quot;469789806&quot;:&quot;single&quot;}"></span>
    </p><hr /></div>
    <div>Section 2</div>
  </body>
</html>`);

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

describe('Shift-Cmd/Ctrl-V space normalization', () => {
  // normalizeSpacesOnPaste is module-level, so consume it after tests that set
  // it without going through the full clipboardTextParser → transformPasted pipeline.
  function resetNormalizeFlag() {
    const p = sectionPasteHandler(baseSchema);
    p.props.transformPasted(Slice.fromJSON(baseSchema, {
      content: [{ type: 'paragraph' }], openStart: 1, openEnd: 1,
    }));
  }

  it('handleKeyDown returns false for Shift-Cmd-V to allow native paste', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });
    expect(result).to.be.false;
    resetNormalizeFlag();
  });

  it('handleKeyDown returns false for Shift-Ctrl-V to allow native paste', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, ctrlKey: true });
    expect(result).to.be.false;
    resetNormalizeFlag();
  });

  it('handleKeyDown does not set flag for plain Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: false, metaKey: true });
    const slice = plugin.props.clipboardTextParser('hello\u00A0world');
    expect(slice.content.toJSON()[0].content[0].text).to.equal('hello\u00A0world');
  });

  it('clipboardTextParser normalizes NBSP and narrow no-break space after Shift-Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });
    const slice = plugin.props.clipboardTextParser('a\u00A0b\u202Fc');
    expect(slice.content.toJSON()[0].content[0].text).to.equal('a b c');
    resetNormalizeFlag();
  });

  it('clipboardTextParser normalizes all non-standard Unicode space types after Shift-Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });
    // One of each: Ogham, en quad, em quad, en, em, 3/em, 4/em, 6/em, figure, punctuation, thin, hair, medium math, ideographic
    const input = 'a\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200A\u205F\u3000b';
    const slice = plugin.props.clipboardTextParser(input);
    expect(slice.content.toJSON()[0].content[0].text).to.equal('a              b');
    resetNormalizeFlag();
  });

  it('clipboardTextParser preserves non-standard spaces on regular Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const slice = plugin.props.clipboardTextParser('hello\u00A0world');
    expect(slice.content.toJSON()[0].content[0].text).to.equal('hello\u00A0world');
  });

  it('clipboardTextParser normalizes spaces via Shift-Ctrl-V (Windows)', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, ctrlKey: true });
    const slice = plugin.props.clipboardTextParser('hello\u00A0world');
    expect(slice.content.toJSON()[0].content[0].text).to.equal('hello world');
    resetNormalizeFlag();
  });

  it('transformPastedHTML normalizes non-standard spaces in text content after Shift-Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });
    const result = plugin.props.transformPastedHTML('<p>hello\u00A0world\u202Ftest</p>');
    expect(result).to.contain('hello world test');
    expect(result).not.to.contain('\u00A0');
    expect(result).not.to.contain('\u202F');
    resetNormalizeFlag();
  });

  it('transformPastedHTML preserves non-standard spaces on regular paste', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const result = plugin.props.transformPastedHTML('<p>hello\u00A0world</p>');
    expect(result).to.contain('hello\u00A0world');
  });

  it('transformPasted normalizes non-standard spaces in text nodes after Shift-Cmd-V', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });
    const slice = Slice.fromJSON(baseSchema, {
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello\u00A0world\u202Ftest' }] }],
      openStart: 1,
      openEnd: 1,
    });
    const result = plugin.props.transformPasted(slice);
    expect(result.content.toJSON()[0].content[0].text).to.equal('hello world test');
  });

  it('transformPasted preserves non-standard spaces on regular paste', () => {
    const plugin = sectionPasteHandler(baseSchema);
    const slice = Slice.fromJSON(baseSchema, {
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello\u00A0world' }] }],
      openStart: 1,
      openEnd: 1,
    });
    const result = plugin.props.transformPasted(slice);
    expect(result.content.toJSON()[0].content[0].text).to.equal('hello\u00A0world');
  });

  it('transformPasted resets flag so subsequent paste is not normalized', () => {
    const plugin = sectionPasteHandler(baseSchema);
    plugin.props.handleKeyDown({}, { code: 'KeyV', shiftKey: true, metaKey: true });

    // First paste consumes the flag
    plugin.props.transformPasted(Slice.fromJSON(baseSchema, {
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'x' }] }],
      openStart: 1,
      openEnd: 1,
    }));

    // Second paste — flag must be reset, spaces must be preserved
    const result = plugin.props.transformPasted(Slice.fromJSON(baseSchema, {
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello\u00A0world' }] }],
      openStart: 1,
      openEnd: 1,
    }));
    expect(result.content.toJSON()[0].content[0].text).to.equal('hello\u00A0world');
  });
});
