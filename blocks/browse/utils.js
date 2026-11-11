export function getBrowseComponent({ search, pathDetails }) {
  if (pathDetails) return 'da-browse';
  return new URLSearchParams(search).get('landing') === 'true' ? 'da-landing' : 'da-sites';
}

export function resolveBrowsePath({ search }) {
  return new URLSearchParams(search).get('browse') === '1' ? './legacy' : './v2';
}
