import { expect } from '@esm-bundle/chai';
import { htmlDiff } from '../../../../../../blocks/edit/prose/diff/htmldiff.js';

describe('HTML Diff', () => {
  describe('htmlDiff main function', () => {
    it('should handle identical HTML strings', () => {
      const html = '<p>Hello world</p>';
      const result = htmlDiff(html, html);
      expect(result).to.equal('<p>Hello world</p>');
    });

    it('should handle simple text changes', () => {
      const oldHtml = '<p>Hello world</p>';
      const newHtml = '<p>Hello universe</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello <del class="diffdel">world</del><ins class="diffins">universe</ins></p>');
    });

    it('should handle text additions', () => {
      const oldHtml = '<p>Hello</p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello<ins class="diffins"> world</ins></p>');
    });

    it('should handle text deletions', () => {
      const oldHtml = '<p>Hello world</p>';
      const newHtml = '<p>Hello</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello<del class="diffdel"> world</del></p>');
    });

    it('should handle HTML tag additions', () => {
      const oldHtml = '<p>Hello world</p>';
      const newHtml = '<p>Hello <strong>world</strong></p>';
      const result = htmlDiff(oldHtml, newHtml);
      // Wrap-around insertion: <strong> opened around equal content "world" and closed
      // again all in one logical change, so it renders as one wrapper instead of two.
      expect(result).to.equal('<p>Hello <ins class="diffins"><strong>world</strong></ins></p>');
    });

    it('should handle HTML tag removals', () => {
      const oldHtml = '<p>Hello <strong>world</strong></p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello <del class="diffdel"><strong>world</strong></del></p>');
    });

    it('should handle complex HTML structures', () => {
      const oldHtml = '<div><p>Hello</p><span>world</span></div>';
      const newHtml = '<div><p>Hello</p><span>universe</span></div>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<div><p>Hello</p><span><del class="diffdel">world</del><ins class="diffins">universe</ins></span></div>');
    });

    it('should handle empty strings', () => {
      const result = htmlDiff('', '');
      expect(result).to.equal('');
    });

    it('should handle empty old HTML', () => {
      const newHtml = '<p>Hello</p>';
      const result = htmlDiff('', newHtml);
      expect(result).to.equal('<ins class="diffins"><p>Hello</p></ins>');
    });

    it('should handle empty new HTML', () => {
      const oldHtml = '<p>Hello</p>';
      const result = htmlDiff(oldHtml, '');
      expect(result).to.equal('<del class="diffdel"><p>Hello</p></del>');
    });

    it('should treat whitespace-only changes as no-op', () => {
      // Whitespace runs are equality-tolerant (any run of whitespace == any other), so
      // pretty-printing differences round-trip silently instead of polluting the diff.
      const oldHtml = '<p>Hello world</p>';
      const newHtml = '<p>Hello  world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello  world</p>');
    });

    it('should handle multiple word changes', () => {
      const oldHtml = '<p>The quick brown fox</p>';
      const newHtml = '<p>The slow red fox</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // Adjacent edits separated only by whitespace are coalesced into a single change.
      expect(result).to.equal('<p>The <del class="diffdel">quick brown</del><ins class="diffins">slow red</ins> fox</p>');
    });

    it('should handle nested HTML tags', () => {
      const oldHtml = '<div><p><span>Hello</span> world</p></div>';
      const newHtml = '<div><p><span>Hello</span> universe</p></div>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<div><p><span>Hello</span> <del class="diffdel">world</del><ins class="diffins">universe</ins></p></div>');
    });

    it('should handle attributes in tags', () => {
      const oldHtml = '<p class="test">Hello</p>';
      const newHtml = '<p class="test">Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p class="test">Hello<ins class="diffins"> world</ins></p>');
    });

    it('should handle self-closing tags', () => {
      const oldHtml = '<p>Hello<br/>world</p>';
      const newHtml = '<p>Hello<br/>universe</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello<br/><del class="diffdel">world</del><ins class="diffins">universe</ins></p>');
    });

    it('should handle line breaks and formatting', () => {
      const oldHtml = '<p>\n  Hello world\n</p>';
      const newHtml = '<p>\n  Hello universe\n</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>\n  Hello <del class="diffdel">world</del><ins class="diffins">universe</ins>\n</p>');
    });

    it('should handle consecutive changes', () => {
      const oldHtml = '<p>one two three</p>';
      const newHtml = '<p>alpha beta gamma</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p><del class="diffdel">one two three</del><ins class="diffins">alpha beta gamma</ins></p>');
    });

    it('should handle word reordering', () => {
      const oldHtml = '<p>first second</p>';
      const newHtml = '<p>second first</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p><ins class="diffins">second </ins>first<del class="diffdel"> second</del></p>');
    });

    it('should handle mixed content and tags', () => {
      const oldHtml = 'Hello <strong>world</strong> today';
      const newHtml = 'Hello <strong>universe</strong> tomorrow';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('Hello <strong><del class="diffdel">world</del><ins class="diffins">universe</ins></strong> <del class="diffdel">today</del><ins class="diffins">tomorrow</ins>');
    });

    it('should handle special characters', () => {
      const oldHtml = '<p>Hello & world</p>';
      const newHtml = '<p>Hello & universe</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello & <del class="diffdel">world</del><ins class="diffins">universe</ins></p>');
    });

    it('should handle HTML entities', () => {
      const oldHtml = '<p>Hello &amp; world</p>';
      const newHtml = '<p>Hello &amp; universe</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello &amp; <del class="diffdel">world</del><ins class="diffins">universe</ins></p>');
    });

    it('should handle large HTML structures', () => {
      const oldHtml = '<div><h1>Title</h1><p>Paragraph 1</p><p>Paragraph 2</p></div>';
      const newHtml = '<div><h1>New Title</h1><p>Paragraph 1</p><p>Modified Paragraph 2</p></div>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<div><h1><ins class="diffins">New </ins>Title</h1><p>Paragraph 1</p><p><ins class="diffins">Modified </ins>Paragraph 2</p></div>');
    });

    it('should handle malformed HTML gracefully', () => {
      const oldHtml = '<p>Hello <strong>world</p>';
      const newHtml = '<p>Hello <strong>universe</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello <strong><del class="diffdel">world</del><ins class="diffins">universe</ins></p>');
    });

    it('should handle no changes with complex HTML', () => {
      const html = '<div class="container"><h1>Title</h1><p>Content with <span class="highlight">emphasis</span></p></div>';
      const result = htmlDiff(html, html);
      expect(result).to.equal(html);
    });

    it('should handle only whitespace differences', () => {
      const oldHtml = '<p>Hello     world</p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello world</p>');
    });

    it('should handle tag attribute changes (tags treated as different)', () => {
      const oldHtml = '<p class="old">Hello</p>';
      const newHtml = '<p class="new">Hello</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<del class="diffdel"><p class="old"></del><ins class="diffins"><p class="new"></ins>Hello</p>');
    });

    it('should handle completely different HTML structures', () => {
      const oldHtml = '<div><p>Hello</p></div>';
      const newHtml = '<section><h1>Hello</h1></section>';
      const result = htmlDiff(oldHtml, newHtml);
      // Deletes are emitted as one run, then inserts as one run, instead of token-by-token
      // interleaving.
      expect(result).to.equal('<del class="diffdel"><div></del><del class="diffdel"><p></del><ins class="diffins"><section></ins><ins class="diffins"><h1></ins>Hello<del class="diffdel"></p></del><del class="diffdel"></div></del><ins class="diffins"></h1></ins><ins class="diffins"></section></ins>');
    });

    it('should handle insertion at the beginning', () => {
      const oldHtml = '<p>world</p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p><ins class="diffins">Hello </ins>world</p>');
    });

    it('should handle insertion at the end', () => {
      const oldHtml = '<p>Hello</p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello<ins class="diffins"> world</ins></p>');
    });

    it('should handle multiple insertions and deletions', () => {
      const oldHtml = '<p>The quick brown fox jumps</p>';
      const newHtml = '<p>A slow red cat walks</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // No words match so the whole run collapses into one delete + one insert rather than
      // five interleaved word-pair markers.
      expect(result).to.equal('<p><del class="diffdel">The quick brown fox jumps</del><ins class="diffins">A slow red cat walks</ins></p>');
    });
  });

  describe('block-level segmentation', () => {
    it('isolates per-paragraph changes so neighbours stay untouched', () => {
      const oldHtml = '<p>One</p><p>Two</p><p>Three</p>';
      const newHtml = '<p>One</p><p>Two changed</p><p>Three</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>One</p><p>Two<ins class="diffins"> changed</ins></p><p>Three</p>');
    });

    it('marks an inserted paragraph as a single ins block', () => {
      const oldHtml = '<p>One</p><p>Three</p>';
      const newHtml = '<p>One</p><p>Two</p><p>Three</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>One</p><ins class="diffins"><p>Two</p></ins><p>Three</p>');
    });

    it('marks a deleted paragraph as a single del block', () => {
      const oldHtml = '<p>One</p><p>Two</p><p>Three</p>';
      const newHtml = '<p>One</p><p>Three</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>One</p><del class="diffdel"><p>Two</p></del><p>Three</p>');
    });

    it('pairs siblings of the same tag even with no shared words', () => {
      const oldHtml = '<h1>Original Title</h1><p>Body content here</p>';
      const newHtml = '<h1>Brand New Heading</h1><p>Body content here</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // h1 paired with h1 by tag-name signal, body paragraph stays as-is.
      expect(result).to.equal('<h1><del class="diffdel">Original Title</del><ins class="diffins">Brand New Heading</ins></h1><p>Body content here</p>');
    });
  });

  describe('attribute normalization', () => {
    it('treats reordered attributes as equal', () => {
      const oldHtml = '<p class="a" id="x">Hello</p>';
      const newHtml = '<p id="x" class="a">Hello</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // Different string, same attribute set — no diff is emitted; the new-side string is
      // returned verbatim because that's the current state of the document.
      expect(result).to.equal(newHtml);
    });
  });

  describe('semantic cleanup', () => {
    it('coalesces edits separated only by trivial whitespace', () => {
      const oldHtml = '<p>foo bar baz</p>';
      const newHtml = '<p>FOO BAR baz</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // foo→FOO and bar→BAR are merged across the single space anchor.
      expect(result).to.equal('<p><del class="diffdel">foo bar</del><ins class="diffins">FOO BAR</ins> baz</p>');
    });

    it('keeps anchor words between unrelated edits', () => {
      const oldHtml = '<p>alpha SHARED beta</p>';
      const newHtml = '<p>gamma SHARED delta</p>';
      const result = htmlDiff(oldHtml, newHtml);
      // SHARED is a real word equal between two edits — it must anchor and split them.
      expect(result).to.equal('<p><del class="diffdel">alpha</del><ins class="diffins">gamma</ins> SHARED <del class="diffdel">beta</del><ins class="diffins">delta</ins></p>');
    });
  });
});
