export function getBrowseComponent({ search, pathDetails, hasLanding }) {
  if (pathDetails) return 'da-browse';
  const landing = new URLSearchParams(search).get('landing');
  if (landing === 'false') return 'da-sites';
  return hasLanding || landing === 'true' ? 'da-landing' : 'da-sites';
}

export function resolveBrowsePath({ search }) {
  return new URLSearchParams(search).get('browse') === '1' ? './legacy' : './v2';
}
