import { expect } from '@esm-bundle/chai';
import { EditorState, NodeSelection, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

let COMMAND_BY_ID;

before(async () => {
  ({ COMMAND_BY_ID } = await import('../../../../../blocks/canvas/editor-utils/command-defs.js'));
});

const schema = getSchema();

function stateWithImage(attrs, selectImage = true) {
  const image = schema.nodes.image.create({ src: 'https://cdn.example.com/a.jpg', ...attrs });
  const para = schema.nodes.paragraph.create(null, [schema.text('a '), image]);
  const doc = schema.nodes.doc.create(null, para);
  const selection = selectImage
    ? NodeSelection.create(doc, 3)
    : TextSelection.create(doc, 1, 2);
  return EditorState.create({ schema, doc, selection });
}

describe('canvas link commands for link-images', () => {
  ['link-create', 'link-edit', 'link-remove'].forEach((id) => {
    it(`hides ${id} when a link-image is selected`, () => {
      const state = stateWithImage({ editAs: 'image', alt: 'Hero' });
      expect(COMMAND_BY_ID.get(id).visible(state)).to.equal(false);
    });
  });

  it('still shows create link for a selected regular image', () => {
    const state = stateWithImage({ alt: 'Hero' });
    expect(COMMAND_BY_ID.get('link-create').visible(state)).to.equal(true);
  });

  it('still shows create link for a text selection', () => {
    const state = stateWithImage({ editAs: 'image' }, false);
    expect(COMMAND_BY_ID.get('link-create').visible(state)).to.equal(true);
  });
});
