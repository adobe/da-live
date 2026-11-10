import { expect } from '@esm-bundle/chai';
import DragHandler from '../../../../blocks/shared/drag-handler.js';

const TYPE = 'application/x-test-item';

function createItem() {
  const item = document.createElement('div');
  item.style.cssText = 'position: fixed; left: 0; top: 0; width: 100px; height: 20px;';
  document.body.append(item);
  return item;
}

/**
 * Dispatches a drag event and invokes the handler while the item is its current
 * target.
 */
function dispatchDrag(item, type, handle, { dataTransfer = new DataTransfer(), clientX = 0 } = {}) {
  const event = new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer, clientX });
  item.addEventListener(type, handle, { once: true });
  item.dispatchEvent(event);
  return event;
}

describe('DragHandler', () => {
  let item;
  let changes;
  let drops;

  const createHandler = (options = {}) => new DragHandler({
    type: TYPE,
    canDrop: () => true,
    onDrop: (move) => drops.push(move),
    onChange: () => { changes += 1; },
    ...options,
  });

  beforeEach(() => {
    item = createItem();
    changes = 0;
    drops = [];
  });

  afterEach(() => {
    item.remove();
  });

  it('carries the dragged id as its data type', () => {
    const handler = createHandler();
    const dataTransfer = new DataTransfer();

    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'), { dataTransfer });

    expect(dataTransfer.getData(TYPE)).to.equal('a');
  });

  it('shows the preview while dragging and removes it when the drag ends', () => {
    const preview = document.createElement('canvas');
    const handler = createHandler({ createPreview: () => preview });

    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'));
    const shownWhileDragging = preview.isConnected;
    handler.end();

    expect(shownWhileDragging).to.be.true;
    expect(preview.isConnected).to.be.false;
  });

  it('marks the side the pointer is over', () => {
    const handler = createHandler();
    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'));

    dispatchDrag(item, 'dragover', (event) => handler.over(event, 'b'), { clientX: 80 });

    expect(handler.dropSide('b')).to.equal('after');
    expect(handler.dropSide('a')).to.equal('');
  });

  it('tells the owner only when the drop marker moves', () => {
    const handler = createHandler();
    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'));

    dispatchDrag(item, 'dragover', (event) => handler.over(event, 'b'), { clientX: 10 });
    dispatchDrag(item, 'dragover', (event) => handler.over(event, 'b'), { clientX: 20 });

    expect(changes).to.equal(1);
  });

  it('drops the dragged item before the target', () => {
    const handler = createHandler();
    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'));

    const event = dispatchDrag(item, 'drop', (drop) => handler.drop(drop, 'b'), { clientX: 10 });

    expect(event.defaultPrevented).to.be.true;
    expect(drops).to.deep.equal([{ id: 'a', targetId: 'b', before: true }]);
    expect(handler.dropSide('b')).to.equal('');
  });

  it('ignores drops that canDrop rejects', () => {
    const handler = createHandler({ canDrop: () => false });
    dispatchDrag(item, 'dragstart', (event) => handler.start(event, 'a'));

    const event = dispatchDrag(item, 'drop', (drop) => handler.drop(drop, 'b'));

    expect(event.defaultPrevented).to.be.false;
    expect(drops).to.deep.equal([]);
  });

  it('ignores drags that did not start here', () => {
    const handler = createHandler();

    const event = dispatchDrag(item, 'dragover', (over) => handler.over(over, 'b'));

    expect(event.defaultPrevented).to.be.false;
    expect(handler.dropSide('b')).to.equal('');
  });
});
