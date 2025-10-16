import { UI_CLASS as CLASS } from '../../../constants.js';

/**
 * Enable hover syncing between content groups and nav active indicator.
 * @param {import('../../navigation.js').default} nav
 * @returns {() => void} cleanup
 */
export function enableHoverSync(nav, enabled = false) {
  if (!enabled) return () => {};
  if (!nav.formGenerator.container || !nav.formGenerator.navigationTree) return () => {};

  const groups = nav.formGenerator.container.querySelectorAll(`.${CLASS.group}, .${CLASS.arrayItem}[id]`);
  const handleMouseEnter = (e) => {
    const group = e.currentTarget;
    const groupId = group.id;
    if (!groupId) return;
    // During programmatic navigation scroll, skip hover updates to avoid fighting the scroll
    const until = nav.formGenerator?._programmaticScrollUntil || 0;
    if (until && Date.now() <= until) return;
    nav.updateNavigationActiveState(groupId);
  };
  groups.forEach((g) => {
    g.removeEventListener('mouseenter', handleMouseEnter);
    g.addEventListener('mouseenter', handleMouseEnter);
  });

  return () => {
    groups.forEach((g) => g.removeEventListener('mouseenter', handleMouseEnter));
  };
}

export default { enableHoverSync };


