import { expect } from '@esm-bundle/chai';
import { baseSchema, Slice } from 'da-y-wrapper';
import linkConverter from '../../../../../../blocks/edit/prose/plugins/linkConverter.js';

describe('Link converter plugin', () => {
  let plugin;

  beforeEach(() => {
    plugin = linkConverter(baseSchema);
  });

  describe('Pasting standalone URLs', () => {
    it('should not convert a pasted standalone http URL to a link', () => {
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

      let addedMark = null;
      const tr = {
        insert: function insert() {
          return this;
        },
        addMark: function addMark(_from, _to, mark) {
          addedMark = mark;
          return this;
        },
        replaceWith: function replaceWith() {
          return this;
        },
      };

      const mockDoc = {
        slice: () => ({
          size: 0,
          content: { content: [] },
        }),
      };

      const mockView = {
        state: {
          selection: { from: 10, to: 10 },
          schema: baseSchema,
          tr,
          doc: mockDoc,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(addedMark).to.not.be.null;
      expect(addedMark.type.name).to.equal('link');
      expect(addedMark.attrs.href).to.equal(url);
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
    it('should not convert URLs mixed with text to links', () => {
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
        },
        dispatch: (tr) => {
          dispatchedTr = tr;
        },
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(false);
      expect(dispatchedTr).to.be.null;
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

      let addedMark = null;
      const tr = {
        insert: function insert() {
          return this;
        },
        addMark: function addMark(_from, _to, mark) {
          addedMark = mark;
          return this;
        },
        replaceWith: function replaceWith() {
          return this;
        },
      };

      const mockDoc = {
        slice: () => ({
          size: 0,
          content: { content: [] },
        }),
      };

      const mockView = {
        state: {
          selection: { from: 10, to: 10 },
          schema: baseSchema,
          tr,
          doc: mockDoc,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(addedMark).to.not.be.null;
      expect(addedMark.attrs.href).to.equal(url);
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

      let addedMark = null;
      const tr = {
        insert: function insert() {
          return this;
        },
        addMark: function addMark(_from, _to, mark) {
          addedMark = mark;
          return this;
        },
        replaceWith: function replaceWith() {
          return this;
        },
      };

      const mockDoc = {
        slice: () => ({
          size: 0,
          content: { content: [] },
        }),
      };

      const mockView = {
        state: {
          selection: { from: 10, to: 10 },
          schema: baseSchema,
          tr,
          doc: mockDoc,
        },
        dispatch: () => {},
      };

      const result = plugin.props.handlePaste(mockView, null, slice);

      expect(result).to.equal(true);
      expect(addedMark).to.not.be.null;
      expect(addedMark.attrs.href).to.equal(url);
    });

    it('should not handle multiple paragraphs', () => {
      const json = {
        content: [
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'https://example.com' }],
          },
          {
            type: 'paragraph',
            content: [{ type: 'text', text: 'https://test.com' }],
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
});
