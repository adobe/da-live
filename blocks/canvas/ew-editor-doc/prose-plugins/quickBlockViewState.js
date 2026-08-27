import { Plugin, PluginKey, Decoration, DecorationSet } from 'da-y-wrapper';
import { getTableBlockName } from '../../editor-utils/blocks.js';
import { isMultiBlockConfigured } from '../../editor-utils/multi-block.js';
import { isQuickBlockConfigured } from '../../editor-utils/quick-block.js';
import {
  createQuickBlockTableToggle,
  createQuickBlockWidget,
} from './quickBlockView.js';

export const QUICK_BLOCK_TABLE_HIDDEN_CLASS = 'quick-block-table-hidden';

/**
 * Tracks, per top-level table position, whether a "quick block" (see
 * editor-utils/quick-block.js) currently renders as pills (`'quick'`, the default) or
 * as the plain table (`'table'`, after the header toggle). Modeled on blockFocus.js:
 * a plugin-state Map keyed by position, remapped across edits via `tr.mapping`, so a
 * toggle survives collab/undo without touching the document itself.
 */
export const quickBlockViewKey = new PluginKey('quickBlockView');

function remapModes(modes, mapping) {
  const next = new Map();
  modes.forEach((mode, pos) => {
    const mapped = mapping.mapResult(pos);
    if (!mapped.deleted) next.set(mapped.pos, mode);
  });
  return next;
}

export function getQuickBlockViewMode(state, pos) {
  return quickBlockViewKey.getState(state)?.modes.get(pos) ?? 'quick';
}

export function setQuickBlockViewMode(view, pos, mode) {
  if (!view) return;
  view.dispatch(view.state.tr.setMeta(quickBlockViewKey, { pos, mode }));
}

function buildDecorations(doc, modes, rows, imagePicker, getMultiTemplateRow) {
  const decorations = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') return;
    const blockName = getTableBlockName(node);
    const multi = isMultiBlockConfigured(rows, blockName);
    if (!multi && !isQuickBlockConfigured(rows, blockName)) return;

    const mode = modes.get(pos) ?? 'quick';
    if (mode === 'table') {
      decorations.push(Decoration.widget(
        pos,
        (view, getPos) => createQuickBlockTableToggle(
          view,
          getPos,
          setQuickBlockViewMode,
        ),
        {
          side: -1,
          key: `quick-block-table-toggle-${pos}`,
          ignoreSelection: true,
          stopEvent: () => true,
        },
      ));
      return;
    }

    decorations.push(
      Decoration.widget(
        pos,
        (view, getPos) => createQuickBlockWidget(
          node,
          view,
          getPos,
          setQuickBlockViewMode,
          {
            imagePicker,
            multi,
            getMultiTemplateRow,
          },
        ),
        {
          side: -1,
          key: `quick-block-${pos}-${JSON.stringify(node.toJSON())}`,
          ignoreSelection: true,
          stopEvent: () => true,
          destroy: (dom) => dom.destroyQuickBlock?.(),
        },
      ),
      Decoration.node(pos, pos + node.nodeSize, { class: QUICK_BLOCK_TABLE_HIDDEN_CLASS }),
    );
  });
  return DecorationSet.create(doc, decorations);
}

export default function quickBlockView(rows, { imagePicker, getMultiTemplateRow } = {}) {
  const templateRows = new Map();
  const loadMultiTemplateRow = getMultiTemplateRow
    ? (blockName) => {
      if (!templateRows.has(blockName)) {
        const request = getMultiTemplateRow(blockName)
          .catch((error) => {
            templateRows.delete(blockName);
            throw error;
          });
        templateRows.set(blockName, request);
      }
      return templateRows.get(blockName);
    }
    : undefined;

  return new Plugin({
    key: quickBlockViewKey,
    state: {
      init(_config, state) {
        const modes = new Map();
        return {
          modes,
          decorations: buildDecorations(
            state.doc,
            modes,
            rows,
            imagePicker,
            loadMultiTemplateRow,
          ),
        };
      },
      apply(tr, prev, _oldState, newState) {
        const meta = tr.getMeta(quickBlockViewKey);
        if (!tr.docChanged && !meta) return prev;

        const remapped = tr.docChanged ? remapModes(prev.modes, tr.mapping) : prev.modes;
        const modes = meta ? new Map(remapped) : remapped;
        if (meta) modes.set(meta.pos, meta.mode);
        return {
          modes,
          decorations: buildDecorations(
            newState.doc,
            modes,
            rows,
            imagePicker,
            loadMultiTemplateRow,
          ),
        };
      },
    },
    props: {
      decorations(state) {
        return quickBlockViewKey.getState(state)?.decorations ?? null;
      },
    },
  });
}
