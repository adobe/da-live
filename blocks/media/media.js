import getPathDetails from '../shared/pathDetails.js';

import '../edit/da-title/da-title.js';
import './da-media.js';

export default function init(el) {
  const details = getPathDetails();

  const daTitle = document.createElement('da-title');
  const daMedia = document.createElement('da-media');

  daTitle.details = details;
  daMedia.details = details;
  el.append(daTitle, daMedia);
}
