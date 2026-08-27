import {
  EditorState,
  EditorView,
  NodeSelection,
  baseKeymap,
  keymap,
} from 'da-y-wrapper';
import {
  collectCells,
  cellImageNode,
  getCellContentImagePosition,
  getCellImagePosition,
  replaceCellContent,
  replaceCellContentNode,
} from '../../editor-utils/table-cells.js';
import {
  appendBlockRow,
  deleteBlockRow,
  getTableBlockName,
  getTableBlockVariant,
  moveBlockRow,
} from '../../editor-utils/blocks.js';
import { openImagePicker } from '../../editor-utils/selection-toolbar.js';

/**
 * UI rendered by quickBlockViewState.js as a widget decoration immediately before the
 * real table. The table stays in the editor DOM and is hidden by a node decoration.
 */

const PLACEHOLDER = '(empty)';

function cellText(cell) {
  return cell.textBetween(0, cell.content.size, '\n').trim();
}

function pillLabel(cell) {
  const img = cellImageNode(cell);
  if (img) return img.attrs.alt || img.attrs.src?.split('/').pop() || 'Image';
  const text = cellText(cell);
  return text || PLACEHOLDER;
}

function contentImageNode(node) {
  if (node.type.name === 'image') return node;
  if (node.childCount === 1 && node.firstChild.type.name === 'image') {
    return node.firstChild;
  }
  return null;
}

function contentLabel(node) {
  const img = contentImageNode(node);
  if (img) return img.attrs.alt || img.attrs.src?.split('/').pop() || 'Image';
  const text = node.textBetween(0, node.content.size, '\n').trim();
  if (text) return text;
  if (node.isTextblock) return PLACEHOLDER;
  const type = node.type.name.replaceAll('_', ' ');
  return type.charAt(0).toUpperCase() + type.slice(1);
}

export default class QuickBlockView {
  constructor(node, view, getPos, setViewMode, {
    imagePicker,
    multi = false,
    getMultiTemplateRow,
  } = {}) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.setViewMode = setViewMode;
    this.imagePicker = imagePicker ?? openImagePicker;
    this.multi = multi;
    this.getMultiTemplateRow = getMultiTemplateRow;
    this.multiTemplateRow = null;
    this.multiTemplateRequested = false;
    this.editingIndex = null;
    this.popupEditor = null;
    this.destroyed = false;

    this.dom = document.createElement('div');
    this.dom.className = 'quick-block quick-block-ui';
    this.dom.contentEditable = 'false';
    this.dom.destroyQuickBlock = () => this.destroy();

    this.render();
  }

  _toggleViewMode(e) {
    e.preventDefault();
    e.stopPropagation();
    const pos = this.getPos();
    if (pos == null) return;
    this.setViewMode(this.view, pos, 'table');
  }

  _renderHeader() {
    const header = document.createElement('div');
    header.className = 'quick-block-header';
    header.addEventListener('mousedown', (event) => event.preventDefault());
    header.addEventListener('click', (event) => event.stopPropagation());

    const name = document.createElement('span');
    name.className = 'quick-block-name';
    const blockName = getTableBlockName(this.node) || 'Block';
    const variant = getTableBlockVariant(this.node);
    name.textContent = variant ? `${blockName} (${variant})` : blockName;
    header.appendChild(name);

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'quick-block-toggle';
    btn.setAttribute('aria-label', 'Show table view');
    btn.title = 'Show table view';
    btn.innerHTML = '<svg aria-hidden="true" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-table-20-n.svg#icon"></use></svg>';
    btn.addEventListener('mousedown', (evt) => evt.preventDefault());
    btn.addEventListener('click', (evt) => this._toggleViewMode(evt));
    header.appendChild(btn);

    return header;
  }

  _commitEdit(rowIndex, cellIndex, content) {
    const pos = this.getPos();
    if (pos == null) return false;
    return replaceCellContent(this.view, pos, rowIndex, cellIndex, content);
  }

  _commitContentEdit(rowIndex, cellIndex, contentIndex, content) {
    const pos = this.getPos();
    if (pos == null) return false;
    return replaceCellContentNode(
      this.view,
      pos,
      rowIndex,
      cellIndex,
      contentIndex,
      content,
    );
  }

  async _loadMultiTemplateRow() {
    if (!this.multi || !this.getMultiTemplateRow || this.multiTemplateRequested) return;
    this.multiTemplateRequested = true;
    try {
      const row = await this.getMultiTemplateRow(getTableBlockName(this.node));
      if (this.destroyed || !row) return;
      this.multiTemplateRow = row;
      this.render();
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Unable to load the multi-block item template.', error);
    }
  }

  _destroyPopupEditor() {
    this.popupPositionCleanup?.();
    this.popupPositionCleanup = null;
    this.popupEditor?.destroy();
    this.popupEditor = null;
  }

  _positionPopup(pill, popup) {
    const viewport = window.visualViewport;
    const viewportLeft = viewport?.offsetLeft ?? 0;
    const viewportTop = viewport?.offsetTop ?? 0;
    const viewportRight = viewportLeft + (viewport?.width || window.innerWidth);
    const viewportBottom = viewportTop + (viewport?.height || window.innerHeight);
    const editorRect = this.dom.closest('.ew-editor-doc')?.getBoundingClientRect();
    const margin = 16;
    const gap = 8;
    const bounds = {
      left: Math.max(viewportLeft, editorRect?.left ?? viewportLeft) + margin,
      top: Math.max(viewportTop, editorRect?.top ?? viewportTop) + margin,
      right: Math.min(viewportRight, editorRect?.right ?? viewportRight) - margin,
      bottom: Math.min(viewportBottom, editorRect?.bottom ?? viewportBottom) - margin,
    };

    popup.style.width = `${Math.max(0, Math.min(480, bounds.right - bounds.left))}px`;
    popup.style.left = '0px';
    popup.style.top = `calc(100% + ${gap}px)`;
    popup.style.bottom = 'auto';
    popup.style.maxHeight = '';

    const pillRect = pill.getBoundingClientRect();
    let popupRect = popup.getBoundingClientRect();
    let left = 0;
    if (popupRect.right > bounds.right) left -= popupRect.right - bounds.right;
    if (popupRect.left + left < bounds.left) left += bounds.left - (popupRect.left + left);
    popup.style.left = `${left}px`;

    popupRect = popup.getBoundingClientRect();
    const spaceBelow = bounds.bottom - pillRect.bottom - gap;
    const spaceAbove = pillRect.top - bounds.top - gap;
    const openAbove = popupRect.height > spaceBelow && spaceAbove > spaceBelow;
    if (openAbove) {
      popup.style.top = 'auto';
      popup.style.bottom = `calc(100% + ${gap}px)`;
    }
    popup.style.maxHeight = `${Math.max(0, openAbove ? spaceAbove : spaceBelow)}px`;
  }

  _trackPopupPosition(pill, popup) {
    const reposition = () => {
      if (!this.destroyed && popup.isConnected) this._positionPopup(pill, popup);
    };
    const editor = this.dom.closest('.ew-editor-doc');
    const viewport = window.visualViewport;
    const resizeObserver = typeof ResizeObserver === 'function'
      ? new ResizeObserver(reposition)
      : null;
    if (editor) resizeObserver?.observe(editor);
    editor?.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition);
    viewport?.addEventListener('resize', reposition);
    viewport?.addEventListener('scroll', reposition);
    this.popupPositionCleanup = () => {
      resizeObserver?.disconnect();
      editor?.removeEventListener('scroll', reposition);
      window.removeEventListener('resize', reposition);
      viewport?.removeEventListener('resize', reposition);
      viewport?.removeEventListener('scroll', reposition);
    };
    queueMicrotask(reposition);
  }

  _openImage(rowIndex, cellIndex) {
    const tablePos = this.getPos();
    if (tablePos == null) return;
    const imagePos = getCellImagePosition(
      this.node,
      tablePos,
      rowIndex,
      cellIndex,
    );
    if (imagePos == null) return;
    const selection = NodeSelection.create(this.view.state.doc, imagePos);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.imagePicker(this.view);
  }

  _openContentImage(rowIndex, cellIndex, contentIndex) {
    const tablePos = this.getPos();
    if (tablePos == null) return;
    const imagePos = getCellContentImagePosition(
      this.node,
      tablePos,
      rowIndex,
      cellIndex,
      contentIndex,
    );
    if (imagePos == null) return;
    const selection = NodeSelection.create(this.view.state.doc, imagePos);
    this.view.dispatch(this.view.state.tr.setSelection(selection));
    this.imagePicker(this.view);
  }

  _renderPopup(pill, content, onCommit) {
    const popup = document.createElement('div');
    popup.className = 'quick-block-popup';

    const label = document.createElement('div');
    label.className = 'quick-block-popup-label';
    label.textContent = 'Edit';
    popup.appendChild(label);

    const editorMount = document.createElement('div');
    editorMount.className = 'quick-block-popup-editor';
    popup.appendChild(editorMount);

    let closing = false;
    const close = (shouldCommit) => {
      if (closing || this.destroyed) return;
      closing = true;
      const updatedContent = this.popupEditor?.state.doc.content;
      this._destroyPopupEditor();
      this.editingIndex = null;
      this.render();
      if (shouldCommit && updatedContent) onCommit(updatedContent);
    };

    const doc = this.view.state.schema.topNodeType.create(null, content);
    const state = EditorState.create({
      doc,
      plugins: [keymap(baseKeymap)],
    });
    const editor = new EditorView(editorMount, {
      state,
      dispatchTransaction: (tr) => {
        const next = editor.state.apply(tr);
        editor.updateState(next);
      },
      handleKeyDown: (_view, event) => {
        if (event.key === 'Escape') {
          close(false);
          return true;
        }
        if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
          close(true);
          return true;
        }
        return false;
      },
    });
    this.popupEditor = editor;
    popup.addEventListener('mousedown', (event) => event.stopPropagation());
    popup.addEventListener('click', (event) => event.stopPropagation());
    popup.addEventListener('focusout', () => {
      queueMicrotask(() => {
        if (this.destroyed || popup.contains(document.activeElement)) return;
        close(true);
      });
    });

    pill.appendChild(popup);
    this._trackPopupPosition(pill, popup);
    queueMicrotask(() => {
      if (!this.destroyed && this.popupEditor === editor) editor.focus();
    });
  }

  _renderPill(rowIndex, cellIndex, cell) {
    const pill = document.createElement('div');
    pill.className = 'quick-block-pill';

    const img = cellImageNode(cell);
    if (img) {
      const thumb = document.createElement('img');
      thumb.className = 'quick-block-pill-thumb';
      thumb.src = img.attrs.src;
      thumb.alt = img.attrs.alt || '';
      pill.appendChild(thumb);
    }

    const text = document.createElement('span');
    text.className = 'quick-block-pill-text';
    text.textContent = pillLabel(cell);
    pill.appendChild(text);

    pill.addEventListener('mousedown', (e) => e.preventDefault());
    pill.addEventListener('click', (e) => {
      if (e.target.closest('.quick-block-popup')) return;
      e.preventDefault();
      e.stopPropagation();
      if (img) {
        this._openImage(rowIndex, cellIndex);
        return;
      }
      this.editingIndex = `${rowIndex}:${cellIndex}`;
      this.render();
    });

    if (this.editingIndex === `${rowIndex}:${cellIndex}`) {
      this._renderPopup(
        pill,
        cell.content,
        (content) => this._commitEdit(rowIndex, cellIndex, content),
      );
    }

    return pill;
  }

  _renderContentPill(rowIndex, cellIndex, contentIndex, node) {
    const pill = document.createElement('div');
    pill.className = 'quick-block-pill';

    const img = contentImageNode(node);
    if (img) {
      const thumb = document.createElement('img');
      thumb.className = 'quick-block-pill-thumb';
      thumb.src = img.attrs.src;
      thumb.alt = img.attrs.alt || '';
      pill.appendChild(thumb);
    }

    const text = document.createElement('span');
    text.className = 'quick-block-pill-text';
    text.textContent = contentLabel(node);
    pill.appendChild(text);

    const editingIndex = `${rowIndex}:${cellIndex}:${contentIndex}`;
    pill.addEventListener('mousedown', (event) => event.preventDefault());
    pill.addEventListener('click', (event) => {
      if (event.target.closest('.quick-block-popup')) return;
      event.preventDefault();
      event.stopPropagation();
      if (img) {
        this._openContentImage(rowIndex, cellIndex, contentIndex);
        return;
      }
      this.editingIndex = editingIndex;
      this.render();
    });

    if (this.editingIndex === editingIndex) {
      this._renderPopup(
        pill,
        node,
        (content) => this._commitContentEdit(
          rowIndex,
          cellIndex,
          contentIndex,
          content,
        ),
      );
    }

    return pill;
  }

  _deleteItem(rowIndex) {
    const pos = this.getPos();
    if (pos == null || !deleteBlockRow(this.view, pos, rowIndex)) return;
    this.view.focus();
  }

  _addItem() {
    const pos = this.getPos();
    if (pos == null || !this.multiTemplateRow) return;
    appendBlockRow(this.view, pos, this.multiTemplateRow);
    this.view.focus();
  }

  _clearItemDragState() {
    this.dragSource?.classList.remove('dragging');
    this.dropTarget?.element.removeAttribute('data-drop-active');
    this.dragSource = null;
    this.draggingRowIndex = null;
    this.dropTarget = null;
  }

  _onItemDragStart(event, item, rowIndex) {
    this._clearItemDragState();
    this.dragSource = item;
    this.draggingRowIndex = rowIndex;
    item.classList.add('dragging');
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', `${rowIndex}`);
    }
  }

  _onDropTargetDragOver(event, element, insertionIndex) {
    if (this.draggingRowIndex == null) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
    this.dropTarget?.element.removeAttribute('data-drop-active');
    element.setAttribute('data-drop-active', '');
    this.dropTarget = { element, insertionIndex };
  }

  _onItemDrop(event) {
    event.preventDefault();
    event.stopPropagation();
    const fromRowIndex = this.draggingRowIndex;
    const target = this.dropTarget;
    this._clearItemDragState();
    const pos = this.getPos();
    if (pos == null || fromRowIndex == null || !target) return;
    if (moveBlockRow(
      this.view,
      pos,
      fromRowIndex,
      target.insertionIndex,
    )) {
      this.view.focus();
    }
  }

  _renderDropTarget(insertionIndex) {
    const target = document.createElement('div');
    target.className = 'quick-block-drop-target';
    target.setAttribute('aria-hidden', 'true');
    target.addEventListener('dragover', (event) => {
      this._onDropTargetDragOver(event, target, insertionIndex);
    });
    target.addEventListener('dragleave', () => {
      target.removeAttribute('data-drop-active');
      if (this.dropTarget?.element === target) this.dropTarget = null;
    });
    target.addEventListener('drop', (event) => this._onItemDrop(event));
    return target;
  }

  _renderDragHandle(item, rowIndex) {
    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'quick-block-item-drag';
    handle.draggable = true;
    handle.setAttribute('aria-label', 'Reorder item');
    handle.title = 'Reorder item';
    handle.innerHTML = '<svg aria-hidden="true" class="quick-block-drag-icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-draghandle-20-n.svg#icon"></use></svg>';
    handle.addEventListener('click', (event) => event.preventDefault());
    handle.addEventListener('dragstart', (event) => {
      this._onItemDragStart(event, item, rowIndex);
    });
    handle.addEventListener('dragend', () => this._clearItemDragState());
    return handle;
  }

  _renderIconButton(className, label, icon, onClick) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.setAttribute('aria-label', label);
    button.title = label;
    button.innerHTML = `<svg aria-hidden="true" class="quick-block-item-icon" viewBox="0 0 20 20"><use href="/img/icons/s2-icon-${icon}-20-n.svg#icon"></use></svg>`;
    button.addEventListener('mousedown', (event) => event.preventDefault());
    button.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      onClick();
    });
    return button;
  }

  _renderMultiItems() {
    const items = document.createElement('div');
    items.className = 'quick-block-items';

    for (let rowIndex = 1; rowIndex < this.node.childCount; rowIndex += 1) {
      const slot = document.createElement('div');
      slot.className = 'quick-block-item-slot';
      slot.appendChild(this._renderDropTarget(rowIndex));

      const row = this.node.child(rowIndex);
      const item = document.createElement('div');
      item.className = 'quick-block-item';

      const pills = document.createElement('div');
      pills.className = 'quick-block-item-pills';
      row.forEach((cell, _cellOffset, cellIndex) => {
        cell.forEach((content, _contentOffset, contentIndex) => {
          pills.appendChild(this._renderContentPill(
            rowIndex,
            cellIndex,
            contentIndex,
            content,
          ));
        });
      });
      item.appendChild(pills);
      item.appendChild(this._renderIconButton(
        'quick-block-item-delete',
        'Delete item',
        'delete',
        () => this._deleteItem(rowIndex),
      ));
      item.appendChild(this._renderDragHandle(item, rowIndex));
      slot.appendChild(item);
      if (rowIndex === this.node.childCount - 1) {
        slot.appendChild(this._renderDropTarget(this.node.childCount));
      }
      items.appendChild(slot);
    }
    if (this.node.childCount === 1) items.appendChild(this._renderDropTarget(1));

    if (this.multiTemplateRow) {
      items.appendChild(this._renderIconButton(
        'quick-block-add-item',
        'Add item',
        'addcircle',
        () => this._addItem(),
      ));
    }

    return items;
  }

  render() {
    this._destroyPopupEditor();
    this.dom.innerHTML = '';
    this.dom.appendChild(this._renderHeader());

    if (this.multi) {
      this._loadMultiTemplateRow();
      this.dom.appendChild(this._renderMultiItems());
      return;
    }

    const pillRow = document.createElement('div');
    pillRow.className = 'quick-block-pills';
    collectCells(this.node).forEach(({ rowIndex, cellIndex, cell }) => {
      if (rowIndex === 0) return;
      pillRow.appendChild(this._renderPill(rowIndex, cellIndex, cell));
    });
    this.dom.appendChild(pillRow);
  }

  destroy() {
    this.destroyed = true;
    this._destroyPopupEditor();
  }
}

export function createQuickBlockWidget(
  node,
  view,
  getPos,
  setViewMode,
  options = {},
) {
  return new QuickBlockView(node, view, getPos, setViewMode, {
    imagePicker: openImagePicker,
    ...options,
  }).dom;
}

export function createQuickBlockTableToggle(view, getPos, setViewMode) {
  const container = document.createElement('div');
  container.className = 'quick-block-ui quick-block-table-toggle-ui';
  container.contentEditable = 'false';

  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'quick-block-table-toggle';
  button.setAttribute('aria-label', 'Show quick view');
  button.title = 'Show quick view';
  button.addEventListener('mousedown', (event) => event.preventDefault());
  button.addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    const pos = getPos();
    if (pos != null) setViewMode(view, pos, 'quick');
  });
  container.append(button);

  return container;
}
