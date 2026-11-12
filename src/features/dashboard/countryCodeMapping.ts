export type GeoJsonCountryProperties = {
  ISO_A2?: unknown;
  ISO_A2_EH?: unknown;
  CONTINENT?: unknown;
};

const isAlpha2 = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Z]{2}$/.test(value.toUpperCase());

/** Prefer Natural Earth ISO_A2_EH; fall back only to a valid ISO_A2 value. */
export function getGeoJsonCountryCode(properties: GeoJsonCountryProperties): string | null {
  if (isAlpha2(properties.ISO_A2_EH)) return properties.ISO_A2_EH.toUpperCase();
  if (isAlpha2(properties.ISO_A2)) return properties.ISO_A2.toUpperCase();
  return null;
}

/** Builds a local ISO alpha-2 to Natural Earth continent lookup. */
export function getGeoJsonContinentMap(features: Array<{ properties?: GeoJsonCountryProperties }>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const feature of features) {
    const code = getGeoJsonCountryCode(feature.properties ?? {});
    const continent = feature.properties?.CONTINENT;
    if (code && typeof continent === 'string' && continent.trim() && continent !== 'Seven seas (open ocean)') result[code] = continent.trim();
  }
  return result;
}
