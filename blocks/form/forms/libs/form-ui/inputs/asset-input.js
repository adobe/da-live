import { render } from 'da-lit';
import BaseInput from './base-input.js';
import { ICONS } from '../utils/icon-urls.js';
import { removeButtonTemplate } from '../templates/buttons.js';
import { assetPreviewTemplate, replaceButtonTemplate, assetPickerWrapperTemplate } from '../templates/asset.js';

// Module-relative URL for the generic file icon
const FILE_ICON_URL = new URL('../../assets/file-icon.svg', import.meta.url).href;

/**
 * FileInput (generic)
 *
 * Picker-driven file chooser used for images, documents, videos, etc.
 * Designed for extension: override hooks to customize wrapper label,
 * preview rendering and selection mapping.
 */
export default class FileInput extends BaseInput {
  constructor(context, handlers = {}) {
    super(context, handlers);
    this.services = (context && context.services) || (handlers && handlers.services) || null;
  }

  /** Hook: label shown inside the wrapper trigger */
  getWrapperLabel() { return 'Choose a file from Assets'; }

  /** Hook: map picker selection → value string saved in hidden input */
  mapSelectionToValue(selection) { return typeof selection === 'string' ? selection : (selection && selection.src) || ''; }

  /** Determine if a given URL looks like an image */
  isImageUrl(url) {
    try {
      const clean = String(url || '').split('?')[0].toLowerCase();
      if (clean.startsWith('data:image/')) return true;
      return /\.(avif|heic|heif|gif|jpe?g|png|webp|svg)$/.test(clean);
    } catch { return false; }
  }

  /** Shared remove button with confirm behavior via lit */
  createRemoveButton(onRemove) {
    let confirmState = false;
    const mount = document.createElement('div');
    const rerender = () => {
      render(removeButtonTemplate({
        confirm: confirmState,
        onClick: (e) => {
          e?.preventDefault?.();
          e?.stopPropagation?.();
          if (confirmState) {
            onRemove();
          } else {
            confirmState = true;
            rerender();
            setTimeout(() => { confirmState = false; rerender(); }, 3000);
          }
        },
      }), mount);
    };
    rerender();
    return mount.firstElementChild;
  }

  /** Hook: render preview for a selected item; may be overridden */
  renderPreview(previewsEl, actionsHost, { src, name }, onRemove, onReplace) {
    previewsEl.innerHTML = '';
    const previewMount = document.createElement('div');
    render(assetPreviewTemplate({ src, name, fileIconUrl: FILE_ICON_URL, isImage: this.isImageUrl(src) }), previewMount);
    const box = previewMount.firstElementChild;

    // Remove button mounted to actions host if provided
    const removeBtn = this.createRemoveButton(onRemove);
    if (actionsHost) {
      actionsHost.innerHTML = '';
      // Stack actions vertically
      actionsHost.style.flexDirection = 'column';
      // Replace (icon button)
      const replaceMount = document.createElement('div');
      render(replaceButtonTemplate({ onClick: (e) => { e.preventDefault(); e.stopPropagation(); try { if (typeof onReplace === 'function') onReplace(); } catch {} } }), replaceMount);
      actionsHost.appendChild(replaceMount.firstElementChild);
      // Remove
      actionsHost.appendChild(removeBtn);
    } else {
      removeBtn.classList.add('form-ui-preview-remove');
      box.appendChild(removeBtn);
    }
    previewsEl.appendChild(box);
  }

  /** Create the file input UI */
  create(fieldPath, propSchema) {
    const container = document.createElement('div');
    container.className = 'form-ui-picture-input';

    const hidden = document.createElement('input');
    hidden.type = 'hidden';
    hidden.name = fieldPath;
    container.appendChild(hidden);

    const defaultText = this.getWrapperLabel();
    const wrapperMount = document.createElement('div');
    render(assetPickerWrapperTemplate({ ariaLabel: defaultText, labelText: defaultText }), wrapperMount);
    const wrapper = wrapperMount.firstElementChild;

    const previews = document.createElement('div');
    previews.className = 'form-ui-upload-previews';

    const setValueAndNotify = (value) => {
      hidden.value = value || '';
      this.onInputOrChange(fieldPath, propSchema, hidden);
      try {
        hidden.dispatchEvent(new Event('input', { bubbles: true }));
        hidden.dispatchEvent(new Event('change', { bubbles: true }));
      } catch {}
    };

    let previewRefs = null;

    const renderPreviewUI = ({ src, name }) => {
      const actionsHost = (() => {
        try {
          // Prefer the actions for this exact fieldPath
          const fieldRoot = container.closest?.('.form-ui-field');
          if (fieldRoot) {
            const exact = fieldRoot.querySelector?.(`.form-ui-field-actions[data-actions-for="${CSS.escape(fieldPath)}"]`);
            if (exact) return exact;
            const row = container.closest?.('.form-ui-field-row');
            const sibling = row && row.querySelector?.('.form-ui-field-actions');
            if (sibling) return sibling;
          }
          // Fallback to legacy sibling traversal
          const main = container.parentElement;
          const actions = main && main.nextElementSibling;
          if (actions && actions.classList && actions.classList.contains('form-ui-field-actions')) return actions;
        } catch {}
        return null;
      })();

      const handleRemove = () => {
        previews.innerHTML = '';
        setValueAndNotify('');
        previewRefs = null;
        try { wrapper.style.display = ''; } catch {}
        if (actionsHost) actionsHost.innerHTML = '';
      };

      this.renderPreview(previews, actionsHost, { src, name }, handleRemove, openPicker);
      try { wrapper.style.display = 'none'; } catch {}
      previewRefs = { src, name };
    };

    const tryInitialPreview = async () => {
      const currentValue = hidden.value || '';
      if (!currentValue) return;
      try {
        const backend = this.services && this.services.backend;
        let url = currentValue;
        if (backend && typeof backend.buildPreviewUrl === 'function') {
          url = await backend.buildPreviewUrl(currentValue);
        }
        const name = (currentValue.split('/') && currentValue.split('/').pop ? currentValue.split('/').pop() : currentValue).replace(/^\./, '');
        renderPreviewUI({ src: url, name });
      } catch {}
    };

    const showAuthToast = async () => {
      try { await import('../../../components/toast/toast.js'); } catch {}
      try {
        let toast = document.querySelector('da-toast');
        if (!toast) { toast = document.createElement('da-toast'); document.body.appendChild(toast); }
        try { toast.show('Sign in required to pick assets', { variant: 'error' }); } catch {}
      } catch {}
    };

    const openPicker = async () => {
      const assets = this.services && this.services.assets;
      if (!assets || !assets.openPicker) return;
      try {
        const authSvc = this.services && this.services.auth;
        if (authSvc && authSvc.getStatus) {
          const st = await authSvc.getStatus();
          if (!st || !st.authenticated) { await showAuthToast(); return; }
        }
      } catch {}

      try {
        const selection = await assets.openPicker();
        if (!selection) return;
        const valueUrl = this.mapSelectionToValue(selection);
        const name = (valueUrl && valueUrl.split('?')[0].split('/') && valueUrl.split('?')[0].split('/').pop ? valueUrl.split('?')[0].split('/').pop() : 'File');
        renderPreviewUI({ src: valueUrl, name });
        setValueAndNotify(valueUrl);
      } catch {}
    };

    // Do not expose a shared opener; keep it scoped per instance via closure

    const updateAuthUI = (authenticated) => {
      const isAuth = !!authenticated;
      if (!isAuth) {
        wrapper.setAttribute('aria-disabled', 'true');
        try { wrapper.classList.add('form-ui-picker-disabled'); } catch {}
        const lt = wrapper.querySelector('.form-ui-picker-label-text');
        if (lt) lt.textContent = 'Sign in required to pick assets';
        wrapper.title = 'Sign in required to pick assets';
      } else {
        wrapper.removeAttribute('aria-disabled');
        try { wrapper.classList.remove('form-ui-picker-disabled'); } catch {}
        const lt = wrapper.querySelector('.form-ui-picker-label-text');
        if (lt) lt.textContent = defaultText;
        wrapper.removeAttribute('title');
      }
    };

    updateAuthUI(false);
    const authSvc = this.services && this.services.auth;
    if (authSvc && authSvc.getStatus) authSvc.getStatus().then((st) => updateAuthUI(st && st.authenticated));

    container.appendChild(wrapper);
    container.appendChild(previews);

    wrapper.addEventListener('click', (e) => {
      if (wrapper.classList && wrapper.classList.contains('form-ui-picker-disabled')) { e.preventDefault(); try { showAuthToast(); } catch {} return; }
      openPicker();
    });


    wrapper.addEventListener('focus', (e) => this.onFocus(fieldPath, propSchema, e.target));
    wrapper.addEventListener('blur', () => this.onBlur(fieldPath, propSchema, wrapper));

    const scheduleInitialPreview = () => {
      tryInitialPreview();
      try {
        requestAnimationFrame(() => {
          tryInitialPreview();
          setTimeout(() => { tryInitialPreview(); }, 100);
        });
      } catch {
        setTimeout(() => { tryInitialPreview(); }, 50);
      }
    };
    try { scheduleInitialPreview(); } catch { try { setTimeout(() => scheduleInitialPreview(), 0); } catch {} }

    return container;
  }
}


