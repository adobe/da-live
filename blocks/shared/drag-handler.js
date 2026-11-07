const DROP_BEFORE = 'before';
const DROP_AFTER = 'after';

function dropSideOf(event) {
  const { left, width } = event.currentTarget.getBoundingClientRect();
  return event.clientX < left + width / 2 ? DROP_BEFORE : DROP_AFTER;
}

/**
 * Lets the user reorder side by side items by dragging them. The owner binds
 * the drag events of each item to `start`, `over`, `leave`, `drop` and `end`,
 * renders `draggedId` and `dropSide` whenever `onChange` fires and decides
 * through `canDrop` and `onDrop` which moves are allowed and what they do.
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

  get draggedId() {
    return this._draggedId;
  }

  dropSide(id) {
    return this._drop?.id === id ? this._drop.side : '';
  }

  start(event, id) {
    this.end();
    this._draggedId = id;
    event.stopPropagation();
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData(this._type, id);
    if (this._createPreview) {
      this._showPreview(event);
    }
    this._onChange();
  }

  over(event, targetId) {
    if (!this._accepts(targetId)) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = 'move';
    this._setDrop({ id: targetId, side: dropSideOf(event) });
  }

  leave() {
    this._setDrop(undefined);
  }

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

  end() {
    this._preview?.remove();
    this._preview = undefined;
    const wasActive = this._draggedId !== undefined || this._drop !== undefined;
    this._draggedId = undefined;
    this._drop = undefined;
    if (wasActive) {
      this._onChange();
    }
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
