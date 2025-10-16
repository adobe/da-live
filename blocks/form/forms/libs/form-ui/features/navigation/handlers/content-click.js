import { UI_CLASS as CLASS } from '../../../constants.js';

/**
 * Attach a delegated click handler on the form content area.
 * Clicking a group (or any primitive within it) highlights the group,
 * updates active state, and scrolls the nav to the corresponding item.
 * @param {import('../../navigation.js').default} nav
 * @returns {() => void} cleanup
 */
export function attachContentClick(nav) {
  const bodyEl = nav.formGenerator.container.querySelector(`.${CLASS.body}`) || nav.formGenerator.container;
  if (!bodyEl) return () => {};

  const onClick = (e) => {
    const clickedGroup = e.target.closest?.(`.${CLASS.group}, .${CLASS.arrayItem}[id]`);
    if (!clickedGroup) return;
    const groupId = clickedGroup.id;
    if (!groupId) return;
    // Highlight group (also scrolls nav item into view) and update active state
    // Set a short programmatic window to avoid hover/scrollspy fighting with our scroll
    try { nav.formGenerator._programmaticScrollUntil = Date.now() + 800; } catch {}
    nav.formGenerator.highlightFormGroup(groupId);
    nav.updateActiveGroup(groupId);
  };

  bodyEl.addEventListener('click', onClick);
  return () => bodyEl.removeEventListener('click', onClick);
}

export default { attachContentClick };


