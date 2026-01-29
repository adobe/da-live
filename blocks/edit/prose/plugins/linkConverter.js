// eslint-disable-next-line import/no-unresolved
import { Plugin, PluginKey } from 'da-y-wrapper';

const linkConverterKey = new PluginKey('linkConverter');

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
    key: linkConverterKey,
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
        const { from, to } = view.state.selection;
        const { size } = slice.content.content[0].content;

        const selectedSlice = view.state.doc.slice(from, to);

        // if we have some text selected, add the link to the selected text
        if (selectedSlice.size > 0
          && selectedSlice.content.content.length === 1
          && selectedSlice.content.content[0].type.name === 'text') {
          const addLinkMark = view.state.tr.addMark(from, to, linkMark);
          view.dispatch(addLinkMark);
          return true;
        }

        const addLinkMark = view.state.tr
          .replaceWith(from, to, slice.content.content[0].content)
          .addMark(from, from + size, linkMark);
        view.dispatch(addLinkMark);

        return true;
      },
    },
  });
}
