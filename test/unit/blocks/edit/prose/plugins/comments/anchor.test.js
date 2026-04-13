import { expect } from '@esm-bundle/chai';
import {
  findThreadAtPosition,
  resolveTextSelector,
  expandToWord,
} from '../../../../../../../blocks/edit/prose/plugins/comments/helpers/anchor.js';

describe('comment anchoring', () => {
  describe('findThreadAtPosition', () => {
    it('returns null when cache is empty', () => {
      expect(findThreadAtPosition({ cache: new Map(), pos: 5 })).to.be.null;
    });

    it('returns threadId when position falls within a range', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 5 })).to.equal('t1');
    });

    it('returns threadId when position is exactly at the start boundary', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 2 })).to.equal('t1');
    });

    it('returns null when position is exactly at the end boundary (exclusive-end)', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 10 })).to.be.null;
    });

    it('returns threadId when position is one before the end boundary', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 9 })).to.equal('t1');
    });

    it('returns null when position is before all ranges', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 1 })).to.be.null;
    });

    it('returns null when position is after all ranges', () => {
      const cache = new Map([['t1', { from: 2, to: 10 }]]);
      expect(findThreadAtPosition({ cache, pos: 11 })).to.be.null;
    });

    it('returns the narrowest range when position overlaps multiple threads', () => {
      const cache = new Map([
        ['t1', { from: 1, to: 20 }],
        ['t2', { from: 5, to: 10 }],
      ]);
      expect(findThreadAtPosition({ cache, pos: 7 })).to.equal('t2');
    });

    it('ignores degenerate ranges where from >= to', () => {
      const cache = new Map([
        ['t1', { from: 5, to: 5 }],
        ['t2', { from: 3, to: 8 }],
      ]);
      expect(findThreadAtPosition({ cache, pos: 5 })).to.equal('t2');
    });

    it('returns null when position matches only degenerate ranges', () => {
      const cache = new Map([['t1', { from: 5, to: 5 }]]);
      expect(findThreadAtPosition({ cache, pos: 5 })).to.be.null;
    });
  });

  describe('resolveTextSelector', () => {
    function toFlat(text) {
      const positions = [];
      for (let i = 0; i < text.length; i += 1) positions.push(i);
      return { text, positions };
    }

    it('resolves a unique match regardless of context', () => {
      const selector = { kind: 'text', exact: 'brown fox', prefix: 'quick ', suffix: ' jumps' };
      const { text, positions } = toFlat('The quick brown fox jumps over the lazy dog');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(10);
      expect(result.to).to.equal(19);
    });

    it('rejects a unique match when context is completely wrong', () => {
      const selector = { kind: 'text', exact: 'brown fox', prefix: 'CHANGED', suffix: 'CHANGED' };
      const { text, positions } = toFlat('The quick brown fox jumps over the lazy dog');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.be.null;
    });

    it('resolves a unique match when context is close enough', () => {
      const selector = { kind: 'text', exact: 'brown fox', prefix: 'quick ', suffix: 'CHANGED' };
      const { text, positions } = toFlat('The quick brown fox jumps over the lazy dog');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(10);
      expect(result.to).to.equal(19);
    });

    it('disambiguates duplicate text using similarity score', () => {
      const selector = { kind: 'text', exact: 'cat', prefix: 'the ', suffix: ' mat' };
      const { text, positions } = toFlat('the cat sat on the cat mat');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(19);
      expect(result.to).to.equal(22);
    });

    it('returns best-scoring match when neither is a perfect context match', () => {
      const selector = { kind: 'text', exact: 'cat', prefix: 'the ', suffix: ' and' };
      const { text, positions } = toFlat('the cat and a cat here');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(4);
      expect(result.to).to.equal(7);
    });

    it('returns null when exact text is not found', () => {
      const selector = { kind: 'text', exact: 'missing', prefix: '', suffix: '' };
      const { text, positions } = toFlat('hello world');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.be.null;
    });

    it('returns null for non-text selector kind', () => {
      const { text, positions } = toFlat('hello');
      const result = resolveTextSelector(text, positions, { kind: 'other', exact: 'hello' });
      expect(result).to.be.null;
    });

    it('picks the correct match when duplicate text exists in the flat string', () => {
      const selector = { kind: 'text', exact: 'bar', prefix: 'siphon, ', suffix: ' mug a' };
      const { text, positions } = toFlat('espresso saucer siphon, bar mug a fair traderobusta cup sweet siphon, mazagran, bar , to go');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(24);
      expect(result.to).to.equal(27);
    });

    it('detaches when original text is deleted and remaining match has wrong context', () => {
      const selector = { kind: 'text', exact: 'bar', prefix: 'siphon, ', suffix: ' mug a' };
      const { text, positions } = toFlat('espresso saucer siphon, mug a fair traderobusta cup sweet siphon, mazagran, bar , to go');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.be.null;
    });

    it('resolves unique text with no context', () => {
      const selector = { kind: 'text', exact: 'skdjbfgjodshgbosdjbgjisdbfjkdsbfkdsfsd', prefix: '', suffix: '' };
      const { text, positions } = toFlat('some text in the first paragraphskdjbfgjodshgbosdjbgjisdbfjkdsbfkdsfsdsome text in the third paragraph');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(32);
      expect(result.to).to.equal(70);
    });

    it('resolves unique text with cross-block context', () => {
      const selector = { kind: 'text', exact: 'unique', prefix: 'first paragraph', suffix: 'third paragraph' };
      const { text, positions } = toFlat('first paragraphuniquethird paragraph');
      const result = resolveTextSelector(text, positions, selector);
      expect(result).to.not.be.null;
      expect(result.from).to.equal(15);
      expect(result.to).to.equal(21);
    });
  });

  describe('expandToWord', () => {
    function mockDoc(textContent, blockStart = 1) {
      const textNode = { isText: true, text: textContent, nodeSize: textContent.length };
      const para = {
        isTextblock: true,
        textContent,
        childCount: 1,
        forEach(fn) { fn(textNode, 0); },
      };
      return {
        resolve(pos) {
          return {
            parent: para,
            parentOffset: pos - blockStart,
            depth: 1,
            start() { return blockStart; },
          };
        },
      };
    }

    it('selects the word when cursor is in the middle', () => {
      const doc = mockDoc('hello world');
      const result = expandToWord(doc, 3);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('selects the word when cursor is at the start of a word', () => {
      const doc = mockDoc('hello world');
      const result = expandToWord(doc, 1);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('selects the word when cursor is at the end of a word', () => {
      const doc = mockDoc('hello world');
      const result = expandToWord(doc, 6);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('selects the second word when cursor is in it', () => {
      const doc = mockDoc('hello world');
      const result = expandToWord(doc, 9);
      expect(result).to.deep.equal({ from: 7, to: 12 });
    });

    it('selects the nearest word when cursor is in whitespace (closer to next word)', () => {
      const doc = mockDoc('hello     world');
      const result = expandToWord(doc, 9);
      expect(result).to.deep.equal({ from: 11, to: 16 });
    });

    it('selects the nearest word when cursor is in whitespace (closer to prev word)', () => {
      const doc = mockDoc('hello     world');
      const result = expandToWord(doc, 7);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('returns null for empty text', () => {
      const doc = mockDoc('');
      const result = expandToWord(doc, 1);
      expect(result).to.be.null;
    });

    it('returns null for whitespace-only text', () => {
      const doc = mockDoc('   ');
      const result = expandToWord(doc, 2);
      expect(result).to.be.null;
    });

    it('selects the only word in the block', () => {
      const doc = mockDoc('hello');
      const result = expandToWord(doc, 3);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('returns null for non-textblock parent', () => {
      const doc = {
        resolve() {
          return {
            parent: { isTextblock: false },
            depth: 1,
            start() { return 1; },
          };
        },
      };
      const result = expandToWord(doc, 1);
      expect(result).to.be.null;
    });

    it('handles unicode text', () => {
      const doc = mockDoc('café latte');
      const result = expandToWord(doc, 3);
      expect(result).to.deep.equal({ from: 1, to: 5 });
    });

    it('stops at punctuation boundaries', () => {
      const doc = mockDoc('hello, world');
      const result = expandToWord(doc, 3);
      expect(result).to.deep.equal({ from: 1, to: 6 });
    });

    it('selects word after punctuation', () => {
      const doc = mockDoc('hello, world');
      const result = expandToWord(doc, 10);
      expect(result).to.deep.equal({ from: 8, to: 13 });
    });
  });
});
