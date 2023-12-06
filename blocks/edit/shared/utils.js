import { conOrigin, origin } from '../../browse/state/index.js';

export function getPathDetails() {
  const { hash } = window.location;
  const fullpath = hash.replace('#', '');
  console.log(fullpath);
  if (!fullpath || fullpath.startsWith('old_hash')) return;

  const pathSplit = fullpath.slice(1).toLowerCase().split('/');

  const [owner, repo, ...parts] = pathSplit;
  const path = parts.join('/');

  const details = { fullpath, name: parts.slice(-1) };
  if (parts.length > 0) details.name = parts.slice(-1);
  if (repo) {
    details.sourceUrl = `${origin}/source${fullpath}.html`;
    details.contentUrl = `${conOrigin}${fullpath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page/${path}`;
  }

   return details;
}
