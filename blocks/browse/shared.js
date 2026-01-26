export default function getEditPath({ path, ext, editor }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? decodeURIComponent(editor) : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);
    const extentionlessPath = path.substring(0, lastIndex);

    const isUe = route.includes('experience.adobe.com');
    const isQe = route.includes('quickedit=on');
    const hasPlaceholder = route.includes('{{path}}');

    if (isUe || isQe || hasPlaceholder) {
      if (isUe || isQe) {
        // Remove first forward slash and org/site.
        const basicPath = extentionlessPath.split('/').slice(3).join('/');
        return isQe ? route.replace('{{path}}', basicPath) : `${route}/${basicPath}`;
      }
      if (hasPlaceholder) {
        // Safely remove placeholders that may be prefixed with a "/"
        return route.replace(/\/?{{path}}/, extentionlessPath);
      }
    }

    return `${route}${extentionlessPath}`;
  }
  return `/media#${path}`;
}
