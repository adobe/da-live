/**
 * Cross-Validation Tests for prose2aem
 *
 * These tests verify that prose2aem produces output compatible with da-collab's doc2aem.
 * The test cases mirror those in da-collab/test/cross-validation.test.js
 *
 * Note: aem2prose has been removed since da-live now uses the da-collab convert API.
 * These tests work directly with DOM structures that represent ProseMirror output.
 */

import { expect } from '@esm-bundle/chai';
import prose2aem from '../../../../blocks/shared/prose2aem.js';

const collapseWhitespace = (str) => str.replace(/>\s+</g, '><').replace(/\s+/g, ' ').trim();

/**
 * Creates a DOM structure suitable for prose2aem processing
 * @param {string} innerHtml - HTML content to wrap in editor structure
 * @returns {HTMLElement} - DOM element ready for prose2aem
 */
function createEditorDom(innerHtml) {
  const editor = document.createElement('div');
  editor.innerHTML = innerHtml;

  // Wrap tables in tableWrapper as prose2aem expects
  editor.querySelectorAll('table').forEach((table) => {
    const wrapper = document.createElement('div');
    wrapper.className = 'tableWrapper';
    table.parentElement.insertBefore(wrapper, table);
    wrapper.appendChild(table);
  });

  return editor;
}

// Test cases that must match da-collab/test/cross-validation.test.js expected outputs
const CROSS_VALIDATION_CASES = [
  {
    name: 'Simple paragraph',
    // ProseMirror DOM output (what the editor renders)
    editorContent: '<p>Hello World</p>',
    // Expected AEM HTML (should match doc2aem output)
    expected: '<body><header></header><main><div><p>Hello World</p></div></main><footer></footer></body>',
  },
  {
    name: 'Multiple paragraphs',
    editorContent: '<p>First</p><p>Second</p><p>Third</p>',
    expected: '<body><header></header><main><div><p>First</p><p>Second</p><p>Third</p></div></main><footer></footer></body>',
  },
  {
    name: 'Headings h1-h6',
    editorContent: '<h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6>',
    expected: '<body><header></header><main><div><h1>H1</h1><h2>H2</h2><h3>H3</h3><h4>H4</h4><h5>H5</h5><h6>H6</h6></div></main><footer></footer></body>',
  },
  {
    name: 'Inline formatting - bold, italic, strikethrough, underline',
    editorContent: '<p><strong>Bold</strong> <em>Italic</em> <s>Strike</s> <u>Under</u></p>',
    expected: '<body><header></header><main><div><p><strong>Bold</strong> <em>Italic</em> <s>Strike</s> <u>Under</u></p></div></main><footer></footer></body>',
  },
  {
    name: 'Links',
    editorContent: '<p><a href="https://example.com">Example Link</a></p>',
    expected: '<body><header></header><main><div><p><a href="https://example.com">Example Link</a></p></div></main><footer></footer></body>',
  },
  {
    name: 'Section break (hr)',
    editorContent: '<p>Section 1</p><hr><p>Section 2</p>',
    expected: '<body><header></header><main><div><p>Section 1</p></div><div><p>Section 2</p></div></main><footer></footer></body>',
  },
  {
    name: 'Superscript and subscript',
    editorContent: '<p>H<sub>2</sub>O and E=mc<sup>2</sup></p>',
    expected: '<body><header></header><main><div><p>H<sub>2</sub>O and E=mc<sup>2</sup></p></div></main><footer></footer></body>',
  },
  {
    name: 'Blockquote',
    editorContent: '<blockquote><p>A wise quote</p></blockquote>',
    expected: '<body><header></header><main><div><blockquote><p>A wise quote</p></blockquote></div></main><footer></footer></body>',
  },
  {
    name: 'Link with formatting inside',
    editorContent: '<p><a href="https://example.com"><strong>Bold link</strong></a></p>',
    expected: '<body><header></header><main><div><p><a href="https://example.com"><strong>Bold link</strong></a></p></div></main><footer></footer></body>',
  },
];

describe('Cross-Validation: prose2aem output compatibility with doc2aem', () => {
  CROSS_VALIDATION_CASES.forEach(({ name, editorContent, expected }) => {
    it(`${name}`, () => {
      const editor = createEditorDom(editorContent);
      const result = prose2aem(editor.cloneNode(true), false, false);

      expect(collapseWhitespace(result)).to.equal(
        collapseWhitespace(expected),
        `prose2aem output mismatch for: ${name}`,
      );
    });
  });
});

describe('prose2aem specific features (ProseMirror cleanup)', () => {
  it('Removes ProseMirror UI elements', () => {
    const editor = createEditorDom(`
      <p>Content</p>
      <img class="ProseMirror-separator" />
      <br class="ProseMirror-trailingBreak" />
      <div class="ProseMirror-yjs-cursor"></div>
      <div class="ProseMirror-gapcursor"></div>
    `);

    const result = prose2aem(editor.cloneNode(true), false, true);

    expect(result).to.not.include('ProseMirror-separator');
    expect(result).to.not.include('ProseMirror-trailingBreak');
    expect(result).to.not.include('ProseMirror-yjs-cursor');
    expect(result).to.not.include('ProseMirror-gapcursor');
    expect(result).to.include('Content');
  });

  it('Removes yjs selection highlights', () => {
    const editor = createEditorDom('<p>Before <span class="ProseMirror-yjs-selection">selected text</span> after</p>');

    const result = prose2aem(editor.cloneNode(true), false, true);

    expect(result).to.not.include('ProseMirror-yjs-selection');
    expect(result).to.include('selected text');
  });

  it('Parses icon syntax in live preview mode', () => {
    const editor = createEditorDom('<p>Check this :checkmark: out</p>');

    const result = prose2aem(editor.cloneNode(true), true, true);

    expect(result).to.include('class="icon icon-checkmark"');
    expect(result).to.not.include(':checkmark:');
  });

  it('Does not parse icons in non-preview mode', () => {
    const editor = createEditorDom('<p>Check this :checkmark: out</p>');

    const result = prose2aem(editor.cloneNode(true), false, true);

    expect(result).to.include(':checkmark:');
    expect(result).to.not.include('class="icon');
  });

  it('Handles empty editor gracefully', () => {
    const editor = createEditorDom('');

    const result = prose2aem(editor.cloneNode(true), false, false);

    expect(collapseWhitespace(result)).to.include('<main>');
    expect(collapseWhitespace(result)).to.include('</main>');
  });
});
