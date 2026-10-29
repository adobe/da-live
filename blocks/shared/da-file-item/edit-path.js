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

export default function getEditPath({ path, ext, editor }) {
  if (ext === 'html' || ext === 'json') {
    const route = ext === 'html' ? editor : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      return `${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`;
    }

    return `${route}${path.substring(0, lastIndex)}`;
  }
  return `/media#${path}`;
}
