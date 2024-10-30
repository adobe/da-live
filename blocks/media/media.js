import getPathDetails from '../shared/pathDetails.js';
import { getNx } from '../../../scripts/utils.js';

import '../edit/da-title/da-title.js';
import { daFetch } from '../shared/utils.js';

const PDF_VIEWER_SRC = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';
const PDF_CLIENT_ID = 'cd73455ea6c04d0aac86270f9f5f830c';
const PDF_DIV_ID = 'da-pdf-viewer';

async function loadViewer() {
  const { default: loadScript } = await import(`${getNx()}/utils/script.js`);
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

  const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
  const style = await getStyle('/blocks/media/da-media.css');
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

async function loadPdfMedia(url, fileName) {
  const adobeDCView = new window.AdobeDC.View({ clientId: PDF_CLIENT_ID, divId: PDF_DIV_ID });

  try {
    const resp = await daFetch(url);
    const blob = await resp.blob();

    const reader = new FileReader();
    reader.onloadend = (e) => {
      const promise = Promise.resolve(e.target.result);
      adobeDCView.previewFile({ content: { promise }, metaData: { fileName } });
    };
    reader.readAsArrayBuffer(blob);
  } catch (e) {
    console.log(e);
  }
}

export default async function init(el) {
  const details = getPathDetails();
  const { name, sourceUrl } = details;
  const ext = name.split('.').pop();

  const daTitle = document.createElement('da-title');

  const daMedia = ext === 'pdf' ? await getPdfMedia(el, sourceUrl, name) : await getDefaultMedia();

  daTitle.details = details;
  daMedia.details = details;
  el.append(daTitle, daMedia);

  if (ext === 'pdf') loadPdfMedia(sourceUrl, name);
}
