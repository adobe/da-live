/*
 * Copyright 2026 Adobe. All rights reserved.
 * Ported from da.live blocks/shared/inlinesvg.js
 */
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
    if (parent && svg) parent.append(svg);
    return svg;
  });
  return Promise.all(svgs);
}
