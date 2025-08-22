import { createElement, createButton, createTooltip } from '../../utils/helpers.js';

function createCompositeButton(
  {
    label,
    id,
    handler,
    variant,
    tooltip,
    switchTooltip,
    isActive = false,
  },
  onSwitchTab,
) {
  const activeClass = isActive ? ' is-active' : '';
  const wrapper = createElement('div', `da-diff-btn da-diff-btn-base ${variant}${activeClass}`);

  const switchBtn = createButton('switch-btn da-diff-btn-base-element');
  switchBtn.textContent = label;
  switchBtn.addEventListener('click', () => onSwitchTab(id));
  if (switchTooltip) {
    switchBtn.appendChild(createTooltip(switchTooltip, 'diff-tooltip'));
  }

  const confirmBtn = createButton('confirm-btn da-diff-btn-base-element', 'button', { 'aria-label': `${tooltip}` });
  confirmBtn.addEventListener('click', handler);
  if (tooltip) {
    confirmBtn.appendChild(createTooltip(tooltip, 'diff-tooltip'));
  }

  wrapper.appendChild(switchBtn);
  wrapper.appendChild(confirmBtn);
  return wrapper;
}

// eslint-disable-next-line import/prefer-default-export
export function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab) {
  const actionsContainer = createElement('div', 'diff-tabbed-actions loc-floating-overlay');
  const actionButtons = createElement('div', 'diff-action-buttons loc-sticky-buttons');

  const buttonConfigs = [
    {
      label: 'Local',
      id: 'added',
      handler: onKeepAdded,
      variant: 'is-local',
      tooltip: 'Accept Local',
      switchTooltip: 'View Local',
      isActive: true, // Local is the default active tab
    },
    {
      label: 'Upstream',
      id: 'deleted',
      handler: onKeepDeleted,
      variant: 'is-upstream',
      tooltip: 'Accept Upstream',
      switchTooltip: 'View Upstream',
    },
    {
      label: 'Difference',
      id: 'diff',
      handler: onKeepBoth,
      variant: 'is-diff',
      tooltip: 'Accept Both',
      switchTooltip: 'View Diff',
    },
  ];

  buttonConfigs.forEach((config) => {
    actionButtons.appendChild(createCompositeButton(config, onSwitchTab));
  });

  actionsContainer.appendChild(actionButtons);
  return actionsContainer;
}
