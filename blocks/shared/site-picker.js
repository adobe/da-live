import { getNx } from '../../scripts/utils.js';

await import(`${getNx()}/blocks/shared/picker/picker.js`);

export function updateSitePicker({ picker, sites, value }) {
  picker.items = [
    { section: 'Your Sites' },
    ...(sites || []).map((site) => ({
      ...site,
      label: site.value.split('/').at(-1),
      description: site.value,
      ariaLabel: site.label,
    })),
    { divider: true },
    { value: 'add-site', label: 'Add site...', action: true, leadingIcon: '/img/icons/s2-icon-add-20-n.svg' },
  ];
  picker.value = value || '';
  picker.labelOverride = sites?.find((site) => site.value === value)?.label || '';
}

export function createSitePicker({ onSelect, onAdd }) {
  const picker = document.createElement('nx-picker');
  picker.setAttribute('aria-label', 'Workspace site');
  picker.placeholder = 'Choose a site';
  picker.size = 'm';
  picker.variant = 'field';
  picker.menuVariant = 'site';
  picker.addEventListener('change', ({ detail: { value } }) => {
    if (value === 'add-site') onAdd();
    else onSelect(value);
  });
  return picker;
}
