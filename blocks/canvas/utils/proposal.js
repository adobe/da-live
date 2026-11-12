export function proposalComparisonContext({ proposedPath, context }) {
  const prefix = `/${context?.org}/${context?.site}/.da/`;
  if (typeof proposedPath !== 'string' || !context?.org || !context?.site
    || !proposedPath.startsWith(prefix) || !proposedPath.endsWith('.html')
    || /[%\\?#\s]/.test(proposedPath)
    || [...proposedPath].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127)) {
    throw new Error("Choose a staged .html page under the current site's /.da/ folder.");
  }
  const path = proposedPath.slice(prefix.length);
  if (path.split('/').some((part) => !part || ['.', '..', '.da'].includes(part))
    || path === '.html') {
    throw new Error('The staged page path is invalid.');
  }
  return {
    org: context.org,
    site: context.site,
    path: path.slice(0, -5),
    proposalPath: `/.da/${path}`,
  };
}
