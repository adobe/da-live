function getHtmlEditor(editor, type) {
  if (type === 'form') return '/form#';
  return editor;
}

export default function getEditPath({ path, ext, editor, type }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? getHtmlEditor(editor, type) : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      return `${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`;
    }

    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
