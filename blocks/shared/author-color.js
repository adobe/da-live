const AUTHOR_PALETTE = [
  { bg: '#ffbcb4', text: '#68150a', strong: '#ff513d' }, // red
  { bg: '#ffc15e', text: '#5f2000', strong: '#e86a00' }, // orange
  { bg: '#f5c700', text: '#4b2f00', strong: '#c18300' }, // yellow
  { bg: '#b6db00', text: '#2f3900', strong: '#809900' }, // chartreuse
  { bg: '#81e43a', text: '#1b3c03', strong: '#52a119' }, // celery
  { bg: '#6be3a2', text: '#003d2c', strong: '#0ba45d' }, // green
  { bg: '#5ce1c2', text: '#003c36', strong: '#0ba286' }, // seafoam
  { bg: '#8ad5ff', text: '#00394e', strong: '#1d95e7' }, // cyan
  { bg: '#accffd', text: '#10288c', strong: '#5d89ff' }, // blue
  { bg: '#c0c9ff', text: '#3706a0', strong: '#8480fe' }, // indigo
  { bg: '#ddc1f6', text: '#4b0090', strong: '#b272eb' }, // purple
  { bg: '#f7b5ff', text: '#5c046d', strong: '#df4df5' }, // fuchsia
  { bg: '#ffb9d0', text: '#6f0028', strong: '#ff4885' }, // magenta
  { bg: '#ffb5e6', text: '#690344', strong: '#f24cb8' }, // pink
];

function hashString(name) {
  let hash = 0;
  const str = name ?? '';
  for (let i = 0; i < str.length; i += 1) {
    // eslint-disable-next-line no-bitwise
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return Math.abs(hash);
}

export function generateColorSet(name) {
  return AUTHOR_PALETTE[hashString(name) % AUTHOR_PALETTE.length];
}

export function colorSetForColor(color) {
  return AUTHOR_PALETTE.find((set) => set.bg === color) ?? null;
}

export function generateColor(name) {
  return generateColorSet(name).bg;
}

export function collabCursorBuilder(user) {
  const cursor = document.createElement('span');
  cursor.classList.add('ProseMirror-yjs-cursor');
  cursor.setAttribute('style', `border-color: ${user.color}`);
  const label = document.createElement('div');
  label.style.backgroundColor = user.color;
  label.style.color = colorSetForColor(user.color)?.text ?? '#1e1e1e';
  label.insertBefore(document.createTextNode(user.name), null);
  cursor.insertBefore(document.createTextNode('\u2060'), null);
  cursor.insertBefore(label, null);
  cursor.insertBefore(document.createTextNode('\u2060'), null);
  return cursor;
}
