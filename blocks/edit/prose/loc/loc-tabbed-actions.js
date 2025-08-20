// Tabbed interface action creation - only needed for complex paired LOC nodes

function createCompositeButton(
  {
    label,
    id,
    keepHandler,
    variantClass,
    tooltip,
    switchTooltip,
    isActive = false,
  },
  onSwitchTab,
  createElement,
  createButton,
  createTooltip,
) {
  const activeClass = isActive ? ' is-active' : '';
  const wrapper = createElement('div', `loc-composite-btn loc-composite-btn-base ${variantClass}${activeClass}`);

  const switchBtn = createButton('loc-composite-switch loc-composite-btn-base-element');
  switchBtn.textContent = label;
  switchBtn.addEventListener('click', () => onSwitchTab(id));
  if (switchTooltip) {
    switchBtn.appendChild(createTooltip(switchTooltip));
  }

  const confirmBtn = createButton('loc-composite-confirm loc-composite-btn-base-element', 'button', { 'aria-label': `${tooltip}` });
  confirmBtn.addEventListener('click', keepHandler);
  if (tooltip) {
    confirmBtn.appendChild(createTooltip(tooltip));
  }

  wrapper.appendChild(switchBtn);
  wrapper.appendChild(confirmBtn);
  return wrapper;
}

export function createTabbedActions(onKeepDeleted, onKeepAdded, onKeepBoth, onSwitchTab, createElement, createButton, createTooltip) {
  const actionsContainer = createElement('div', 'loc-tabbed-actions loc-floating-overlay');
  const actionButtons = createElement('div', 'loc-action-buttons loc-sticky-buttons');

  const buttonConfigs = [
    {
      label: 'Local',
      id: 'added',
      keepHandler: onKeepAdded,
      variantClass: 'is-local',
      tooltip: 'Accept Local',
      switchTooltip: 'View Local',
      isActive: true, // Local is the default active tab
    },
    {
      label: 'Upstream',
      id: 'deleted',
      keepHandler: onKeepDeleted,
      variantClass: 'is-upstream',
      tooltip: 'Accept Upstream',
      switchTooltip: 'View Upstream',
    },
    {
      label: 'Difference',
      id: 'diff',
      keepHandler: onKeepBoth,
      variantClass: 'is-diff',
      tooltip: 'Accept Both',
      switchTooltip: 'View Diff',
    },
  ];

  buttonConfigs.forEach((config) => {
    actionButtons.appendChild(createCompositeButton(config, onSwitchTab, createElement, createButton, createTooltip));
  });

  actionsContainer.appendChild(actionButtons);
  return actionsContainer;
}
