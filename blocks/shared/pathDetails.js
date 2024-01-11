import { conOrigin, origin } from './constants.js';

let currhash;
let details;

export default function getPathDetails(loc) {
  const { pathname, hash } = loc || window.location;
  // Use cached details if the hash has not changed
  if (currhash === hash && details) return details;
  currhash = hash;

  const fullpath = hash.replace('#', '');
  if (pathname === '/' && !hash) return null;

  // IMS will redirect and there's a small window where old_hash exists
  if (!fullpath || fullpath.startsWith('old_hash')) return null;

  // Split everything up so it can be later used for AEM
  const pathSplit = fullpath.slice(1).toLowerCase().split('/');
  const [owner, repo, ...parts] = pathSplit;

  details = {
    owner,
    repo,
    origin,
    fullpath,
  };

  // There's actual content and the creator is not looking at owner or repo directly.
  if (parts.length > 0) {
    // Figure out the filename situation
    const filename = parts.pop();
    let [name, ext] = filename.split('.');
    if (!ext && pathname === '/sheet') ext = 'json';
    if (!ext && pathname === '/edit') ext = 'html';

    // Source path (DA Admin API) will always want the extension
    const prefix = [...parts, name].join('/');
    const sourcePath = `/${owner}/${repo}/${prefix}.${ext}`;
    const sourceUrl = `${origin}/source${sourcePath}`;

    // Preview path (AEM preview) does not want .html (or owner/repo), all other extensions are fine
    const previewPath = ext === 'html' ? `/${prefix}` : `/${prefix}.${ext}`;
    const contentPath = `/${owner}/${repo}${previewPath}`;

    details.name = name;
    details.parent = `/${pathSplit.slice(0, -1).join('/')}`;
    details.parentName = parts.at(-1) || repo;
    details.sourceUrl = sourceUrl;
    details.contentUrl = `${conOrigin}${contentPath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page${previewPath}`;
    details.previewOrigin = `https://main--${repo}--${owner}.hlx.page`;
  } else if (repo) {
    details.name = repo;
    details.parent = `/${owner}`;
    details.parentName = owner;
    details.sourceUrl = `${origin}/source${fullpath}`;
    details.previewUrl = `https://main--${repo}--${owner}.hlx.page`;
  } else {
    details.name = owner;
    details.parent = '/';
    details.parentName = 'Root';
    details.sourceUrl = `${origin}/source${fullpath}`;
  }
  return details;
}
