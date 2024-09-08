import { aemPreview } from '../../../shared/utils.js';

export default function getAEMStatus(path) {
  return aemPreview(path, 'status', 'GET');
}
