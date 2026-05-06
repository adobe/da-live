import { expect } from '@esm-bundle/chai';
import { Y, ySyncPluginKey } from 'da-y-wrapper';
import {
  encodeAnchor,
  decodeAnchor,
  getSelectionData,
} from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/anchor.js';

function makeState(ydoc) {
  const fragment = ydoc.getXmlFragment('prosemirror');
  const binding = { type: fragment, mapping: new Map(), doc: ydoc };
  const state = {};
  state[ySyncPluginKey.key] = { type: fragment, doc: ydoc, binding };
  return { state, fragment };
}

describe('encodeAnchor / decodeAnchor', () => {
  it('round-trips a text anchor', () => {
    const ydoc = new Y.Doc();
    const { state, fragment } = makeState(ydoc);
    const text = new Y.XmlText();
    text.insert(0, 'hello world');
    fragment.insert(0, [text]);

    const encoded = encodeAnchor({
      selectionData: { from: 2, to: 7, anchorType: 'text', anchorText: 'hello' },
      state,
    });

    expect(encoded.anchorType).to.equal('text');
    expect(encoded.anchorText).to.equal('hello');
    expect(encoded.anchorFrom).to.be.an('array');
    expect(encoded.anchorTo).to.be.an('array');

    const decoded = decodeAnchor({ anchor: encoded, state });
    expect(decoded).to.deep.equal({ from: 2, to: 7 });
  });

  it('returns null when anchorFrom or anchorTo is missing', () => {
    const ydoc = new Y.Doc();
    const { state } = makeState(ydoc);
    expect(decodeAnchor({ anchor: { anchorFrom: null, anchorTo: null }, state })).to.be.null;
    expect(decodeAnchor({ anchor: { anchorFrom: [1], anchorTo: null }, state })).to.be.null;
    expect(decodeAnchor({ anchor: null, state })).to.be.null;
  });

  it('returns null when from >= to', () => {
    const ydoc = new Y.Doc();
    const { state, fragment } = makeState(ydoc);
    const text = new Y.XmlText();
    text.insert(0, 'hello world');
    fragment.insert(0, [text]);

    const encoded = encodeAnchor({
      selectionData: { from: 3, to: 5, anchorType: 'text', anchorText: 'lo' },
      state,
    });
    const swapped = { ...encoded, anchorFrom: encoded.anchorTo, anchorTo: encoded.anchorFrom };
    expect(decodeAnchor({ anchor: swapped, state })).to.be.null;
  });

  it('returns null when binding is not available', () => {
    expect(encodeAnchor({
      selectionData: { from: 1, to: 3, anchorType: 'text', anchorText: 'hi' },
      state: {},
    })).to.be.null;
  });
});

describe('getSelectionData (plain-state shape)', () => {
  it('returns null for an empty cursor', () => {
    expect(getSelectionData({ selection: { empty: true } })).to.be.null;
  });
});
