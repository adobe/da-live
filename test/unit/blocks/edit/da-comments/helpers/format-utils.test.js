import { expect } from '@esm-bundle/chai';
import {
  getInitials,
  getReplySummary,
  formatTimestamp,
  formatAnchorPreview,
} from '../../../../../../blocks/edit/da-comments/helpers/format-utils.js';

describe('format-utils', () => {
  describe('formatAnchorPreview', () => {
    it('wraps text anchors in quotes', () => {
      expect(formatAnchorPreview({ anchorType: 'text', anchorText: 'hello' })).to.equal('"hello"');
    });

    it('truncates long text anchors', () => {
      const long = 'x'.repeat(120);
      const out = formatAnchorPreview({ anchorType: 'text', anchorText: long });
      expect(out.endsWith('…"')).to.be.true;
      expect(out.length).to.be.lessThan(90);
    });

    it('formats image anchors', () => {
      expect(formatAnchorPreview({ anchorType: 'image', anchorText: '' })).to.equal('an image');
    });

    it('uses the raw "block: Name" text for tables', () => {
      expect(formatAnchorPreview({ anchorType: 'table', anchorText: 'block: Metadata' })).to.equal('block: Metadata');
    });

    it('falls back to "a table" when the table anchorText is empty', () => {
      expect(formatAnchorPreview({ anchorType: 'table', anchorText: '' })).to.equal('a table');
    });

    it('returns empty string for null anchor', () => {
      expect(formatAnchorPreview(null)).to.equal('');
    });
  });

  describe('getInitials', () => {
    it('returns first and last initial for a two-part name', () => {
      expect(getInitials('Alice Smith')).to.equal('AS');
    });

    it('returns first two chars uppercased for a single-word name', () => {
      expect(getInitials('Alice')).to.equal('AL');
    });

    it('uses first and last word for multi-part names', () => {
      expect(getInitials('Alice Marie Smith')).to.equal('AS');
    });

    it('returns ? for empty string', () => {
      expect(getInitials('')).to.equal('?');
    });

    it('returns ? for null', () => {
      expect(getInitials(null)).to.equal('?');
    });
  });

  describe('formatTimestamp', () => {
    it('returns "Just now" for timestamps within the last minute', () => {
      const now = Date.now();
      expect(formatTimestamp(now)).to.equal('Just now');
      expect(formatTimestamp(now - 59000)).to.equal('Just now');
    });

    it('returns minutes for timestamps within the last hour', () => {
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      expect(formatTimestamp(fiveMinutesAgo)).to.equal('5m ago');
    });

    it('returns hours for timestamps within the last day', () => {
      const twoHoursAgo = Date.now() - 2 * 3600 * 1000;
      expect(formatTimestamp(twoHoursAgo)).to.equal('2h ago');
    });

    it('returns days for timestamps within the last week', () => {
      const threeDaysAgo = Date.now() - 3 * 86400 * 1000;
      expect(formatTimestamp(threeDaysAgo)).to.equal('3d ago');
    });
  });

  describe('getReplySummary', () => {
    const root = { author: { id: 'u1' } };
    const makeReply = (id, name) => ({ author: { id, name } });

    it('returns empty string when only the root author has replied', () => {
      expect(getReplySummary({ rootComment: root, replies: [makeReply('u1', 'Alice')] })).to.equal('');
    });

    it('returns single author name', () => {
      expect(getReplySummary({ rootComment: root, replies: [makeReply('u2', 'Bob')] })).to.equal(' from Bob');
    });

    it('returns two authors joined with "and"', () => {
      const replies = [makeReply('u2', 'Bob'), makeReply('u3', 'Carol')];
      expect(getReplySummary({ rootComment: root, replies })).to.equal(' from Bob and Carol');
    });

    it('truncates beyond two unique authors', () => {
      const replies = [makeReply('u2', 'Bob'), makeReply('u3', 'Carol'), makeReply('u4', 'Dave')];
      expect(getReplySummary({ rootComment: root, replies })).to.equal(' from Bob, Carol and 1 other');
    });

    it('deduplicates repeated authors', () => {
      const replies = [makeReply('u2', 'Bob'), makeReply('u2', 'Bob')];
      expect(getReplySummary({ rootComment: root, replies })).to.equal(' from Bob');
    });

    it('uses "others" plural for 2+ remaining', () => {
      const replies = [
        makeReply('u2', 'Bob'),
        makeReply('u3', 'Carol'),
        makeReply('u4', 'Dave'),
        makeReply('u5', 'Eve'),
      ];
      expect(getReplySummary({ rootComment: root, replies })).to.equal(' from Bob, Carol and 2 others');
    });
  });
});
