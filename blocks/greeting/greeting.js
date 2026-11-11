export default function init(el) {
  const landing = el.closest('da-landing');
  if (!el.isConnected || !landing?.scope) {
    el.hidden = true;
    return;
  }
  const { profile } = landing;
  const name = profile?.first_name?.trim() || profile?.displayName?.trim().split(/\s+/)[0] || '';
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    node.textContent = node.textContent.replace(/\[firstname\]/gi, () => name);
  }
}
