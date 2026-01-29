import { expect } from '@esm-bundle/chai';
import { baseSchema } from 'da-y-wrapper';
import linkTextSync from '../../../../../../blocks/edit/prose/plugins/linkTextSync.js';

function createMockNode(text, marks = []) {
  return {
    textContent: text,
    text,
    nodeSize: text.length,
    marks,
  };
}

function createMockLinkMark(href) {
  return {
    type: { name: 'link' },
    attrs: { href },
  };
}

function createMockParent(node, offset = 0) {
  return { childAfter: () => ({ node, offset }) };
}

function createMockSelection(parentOffset, parent, empty = true) {
  return {
    $from: {
      parentOffset,
      parent,
      start: () => 0,
    },
    empty,
  };
}

function createMockState(selection, schema = baseSchema, trackCalls = null) {
  const tr = {
    removeMark: function removeMark() { return this; },
    addMark: function addMark(from, to, mark) {
      if (trackCalls) {
        trackCalls.addMark = { from, to, mark };
      }
      return this;
    },
    setMeta: function setMeta(key, value) {
      if (trackCalls) {
        trackCalls.setMeta = { key, value };
      }
      return this;
    },
  };
  return { selection, schema, tr };
}

function createMockTransaction(docChanged = true, linkSyncMeta = false) {
  return {
    docChanged,
    getMeta: (key) => (key === 'linkSync' ? linkSyncMeta : null),
  };
}

describe('linkTextSync plugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = linkTextSync();
  });

  describe('appendTransaction', () => {
    it('should return null if transaction has linkSync meta (prevents infinite loop)', () => {
      const trs = [createMockTransaction(true, true)];
      const oldState = {};
      const newState = {};

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if document has not changed', () => {
      const trs = [createMockTransaction(false)];
      const oldState = {};
      const newState = {};

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if cursor is not in a link in old state', () => {
      const trs = [createMockTransaction(true)];
      const node = createMockNode('plain text');
      const parent = createMockParent(node);
      const selection = createMockSelection(0, parent);
      const oldState = createMockState(selection);
      const newState = createMockState(selection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if link text does not equal href in old state', () => {
      const trs = [createMockTransaction(true)];
      const linkMark = createMockLinkMark('https://example.com');
      const node = createMockNode('Click here', [linkMark]);
      const parent = createMockParent(node);
      const selection = createMockSelection(0, parent);
      const oldState = createMockState(selection);
      const newState = createMockState(selection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if new text is not a valid URL', () => {
      const trs = [createMockTransaction(true)];

      const oldHref = 'https://example.com';
      const oldLinkMark = createMockLinkMark(oldHref);
      const oldNode = createMockNode(oldHref, [oldLinkMark]);
      const oldParent = createMockParent(oldNode);
      const oldSelection = createMockSelection(0, oldParent);
      const oldState = createMockState(oldSelection);

      const newLinkMark = createMockLinkMark(oldHref);
      const newNode = createMockNode('Example Site', [newLinkMark]);
      const newParent = createMockParent(newNode);
      const newSelection = createMockSelection(0, newParent);
      const newState = createMockState(newSelection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if text has not changed', () => {
      const trs = [createMockTransaction(true)];

      const href = 'https://example.com';
      const linkMark = createMockLinkMark(href);
      const node = createMockNode(href, [linkMark]);
      const parent = createMockParent(node);
      const selection = createMockSelection(0, parent);
      const oldState = createMockState(selection);
      const newState = createMockState(selection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should update href to match new text when text === href and is valid URL', () => {
      const trs = [createMockTransaction(true)];

      const oldHref = 'https://reddit.com';
      const oldLinkMark = createMockLinkMark(oldHref);
      const oldNode = createMockNode(oldHref, [oldLinkMark]);
      const oldParent = createMockParent(oldNode);
      const oldSelection = createMockSelection(0, oldParent);
      const oldState = createMockState(oldSelection);

      const newHref = 'https://twitter.com';
      const newLinkMark = createMockLinkMark(oldHref);
      const newNode = createMockNode(newHref, [newLinkMark]);
      const newParent = createMockParent(newNode);
      const newSelection = createMockSelection(0, newParent);
      const trackCalls = {};
      const newState = createMockState(newSelection, baseSchema, trackCalls);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.not.be.null;
      expect(trackCalls.addMark).to.exist;
      expect(trackCalls.addMark.mark.attrs.href).to.equal(newHref);
      expect(trackCalls.setMeta).to.exist;
      expect(trackCalls.setMeta.key).to.equal('linkSync');
      expect(trackCalls.setMeta.value).to.equal(true);
    });

    it('should sync href when user selects and types to replace text', () => {
      const trs = [createMockTransaction(true)];

      const oldHref = 'https://reddit.com';
      const oldLinkMark = createMockLinkMark(oldHref);
      const oldNode = createMockNode(oldHref, [oldLinkMark]);
      const oldParent = createMockParent(oldNode);
      const oldSelection = createMockSelection(0, oldParent, false);
      const oldState = createMockState(oldSelection);

      const newHref = 'https://twitter.com';
      const newLinkMark = createMockLinkMark(oldHref);
      const newNode = createMockNode(newHref, [newLinkMark]);
      const newParent = createMockParent(newNode);
      const newSelection = createMockSelection(0, newParent);
      const trackCalls = {};
      const newState = createMockState(newSelection, baseSchema, trackCalls);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.not.be.null;
      expect(trackCalls.addMark.mark.attrs.href).to.equal(newHref);
    });

    it('should return null if node is null in old state', () => {
      const trs = [createMockTransaction(true)];

      const parent = { childAfter: () => ({ node: null, offset: 0 }) };
      const selection = createMockSelection(0, parent);
      const oldState = createMockState(selection);
      const newState = createMockState(selection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });

    it('should return null if href changed between old and new state', () => {
      const trs = [createMockTransaction(true)];

      const oldHref = 'https://example.com';
      const oldLinkMark = createMockLinkMark(oldHref);
      const oldNode = createMockNode(oldHref, [oldLinkMark]);
      const oldParent = createMockParent(oldNode);
      const oldSelection = createMockSelection(0, oldParent);
      const oldState = createMockState(oldSelection);

      const newLinkMark = createMockLinkMark('https://reddit.com');
      const newNode = createMockNode('https://twitter.com', [newLinkMark]);
      const newParent = createMockParent(newNode);
      const newSelection = createMockSelection(0, newParent);
      const newState = createMockState(newSelection);

      const result = plugin.spec.appendTransaction(trs, oldState, newState);

      expect(result).to.be.null;
    });
  });
});
