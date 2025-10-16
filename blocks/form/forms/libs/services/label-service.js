/**
 * LabelService
 * Simple text formatting helpers for labels/titles.
 */
export class LabelService {
  formatLabel(name) {
    return String(name || '')
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (str) => str.toUpperCase())
      .replace(/_/g, ' ');
  }
}

export default LabelService;


