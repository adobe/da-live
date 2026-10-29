export const UI_SIZE_EVENT = 'nx-ui-size-change';

export function getUISize() {
  const size = localStorage.getItem('ui-size');
  return ['s', 'm', 'l'].includes(size) ? size : 's';
}

function applyUISize() {
  const size = getUISize();
  document.body.classList.remove('ui-size-s', 'ui-size-m', 'ui-size-l');
  if (size !== 's') document.body.classList.add(`ui-size-${size}`);
  document.dispatchEvent(new CustomEvent(UI_SIZE_EVENT, { detail: { size } }));
}

export function setUISize({ size }) {
  if (!['s', 'm'].includes(size)) throw new RangeError(`Unsupported UI size: ${size}`);
  localStorage.setItem('ui-size', size);
  applyUISize();
}

window.addEventListener('storage', (event) => {
  if (event.storageArea === localStorage && (event.key === 'ui-size' || event.key === null)) {
    applyUISize();
  }
});

export class UISizeController {
  constructor(host, { onChange } = {}) {
    this.host = host;
    this.onChange = onChange;
    host.addController(this);
  }

  _update = () => {
    const size = getUISize();
    this.host.dataset.uiSize = size;
    this.onChange?.(size);
    this.host.requestUpdate();
  };

  hostConnected() {
    this._update();
    document.addEventListener(UI_SIZE_EVENT, this._update);
  }

  hostDisconnected() {
    document.removeEventListener(UI_SIZE_EVENT, this._update);
  }
}
