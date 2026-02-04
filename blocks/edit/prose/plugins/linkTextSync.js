// eslint-disable-next-line import/no-unresolved
import { Plugin } from 'da-y-wrapper';
import { isURL } from '../../utils/helpers.js';

function getLinkAtCursor(state) {
  const { $from } = state.selection;
  const { node, offset } = $from.parent.childAfter($from.parentOffset);

  if (!node) return null;

  const linkMark = node.marks.find((mark) => mark.type.name === 'link');
  if (!linkMark) return null;

  return {
    from: $from.start() + offset,
    to: $from.start() + offset + node.nodeSize,
    text: node.textContent,
    href: linkMark.attrs.href,
  };
}

export default function linkTextSync() {
  return new Plugin({
    appendTransaction(trs, oldState, state) {
      const skipTransaction = trs.some((t) => t.getMeta('linkSync')) || !trs.some((t) => t.docChanged);
      const oldLink = !skipTransaction && getLinkAtCursor(oldState);
      const newLink = !skipTransaction && getLinkAtCursor(state);

      const skipSync = !oldLink
        || oldLink.text !== oldLink.href
        || !newLink
        || newLink.href !== oldLink.href
        || newLink.text === oldLink.text
        || !isURL(newLink.text);

      if (skipSync) {
        return null;
      }

      const { from, to, text: href } = newLink;
      const linkMarkType = state.schema.marks.link;

      return state.tr
        .removeMark(from, to, linkMarkType)
        .addMark(from, to, linkMarkType.create({ href }))
        .setMeta('linkSync', true);
    },
  });
}
