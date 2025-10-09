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
      expect(result).to.equal('<p>Hello <ins class="diffins"><strong></ins>world<ins class="diffins"></strong></ins></p>');
    });

    it('should handle HTML tag removals', () => {
      const oldHtml = '<p>Hello <strong>world</strong></p>';
      const newHtml = '<p>Hello world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello <del class="diffdel"><strong></del>world<del class="diffdel"></strong></del></p>');
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

    it('should handle whitespace changes', () => {
      const oldHtml = '<p>Hello world</p>';
      const newHtml = '<p>Hello  world</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>Hello<del class="diffdel"> </del><ins class="diffins">  </ins>world</p>');
    });

    it('should handle multiple word changes', () => {
      const oldHtml = '<p>The quick brown fox</p>';
      const newHtml = '<p>The slow red fox</p>';
      const result = htmlDiff(oldHtml, newHtml);
      expect(result).to.equal('<p>The <del class="diffdel">quick</del><ins class="diffins">slow</ins> <del class="diffdel">brown</del><ins class="diffins">red</ins> fox</p>');
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
      expect(result).to.equal('<p><del class="diffdel">one</del><ins class="diffins">alpha</ins> <del class="diffdel">two</del><ins class="diffins">beta</ins> <del class="diffdel">three</del><ins class="diffins">gamma</ins></p>');
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
      expect(result).to.equal('<p>Hello<del class="diffdel">     </del><ins class="diffins"> </ins>world</p>');
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
      expect(result).to.equal('<del class="diffdel"><div></del><ins class="diffins"><section></ins><del class="diffdel"><p></del><ins class="diffins"><h1></ins>Hello<del class="diffdel"></p></del><ins class="diffins"></h1></ins><del class="diffdel"></div></del><ins class="diffins"></section></ins>');
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
      expect(result).to.equal('<p><del class="diffdel">The</del><ins class="diffins">A</ins> <del class="diffdel">quick</del><ins class="diffins">slow</ins> <del class="diffdel">brown</del><ins class="diffins">red</ins> <del class="diffdel">fox</del><ins class="diffins">cat</ins> <del class="diffdel">jumps</del><ins class="diffins">walks</ins></p>');
    });
  });
});
