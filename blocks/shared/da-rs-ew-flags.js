import { fetchDaConfigs, getFirstSheet } from './utils.js';

// Workspace flags remain site configuration, independent of Source mode.
export async function getEWFlags({ org, site } = {}) {
  if (!org) return {};
  const configs = await Promise.all(fetchDaConfigs({ org, site }));
  return configs.reduce((flags, config) => {
    if (!config || config.error) return flags;
    (getFirstSheet(config) || []).forEach(({ key, value }) => {
      if (key?.startsWith('ew.')) flags[key] = value;
    });
    return flags;
  }, {});
}

export async function isEWEnabled(context) {
  return (await getEWFlags(context))['ew.enabled'] === 'true';
}

export const isEwChatEnabled = async () => false;
export const isEwChatDisabled = async () => true;
