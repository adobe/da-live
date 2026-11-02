import { expect } from '@esm-bundle/chai';
import { localToUtc, utcToLocal } from '../../../../../blocks/form/fields/datetime-zone.js';

describe('datetime-zone', () => {
  describe('localToUtc / utcToLocal (native datetime-local string)', () => {
    it('serializes a local datetime string to a UTC (Z) instant', () => {
      expect(localToUtc('2026-08-14T13:00')).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    });

    it('returns empty for empty/unparseable input', () => {
      expect(localToUtc('')).to.equal('');
      expect(localToUtc('nope')).to.equal('');
      expect(utcToLocal('')).to.equal('');
      expect(utcToLocal('nope')).to.equal('');
    });

    // Zone-agnostic: both directions use the runner's local zone, so the
    // wall-clock string round-trips regardless of which zone that is.
    it('round-trips a local string through UTC and back', () => {
      const local = '2026-08-14T13:00';
      expect(utcToLocal(localToUtc(local))).to.equal(local);
    });

    it('reads a stored UTC instant back to the same local string', () => {
      const iso = localToUtc('2026-08-14T13:00');
      expect(localToUtc(utcToLocal(iso))).to.equal(iso);
    });

    // Pre-1900 dates carry sub-minute offsets; rounding keeps them canonical.
    it('emits a canonical minute-precision instant for an ancient date', () => {
      expect(localToUtc('0001-01-01T01:00')).to.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
    });

    it('zero-pads the year to 4 digits so the native input can parse it', () => {
      const year = utcToLocal(localToUtc('0001-01-01T01:00')).split('-')[0];
      expect(year).to.have.lengthOf(4);
    });
  });
});
