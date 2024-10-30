import getPathDetails from '../shared/pathDetails.js';
import { getNx } from '../../../scripts/utils.js';

import '../edit/da-title/da-title.js';
import './da-media.js';

const PDF_VIEWER_SRC = 'https://acrobatservices.adobe.com/view-sdk/viewer.js';
const PDF_CLIENT_ID = 'cd73455ea6c04d0aac86270f9f5f830c';
const PDF_DIV_ID = 'da-pdf-viewer';

async function getPdfViewer(url, fileName) {
  const { default: getStyle } = await import(`${getNx()}/utils/styles.js`);
  const style = await getStyle(import.meta.url.replace('media.js', 'da-media.css'));
  document.adoptedStyleSheets = [style];

  const { default: loadScript } = await import(`${getNx()}/utils/script.js`);
  await loadScript(PDF_VIEWER_SRC);

  document.addEventListener('adobe_dc_view_sdk.ready', () => {
    const adobeDCView = new window.AdobeDC.View({ clientId: PDF_CLIENT_ID, divId: PDF_DIV_ID });
    adobeDCView.previewFile(
      {
        content: { location: { url } },
        metaData: { fileName },
      },
    );
  });

  const daContent = document.createElement('div');
  daContent.classList.add('da-pdf-content');
  daContent.id = 'da-pdf-viewer';

  return daContent;
}

export default async function init(el) {
  const details = getPathDetails();
  const { name, sourceUrl } = details;
  const ext = name.split('.').pop();

  const daTitle = document.createElement('da-title');

  const daMedia = ext === 'pdf' ? await getPdfViewer(sourceUrl, name) : document.createElement('da-media');

  daTitle.details = details;
  daMedia.details = details;
  el.append(daTitle, daMedia);
}
