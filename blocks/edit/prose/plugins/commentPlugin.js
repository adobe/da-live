/*
 * Copyright 2026 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 */

// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey, Decoration, DecorationSet, TextSelection } from 'da-y-wrapper';
import {
  COMMENT_ADD,
  COMMENT_EDIT,
  COMMENT_DELETE,
  COMMENT_CLOSED,
} from '../../da-comment-panel/da-comment-panel.js';

const commentPluginKey = new PluginKey('commentPlugin');

let panelRef = null;

const NODES = {
  paragraph: 'Paragraph',
  blockquote: 'Blockquote',
  heading: null,
  code_block: 'Code Block',
  bullet_list: 'Bullet List',
  ordered_list: 'Ordered List',
};

function parseComments(dataId) {
  if (dataId == null || dataId === '') return [];
  if (typeof dataId !== 'string') return [];
  const trimmed = dataId.trim();
  if (trimmed === '') return [];
  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(dataId);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [{ id: 'legacy-1', text: trimmed, user: 'unknown', name: 'Unknown', date: new Date(0).toISOString() }];
}

function serializeComments(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return null;
  return JSON.stringify(arr);
}

function getTopLevelBlock(state) {
  const { $from } = state.selection;
  if ($from.depth < 1) return null;
  const pos = $from.before(1);
  const node = state.doc.nodeAt(pos);
  if (!node) return null;
  if (!(node.type.name in NODES)) return null;
  if (node.type.name === 'paragraph' && node.content.size === 0) return null;
  return { pos, node };
}

function canComment(state) {
  return getTopLevelBlock(state) != null;
}

function getBlockLabel(node) {
  if (!node) return '';
  if (node.type.name === 'heading') return `H${node.attrs.level || 1}`;
  return NODES[node.type.name] ?? node.type.name;
}

async function getCurrentUser() {
  if (typeof window.adobeIMS?.getProfile !== 'function') {
    return { email: 'anonymous', name: 'Anonymous' };
  }
  try {
    const profile = await window.adobeIMS.getProfile();
    return {
      email: profile.email || profile.userId || 'anonymous',
      name: profile.displayName || 'Anonymous',
    };
  } catch {
    return { email: 'anonymous', name: 'Anonymous' };
  }
}

export function closeCommentPanel() {
  if (panelRef?.panel?.isConnected) {
    panelRef.panel.close();
  }
  panelRef = null;
}

function refreshContainerPanel() {
  if (!panelRef?.container || !panelRef?.panel) return;
  const { view } = window;
  if (!view) return;
  const block = getTopLevelBlock(view.state);
  const blockPos = block?.pos ?? null;
  if (blockPos === panelRef.blockPos) return;
  const comments = block ? parseComments(block.node.attrs.dataId) : [];
  const { panel } = panelRef;
  panel.comments = [...comments];
  panel.blockPos = blockPos;
  panel.noBlock = !block;
  panel.blockLabel = block ? getBlockLabel(block.node) : '';
  panelRef.blockPos = blockPos;
}

function applyCommentsToBlock(newList) {
  const v = window.view;
  if (!v) return;
  const fresh = getTopLevelBlock(v.state);
  if (!fresh) return;
  const value = serializeComments(newList);
  v.dispatch(v.state.tr.setNodeAttribute(fresh.pos, 'dataId', value));
}

export function openCommentPanel(container, onClose) {
  if (!container || !window.view) return;
  closeCommentPanel();
  const { view } = window;
  const block = getTopLevelBlock(view.state);
  const comments = block ? parseComments(block.node.attrs.dataId) : [];
  const blockPos = block ? block.pos : null;

  getCurrentUser().then((user) => {
    const panel = document.createElement('da-comment-panel');
    panel.comments = [...comments];
    panel.currentUser = user.email;
    panel.blockPos = blockPos;
    panel.noBlock = !block;
    panel.blockLabel = block ? getBlockLabel(block.node) : '';

    panel.addEventListener(COMMENT_ADD, (e) => {
      const { text } = e.detail;
      if (!text?.trim()) return;
      const v = window.view;
      if (!v || !getTopLevelBlock(v.state)) return;
      const newComment = {
        id: `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`,
        text: text.trim(),
        user: user.email,
        name: user.name,
        date: new Date().toISOString(),
      };
      panel.comments = [...panel.comments, newComment];
      applyCommentsToBlock(panel.comments);
    });

    panel.addEventListener(COMMENT_EDIT, (e) => {
      const { id, text } = e.detail;
      if (!id || text == null) return;
      const list = panel.comments.map((c) => (
        c.id === id ? { ...c, text: text.trim(), date: new Date().toISOString() } : c
      ));
      panel.comments = list;
      applyCommentsToBlock(panel.comments);
    });

    panel.addEventListener(COMMENT_DELETE, (e) => {
      const { id } = e.detail;
      const list = panel.comments.filter((c) => c.id !== id);
      panel.comments = list;
      applyCommentsToBlock(panel.comments);
    });

    panel.addEventListener(COMMENT_CLOSED, () => {
      if (panelRef?.panel === panel) panelRef = null;
      if (typeof onClose === 'function') onClose();
      panel.remove();
    });

    container.appendChild(panel);
    panelRef = { panel, blockPos, container };
  });
}

// eslint-disable-next-line no-unused-vars
export function addCommentCommand(state) {
  if (panelRef?.container) {
    refreshContainerPanel();
  } else {
    document.dispatchEvent(new CustomEvent('open-comments-pane'));
  }
  return true;
}

// function openCommentPanel(blockPos) {
//   const { view } = window;
//   if (!view) return;
//   const { state } = view;
//   const { doc } = state;
//   const safePos = Math.min(blockPos + 1, doc.content.size - 1);
//   if (safePos < 0) return;
//   view.dispatch(state.tr.setSelection(TextSelection.create(doc, safePos)));
//   if (panelRef?.container) {
//     refreshContainerPanel();
//   } else {
//     document.dispatchEvent(new CustomEvent('open-comments-pane'));
//   }
// }

function createCommentIcon(comments, blockPos) {
  const count = Array.isArray(comments) ? comments.length : 0;
  const span = document.createElement('span');
  span.className = 'comment-indicator';
  span.title = count ? `${count} comment${count !== 1 ? 's' : ''}` : 'Comment';
  span.setAttribute('aria-label', count ? `${count} comments` : 'Comment');
  span.innerHTML = '<span class="comment-indicator-icon"></span>';
  if (count > 0) {
    const badge = document.createElement('span');
    badge.className = 'comment-count';
    badge.textContent = String(count);
    span.appendChild(badge);
  }
  span.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    openCommentPanel(blockPos);
  });
  return span;
}

/**
 * Builds ProseMirror decorations for blocks that have comments: a `has-comment` node
 * class and a widget (comment icon with optional count) to the left of each block.
 * Used to show which blocks are commented and to open the comment pane on click.
 */
function buildDecorations(state) {
  if (!state?.doc) return DecorationSet.empty;
  const decorations = [];
  state.doc.forEach((node, from) => {
    if (!node.isBlock) return;
    if (!(node.type.name in NODES)) return;
    const comments = parseComments(node.attrs.dataId);
    if (comments.length === 0) return;
    const to = from + node.nodeSize;
    decorations.push(Decoration.node(from, to, { class: 'has-comment' }));
    decorations.push(
      Decoration.widget(from + 1, () => createCommentIcon(comments, from), {
        side: -1,
        key: `comment-${from}-${comments.length}`,
      }),
    );
  });
  return DecorationSet.create(state.doc, decorations);
}

export default function commentPlugin() {
  return new Plugin({
    key: commentPluginKey,
    state: {
      init(_, state) {
        return buildDecorations(state);
      },
      apply(tr, oldDecos, _oldState, newState) {
        if (!tr.docChanged) return oldDecos.map(tr.mapping, tr.doc);
        return buildDecorations(newState);
      },
    },
    props: {
      decorations(state) {
        return commentPluginKey.getState(state) ?? DecorationSet.empty;
      },
    },
    view: () => ({ update() { refreshContainerPanel(); } }),
  });
}

export { canComment, getTopLevelBlock, parseComments, serializeComments };
