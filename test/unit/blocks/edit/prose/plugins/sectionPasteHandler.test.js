import { expect } from '@esm-bundle/chai';
import sectionPasteHandler from '../../../../../../blocks/edit/prose/plugins/sectionPasteHandler.js';

function normalizeHTML(html) {
  return html.replace(/[\n\s]+/g, ' ').replace(/></g, '> <').trim();
}

describe('Section paste handler', () => {
  it('Test paste from desktop Word 1', () => {
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

  it('Test paste from desktop Word ignore alien content', () => {
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
});
