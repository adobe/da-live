import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import { removeLink, BLOCK_TYPES } from '../../../../../../blocks/form/utils/rich-text/commands.js';
import { TOOL_IDS, createToolset } from '../../../../../../blocks/form/utils/rich-text/tools.js';
import { schema, stateFor, run } from '../../helpers/rich-text-states.js';

/**
 * Creates the toolset and finds its tools by id.
 * @param {object} [options] The settings.
 * @param {() => void} [options.onLink] Opens the link dialog.
 * @returns {{ toolset: object, tool: (id: string) => object }} The toolset and a lookup.
 */
function setup({ onLink = () => {} } = {}) {
  const toolset = createToolset({ proseMirror, schema, onLink });
  const tools = [...toolset.leading, ...toolset.groups.flat(), ...toolset.menuGroups.flat()];
  return { toolset, tool: (id) => tools.find((candidate) => candidate.id === id) };
}

describe('rich-text tools', () => {
  describe('TOOL_IDS', () => {
    it('names every tool once', () => {
      const { toolset } = setup();
      const tools = [...toolset.leading, ...toolset.groups.flat(), ...toolset.menuGroups.flat()];
      const ids = tools.map(({ id }) => id);
      expect(ids).to.have.members(Object.values(TOOL_IDS));
      expect(new Set(ids).size).to.equal(ids.length);
      expect(Object.isFrozen(TOOL_IDS)).to.be.true;
    });

    it('names the toggles after their schema marks and nodes', () => {
      const { toolset } = setup();
      const toggles = [...toolset.groups.flat(), ...toolset.menuGroups.flat()]
        .filter(({ isActive }) => isActive)
        .map(({ id }) => id);
      const names = [...Object.keys(schema.marks), ...Object.keys(schema.nodes)];
      expect(names).to.include.members(toggles);
    });
  });

  describe('commands', () => {
    it('runs the history commands of da-y-wrapper and removes links', () => {
      const { tool } = setup();
      expect(tool(TOOL_IDS.undo).command).to.equal(proseMirror.undo);
      expect(tool(TOOL_IDS.redo).command).to.equal(proseMirror.redo);
      expect(tool(TOOL_IDS.unlink).command).to.equal(removeLink);
    });

    it('toggles marks, lists and blockquotes', () => {
      const { tool } = setup();
      const state = stateFor('<p>ab</p>', { from: 1, to: 3 });
      expect(run(tool(TOOL_IDS.italic).command, state).html).to.equal('<p><em>ab</em></p>');
      expect(run(tool(TOOL_IDS.orderedList).command, state).html).to.equal('<ol><li>ab</li></ol>');
      expect(run(tool(TOOL_IDS.blockquote).command, state).html)
        .to.equal('<blockquote><p>ab</p></blockquote>');
    });

    it('asks for the link dialog only when the command runs', () => {
      const calls = [];
      const { tool } = setup({ onLink: () => calls.push('link') });
      const state = stateFor('<p>ab</p>', { from: 1, to: 3 });
      expect(tool(TOOL_IDS.link).command(state)).to.be.true;
      expect(calls).to.be.empty;
      run(tool(TOOL_IDS.link).command, state);
      expect(calls).to.deep.equal(['link']);
    });

    it('follows the history', () => {
      const { tool } = setup();
      const state = stateFor('');
      expect(tool(TOOL_IDS.undo).command(state)).to.be.false;
      const typed = state.apply(state.tr.insertText('a', 1));
      expect(tool(TOOL_IDS.undo).command(typed)).to.be.true;
      expect(tool(TOOL_IDS.redo).command(typed)).to.be.false;
    });
  });

  describe('selection checks', () => {
    it('follows the marks and link of the selection', () => {
      const { tool } = setup();
      const state = stateFor('<h2><a href="/a"><strong>ab</strong></a></h2>', { from: 1, to: 3 });
      const active = [TOOL_IDS.bold, TOOL_IDS.italic, TOOL_IDS.link]
        .filter((id) => tool(id).isActive(state));
      expect(active).to.deep.equal([TOOL_IDS.bold, TOOL_IDS.link]);
    });

    it('follows the list and blockquote of the caret', () => {
      const { tool } = setup();
      const list = stateFor('<ul><li>a</li></ul>', { from: 3 });
      expect(tool(TOOL_IDS.bulletList).isActive(list)).to.be.true;
      expect(tool(TOOL_IDS.orderedList).isActive(list)).to.be.false;
      const quote = stateFor('<blockquote><p>q</p></blockquote>', { from: 2 });
      expect(tool(TOOL_IDS.blockquote).isActive(quote)).to.be.true;
    });

    it('only shows remove link on a link', () => {
      const { tool } = setup();
      const { isVisible } = tool(TOOL_IDS.unlink);
      expect(isVisible(stateFor('<p>ab</p>', { from: 1, to: 3 }))).to.be.false;
      expect(isVisible(stateFor('<p><a href="/a">ab</a></p>', { from: 1, to: 3 }))).to.be.true;
    });
  });

  describe('picker', () => {
    it('offers the text styles', () => {
      const { toolset } = setup();
      expect(toolset.picker.items.filter(({ value }) => value)).to.deep.equal(BLOCK_TYPES);
    });

    it('reads the text style and only applies outside lists', () => {
      const { picker } = setup().toolset;
      const heading = stateFor('<h2>a</h2>', { from: 1 });
      expect(picker.getValue(heading)).to.equal('heading-2');
      expect(picker.isEnabled(heading)).to.be.true;
      expect(picker.isEnabled(stateFor('<ul><li>a</li></ul>', { from: 3 }))).to.be.false;
    });

    it('changes the text style', () => {
      const { picker } = setup().toolset;
      const state = stateFor('<p>a</p>', { from: 1 });
      expect(run(picker.commandFor('heading-3'), state).html).to.equal('<h3>a</h3>');
    });
  });
});
