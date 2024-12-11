import { Plugin } from "da-y-wrapper";

function generateLoremIpsum(lines = 5) {
  const loremSentences = [
    'Lorem ipsum dolor sit amet, consectetur adipiscing elit.',
    'Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.',
    'Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.',
    'Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore.',
    'Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia.',
    'Nunc feugiat mi a tellus consequat imperdiet.',
    'Vestibulum sapien proin quam etiam ultrices suscipit gravida bibendum.',
    'Fusce pellentesque enim aliquam varius tincidunt aenean vulputate.',
    'Maecenas volutpat blandit aliquam etiam erat velit scelerisque in dictum.'
  ];
  return loremSentences.slice(0, lines).join("\n");
}

export default function loremPlugin() {
  return new Plugin({
    props: {
      handleKeyDown(view, event) {
        if (event.key === " " || event.key === "Enter") {
          const { state, dispatch } = view;
          const { $cursor } = state.selection;

          // Ensure the selection is a cursor
          if (!$cursor) return false;

          const from = $cursor.before();
          const to = $cursor.pos;

          const textBeforeCursor = state.doc.textBetween(from, to, undefined, "\n");
          const match = textBeforeCursor.match(/=lorem\((\d+)?\)$/);
          if (match) {
            const lines = parseInt(match[1], 10) || 5;
            const loremText = generateLoremIpsum(lines);
            const tr = state.tr.replaceWith(
              from,
              to,
              state.schema.text(loremText)
            );
            dispatch(tr);
            return true;
          }
        }
        return false;
      },
    },
  });
}
