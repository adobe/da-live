import { Plugin } from 'da-y-wrapper';
import { openFocalPointDialog } from './focalPointDialog.js';
import { getTableInfo, isInTableCell } from './tableUtils.js';

let blocksDataPromise = null;
async function getBlocksData() {
  if (!blocksDataPromise) {
    blocksDataPromise = (async () => {
      try {
        const { getLibraryList } = await import('https://da.live/blocks/edit/da-library/helpers/helpers.js');
        const { getBlocks } = await import('https://da.live/blocks/edit/da-library/helpers/index.js');
        const libraryList = await getLibraryList();
        const blocksInfo = libraryList.find((l) => l.name === 'blocks');
        if (!blocksInfo) return [];
        return await getBlocks(blocksInfo.sources);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.warn('Failed to load blocks data for focal point:', error);
        return [];
      }
    })();
  }
  return blocksDataPromise;
}

function hasFocalPointData(attrs) {
  return (attrs.dataFocalX && attrs.dataFocalX !== '')
    || (attrs.dataFocalY && attrs.dataFocalY !== '');
}

function shouldShowFocalPoint(tableName, blocks) {
  if (!tableName || !blocks || blocks.length === 0) return false;

  const tableNameLower = tableName.toLowerCase().replace(/-/g, ' ');
  return blocks.some((block) => (block.name.toLowerCase() === tableNameLower && block['focal-point'] === 'yes'));
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

    this.dom.appendChild(this.img);

    this.initFocalPoint();
  }

  async initFocalPoint() {
    try {
      const blocks = await getBlocksData();
      const pos = this.getPos();
      if (pos == null) return;

      const tableInfo = getTableInfo(this.view.state, pos);
      if (tableInfo && shouldShowFocalPoint(tableInfo.tableName, blocks)) {
        this.enableFocalPoint();
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to initialize focal point:', error);
    }
  }

  enableFocalPoint() {
    if (this.icon) return;

    this.icon = document.createElement('span');
    this.icon.className = hasFocalPointData(this.node.attrs)
      ? 'focal-point-icon focal-point-icon-active'
      : 'focal-point-icon';

    const crosshairs = document.createElement('img');
    crosshairs.src = '/blocks/edit/img/Smock_Crosshairs_18_N.svg';
    crosshairs.setAttribute('aria-hidden', 'true');
    this.icon.append(crosshairs);

    this.handleIconClick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = this.getPos();
      if (pos != null) {
        openFocalPointDialog(this.view, pos, this.node);
      }
    };
    this.icon.addEventListener('click', this.handleIconClick);

    this.dom.appendChild(this.icon);
  }

  update(node) {
    if (node.type.name !== 'image') return false;

    this.node = node;
    updateImageAttributes(this.img, node.attrs);

    if (this.icon) {
      this.icon.className = hasFocalPointData(node.attrs)
        ? 'focal-point-icon focal-point-icon-active'
        : 'focal-point-icon';
    }

    return true;
  }

  destroy() {
    if (this.icon) {
      this.icon.removeEventListener('click', this.handleIconClick);
    }
  }
}

export default function imageFocalPoint() {
  return new Plugin({
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
