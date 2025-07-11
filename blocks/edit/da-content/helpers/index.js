import { DA_ORIGIN } from '../../../shared/constants.js';
import { daFetch } from '../../../shared/utils.js';

export default async function getUeUrl(org, previewUrl) {
  const UE_PREFIX = 'https://experience.adobe.com/#/{{DX_ORG}}/aem/editor/canvas/';
  const resp = await daFetch(`${DA_ORIGIN}/config/${org}/`);
  if (!resp.ok) return null;
  const json = await resp.json();
  const confSheet = json.data.data || json.data;
  const ueConf = confSheet.find((row) => row.key === 'editor.path');
  if (!ueConf) return null;
  const { value } = ueConf;
  if (!value) return null;
  const dxOrg = value.split('/').find((split) => split.startsWith('@'));
  if (!dxOrg) return null;
  const prefix = UE_PREFIX.replace('{{DX_ORG}}', dxOrg);
  const ueDomain = previewUrl.replace('https://', '').replace('.aem.', '.ue.da.');
  return `${prefix}${ueDomain}`;
}
