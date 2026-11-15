import { describe, expect, it } from 'vitest';
import {
  generateReliveRouteGeometry,
  getReliveRoutePrefix,
  interpolateReliveRoute,
  toReliveRouteGeoJsonGeometry,
} from './reliveRouteGeometry';

describe('Relive organic route geometry', () => {
  it('generates deterministic curved paths with exact endpoints', () => {
    const start: [number, number] = [72.877, 19.076];
    const end: [number, number] = [80.2707, 13.0827];
    const first = generateReliveRouteGeometry(start, end, { seed: 'leg-a' });
    const second = generateReliveRouteGeometry(start, end, { seed: 'leg-a' });
    expect(first.coordinates).toEqual(second.coordinates);
    expect(first.coordinates).toHaveLength(40);
    expect(first.coordinates[0]).toEqual(start);
    expect(first.coordinates.at(-1)).toEqual(end);
    expect(first.coordinates.some((point, index) =>
      index > 0 && index < first.coordinates.length - 1 &&
      (Math.abs(point[0] - (start[0] + (end[0] - start[0]) * index / 39)) > 0.000001),
    )).toBe(true);
  });

  it('keeps an antimeridian crossing on the short side of the world', () => {
    const route = generateReliveRouteGeometry([179.7, 10], [-179.7, 11], { seed: 'dateline' });
    const longitudes = route.coordinates.map(([longitude]) => longitude);
    const jumps = longitudes.slice(1).map((longitude, index) =>
      Math.abs(longitude - longitudes[index]),
    );
    expect(Math.max(...jumps)).toBeLessThan(180);
    expect(route.distanceKm).toBeLessThan(150);
    expect(route.coordinates[0]).toEqual([179.7, 10]);
    expect(route.coordinates.at(-1)?.[0]).toBeCloseTo(180.3, 8);
    expect(route.coordinates.at(-1)?.[1]).toBe(11);

    const geoJson = toReliveRouteGeoJsonGeometry(route.coordinates);
    expect(geoJson.type).toBe('MultiLineString');
    if (geoJson.type === 'MultiLineString') {
      expect(geoJson.coordinates).toHaveLength(2);
      expect(geoJson.coordinates[0].at(-1)?.[0]).toBe(180);
      expect(geoJson.coordinates[1][0][0]).toBe(-180);
      expect(geoJson.coordinates.flat().every(([longitude]) =>
        longitude >= -180 && longitude <= 180,
      )).toBe(true);
    }
  });

  it('splits westbound antimeridian crossings in the opposite direction', () => {
    const route = generateReliveRouteGeometry([-179.7, 11], [179.7, 10], { seed: 'westbound' });
    const geoJson = toReliveRouteGeoJsonGeometry(route.coordinates);
    expect(geoJson.type).toBe('MultiLineString');
    if (geoJson.type === 'MultiLineString') {
      expect(geoJson.coordinates[0].at(-1)?.[0]).toBe(-180);
      expect(geoJson.coordinates[1][0][0]).toBe(180);
    }
  });

  it('handles very short routes without introducing a large curve', () => {
    const route = generateReliveRouteGeometry([10, 10], [10.00001, 10.00001]);
    expect(route.coordinates).toHaveLength(2);
    expect(route.coordinates[0]).toEqual([10, 10]);
    expect(route.coordinates[1]).toEqual([10.00001, 10.00001]);
  });

  it('interpolates the car position along the same generated geometry', () => {
    const route = generateReliveRouteGeometry([72.877, 19.076], [80.2707, 13.0827]);
    expect(interpolateReliveRoute(route.coordinates, 0)).toEqual(route.coordinates[0]);
    expect(interpolateReliveRoute(route.coordinates, 1)).toEqual(route.coordinates.at(-1));
    const halfway = interpolateReliveRoute(route.coordinates, 0.5);
    expect(halfway).not.toBeNull();
    expect(halfway?.[0]).toBeGreaterThan(72.877);
    expect(halfway?.[0]).toBeLessThan(80.2707);
  });

  it('reveals a route prefix ending at the same interpolated car position', () => {
    const route = generateReliveRouteGeometry([72.877, 19.076], [80.2707, 13.0827]);
    const prefix = getReliveRoutePrefix(route.coordinates, 0.43);
    expect(prefix.length).toBeGreaterThan(2);
    expect(prefix.at(-1)).toEqual(interpolateReliveRoute(route.coordinates, 0.43));
  });
});
