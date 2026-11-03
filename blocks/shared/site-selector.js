export function getCreateSiteHref({ org, href = window.location.href }) {
  const url = new URL(href);
  url.pathname = '/start';
  url.searchParams.delete('browse');
  url.searchParams.delete('site');
  url.searchParams.set('org', org);
  url.hash = '';
  return url.href;
}
