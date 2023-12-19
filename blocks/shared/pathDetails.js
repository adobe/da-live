import { conOrigin, origin } from './constants.js';

export default function getPathDetails(loc) {
  const { hash } = loc || window.location;
  const fullpath = hash.replace('#', '');
  if (!fullpath || fullpath.startsWith('old_hash')) return;

  const pathSplit = fullpath.slice(1).toLowerCase().split('/');

  const [owner, repo, ...parts] = pathSplit;
  const path = parts.join('/');

  let name = parts.slice(-1)[0];
  if (!name) name = repo || owner;
  const nameSplit = name.split('.');
  const ext = nameSplit.length > 1 ? '' : '.html';
  const sourceUrl = `${origin}/source${fullpath}${ext}`;

  const details = {
    owner,
    repo,
    origin,
    fullpath,
    path,
    name,
    sourceUrl,
  };

  if (name !== owner && name !== repo) {
    details.parent = `/${pathSplit.slice(0, -1).join('/')}`;
    details.parentName = pathSplit.at(-2);
    details.contentUrl = `${conOrigin}${fullpath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page/${path}`;
    return details;
  }

  if (name === repo) {
    details.parent = `/${owner}`;
    details.parentName = owner;
    details.sourceUrl = `${origin}/source${fullpath}`;
  }

  if (name === owner) {
    details.parent = `/`;
    details.parentName = 'Root';
    details.sourceUrl = `${origin}/source${fullpath}`;
  }

  return details;
}
