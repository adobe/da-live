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
    'Maecenas volutpat blandit aliquam etiam erat velit scelerisque in dictum.',
  ];

  const result = [];
  for (let i = 0; i < lines; i += 1) {
    result.push(loremSentences[i % loremSentences.length]);
  }
  return result.join('  ');
}

const MAX_LINES = 100;
export default function loremIpsum(state, dispatch, lines = 5) {
  const linesInt = Math.min(parseInt(lines, 10) || 5, MAX_LINES);
  const { $cursor } = state.selection;

  if (!$cursor) return;
  const from = $cursor.before();
  const to = $cursor.pos;
  const loremText = generateLoremIpsum(linesInt);
  const tr = state.tr.replaceWith(from, to, state.schema.text(loremText));
  dispatch(tr);
}
