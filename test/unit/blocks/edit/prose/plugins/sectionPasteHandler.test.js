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

  it('Test transform pasted dashes 2', async () => {
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
