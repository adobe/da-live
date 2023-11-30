export function getHashParts() {
  const { hash } = window.location;
  const fullpath = hash.replace('#', '');
  const pathSplit = fullpath.slice(1).toLowerCase().split('/');

  const [owner, repo, ...parts] = pathSplit;
  const path = parts.join('/');
  return { owner, repo, path };
}
