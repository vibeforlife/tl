import { describe, expect, it } from 'vitest';
import { getGeoJsonCountryCode } from '../src/features/dashboard/countryCodeMapping';

describe('GeoJSON country-code mapping', () => {
  it('prefers corrected ISO_A2_EH', () => expect(getGeoJsonCountryCode({ ISO_A2: '-99', ISO_A2_EH: 'FR' })).toBe('FR'));
  it('uses a valid ISO_A2 fallback', () => expect(getGeoJsonCountryCode({ ISO_A2: 'CA', ISO_A2_EH: '-99' })).toBe('CA'));
  it('rejects unsupported placeholders rather than guessing', () => {
    expect(getGeoJsonCountryCode({ ISO_A2: '-99', ISO_A2_EH: '-99' })).toBeNull();
    expect(getGeoJsonCountryCode({ ISO_A2: 'CN-TW', ISO_A2_EH: '-99' })).toBeNull();
  });
});
