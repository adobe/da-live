import { conOrigin, origin } from './constants.js';

export default function getPathDetails() {
  const { hash } = window.location;
  const fullpath = hash.replace('#', '');
  if (!fullpath || fullpath.startsWith('old_hash')) return;

  const pathSplit = fullpath.slice(1).toLowerCase().split('/');

  const [owner, repo, ...parts] = pathSplit;
  const path = parts.join('/');

  const details = {
    owner,
    repo,
    origin,
    fullpath,
    path,
    name: parts.slice(-1),
    parent: `/${pathSplit.slice(0, -1).join('/')}`,
    parentName: pathSplit.at(-2),
  };
  if (parts.length > 0) details.name = parts.slice(-1);
  if (repo) {
    details.sourceUrl = `${origin}/source${fullpath}.html`;
    details.contentUrl = `${conOrigin}${fullpath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page/${path}`;
  }
  return details;
}
