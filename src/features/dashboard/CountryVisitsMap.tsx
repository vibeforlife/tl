import { useEffect, useMemo, useRef } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import type { CountryVisitSummary } from './countryVisitCalculations';
import { getGeoJsonCountryCode } from './countryCodeMapping';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;
const SOURCE_ID = 'travel-lore-country-boundaries';
const FILL_LAYER_ID = 'travel-lore-country-fills';
const LINE_LAYER_ID = 'travel-lore-country-borders';
const WORLD_BOUNDS: [[number, number], [number, number]] = [[-180, -85], [180, 85]];

type Props = {
  countries: CountryVisitSummary[];
  selectedCountryCode: string | null;
  onSelectCountry: (code: string) => void;
};

type Coordinate = [number, number];

function collectCoordinates(value: unknown, output: Coordinate[]) {
  if (!Array.isArray(value)) return;
  if (value.length >= 2 && typeof value[0] === 'number' && typeof value[1] === 'number') {
    output.push([value[0], value[1]]);
    return;
  }
  value.forEach((child) => collectCoordinates(child, output));
}

function fitVisitedCountries(
  map: mapboxgl.Map,
  codes: string[],
  features: Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }>,
  duration: number,
) {
  const visited = new Set(codes);
  const coordinates: Coordinate[] = [];

  features.forEach((feature) => {
    const code = feature.properties?.TL_COUNTRY_CODE;
    if (!code || !visited.has(String(code))) return;
    collectCoordinates(feature.geometry?.coordinates, coordinates);
  });

  if (coordinates.length === 0) {
    map.fitBounds(WORLD_BOUNDS, { padding: 24, duration, maxZoom: 1.15 });
    return;
  }

  const bounds = coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
  );
  map.fitBounds(bounds, {
    padding: { top: 48, bottom: 48, left: 48, right: 48 },
    duration,
    maxZoom: 2.35,
  });
}

function fitCountry(map: mapboxgl.Map, code: string) {
  const features = map.querySourceFeatures(SOURCE_ID, {
    filter: ['==', ['get', 'TL_COUNTRY_CODE'], code],
  });
  const coordinates: Coordinate[] = [];
  features.forEach((feature) => collectCoordinates(
    feature.geometry && 'coordinates' in feature.geometry ? feature.geometry.coordinates : null,
    coordinates,
  ));
  if (coordinates.length === 0) return;
  const bounds = coordinates.reduce(
    (result, coordinate) => result.extend(coordinate),
    new mapboxgl.LngLatBounds(coordinates[0], coordinates[0]),
  );
  map.fitBounds(bounds, {
    padding: { top: 60, bottom: 60, left: 60, right: 60 },
    duration: 650,
    maxZoom: 3.8,
  });
}

export function CountryVisitsMap({ countries, selectedCountryCode, onSelectCountry }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const onSelectRef = useRef(onSelectCountry);
  const visitedCodes = useMemo(() => countries.map((country) => country.code), [countries]);
  const visitedCodesRef = useRef(visitedCodes);
  const selectedCountryRef = useRef(selectedCountryCode);
  const countryFeaturesRef = useRef<Array<{ properties?: Record<string, unknown>; geometry?: { coordinates?: unknown } }>>([]);

  useEffect(() => { onSelectRef.current = onSelectCountry; }, [onSelectCountry]);
  useEffect(() => { visitedCodesRef.current = visitedCodes; }, [visitedCodes]);
  useEffect(() => { selectedCountryRef.current = selectedCountryCode; }, [selectedCountryCode]);

  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;
    mapboxgl.accessToken = MAPBOX_TOKEN;
    const map = new mapboxgl.Map({
      container: containerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      projection: 'mercator',
      center: [0, 15],
      zoom: 0.8,
      minZoom: 0.65,
      maxZoom: 5,
      renderWorldCopies: false,
    });
    mapRef.current = map;
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right');

    map.on('load', async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}data/ne_110m_admin_0_countries.geojson`);
        if (!response.ok) throw new Error(`Country boundaries unavailable (${response.status}).`);
        const geojson = await response.json();
        if (mapRef.current !== map || !map.isStyleLoaded()) return;
        const normalizedGeojson = {
          ...geojson,
          features: geojson.features.map((feature: { properties?: Record<string, unknown> }) => ({
            ...feature,
            properties: { ...feature.properties, TL_COUNTRY_CODE: getGeoJsonCountryCode(feature.properties ?? {}) },
          })),
        };
        countryFeaturesRef.current = normalizedGeojson.features;

        map.setProjection('mercator');
        map.addSource(SOURCE_ID, { type: 'geojson', data: normalizedGeojson });
        map.addLayer({
          id: FILL_LAYER_ID, type: 'fill', source: SOURCE_ID,
          paint: {
            'fill-color': ['case', ['in', ['get', 'TL_COUNTRY_CODE'], ['literal', visitedCodesRef.current]], '#48d6c7', '#34434b'],
            'fill-opacity': ['case', ['==', ['get', 'TL_COUNTRY_CODE'], selectedCountryRef.current ?? ''], 0.96, ['in', ['get', 'TL_COUNTRY_CODE'], ['literal', visitedCodesRef.current]], 0.78, 0.48],
          },
        });
        map.addLayer({ id: LINE_LAYER_ID, type: 'line', source: SOURCE_ID,
          paint: { 'line-color': '#8d9da0', 'line-width': 0.55, 'line-opacity': 0.62 },
        });
        map.on('click', FILL_LAYER_ID, (event) => {
          const properties = event.features?.[0]?.properties;
          if (!properties) return;
          const code = getGeoJsonCountryCode(properties);
          if (code && visitedCodesRef.current.includes(code)) onSelectRef.current(code);
        });
        map.on('mouseenter', FILL_LAYER_ID, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', FILL_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
        map.once('idle', () => {
          if (selectedCountryRef.current) {
            fitCountry(map, selectedCountryRef.current);
          } else {
            fitVisitedCountries(map, visitedCodesRef.current, countryFeaturesRef.current, 0);
          }
        });
      } catch (error) {
        console.error('Travel Lore country map failed to load:', error);
      }
    });

    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => map.resize());
    if (observer && containerRef.current) observer.observe(containerRef.current);
    const onWindowResize = () => map.resize();
    if (!observer) window.addEventListener('resize', onWindowResize);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener('resize', onWindowResize);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  const visitedCodesKey = visitedCodes.join(',');
  useEffect(() => {
    const map = mapRef.current;
    if (!map?.getLayer(FILL_LAYER_ID)) return;
    map.setPaintProperty(FILL_LAYER_ID, 'fill-color', [
      'case', ['in', ['get', 'TL_COUNTRY_CODE'], ['literal', visitedCodesRef.current]], '#48d6c7', '#34434b',
    ]);
    map.setPaintProperty(FILL_LAYER_ID, 'fill-opacity', [
      'case', ['==', ['get', 'TL_COUNTRY_CODE'], selectedCountryCode ?? ''], 0.96,
      ['in', ['get', 'TL_COUNTRY_CODE'], ['literal', visitedCodesRef.current]], 0.78, 0.48,
    ]);
  }, [visitedCodesKey, selectedCountryCode]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getSource(SOURCE_ID)) return;
    if (selectedCountryCode) {
      fitCountry(map, selectedCountryCode);
    } else {
      fitVisitedCountries(map, visitedCodesRef.current, countryFeaturesRef.current, 550);
    }
  }, [selectedCountryCode, visitedCodesKey]);

  if (!MAPBOX_TOKEN) return <div className="td-country-map__fallback">Add a Mapbox access token to enable the world map.</div>;
  return <div className="td-country-map">
    <div className="td-country-map__canvas" ref={containerRef} aria-label="Flat world map showing countries visited" />
    <div className="td-country-map__legend">
      <span><i className="td-country-map__swatch td-country-map__swatch--visited" /> Countries with recorded Memories</span>
      <span><i className="td-country-map__swatch td-country-map__swatch--other" /> Other countries</span>
    </div>
  </div>;
}
