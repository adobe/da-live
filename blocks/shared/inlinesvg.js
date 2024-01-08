async function fetchIcon(path) {
  const resp = await fetch(path);
  if (!resp.ok) return null;
  const text = await resp.text();
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'image/svg+xml');
  return doc.querySelector('svg');
}

export default function inlinesvg({ parent, paths }) {
  const svgs = paths.map(async (path) => {
    const svg = await fetchIcon(path);
    if (parent) parent.append(svg);
    return svg;
  });
  return Promise.all(svgs);
}
