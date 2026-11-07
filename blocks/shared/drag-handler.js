const DROP_BEFORE = 'before';
const DROP_AFTER = 'after';

/**
 * Tells which half of the hovered item the pointer is over.
 *
 * @param {DragEvent} event - A drag event on the item.
 * @returns {string} `before` or `after`.
 */
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
  /** The id of the dragged item, while a drag runs. */
  _draggedId;

  /** The drag preview in the item's DOM, while a drag runs. */
  _preview;

  /** The item `id` and `side` the dragged item would drop on. */
  _drop;

  /**
   * Takes the drag data type, the rules for dropping and the listener for
   * drop marker changes.
   *
   * @param {object} options
   * @param {string} options.type - The data type the drag carries the id as.
   * @param {(id: string, targetId: string) => boolean} options.canDrop - Tells
   *   whether an item may drop next to another one.
   * @param {(move: object) => void} options.onDrop - Moves the item, given its
   *   `id`, the `targetId` and whether it goes `before` the target.
   * @param {() => void} options.onChange - Called when a drag starts or ends
   *   and when the drop marker moves, so the owner can render them.
   * @param {(element: HTMLElement) => HTMLElement} [options.createPreview] -
   *   Draws the drag preview for the dragged element. The browser's default
   *   snapshot shows without it.
   */
  constructor({ type, canDrop, onDrop, onChange, createPreview }) {
    this._type = type;
    this._canDrop = canDrop;
    this._onDrop = onDrop;
    this._onChange = onChange;
    this._createPreview = createPreview;
  }

  /**
   * The id of the item being dragged.
   *
   * @returns {string|undefined} The dragged item's id, or undefined when no
   *   drag runs.
   */
  get draggedId() {
    return this._draggedId;
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
    this._onChange();
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
   * Forgets the drag and removes its drag preview. Tells the owner when a
   * drag or a drop marker was showing.
   */
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

  /**
   * Shows the drag preview, held where the pointer grabbed the element. The
   * preview must be in the DOM for the browser to draw it, and inside the
   * element's shadow root for that root's styles to apply.
   *
   * @param {DragEvent} event - The dragstart event on the dragged element.
   */
  _showPreview(event) {
    const element = event.currentTarget;
    const { left, top } = element.getBoundingClientRect();
    const root = element.getRootNode();
    this._preview = this._createPreview(element);
    (root instanceof ShadowRoot ? root : document.body).append(this._preview);
    event.dataTransfer.setDragImage(this._preview, event.clientX - left, event.clientY - top);
  }

  /**
   * Tells whether the dragged item may drop next to an item.
   *
   * @param {string} targetId - The target item's id.
   * @returns {boolean} Whether the drop is allowed.
   */
  _accepts(targetId) {
    return !!this._draggedId && this._draggedId !== targetId
      && this._canDrop(this._draggedId, targetId);
  }

  /**
   * Moves the drop marker and tells the owner when it changed.
   *
   * @param {object} [drop] - The target item's `id` and the `side` to drop on.
   */
  _setDrop(drop) {
    if (this._drop?.id === drop?.id && this._drop?.side === drop?.side) {
      return;
    }

    this._drop = drop;
    this._onChange();
  }
}
