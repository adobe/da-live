/* eslint-disable no-script-url */
import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import {
  getActiveMarks,
  getListType,
  getLinkAt,
  getLinkDraft,
  applyLink,
  removeLink,
  toggleList,
  getBlockType,
  setBlock,
  isInBlockquote,
  toggleBlockquote,
  BLOCK_TYPES,
  insertHardBreak,
} from '../../../../../../blocks/form/utils/rich-text/commands.js';
import { stateFor, run } from '../../helpers/rich-text-states.js';

describe('rich-text commands', () => {
  describe('selection helpers', () => {
    it('reports marks across a range and at a caret', () => {
      const state = stateFor('<p><strong>ab</strong>cd</p>', { from: 1, to: 3 });
      expect([...getActiveMarks(state)]).to.deep.equal(['strong']);
      const caret = stateFor('<p><em>ab</em>cd</p>', { from: 2 });
      expect(getActiveMarks(caret).has('em')).to.be.true;
      expect(getActiveMarks(stateFor('<p>ab</p>', { from: 2 })).size).to.equal(0);
    });

    it('finds the closest list type', () => {
      expect(getListType(stateFor('<p>a</p>', { from: 1 }))).to.equal(null);
      expect(getListType(stateFor('<ol><li>a</li></ol>', { from: 3 })).name).to.equal('ordered_list');
    });

    it('reports the block type at the caret', () => {
      expect(getBlockType(stateFor('<p>a</p>', { from: 1 }))).to.equal('paragraph');
      expect(getBlockType(stateFor('<h3>a</h3>', { from: 1 }))).to.equal('heading-3');
      expect(BLOCK_TYPES.map((blockType) => blockType.value)).to.include('heading-6');
    });

    it('detects blockquotes around the caret', () => {
      expect(isInBlockquote(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      expect(isInBlockquote(stateFor('<blockquote><ul><li>a</li></ul></blockquote>', { from: 4 }))).to.be.true;
    });

    it('finds the full extent of a link around the caret', () => {
      const state = stateFor('<p>x <a href="/a">li<strong>nk</strong></a> y</p>', { from: 5 });
      expect(getLinkAt(state)).to.deep.equal({ href: '/a', title: '', from: 3, to: 7 });
      expect(getLinkAt(stateFor('<p>plain</p>', { from: 2 }))).to.equal(null);
    });
  });

  describe('commands', () => {
    const link = ({ href, text, title }) => applyLink({ proseMirror, href, text, title });

    it('drafts the link and text around the selection', () => {
      expect(getLinkDraft(stateFor('<p>x <a href="/a" title="T">li<strong>nk</strong></a> y</p>', { from: 5 })))
        .to.deep.equal({ href: '/a', title: 'T', text: 'link' });
      expect(getLinkDraft(stateFor('<p>hello there</p>', { from: 1, to: 6 })))
        .to.deep.equal({ href: '', title: '', text: 'hello' });
      expect(getLinkDraft(stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 })).text).to.equal('a b');
    });

    it('links the selection and keeps its text and marks', () => {
      const state = stateFor('<p><strong>hello</strong> you</p>', { from: 1, to: 6 });
      const { html, state: next } = run(link({ href: 'https://a.b', text: 'hello' }), state);
      expect(html).to.equal('<p><strong><a href="https://a.b">hello</a></strong> you</p>');
      expect(next.selection.from).to.equal(6);
    });

    it('links a multi-paragraph selection without merging it', () => {
      const state = stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 });
      const { html } = run(link({ href: '/x', text: 'a b' }), state);
      expect(html).to.equal('<p><a href="/x">a</a></p><p><a href="/x">b</a></p>');
    });

    it('updates the whole link under the caret', () => {
      const state = stateFor('<p>x <a href="/old">li<strong>nk</strong></a> y</p>', { from: 4 });
      const { html } = run(link({ href: '/new', text: 'link' }), state);
      expect(html).to.equal('<p>x <a href="/new">li</a><strong><a href="/new">nk</a></strong> y</p>');
    });

    it('replaces the text when the display text changes', () => {
      const state = stateFor('<p>x <a href="/a"><em>old</em></a> y</p>', { from: 4 });
      const { html } = run(link({ href: '/b', text: ' new text ' }), state);
      expect(html).to.equal('<p>x <em><a href="/b">new text</a></em> y</p>');
    });

    it('inserts the text or URL at the caret', () => {
      const state = stateFor('<p>go now</p>', { from: 4 });
      expect(run(link({ href: '/x', text: 'here' }), state).html)
        .to.equal('<p>go <a href="/x">here</a>now</p>');
      expect(run(link({ href: '/x', text: '  ' }), state).html)
        .to.equal('<p>go <a href="/x">/x</a>now</p>');
    });

    it('sets, updates and clears the link title', () => {
      const added = run(link({ href: '/a', text: 'ab', title: '  Hi there ' }), stateFor('<p>ab</p>', { from: 1, to: 3 }));
      expect(added.html).to.equal('<p><a href="/a" title="Hi there">ab</a></p>');
      const caret = stateFor(added.html, { from: 2 });
      expect(run(link({ href: '/a', text: 'ab', title: 'New' }), caret).html)
        .to.equal('<p><a href="/a" title="New">ab</a></p>');
      expect(run(link({ href: '/a', text: 'ab', title: ' ' }), caret).html)
        .to.equal('<p><a href="/a">ab</a></p>');
    });

    it('refuses unsafe links', () => {
      const state = stateFor('<p>a</p>', { from: 1, to: 2 });
      expect(run(link({ href: 'javascript:x', text: 'a' }), state).handled).to.be.false;
      expect(link({ href: '/ok' })(state)).to.be.true;
    });

    it('removes a link', () => {
      const { handled, html } = run(removeLink, stateFor('<p><a href="/a">ab</a></p>', { from: 2 }));
      expect(handled).to.be.true;
      expect(html).to.equal('<p>ab</p>');
      expect(run(removeLink, stateFor('<p>ab</p>', { from: 2 })).handled).to.be.false;
    });

    it('toggles and switches lists', () => {
      const bullet = toggleList({ proseMirror, name: 'bullet_list' });
      const ordered = toggleList({ proseMirror, name: 'ordered_list' });
      const wrapped = run(bullet, stateFor('<p>a</p>', { from: 1 }));
      expect(wrapped.html).to.equal('<ul><li><p>a</p></li></ul>');
      const switched = run(ordered, wrapped.state);
      expect(switched.html).to.equal('<ol><li><p>a</p></li></ol>');
      expect(run(ordered, switched.state).html).to.equal('<p>a</p>');
    });

    it('wraps every selected block in its own list item', () => {
      const bullet = toggleList({ proseMirror, name: 'bullet_list' });
      const ordered = toggleList({ proseMirror, name: 'ordered_list' });
      expect(run(bullet, stateFor('<p>aa</p><p>bb</p><p>cc</p>', { from: 2, to: 6 })).html)
        .to.equal('<ul><li><p>aa</p></li><li><p>bb</p></li></ul><p>cc</p>');
      expect(run(bullet, stateFor('<h2>hh</h2><p>bb</p>', { from: 1, to: 6 })).html)
        .to.equal('<ul><li><p>hh</p></li><li><p>bb</p></li></ul>');
      expect(run(ordered, stateFor('<blockquote><p>a</p><p>b</p></blockquote>', { from: 2, to: 6 })).html)
        .to.equal('<blockquote><ol><li><p>a</p></li><li><p>b</p></li></ol></blockquote>');
      expect(run(bullet, stateFor('<p>a</p><blockquote><p>b</p></blockquote>', { from: 1, to: 6 })).handled)
        .to.be.false;
    });

    it('removes the list from every selected item', () => {
      const bullet = toggleList({ proseMirror, name: 'bullet_list' });
      const list = '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul>';
      expect(run(bullet, stateFor(list, { from: 8, to: 14 })).html)
        .to.equal('<ul><li><p>a</p></li></ul><p>b</p><p>c</p><ul><li><p>d</p></li></ul>');
      expect(run(bullet, stateFor(list, { from: 3, to: 19 })).html)
        .to.equal('<p>a</p><p>b</p><p>c</p><p>d</p>');
      const nested = '<ul><li>a<ul><li>b</li></ul></li><li>c</li></ul>';
      expect(run(bullet, stateFor(nested, { from: 3, to: 17 })).html).to.equal('<p>a</p><p>b</p><p>c</p>');
      expect(run(bullet, stateFor(nested, { from: 8 })).html)
        .to.equal('<ul><li><p>a</p></li></ul><p>b</p><ul><li><p>c</p></li></ul>');
    });

    it('changes the block type', () => {
      const heading = run(setBlock({ proseMirror, value: 'heading-2' }), stateFor('<p>a</p>', { from: 1 }));
      expect(heading.html).to.equal('<h2>a</h2>');
      expect(run(setBlock({ proseMirror, value: 'paragraph' }), heading.state).html).to.equal('<p>a</p>');
      expect(run(setBlock({ proseMirror, value: 'heading-7' }), heading.state).handled).to.be.false;
    });

    it('does not change list items into headings', () => {
      const state = stateFor('<ul><li>a</li></ul>', { from: 3 });
      expect(run(setBlock({ proseMirror, value: 'heading-1' }), state).handled).to.be.false;
    });

    it('toggles a blockquote', () => {
      const quote = toggleBlockquote({ proseMirror });
      const wrapped = run(quote, stateFor('<p>a</p><p>b</p>', { from: 1, to: 5 }));
      expect(wrapped.html).to.equal('<blockquote><p>a</p><p>b</p></blockquote>');
      expect(run(quote, wrapped.state).html).to.equal('<p>a</p><p>b</p>');
    });

    it('lifts only the selected block out of a blockquote', () => {
      const state = stateFor('<blockquote><p>a</p><p>b</p></blockquote>', { from: 2 });
      expect(run(toggleBlockquote({ proseMirror }), state).html).to.equal('<p>a</p><blockquote><p>b</p></blockquote>');
    });

    it('inserts a hard break', () => {
      expect(run(insertHardBreak, stateFor('<p>ab</p>', { from: 2 })).html).to.equal('<p>a<br>b</p>');
    });
  });
});
