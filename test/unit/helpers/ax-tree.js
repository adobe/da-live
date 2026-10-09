import { executeServerCommand, sendKeys } from '@web/test-runner-commands';

const SKIP = new Set([
  'none', 'generic', 'StaticText', 'InlineTextBox', 'LineBreak', 'ListMarker',
]);
const KEYS = ['role', 'name', 'level', 'expanded', 'selected', 'pressed', 'focused', 'disabled'];

function prune(node) {
  const children = (node.children ?? []).flatMap(prune);
  if (SKIP.has(node.role)) return children;
  const own = Object.fromEntries(KEYS
    .filter((k) => node[k] !== undefined)
    .map((k) => [k, node[k]]));
  return [children.length ? { ...own, children } : own];
}

export async function axTree(selector) {
  const snapshot = await executeServerCommand('ax-tree', { selector });
  return snapshot ? prune(snapshot)[0] : undefined;
}

export function axAll(node, role) {
  const own = node.role === role ? [node] : [];
  return [...own, ...(node.children ?? []).flatMap((child) => axAll(child, role))];
}

export function axFocused(node) {
  if (node.focused) return node;
  return (node.children ?? []).map(axFocused).find(Boolean);
}

export async function tabFrom(el) {
  el.focus();
  await sendKeys({ press: 'Tab' });
}
