import { Plugin } from 'da-y-wrapper';
import inlinesvg from '../../../shared/inlinesvg.js';
import { openFocalPointDialog } from './focalPointDialog.js';
import getSheet from '../../../shared/sheet.js';

const focalPointSheet = await getSheet('/blocks/edit/prose/plugins/focalPointDialog.css');
const injectedRoots = new WeakSet();

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

    inlinesvg({ parent: this.icon, paths: ['/blocks/edit/img/Smock_Crosshairs_18_N.svg'] });

    this.handleIconClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        openFocalPointDialog(this.view, pos, this.node);
      }
    };
    this.icon.addEventListener('click', this.handleIconClick);

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
  return new Plugin({
    view() {
      return {
        update(view) {
          const shadowRoot = view.dom.getRootNode();

          if (shadowRoot instanceof ShadowRoot && shadowRoot.adoptedStyleSheets) {
            if (!injectedRoots.has(shadowRoot)) {
              if (!shadowRoot.adoptedStyleSheets.includes(focalPointSheet)) {
                shadowRoot.adoptedStyleSheets = [...shadowRoot.adoptedStyleSheets, focalPointSheet];
              }
              injectedRoots.add(shadowRoot);
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
