import './forms/editor.js';

export default async function init(el) {
  const cmp = document.createElement('da-forms-editor');
  el.replaceChildren();
  el.append(cmp);
}
