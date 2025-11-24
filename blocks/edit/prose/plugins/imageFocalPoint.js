import { Plugin } from 'da-y-wrapper';
import inlinesvg from '../../../shared/inlinesvg.js';
import { openFocalPointDialog } from './focalPointDialog.js';
import { getLibraryList } from '../../da-library/helpers/helpers.js';
import { getBlocks } from '../../da-library/helpers/index.js';
import { getTableInfo, isInTableCell } from './tableUtils.js';

// Cache blocks data at module level
let blocksDataPromise = null;
async function getBlocksData() {
  if (!blocksDataPromise) {
    blocksDataPromise = (async () => {
      try {
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

  const tableNameLower = tableName.toLowerCase();
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
    // img.title = `data-focal:${attrs.dataFocalX},${attrs.dataFocalY}`;
  } else {
    img.removeAttribute('data-focal-x');
    img.removeAttribute('data-focal-y');
    if (img.title?.includes('data-focal:')) {
      img.removeAttribute('title');
    }
  }
}

// Track all active image views for global updates
const imageViews = new Set();

class ImageWithFocalPointView {
  constructor(node, view, getPos) {
    this.node = node;
    this.view = view;
    this.getPos = getPos;
    this.currentTableName = null;

    this.dom = document.createElement('span');
    this.dom.className = 'focal-point-image-wrapper';

    this.img = document.createElement('img');
    updateImageAttributes(this.img, node.attrs);

    if (node.attrs.src?.toLowerCase().endsWith('.svg')) {
      this.dom.classList.add('focal-point-svg-wrapper');
    }

    this.dom.appendChild(this.img);

    imageViews.add(this);
    this.initFocalPoint();
  }

  async initFocalPoint() {
    try {
      const blocks = await getBlocksData();
      const pos = this.getPos();
      if (pos == null) return;

      const tableInfo = getTableInfo(this.view.state, pos);
      this.currentTableName = tableInfo?.tableName || null;
      if (tableInfo && shouldShowFocalPoint(tableInfo.tableName, blocks)) {
        this.enableFocalPoint();
      }
    } catch (error) {
      // If blocks data fails to load, don't show focal point
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

    this.dom.appendChild(this.icon);
  }

  disableFocalPoint() {
    if (!this.icon) return;

    this.icon.removeEventListener('click', this.handleIconClick);
    this.icon.remove();
    this.icon = null;
    this.handleIconClick = null;
  }

  async recheckFocalPoint() {
    try {
      const blocks = await getBlocksData();
      const pos = this.getPos();
      if (pos == null) return;

      const tableInfo = getTableInfo(this.view.state, pos);
      const newTableName = tableInfo?.tableName || null;

      // Only recheck if table name changed
      if (newTableName !== this.currentTableName) {
        this.currentTableName = newTableName;
        const shouldShow = tableInfo && shouldShowFocalPoint(tableInfo.tableName, blocks);

        if (shouldShow && !this.icon) {
          this.enableFocalPoint();
        } else if (!shouldShow && this.icon) {
          this.disableFocalPoint();
        }
      }
    } catch (error) {
      // eslint-disable-next-line no-console
      console.warn('Failed to recheck focal point:', error);
    }
  }

  update(node) {
    if (node.type.name !== 'image') return false;

    this.node = node;
    updateImageAttributes(this.img, node.attrs);

    if (node.attrs.src?.toLowerCase().endsWith('.svg')) {
      this.dom.classList.add('focal-point-svg-wrapper');
    } else {
      this.dom.classList.remove('focal-point-svg-wrapper');
    }

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
    imageViews.delete(this);
  }
}

export default function imageFocalPoint() {
  return new Plugin({
    view() {
      return {
        update(view, prevState) {
          // Check if document changed (not just selection)
          if (!view.state.doc.eq(prevState.doc)) {
            // Recheck focal point status for all image views
            imageViews.forEach((imageView) => {
              imageView.recheckFocalPoint();
            });
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
