import getPathDetails from '../shared/pathDetails.js';
import { getNx, getNx2Api } from '../../scripts/utils.js';

import '../edit/da-title/da-title.js';
import { contentLogin, livePreviewLogin } from '../shared/utils.js';
import { getLivePreviewUrl } from '../shared/constants.js';

const PDF_VIEWER_SRC = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';
const PDF_CLIENT_ID = 'cd73455ea6c04d0aac86270f9f5f830c';
const PDF_DIV_ID = 'da-pdf-viewer';

async function loadViewer() {
  const { loadScript } = await import(`${getNx()}/utils/utils.js`);
  await loadScript(PDF_VIEWER_SRC);

  // The window object is not instantiated
  // fast enough after the script load event.
  return new Promise((resolve) => {
    const interval = setInterval(async () => {
      if (window.AdobeDC) {
        clearInterval(interval);
        resolve();
      }
    }, 50);
  });
}

async function getPdfMedia() {
  await loadViewer();

  const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
  const style = await loadStyle('/blocks/media/da-media.css');
  document.adoptedStyleSheets = [style];

  const daContent = document.createElement('div');
  daContent.classList.add('da-pdf-media');
  daContent.id = 'da-pdf-viewer';
  return daContent;
}

async function getDefaultMedia() {
  await import('./da-media.js');
  return document.createElement('da-media');
}

async function loadPdfMedia(path, fileName) {
  const adobeDCView = new window.AdobeDC.View({ clientId: PDF_CLIENT_ID, divId: PDF_DIV_ID });

  try {
    const { source } = await getNx2Api();
    // path is the `/org/site/...` fullpath; source.get's withArgs parses it.
    const resp = await source.get(path);
    const blob = await resp.blob();

    const reader = new FileReader();
    reader.onloadend = (e) => {
      const promise = Promise.resolve(e.target.result);
      adobeDCView.previewFile({ content: { promise }, metaData: { fileName } });
    };
    reader.readAsArrayBuffer(blob);
  } catch (e) {
    // eslint-disable-next-line no-console
    console.log(e);
  }
}

export default async function init(el) {
  const details = getPathDetails();
  const { name, fullpath, owner, repo, path } = details;
  const ext = name.split('.').pop();

  const { isHlx6 } = await getNx2Api();
  const hlx6 = await isHlx6(owner, repo);

  let mediaDetails = details;
  if (hlx6 && ext !== 'pdf') {
    const contentUrl = `${getLivePreviewUrl(owner, repo)}${path}`;
    mediaDetails = { ...details, contentUrl };
    await livePreviewLogin(owner, repo);
  } else {
    await contentLogin(owner, repo);
  }

  const daTitle = document.createElement('da-title');

  const daMedia = ext === 'pdf' ? await getPdfMedia() : await getDefaultMedia();

  daTitle.details = details;
  daMedia.details = mediaDetails;
  el.append(daTitle, daMedia);

  if (ext === 'pdf') loadPdfMedia(fullpath, name);
}
