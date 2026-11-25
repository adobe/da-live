import { withDaRsBinding } from '../da-rs-navigation.js';

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

export default function getEditPath({ path, ext, editor, capabilities }) {
  if (ext === 'html' || ext === 'json') {
    // Imported pages only open in the read-only viewer, whatever the editor preference.
    const pageRoute = capabilities?.view === 'page-readonly' ? '/edit#' : editor;
    const route = ext === 'html' ? pageRoute : '/sheet#';
    const lastIndex = path.lastIndexOf(`.${ext}`);

    if (route.includes('experience.adobe.com')) {
      return withDaRsBinding(`${route}/${path.substring(0, lastIndex).split('/').slice(3).join('/')}`);
    }

    return withDaRsBinding(`${route}${path.substring(0, lastIndex)}`);
  }
  return withDaRsBinding(`/media#${path}`);
}
