// eslint-disable-next-line import/no-unresolved
import { Plugin } from 'da-y-wrapper';

function isURL(text) {
  try {
    const url = new URL(text);
    // Only consider https as valid URLs for auto-linking
    return url.protocol === 'https:';
  } catch (e) {
    return false;
  }
}

export default function linkConverter(schema) {
  return new Plugin({
    props: {
      handlePaste: (view, event, slice) => {
        const { content } = slice.content;
        // Only handle simple case: pasting a single standalone URL
        if (content.length !== 1 || content[0].content.content.length !== 1) {
          return false;
        }

        const node = content[0].content.content[0];
        if (node.type.name !== 'text') return false;

        const text = node.text.trim();
        if (!isURL(text)) return false;

        const linkMark = schema.marks.link.create({ href: text });
        view.dispatch(
          view.state.tr
            .replaceSelectionWith(schema.text(text, [linkMark]), false)
            .scrollIntoView(),
        );
        return true;
      },
    },
  });
}
