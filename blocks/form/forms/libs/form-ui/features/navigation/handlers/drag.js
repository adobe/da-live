import { UI_CLASS as CLASS } from '../../../constants.js';

/**
 * Attach drag handlers to freshly rendered draggable nav items.
 * Returns a cleanup function to remove handlers.
 * @param {import('../../navigation.js').default} nav
 * @returns {() => void}
 */
export function attachDragHandlers(nav) {
  const tree = nav.formGenerator.navigationTree;
  if (!tree) return () => {};

  const onDragStart = (e) => {
    const li = e.target.closest('li');
    const item = e.target.closest?.(`.${CLASS.navItem}`) || li || e.currentTarget;
    const data = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath || e.currentTarget.dataset.itemIndex != null))
      ? e.currentTarget.dataset
      : (item?.dataset || li?.dataset || {});
    const { arrayPath, itemIndex } = data;
    if (!arrayPath || itemIndex == null) return;
    nav._dragData = { arrayPath, fromIndex: Number(itemIndex) };
    try { e.dataTransfer.effectAllowed = 'move'; } catch { /* noop */ }
  };

  const onDragOver = (e) => {
    const li = e.target.closest('li');
    const item = e.target.closest?.(`.${CLASS.navItem}`) || li || e.currentTarget;
    const data = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath != null)) ? e.currentTarget.dataset : (item?.dataset || li?.dataset || {});
    const { arrayPath } = data;
    if (!nav._dragData || !arrayPath || arrayPath !== nav._dragData.arrayPath) return;
    e.preventDefault();
    try { e.dataTransfer.dropEffect = 'move'; } catch { /* noop */ }
  };

  const onDrop = (e) => {
    e.preventDefault();
    const li = e.target.closest('li');
    const item = e.target.closest?.(`.${CLASS.navItem}`) || li || e.currentTarget;
    const data = (e.currentTarget.dataset && (e.currentTarget.dataset.arrayPath != null)) ? e.currentTarget.dataset : (item?.dataset || li?.dataset || {});
    const { arrayPath, itemIndex } = data;
    if (!nav._dragData || !arrayPath || arrayPath !== nav._dragData.arrayPath) {
      nav._dragData = null;
      return;
    }
    const toIndex = Number(itemIndex);
    const { fromIndex } = nav._dragData;
    nav._dragData = null;
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;
    nav.formGenerator.reorderArrayItem(arrayPath, fromIndex, toIndex);
  };

  const draggables = Array.from(tree.querySelectorAll('[draggable="true"]'));
  draggables.forEach((el) => {
    el.addEventListener('dragstart', onDragStart);
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('drop', onDrop);
  });

  return () => {
    draggables.forEach((el) => {
      el.removeEventListener('dragstart', onDragStart);
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('drop', onDrop);
    });
  };
}

export default { attachDragHandlers };


