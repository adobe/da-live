import { expect } from '@esm-bundle/chai';
import { baseSchema, Slice } from 'da-y-wrapper';
import linkConverter from '../../../../../../blocks/edit/prose/plugins/linkConverter.js';

describe('Link converter plugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = linkConverter(baseSchema);
  });

  describe('Pasting standalone URLs', () => {
    it('should convert a pasted standalone http URL to a link', () => {
      const url = 'http://example.com';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: url }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let replacedNode = null;
      const tr = {
        replaceSelectionWith: function replaceSelectionWith(node) {
          replacedNode = node;
          return this;
        },
        scrollIntoView: function scrollIntoView() {
          return this;
        },
      };

      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(replacedNode).to.not.be.null;
      expect(replacedNode.marks).to.have.lengthOf(1);
      expect(replacedNode.marks[0].type.name).to.equal('link');
      expect(replacedNode.marks[0].attrs.href).to.equal(url);
    });

    it('should convert a pasted standalone https URL to a link', () => {
      const url = 'https://example.com/path?query=value';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: url }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let replacedNode = null;
      const tr = {
        replaceSelectionWith: function replaceSelectionWith(node) {
          replacedNode = node;
          return this;
        },
        scrollIntoView: function scrollIntoView() {
          return this;
        },
      };

      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(replacedNode).to.not.be.null;
      expect(replacedNode.marks[0].attrs.href).to.equal(url);
    });

    it('should not convert non-URL text', () => {
      const text = 'This is not a URL';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(false);
      expect(dispatchedTr).to.be.null;
    });
  });

  describe('Pasting URLs with text', () => {
    it('should convert URLs mixed with text to links', () => {
      const text = 'Visit https://example.com for more info';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr: {
            replaceSelection: function replaceSelection() {
              return this;
            },
            scrollIntoView: function scrollIntoView() {
              return this;
            },
          },
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(dispatchedTr).to.not.be.null;
    });

    it('should convert multiple URLs in text to links', () => {
      const text = 'Visit https://example.com and https://test.com';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr: {
            replaceSelection: function replaceSelection() {
              return this;
            },
            scrollIntoView: function scrollIntoView() {
              return this;
            },
          },
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(dispatchedTr).to.not.be.null;
    });

    it('should handle URLs with paths and query strings', () => {
      const text = 'Check https://example.com/path/to/page?query=value&other=param';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr: {
            replaceSelection: function replaceSelection() {
              return this;
            },
            scrollIntoView: function scrollIntoView() {
              return this;
            },
          },
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(dispatchedTr).to.not.be.null;
    });

    it('should not convert text without URLs', () => {
      const text = 'This is just plain text with no links';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(false);
      expect(dispatchedTr).to.be.null;
    });
  });

  describe('Edge cases', () => {
    it('should handle www URLs', () => {
      const url = 'https://www.example.com';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: url }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let replacedNode = null;
      const tr = {
        replaceSelectionWith: function replaceSelectionWith(node) {
          replacedNode = node;
          return this;
        },
        scrollIntoView: function scrollIntoView() {
          return this;
        },
      };

      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(replacedNode.marks[0].attrs.href).to.equal(url);
    });

    it('should handle URLs with fragments', () => {
      const url = 'https://example.com/page#section';
      const json = {
        content: [{
          type: 'paragraph',
          content: [{ type: 'text', text: url }],
        }],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let replacedNode = null;
      const tr = {
        replaceSelectionWith: function replaceSelectionWith(node) {
          replacedNode = node;
          return this;
        },
        scrollIntoView: function scrollIntoView() {
          return this;
        },
      };

      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(replacedNode.marks[0].attrs.href).to.equal(url);
    });

    it('should handle multiple paragraphs with URLs', () => {
      const json = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'First paragraph with https://example.com' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'Second paragraph with https://test.com' }],
          },
        ],
        openStart: 1,
        openEnd: 1,
      };
      const slice = Slice.fromJSON(baseSchema, json);

      let dispatchedTr = null;
      const mockView = {
        state: {
          selection: { from: 10 },
          schema: baseSchema,
          tr: {
            replaceSelection: function replaceSelection() {
              return this;
            },
            scrollIntoView: function scrollIntoView() {
              return this;
            },
          },
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(dispatchedTr).to.not.be.null;
    });
  });
});
