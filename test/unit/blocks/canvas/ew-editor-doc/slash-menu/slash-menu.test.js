import { expect } from '@esm-bundle/chai';
import { EditorState, TextSelection } from 'da-y-wrapper';
import { getSchema } from 'da-parser';
import { setNx } from '../../../../../../scripts/utils.js';

setNx('/test/fixtures/nx', { hostname: 'example.com' });

const schema = getSchema();

let getSlashContext;

before(async () => {
  const mod = await import('../../../../../../blocks/canvas/ew-editor-doc/slash-menu/slash-menu.js');
  getSlashContext = mod.getSlashContext;
});

function stateWithParagraph(text) {
  const para = schema.nodes.paragraph.create(null, text ? schema.text(text) : null);
  const doc = schema.nodes.doc.create(null, para);
  // doc.content.size is after the paragraph's close bracket; -1 puts cursor inside it
  const sel = TextSelection.create(doc, doc.content.size - 1);
  return EditorState.create({ schema, doc, selection: sel });
}

describe('getSlashContext', () => {
  it('returns the query for a single-word slash command', () => {
    const ctx = getSlashContext(stateWithParagraph('/banner'));
    expect(ctx).to.not.be.null;
    expect(ctx.query).to.equal('banner');
  });

  it('allows spaces for multi-term queries', () => {
    const ctx = getSlashContext(stateWithParagraph('/banner blue'));
    expect(ctx).to.not.be.null;
    expect(ctx.query).to.equal('banner blue');
  });

  it('returns null when the paragraph does not start with a slash', () => {
    expect(getSlashContext(stateWithParagraph('banner'))).to.be.null;
  });

  it('returns null for an over-long query (cap)', () => {
    expect(getSlashContext(stateWithParagraph(`/${'x'.repeat(60)}`))).to.be.null;
  });
});
