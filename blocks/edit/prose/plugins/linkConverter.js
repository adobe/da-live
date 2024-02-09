// eslint-disable-next-line import/no-unresolved
import { Plugin } from 'da-y-wrapper';

function isURL(text) {
  try {
    // eslint-disable-next-line no-new
    new URL(text);
    return true;
  } catch (e) {
    return false;
  }
}

export default function linkConverter(schema) {
  return new Plugin({
    props: {
      handlePaste: (view, event, slice) => {
        if (slice.content.content.length !== 1 // there needs to be only one line
          || slice.content.content[0].content.content.length !== 1 // only one element needed
          || slice.content.content[0].content.content[0].type.name !== 'text' // the only element is text
          || !isURL(slice.content.content[0].content.content[0].text)) {
          return false;
        }

        const linkMark = schema.marks.link.create(
          { href: slice.content.content[0].content.content[0].text },
        );
        const { from } = view.state.selection;
        const { size } = slice.content.content[0].content;

        const addLinkMark = view.state.tr
          .insert(from, slice.content.content[0].content)
          .addMark(from, from + size, linkMark);
        view.dispatch(addLinkMark);

        return true;
      },
    },
  });
}
