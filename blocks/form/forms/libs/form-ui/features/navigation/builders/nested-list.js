import { html, render } from 'da-lit';
import { navListTemplate } from '../../../templates/nav.js';

/**
 * Convert a flat array of nav item elements (each carrying dataset.level)
 * into a nested UL/LI structure suitable for the sidebar tree.
 * Returns the root UL element.
 * @param {HTMLElement[]} nodes
 * @returns {HTMLUListElement}
 */
export function buildNestedList(nodes) {
  const items = [];
  const stack = [{ level: 0, children: items, last: null }];

  const ensureLevel = (targetLevel) => {
    while (stack.length - 1 > targetLevel) stack.pop();
    while (stack.length - 1 < targetLevel) {
      const parent = stack[stack.length - 1];
      const last = parent.last;
      if (!last) {
        const newNode = { className: '', dataset: {}, node: html``, children: [] };
        parent.children.push(newNode);
        stack.push({ level: parent.level + 1, children: newNode.children, last: null });
      } else {
        if (!last.children) last.children = [];
        stack.push({ level: parent.level + 1, children: last.children, last: null });
      }
    }
  };

  nodes.forEach((node) => {
    const level = Number(node?.dataset?.level || 0);
    ensureLevel(level);
    const current = stack[stack.length - 1];
    const data = { ...node.dataset };
    const className = node.className || '';
    const nodeHtml = html`${Array.from(node.childNodes).map((n) => n)} `;
    const item = { className, dataset: data, node: nodeHtml, children: [] };
    current.children.push(item);
    current.last = item;
  });

  const mount = document.createElement('div');
  render(navListTemplate(items), mount);
  return mount.firstElementChild;
}

export default { buildNestedList };


