import { Plugin } from 'da-y-wrapper';
import { openFocalPointDialog } from './focalPointDialog.js';
import getSheet from '../../../shared/sheet.js';

const focalPointSheet = await getSheet('/blocks/edit/prose/plugins/focalPointDialog.css');

function isInTableCell(state, pos) {
  const $pos = state.doc.resolve(pos);
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'table_cell') {
      return true;
    }
  }
  return false;
}

function hasFocalPointData(attrs) {
  return (attrs.dataFocalX && attrs.dataFocalX !== '')
    || (attrs.dataFocalY && attrs.dataFocalY !== '');
}

function updateImageAttributes(img, attrs) {
  img.src = attrs.src;
  ['alt', 'title', 'width', 'height'].forEach((attr) => {
    if (attrs[attr]) {
      img[attr] = attrs[attr];
    } else {
      img.removeAttribute(attr);
    }
  });

  if (attrs.dataFocalX && attrs.dataFocalY) {
    img.setAttribute('data-focal-x', attrs.dataFocalX);
    img.setAttribute('data-focal-y', attrs.dataFocalY);
    // img.title = `data-focal:${attrs.dataFocalX},${attrs.dataFocalY}`;
  } else {
    img.removeAttribute('data-focal-x');
    img.removeAttribute('data-focal-y');
    if (img.title?.includes('data-focal:')) {
      img.removeAttribute('title');
    }
  }
}

class ImageWithFocalPointView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;

    this.dom = document.createElement('span');
    this.dom.className = 'focal-point-image-wrapper';

    this.img = document.createElement('img');
    updateImageAttributes(this.img, node.attrs);

    this.icon = document.createElement('span');
    this.icon.className = hasFocalPointData(node.attrs)
      ? 'focal-point-icon focal-point-icon-active'
      : 'focal-point-icon';
    this.icon.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" height="18" viewBox="0 0 18 18" width="18"><circle cx="9" cy="9" r="7" fill="none" stroke="currentColor" stroke-width="1.5" /><line x1="9" y1="4" x2="9" y2="7" stroke="currentColor" stroke-width="1.5" /><line x1="9" y1="11" x2="9" y2="14" stroke="currentColor" stroke-width="1.5" /><line x1="4" y1="9" x2="7" y2="9" stroke="currentColor" stroke-width="1.5" /><line x1="11" y1="9" x2="14" y2="9" stroke="currentColor" stroke-width="1.5" /><circle cx="9" cy="9" r="1.5" fill="currentColor" /></svg>';

    this.icon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        openFocalPointDialog(this.view, pos, this.node);
      }
    });

    this.dom.appendChild(this.img);
    this.dom.appendChild(this.icon);
  }

  update(node) {
    if (node.type.name !== 'image') return false;

    this.node = node;
    updateImageAttributes(this.img, node.attrs);
    this.icon.className = hasFocalPointData(node.attrs)
      ? 'focal-point-icon focal-point-icon-active'
      : 'focal-point-icon';

    return true;
  }

  destroy() {
    this.icon.removeEventListener('click', this.handleIconClick);
  }
}

export default function imageFocalPoint() {
  let styleInjected = false;

  return new Plugin({
    view() {
      return {
        update(view) {
          if (!styleInjected) {
            const shadowRoot = view.dom.getRootNode();

            if (shadowRoot && shadowRoot instanceof ShadowRoot && shadowRoot.adoptedStyleSheets) {
              if (!shadowRoot.adoptedStyleSheets.includes(focalPointSheet)) {
                shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, focalPointSheet];
              }
              styleInjected = true;
            }
          }
        },
      };
    },
    props: {
      nodeViews: {
        image(node, view, getPos) {
          if (isInTableCell(view.state, getPos())) {
            return new ImageWithFocalPointView(node, view, getPos);
          }
          return null;
        },
      },
    },
  });
}
