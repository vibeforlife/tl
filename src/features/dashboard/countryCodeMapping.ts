export type GeoJsonCountryProperties = {
  ISO_A2?: unknown;
  ISO_A2_EH?: unknown;
};

const isAlpha2 = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{2}$/.test(value.toUpperCase());

/** Prefer Natural Earth ISO_A2_EH; fall back only to a valid ISO_A2 value. */
export function getGeoJsonCountryCode(properties: GeoJsonCountryProperties): string | null {
  if (isAlpha2(properties.ISO_A2_EH)) return properties.ISO_A2_EH.toUpperCase();
  if (isAlpha2(properties.ISO_A2)) return properties.ISO_A2.toUpperCase();
  return null;
}
