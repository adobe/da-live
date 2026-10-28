import { expect } from '@esm-bundle/chai';
import { getSchema } from 'da-parser';
import { getBlockRerenderScope } from '../../../../../blocks/canvas/editor-utils/rerender-scope.js';

const schema = getSchema();

const paragraph = (text) => schema.node('paragraph', null, [schema.text(text)]);
const block = (name, text) => {
  const row = (content) => schema.node('table_row', null, [
    schema.node('table_cell', null, [paragraph(content)]),
  ]);
  return schema.node('table', null, [row(name), row(text)]);
};
const hr = () => schema.node('horizontal_rule');

// intro | hero | --- | cards | teaser
const makeDoc = ({ cards = 'card', teaser = 'teaser', intro = 'intro' } = {}) => schema.node('doc', null, [
  paragraph(intro), block('hero', 'hero'), hr(), block('cards', cards), block('teaser', teaser),
]);

const body = (sections) => `<body><main>${sections
  .map((blocks) => `<div>${'<div data-block-index="1"></div>'.repeat(blocks)}</div>`)
  .join('')}</main></body>`;

const posOf = (doc, index) => {
  let pos = 0;
  for (let i = 0; i < index; i += 1) pos += doc.child(i).nodeSize;
  return pos;
};

describe('getBlockRerenderScope', () => {
  // Rendered blocks: hero (section 0), cards and teaser (section 1).
  const scopeFor = (previousDoc, doc, pos, rendered = body([1, 2])) => {
    const args = { previousDoc, doc, body: rendered, pos };
    return getBlockRerenderScope(args);
  };
  const PAGE = { type: 'page' };

  it('scopes to the requested block when nothing else is unsynced', () => {
    const doc = makeDoc();
    expect(scopeFor(doc, doc, posOf(doc, 3)))
      .to.deep.equal({ type: 'block', sectionIndex: 1, blockIndex: 1 });
  });

  it('scopes to the requested block when only its own text is unsynced', () => {
    const doc = makeDoc({ teaser: 'changed' });
    expect(scopeFor(makeDoc(), doc, posOf(doc, 4)))
      .to.deep.equal({ type: 'block', sectionIndex: 1, blockIndex: 2 });
  });

  it('falls back to the page when something else is unsynced', () => {
    const doc = makeDoc({ intro: 'changed' });
    expect(scopeFor(makeDoc(), doc, posOf(doc, 3))).to.deep.equal(PAGE);
  });

  it('falls back to the page when the position is not a rendered top-level block', () => {
    const doc = makeDoc();
    expect(scopeFor(doc, doc, 0)).to.deep.equal(PAGE);
    expect(scopeFor(doc, doc, posOf(doc, 3) + 1)).to.deep.equal(PAGE);
    expect(scopeFor(doc, doc, undefined)).to.deep.equal(PAGE);
  });

  it('falls back to the page when the rendered body disagrees with the document', () => {
    const doc = makeDoc();
    expect(scopeFor(doc, doc, posOf(doc, 3), body([1, 1]))).to.deep.equal(PAGE);
  });
});
