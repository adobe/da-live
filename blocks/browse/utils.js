export function getBrowseComponent({ search, pathDetails }) {
  const landing = new URLSearchParams(search).get('landing') === 'true';
  if (landing && (!pathDetails || (pathDetails.site && !pathDetails.path))) return 'da-landing';
  return pathDetails ? 'da-browse' : 'da-sites';
}

export function resolveBrowsePath({ search }) {
  return new URLSearchParams(search).get('browse') === '1' ? './legacy' : './v2';
}
