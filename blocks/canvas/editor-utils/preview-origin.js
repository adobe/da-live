export function getPreviewOrigin(org, repo, branch = 'main') {
  const hostname = window?.location?.hostname ?? '';
  const domain = hostname.endsWith('aem.page') || hostname.endsWith('localhost')
    ? 'stage-preview.da.live'
    : 'preview.da.live';
  return `https://${branch}--${repo}--${org}.${domain}`;
}
