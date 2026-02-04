import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch } from '../../../shared/utils.js';

async function getConfSheet(org) {
  const resp = await daFetch(`${DA_ORIGIN}/config/${org}/`);
  if (!resp.ok) return null;
  const json = await resp.json();
  return json.data.data || json.data;
}

export async function getUeUrl(ueConf, previewUrl) {
  const UE_PREFIX = 'https://experience.adobe.com/#/{{DX_ORG}}/aem/editor/canvas/';
  const { value } = ueConf;
  if (!value) return null;
  const dxOrg = value.split('/').find((split) => split.startsWith('@'));
  if (!dxOrg) return null;
  const prefix = UE_PREFIX.replace('{{DX_ORG}}', dxOrg);
  // TODO: INFRA
  let ueDomain = previewUrl.replace('https://', '').replace('.aem.', '.ue.da.');
  ueDomain = window.location.origin === 'https://da.page' ? ueDomain.replace('.ue.da.live', '.ue.da.page') : ueDomain;
  return `${prefix}${ueDomain}`;
}

export async function getQeUrl(previewUrl) {
  const finalUrl = previewUrl
    .replace('.aem.live', '.aem.page')
    .replace(/\/index$/, '/');
  return `${finalUrl}?quick-edit=on`;
}

export default async function getExternalUrl(org, repo, previewUrl) {
  const confSheet = await getConfSheet(org);
  const qeConf = confSheet.find((row) => row.key === 'quick-edit' && row.value.split(',').find((split) => split.startsWith(repo)));
  if (qeConf) return getQeUrl(previewUrl);
  const ueConf = confSheet.find((row) => row.key === 'editor.path');
  if (ueConf) return getUeUrl(ueConf, previewUrl);
  return null;
}
