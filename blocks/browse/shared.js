const CANVAS_ROUTE = /^\/canvas(?=[?#]|$)/;

// Canvas runs inside the same app as Browse, so it inherits Browse's query
// parameters (nx, quick-edit, theme, ...). Parameters set on the configured
// route itself win over the inherited ones.
function withBrowseParams(route, search) {
  const inherited = new URLSearchParams(search);
  if (!CANVAS_ROUTE.test(route) || !inherited.size) return route;
  const hashAt = route.indexOf('#');
  const base = hashAt === -1 ? route : route.slice(0, hashAt);
  const hash = hashAt === -1 ? '' : route.slice(hashAt);
  const [pathname, own = ''] = base.split('?');
  const params = new URLSearchParams(own);
  const configured = new Set(params.keys());
  inherited.forEach((value, key) => {
    if (!configured.has(key)) params.append(key, value);
  });
  return `${pathname}?${params}${hash}`;
}

export default function getEditPath({ path, ext, editor, search = window.location.search }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? withBrowseParams(editor, search) : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      return `${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`;
    }

    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
