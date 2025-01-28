export default function getEditPath({ path, ext, editor }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? editor : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      console.log(`${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`);
      return `${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`;
    }

    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
