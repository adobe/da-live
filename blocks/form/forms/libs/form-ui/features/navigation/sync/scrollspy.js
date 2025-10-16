/**
 * Attach throttled scroll and resize listeners to update nav active state
 * based on the visible content group (scrollspy behavior).
 * @param {import('../../navigation.js').default} nav
 * @returns {() => void} cleanup
 */
export function enableScrollSync(nav) {
  const { el, type } = getScrollSource(nav);
  if (!el && type !== 'window') return () => {};

  let scheduled = false;
  const onScroll = () => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      nav.updateActiveGroupFromScroll();
    });
  };

  if (type === 'window') {
    window.removeEventListener('scroll', onScroll);
    window.addEventListener('scroll', onScroll, { passive: true });
  } else if (el) {
    el.removeEventListener('scroll', onScroll);
    el.addEventListener('scroll', onScroll, { passive: true });
  }
  const onResize = () => nav.updateActiveGroupFromScroll();
  window.removeEventListener('resize', onResize);
  window.addEventListener('resize', onResize, { passive: true });

  nav.updateActiveGroupFromScroll();

  return () => {
    if (type === 'window') window.removeEventListener('scroll', onScroll);
    else if (el) el.removeEventListener('scroll', onScroll);
    window.removeEventListener('resize', onResize);
  };
}

function getScrollSource(nav) {
  const bodyEl = nav.formGenerator?.container?.querySelector?.('.form-ui-body') || null;
  const isScrollable = (el) => !!el && el.scrollHeight > el.clientHeight;
  if (isScrollable(bodyEl)) return { el: bodyEl, type: 'element' };
  return { el: null, type: 'window' };
}

export default { enableScrollSync };


