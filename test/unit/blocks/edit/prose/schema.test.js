import { expect } from '@esm-bundle/chai';
import { DOMParser } from 'da-y-wrapper';
import { getSchema } from '../../../../../blocks/edit/prose/schema.js';

describe('Prose Schema', () => {
  const schema = getSchema();
  const parser = DOMParser.fromSchema(schema);

  it('parses image with focal point attributes', () => {
    const div = document.createElement('div');
    div.innerHTML = '<img src="test.jpg" data-focal-x="10" data-focal-y="20">';

    const doc = parser.parse(div);
    // doc is likely a doc node containing a paragraph containing the image (inline)
    const paragraph = doc.content.firstChild;
    const img = paragraph.content.firstChild;

    expect(img.type.name).to.equal('image');
    expect(img.attrs.dataFocalX).to.equal('10');
    expect(img.attrs.dataFocalY).to.equal('20');
  });

  it('excludes title if it contains data-focal', () => {
    const div = document.createElement('div');
    div.innerHTML = '<img src="test.jpg" title="data-focal:10,20">';

    const doc = parser.parse(div);
    const paragraph = doc.content.firstChild;
    const img = paragraph.content.firstChild;

    expect(img.attrs.title).to.be.null;
  });

  it('serializes focal point to data attributes and title', () => {
    const img = schema.nodes.image.create({
      src: 'test.jpg',
      dataFocalX: '30',
      dataFocalY: '40',
    });

    const dom = schema.nodes.image.spec.toDOM(img);
    // dom is ['img', attrs]
    const attrs = dom[1];

    expect(attrs['data-focal-x']).to.equal('30');
    expect(attrs['data-focal-y']).to.equal('40');
    expect(attrs.title).to.equal('data-focal:30,40');
  });
});
