export function getConfiguredEditor(path, editorConfs, defaultEditor) {
  const matchedConfs = (editorConfs || []).filter(
    (conf) => path.startsWith(conf.split('=')[0]),
  );
  if (matchedConfs.length === 0) return defaultEditor;

  const matchedConf = matchedConfs.sort(
    (a, b) => b.split('=')[0].length - a.split('=')[0].length,
  )[0];
  return matchedConf.split('=')[1];
}

// Carry the code branch (`?ref=`) from the current page into same-origin editors,
// e.g. canvas -> folder listing (breadcrumb keeps the query) -> canvas.
function withRef(route) {
  if (!route?.startsWith('/') || route.startsWith('//')) return route;
  const ref = new URLSearchParams(window.location.search).get('ref');
  if (!ref) return route;
  const hashIdx = route.indexOf('#');
  const base = hashIdx === -1 ? route : route.slice(0, hashIdx);
  const hash = hashIdx === -1 ? '' : route.slice(hashIdx);
  const queryIdx = base.indexOf('?');
  const pathname = queryIdx === -1 ? base : base.slice(0, queryIdx);
  const query = queryIdx === -1 ? '' : base.slice(queryIdx + 1);
  if (new URLSearchParams(query).has('ref')) return route;
  const sep = query ? '&' : '';
  return `${pathname}?${query}${sep}ref=${encodeURIComponent(ref)}${hash}`;
}

export default function getEditPath({ path, ext, editor }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? withRef(editor) : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      return `${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`;
    }

    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
