import { DOMParser as PMDOMParser, Slice } from 'da-y-wrapper';

export function insertDroppedHtml({ view, html, position }) {
  if (!view?.editable || typeof html !== 'string' || !html.trim()
    || !Number.isSafeInteger(position) || position < 0
    || position > view.state.doc.content.size) return false;
  const dom = new DOMParser().parseFromString(html, 'text/html');
  const parsed = PMDOMParser.fromSchema(view.state.schema).parse(dom.body);
  if (!parsed.content.size) return false;
  const slice = new Slice(parsed.content, 0, 0);
  view.dispatch(view.state.tr.replaceRange(position, position, slice).scrollIntoView());
  return true;
}
