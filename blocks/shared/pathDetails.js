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
    // TODO: Make this more sane.
    name: parts.slice(-1).length ? parts.slice(-1) : (repo || owner),
    parent: parts.slice(-1).length ? `/${pathSplit.slice(0, -1).join('/')}` : '/',
    parentName: parts.slice(-1).length ? pathSplit.at(-2) : 'Root',
  };

  if (parts.length > 0) details.name = parts.slice(-1);
  if (repo) {
    details.sourceUrl = `${origin}/source${fullpath}.html`;
    details.contentUrl = `${conOrigin}${fullpath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page/${path}`;
  }
  return details;
}
