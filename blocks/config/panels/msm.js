// `msm` sheet of the org config: a row without `satellite` defines a base site, a row with one
// makes that site resolve from the base. A satellite can itself be the base of other rows.

import { all, validator, required } from '../editors/validators.js';
import { VALIDATION } from '../messages.js';

const siteName = (value) => value && !/^[\w.-]+$/.test(value) && VALIDATION.msm.siteName;

export const validateRow = validator({
  base: all(required(VALIDATION.msm.baseSite), siteName),
  satellite: all(
    siteName,
    (value, row) => value && value === row.base && VALIDATION.msm.ownSatellite,
    // Each satellite resolves from one base.
    (value, row, others) => value
      && others.some((other) => other.satellite === value && other.base !== row.base)
      && VALIDATION.msm.satelliteTaken,
  ),
});

export default {
  kind: 'rows',
  idKey: 'base',
  idOf: (row) => `${row.base}>${row.satellite ?? ''}`,
  duplicate: VALIDATION.msm.duplicate,
  noun: 'site',
  label: (row) => row.title || row.satellite || row.base,
  details: (row) => (row.satellite
    ? `${row.satellite} · satellite of ${row.base}`
    : `${row.base} · base site`),
  description: 'Define base sites and the satellite sites that inherit their content. MSM also needs '
    + 'the MSM content source in each site\'s Config Service setup, and the Multi-site Manager entry '
    + 'in Extensions → Prepare (or the MSM app in Apps).',
  validate: validateRow,
  columns: [
    {
      key: 'base',
      label: 'Base site',
      hint: 'Site that supplies the shared content.',
      required: true,
      placeholder: 'my-base',
    },
    {
      key: 'satellite',
      label: 'Satellite site',
      hint: 'Site that inherits from the base. Leave empty to define the base site itself.',
      placeholder: 'satellite-1',
    },
    {
      key: 'title',
      label: 'Title',
      hint: 'Display name shown in the MSM tools.',
      placeholder: 'Satellite Site 1',
    },
  ],
};
