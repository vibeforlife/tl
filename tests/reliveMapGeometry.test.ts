import { describe, expect, it } from 'vitest';
import type { Entry } from '../src/types/domain';
import {
  buildReliveMapPointFeatures,
  buildReliveMapStops,
  isReliveNewStopMemory,
  RELIVE_MAP_CLUSTER_MAX_ZOOM,
  RELIVE_MAP_CLUSTER_RADIUS_PX,
  resolveReliveActiveMappedEntryId,
  resolveReliveActiveStopIndex,
} from '../src/features/relive/reliveMapGeometry';

const entry = (id: string, latitude?: number, longitude?: number): Entry => ({
  id,
  title: `Memory ${id}`,
  location: latitude === undefined || longitude === undefined
    ? undefined
    : { name: `Place ${id}`, latitude, longitude },
} as Entry);

describe('Relive map geometry', () => {
  it('groups nearby Memories into one geographic stop while retaining their coordinates', () => {
    const entries = [
      entry('a', 19.076, 72.877),
      entry('b', 19.077, 72.878),
      entry('c', 19.2, 73.0),
    ];

    const stops = buildReliveMapStops(entries);

    expect(stops).toHaveLength(2);
    expect(stops[0].entryIds).toEqual(['a', 'b']);
    expect(stops[1].entryIds).toEqual(['c']);
  });


  it('does not merge a return to an earlier location after an intervening stop', () => {
    const entries = [
      entry('a1', 19.076, 72.877),
      entry('b', 13.0827, 80.2707),
      entry('a2', 19.077, 72.878),
    ];
    const stops = buildReliveMapStops(entries);
    expect(stops.map((stop) => stop.entryIds)).toEqual([['a1'], ['b'], ['a2']]);
  });

  it('allows unmapped Memories between nearby mapped Memories without breaking the stop', () => {
    const entries = [
      entry('a1', 19.076, 72.877),
      entry('unmapped'),
      entry('a2', 19.077, 72.878),
    ];
    const stops = buildReliveMapStops(entries);
    expect(stops).toHaveLength(1);
    expect(stops[0].entryIds).toEqual(['a1', 'a2']);
  });

  it('does not create map stops for missing or invalid coordinates', () => {
    const entries = [entry('missing'), entry('invalid', 120, 500)];
    expect(buildReliveMapStops(entries)).toEqual([]);
  });

  it('only treats the first Memory in a grouped stop as a new route leg', () => {
    const entries = [
      entry('stop-start', 19.076, 72.877),
      entry('same-stop', 19.077, 72.878),
      entry('next-stop', 13.0827, 80.2707),
    ];
    const stops = buildReliveMapStops(entries);

    expect(isReliveNewStopMemory(stops, 'stop-start')).toBe(true);
    expect(isReliveNewStopMemory(stops, 'same-stop')).toBe(false);
    expect(isReliveNewStopMemory(stops, 'next-stop')).toBe(true);
    expect(isReliveNewStopMemory(stops, null)).toBe(false);
  });

  it('keeps the last known stop active for a Memory without coordinates', () => {
    const entries = [
      entry('first', 19.076, 72.877),
      entry('no-location'),
      entry('later', 13.0827, 80.2707),
    ];
    const stops = buildReliveMapStops(entries);

    expect(resolveReliveActiveStopIndex(entries, stops, 'no-location')).toBe(0);
    expect(resolveReliveActiveStopIndex(entries, stops, 'later')).toBe(1);
    expect(resolveReliveActiveMappedEntryId(entries, 'no-location')).toBe('first');
  });

  it('keeps the same stop active for multiple Memories in the same area', () => {
    const entries = [entry('first', 19.076, 72.877), entry('second', 19.077, 72.878)];
    const stops = buildReliveMapStops(entries);

    expect(resolveReliveActiveStopIndex(entries, stops, 'second')).toBe(0);
    expect(resolveReliveActiveMappedEntryId(entries, 'second')).toBe('second');
  });
});

describe('Relive map point features', () => {
  it('uses screen-space clustering at overview zoom and disables it before detail zoom', () => {
    expect(RELIVE_MAP_CLUSTER_RADIUS_PX).toBe(58);
    expect(RELIVE_MAP_CLUSTER_MAX_ZOOM).toBe(10);
  });

  it('retains distinct saved coordinates so nearby Memories can separate at detail zoom', () => {
    const entries = [
      entry('m1', 19.076, 72.877),
      entry('m2', 19.077, 72.878),
      entry('m3', 13.0827, 80.2707),
    ];
    const stops = buildReliveMapStops(entries);
    const collection = buildReliveMapPointFeatures(entries, stops, 'm2');

    expect(collection.features).toHaveLength(3);
    expect(collection.features[0].properties.memoryNumber).toBe('01');
    expect(collection.features[0].properties.isActive).toBe(0);
    expect(collection.features[1].properties.memoryNumber).toBe('02');
    expect(collection.features[1].properties.isActive).toBe(1);
    expect(collection.features[1].geometry.coordinates).toEqual([72.878, 19.077]);
  });

  it('fans out effectively identical coordinates so individual Memories remain visible', () => {
    const entries = [
      entry('m1', 19.076, 72.877),
      entry('m2', 19.0760001, 72.8770001),
      entry('m3', 19.077, 72.878),
    ];
    const stops = buildReliveMapStops(entries);
    const collection = buildReliveMapPointFeatures(entries, stops, 'm2');

    expect(collection.features).toHaveLength(3);
    const firstAndThird = collection.features.filter((feature) => ['m1', 'm3'].includes(feature.properties.entryId));
    expect(firstAndThird).toHaveLength(2);
    expect(firstAndThird[0].geometry.coordinates).not.toEqual(firstAndThird[1].geometry.coordinates);
    expect(collection.features[0].properties.memoryNumber).toBe('01');
    expect(collection.features[1].properties.memoryNumber).toBe('02');
    expect(collection.features[1].properties.isActive).toBe(1);
    expect(collection.features[2].properties.memoryNumber).toBe('03');
  });

  it('marks the last mapped Memory active when the current Memory has no coordinates', () => {
    const entries = [entry('mapped', 19.076, 72.877), entry('unmapped')];
    const stops = buildReliveMapStops(entries);
    const activeId = resolveReliveActiveMappedEntryId(entries, 'unmapped');
    const collection = buildReliveMapPointFeatures(entries, stops, activeId);

    expect(activeId).toBe('mapped');
    expect(collection.features[0].properties.isActive).toBe(1);
  });
});
