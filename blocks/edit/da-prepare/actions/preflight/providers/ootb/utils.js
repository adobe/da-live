export function getMetadata(el) {
  if (!el) return {};
  return [...el.childNodes].reduce((rdx, row) => {
    if (row.children) {
      const key = row.children[0].textContent.trim().toLowerCase();
      const content = row.children[1];
      const text = content.textContent.trim().toLowerCase();
      if (key && content) rdx[key] = { content, text };
    }
    return rdx;
  }, {});
}
