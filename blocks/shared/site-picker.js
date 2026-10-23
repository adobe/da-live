import { getNx } from '../../scripts/utils.js';

const { loadStyle } = await import(`${getNx()}/utils/utils.js`);
const [style] = await Promise.all([
  loadStyle(import.meta.url),
  import(`${getNx()}/blocks/shared/picker/picker.js`),
]);
document.adoptedStyleSheets.push(style);

export { getSiteOptions } from './site-picker-utils.js';

export function updateSitePicker({ picker, sites = [], value }) {
  picker.items = [
    { section: 'Your Sites' },
    ...sites.map((site) => ({
      ...site,
      label: site.value.split('/').at(-1),
      description: site.value,
      ariaLabel: site.label,
    })),
    { divider: true },
    { value: 'add-site', label: 'Add site...', action: true, leadingIcon: '/img/icons/s2-icon-add-20-n.svg' },
  ];
  picker.value = value || '';
  picker.labelOverride = sites.find((site) => site.value === value)?.label || '';
}

export function createSitePicker({ onSelect, onAdd }) {
  const picker = document.createElement('nx-picker');
  picker.className = 'da-site-picker';
  picker.setAttribute('aria-label', 'Workspace site');
  picker.placeholder = 'Choose a site';
  picker.size = 'm';
  picker.variant = 'field';
  picker.addEventListener('change', ({ detail: { value } }) => {
    if (value === 'add-site') onAdd();
    else onSelect(value);
  });
  return picker;
}
