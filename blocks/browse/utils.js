export function getBrowseComponent({ search, pathDetails }) {
  if (pathDetails) return 'da-browse';
  const params = new URLSearchParams(search);
  if (params.get('landing') === 'true') return 'da-landing';
  if (params.get('onboarding') === 'true') return 'da-onboarding';
  return 'da-sites';
}

export function resolveBrowsePath({ search }) {
  return new URLSearchParams(search).get('browse') === '1' ? './legacy' : './v2';
}
