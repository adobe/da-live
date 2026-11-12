import { expect } from '@esm-bundle/chai';
import * as proseMirror from 'da-y-wrapper';
import { removeLink, BLOCK_TYPES } from '../../../../../../blocks/form/utils/rich-text/commands.js';
import {
  TOOL_IDS,
  buildKeymap,
  createToolset,
  listTools,
} from '../../../../../../blocks/form/utils/rich-text/tools.js';
import { schema, stateFor, run } from '../../helpers/rich-text-states.js';

function setup({ onLink = () => {} } = {}) {
  const toolset = createToolset({ proseMirror, schema, onLink });
  const tools = listTools(toolset);
  return { toolset, tool: (id) => tools.find((candidate) => candidate.id === id) };
}

describe('rich-text tools', () => {
  describe('TOOL_IDS', () => {
    it('names every tool once', () => {
      const { toolset } = setup();
      const ids = listTools(toolset).map(({ id }) => id);
      expect(ids).to.have.members(Object.values(TOOL_IDS));
      expect(new Set(ids).size).to.equal(ids.length);
      expect(Object.isFrozen(TOOL_IDS)).to.be.true;
    });

    it('names the toggles after their schema marks and nodes', () => {
      const { toolset } = setup();
      const toggles = listTools(toolset)
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
      expect(run(tool(TOOL_IDS.orderedList).command, state).html).to.equal('<ol><li><p>ab</p></li></ol>');
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
      expect(toolset.picker.items).to.deep.equal(BLOCK_TYPES);
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

  describe('keymap', () => {
    const keymapFor = (options) => {
      const { toolset } = setup(options);
      return buildKeymap({ proseMirror, schema, toolset });
    };

    it('binds the shortcuts of the tools', () => {
      const { tool } = setup();
      const keys = keymapFor();
      expect(keys['Mod-z']).to.equal(proseMirror.undo);
      expect(keys['Mod-Shift-z']).to.equal(proseMirror.redo);
      expect(keys['Mod-y']).to.equal(proseMirror.redo);
      expect(keys['Mod-b']).to.be.a('function');
      expect(keys['Mod-k']).to.be.a('function');
      expect(Object.keys(keys)).to.include.members(
        [TOOL_IDS.code, TOOL_IDS.orderedList, TOOL_IDS.bulletList, TOOL_IDS.blockquote]
          .map((id) => tool(id).keys),
      );
    });

    it('binds the Canvas shortcuts, underline and strikethrough', () => {
      const keys = keymapFor();
      ['Mod-`', 'Ctrl-Shift-0', 'Ctrl-Shift-6', 'Ctrl-Shift->', 'Ctrl-Shift-8', 'Ctrl-Shift-9', 'Mod-u', 'Mod-Shift-s']
        .forEach((key) => expect(keys[key], key).to.be.a('function'));
      ['Mod-Shift-x', 'Mod-.', 'Mod-,', 'Mod-Shift-k']
        .forEach((key) => expect(keys[key], key).to.equal(undefined));
    });

    it('changes the text style', () => {
      const { 'Ctrl-Shift-2': heading, 'Ctrl-Shift-0': paragraph } = keymapFor();
      const changed = run(heading, stateFor('<p>a</p>', { from: 1 }));
      expect(changed.html).to.equal('<h2>a</h2>');
      expect(run(paragraph, changed.state).html).to.equal('<p>a</p>');
    });

    it('opens the link dialog for Mod-k, which applies anywhere', () => {
      const calls = [];
      const keys = keymapFor({ onLink: () => calls.push('link') });
      const state = stateFor('<p>a</p>');
      expect(keys['Mod-k'](state)).to.be.true;
      expect(calls).to.be.empty;
      expect(keys['Mod-k'](state, () => {})).to.be.true;
      expect(calls).to.deep.equal(['link']);
    });

    it('indents and outdents list items', () => {
      const { Tab: indent, 'Shift-Tab': outdent } = keymapFor();
      const flat = '<ul><li><p>a</p></li><li><p>b</p></li></ul>';
      expect(indent(stateFor(flat, { from: 3 }))).to.be.false;
      expect(indent(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      expect(outdent(stateFor('<p>a</p>', { from: 1 }))).to.be.false;
      const nested = run(indent, stateFor(flat, { from: 8 }));
      expect(nested.html).to.equal('<ul><li><p>a</p><ul><li><p>b</p></li></ul></li></ul>');
      const lifted = run(outdent, nested.state);
      expect(lifted.html).to.equal(flat);
      expect(run(outdent, lifted.state).html).to.equal('<ul><li><p>a</p></li></ul><p>b</p>');
    });

    it('inserts a hard break', () => {
      const { 'Shift-Enter': shiftEnter, 'Mod-Enter': modEnter } = keymapFor();
      expect(run(shiftEnter, stateFor('<p>ab</p>', { from: 2 })).html).to.equal('<p>a<br>b</p>');
      expect(modEnter).to.equal(shiftEnter);
    });
  });
});
