import { DA_ORIGIN, DA_HLX } from './constants.js';
import DaAdminApi from './api/da-admin.js';
import DaHlx6Api from './api/da-hlx6.js';

const DaApi = DA_HLX ? DaHlx6Api : DaAdminApi;

export default DaApi;
export const daApi = new DaApi(DA_ORIGIN);
