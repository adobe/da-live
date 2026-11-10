const DROP_BEFORE = 'before';
const DROP_AFTER = 'after';

function dropSideOf(event) {
  const { left, width } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left + width / 2 ? DROP_BEFORE : DROP_AFTER;
}

/**
 * Lets the user reorder side by side items by dragging them. The owner binds
 * the drag events of each item to `start`, `over`, `leave`, `drop` and `end`,
 * renders `dropSide` whenever `onChange` fires and decides through `canDrop`
 * and `onDrop` which moves are allowed and what they do.
 *
 * Only drags that started here can drop, so drops from elsewhere on the page
 * or from outside it are ignored.
 */
export default class DragHandler {
  _draggedId;

  _preview;

  _drop;

  constructor({ type, canDrop, onDrop, onChange, createPreview }) {
    this._type = type;
    this._canDrop = canDrop;
    this._onDrop = onDrop;
    this._onChange = onChange;
    this._createPreview = createPreview;
  }

  /**
   * Tells which side of an item the dragged item would drop on.
   *
   * @param {string} id - The item's id.
   * @returns {string} `before`, `after`, or empty when it's not the target.
   */
  dropSide(id) {
    return this._drop?.id === id ? this._drop.side : '';
  }

  /**
   * Starts dragging an item.
   *
   * @param {DragEvent} event - The dragstart event on the dragged element.
   * @param {string} id - The dragged item's id.
   */
  start(event, id) {
    this.end();
    this._draggedId = id;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(this._type, id);
    if (this._createPreview) {
      this._showPreview(event);
    }
  }

  /**
   * Marks the side of an item the dragged item would drop on.
   *
   * @param {DragEvent} event - The dragover event on the item.
   * @param {string} targetId - The hovered item's id.
   */
  over(event, targetId) {
    if (!this._accepts(targetId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    this._setDrop({ id: targetId, side: dropSideOf(event) });
  }

  /**
   * Clears the drop marker once the pointer leaves an item.
   */
  leave() {
    this._setDrop(undefined);
  }

  /**
   * Drops the dragged item before or after an item.
   *
   * @param {DragEvent} event - The drop event on the item.
   * @param {string} targetId - The target item's id.
   */
  drop(event, targetId) {
    if (!this._accepts(targetId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    const before = dropSideOf(event) === DROP_BEFORE;
    this._onDrop({ id: this._draggedId, targetId, before });
    this.end();
  }

  /**
   * Forgets the drag and removes its drag preview.
   */
  end() {
    this._preview?.remove();
    this._preview = undefined;
    this._draggedId = undefined;
    this._setDrop(undefined);
  }

  _showPreview(event) {
    const element = event.currentTarget;
    const { left, top } = element.getBoundingClientRect();
    const root = element.getRootNode();
    this._preview = this._createPreview(element);
    (root instanceof ShadowRoot ? root : document.body).append(this._preview);
    event.dataTransfer.setDragImage(this._preview, event.clientX - left, event.clientY - top);
  }

  _accepts(targetId) {
    return !!this._draggedId && this._draggedId !== targetId
      && this._canDrop(this._draggedId, targetId);
  }

  _setDrop(drop) {
    if (this._drop?.id === drop?.id && this._drop?.side === drop?.side) {
      return;
    }

    this._drop = drop;
    this._onChange();
  }
}
