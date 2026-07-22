import { expect } from '@esm-bundle/chai';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const { createTestEditor, destroyEditor } = await import('../../edit/prose/test-helpers.js');
const { insertSection } = await import('../../../../../blocks/canvas/editor-utils/blocks.js');

function countSections(view) {
  const { doc, schema } = view.state;
  const sections = [[]];
  doc.forEach((node) => {
    if (node.type === schema.nodes.horizontal_rule) {
      sections.push([]);
    } else {
      sections[sections.length - 1].push(node);
    }
  });
  return sections.length;
}

describe('insertSection', () => {
  let editor;
  beforeEach(async () => { editor = await createTestEditor(); });
  afterEach(() => destroyEditor(editor));

  it('appends a horizontal_rule node to the end of the doc and adds a new section', () => {
    const { schema } = editor.view.state;
    const paragraph = schema.nodes.paragraph.create(null, schema.text('hello'));
    const { tr } = editor.view.state;
    editor.view.dispatch(tr.replaceWith(0, tr.doc.content.size, [paragraph]));

    const sectionCountBefore = countSections(editor.view);

    insertSection(editor.view);

    const { doc } = editor.view.state;
    const lastNode = doc.lastChild;
    expect(lastNode.type.name).to.equal('horizontal_rule');

    const sectionCountAfter = countSections(editor.view);
    expect(sectionCountAfter).to.equal(sectionCountBefore + 1);
  });

  it('does nothing when view is falsy', () => {
    expect(() => insertSection(null)).to.not.throw();
  });
});
