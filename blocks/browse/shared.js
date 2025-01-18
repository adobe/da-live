export default function getEditPath({ path, ext, editor }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? editor : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);
    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
