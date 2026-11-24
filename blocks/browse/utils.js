export function getBrowseComponent({ search, pathDetails }) {
  if (pathDetails) return 'da-browse';
  return new URLSearchParams(search).get('landing') === 'true' ? 'da-landing' : 'da-sites';
}
