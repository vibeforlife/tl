import { describe, expect, it } from 'vitest';
import { getReliveAdaptiveCameraFrame, getReliveCameraPlan } from './reliveCamera';

describe('getReliveAdaptiveCameraFrame', () => {
  it('returns null when there is no valid active stop', () => {
    expect(getReliveAdaptiveCameraFrame([], 0)).toBeNull();
    expect(getReliveAdaptiveCameraFrame([[-79, 43]], -1)).toBeNull();
    expect(getReliveAdaptiveCameraFrame([[-79, 43]], 1)).toBeNull();
  });

  it('keeps nearby stops together without including distant journey regions', () => {
    const stops: [number, number][] = [
      [-79.38, 43.65], // Toronto
      [80.27, 13.08], // Chennai
      [80.25, 13.10], // nearby Chennai stop
      [77.59, 12.97], // Bengaluru
      [72.88, 19.08], // Mumbai, outside the local radius
    ];
    const frame = getReliveAdaptiveCameraFrame(stops, 1);
    expect(frame?.coordinates).toEqual([stops[1], stops[2]]);
    expect(frame?.mode).toBe('local');
    expect(frame?.maxZoom).toBe(11.2);
  });

  it('uses a conservative regional frame when only one stop is mapped nearby', () => {
    const frame = getReliveAdaptiveCameraFrame([[-79.38, 43.65], [80.27, 13.08]], 1);
    expect(frame?.coordinates).toEqual([[80.27, 13.08]]);
    expect(frame?.mode).toBe('regional');
    expect(frame?.maxZoom).toBe(5.8);
  });

  it('handles antimeridian-neighbouring stops as geographically close', () => {
    const frame = getReliveAdaptiveCameraFrame([[179.5, 10], [-179.6, 10]], 0);
    expect(frame?.coordinates).toHaveLength(2);
  });
});

describe('getReliveCameraPlan', () => {
  const canadaToIndia: [number, number][] = [
    [-79.38, 43.65], // Toronto
    [80.27, 13.08], // Chennai
    [80.25, 13.10], // nearby Chennai stop
    [77.59, 12.97], // Bengaluru
    [72.88, 19.08], // Mumbai
  ];

  it('frames the incoming leg during transit without changing route progress', () => {
    const plan = getReliveCameraPlan(
      canadaToIndia,
      1,
      { id: 'toronto->chennai', from: canadaToIndia[0], to: canadaToIndia[1] },
      0.2,
    );
    expect(plan?.mode).toBe('transit');
    expect(plan?.coordinates).toEqual([canadaToIndia[0], canadaToIndia[1]]);
  });

  it('switches to the local region after arrival even when there is no active leg', () => {
    // Later Memories at the same stop do not expose activeLegId. Camera
    // framing must still be based on the current stop, not cumulative stops.
    const plan = getReliveCameraPlan(canadaToIndia, 1, null, 0.1);
    expect(plan?.mode).toBe('local');
    expect(plan?.coordinates).toEqual([
      canadaToIndia[1],
      canadaToIndia[2],
    ]);
    expect(plan?.coordinates).not.toContain(canadaToIndia[0]);
  });

  it('switches from the transit frame to the local frame at the transition threshold', () => {
    const leg = { id: 'toronto->chennai', from: canadaToIndia[0], to: canadaToIndia[1] };
    expect(getReliveCameraPlan(canadaToIndia, 1, leg, 0.61)?.mode).toBe('transit');
    expect(getReliveCameraPlan(canadaToIndia, 1, leg, 0.62)?.mode).toBe('local');
  });

  it('keeps a stable target key for Memories in the same geographic cluster', () => {
    const first = getReliveCameraPlan(canadaToIndia, 1, null, 0);
    const nextNearby = getReliveCameraPlan(canadaToIndia, 2, null, 0);
    expect(first?.key).toBe(nextNearby?.key);
  });
});


describe('city-scale adaptive framing', () => {
  it('zooms closer for a dense cluster of city stops', () => {
    const cityStops: [number, number][] = [
      [72.8777, 19.0760], // Mumbai
      [72.8900, 19.0800],
      [72.8650, 19.0900],
      [72.9000, 19.0600],
    ];
    const frame = getReliveAdaptiveCameraFrame(cityStops, 0);
    expect(frame?.maxZoom).toBe(11.2);
  });

  it('zooms closer when several Memories are grouped into one city stop', () => {
    const oneCityStop: [number, number][] = [[72.8777, 19.0760]];
    const frame = getReliveAdaptiveCameraFrame(oneCityStop, 0, [6]);
    expect(frame?.maxZoom).toBe(10.8);
    expect(frame?.coordinates).toEqual(oneCityStop);
  });

  it('keeps a single isolated stop at a conservative regional zoom', () => {
    const frame = getReliveAdaptiveCameraFrame([[-79.38, 43.65]], 0, [1]);
    expect(frame?.maxZoom).toBe(5.8);
  });
});


describe('city-focused context radius', () => {
  it('excludes distant cities from a Mumbai local frame', () => {
    const stops: [number, number][] = [
      [72.8777, 19.0760], // Mumbai
      [72.9000, 19.0600], // nearby Mumbai stop
      [73.8567, 18.5204], // Pune
      [75.7873, 15.3647], // Hubballi
      [76.6394, 12.2958], // Mysuru
      [80.2707, 13.0827], // Chennai
    ];
    const frame = getReliveAdaptiveCameraFrame(stops, 0);
    expect(frame?.coordinates).toContain(stops[0]);
    expect(frame?.coordinates).toContain(stops[1]);
    expect(frame?.coordinates).not.toContain(stops[2]);
    expect(frame?.coordinates).not.toContain(stops[3]);
    expect(frame?.coordinates).not.toContain(stops[4]);
    expect(frame?.coordinates).not.toContain(stops[5]);
    expect(frame?.maxZoom).toBe(11.2);
  });

  it('retains useful nearby regional context beyond the immediate city', () => {
    const stops: [number, number][] = [
      [72.8777, 19.0760], // Mumbai
      [73.55, 18.85], // nearby regional context
      [80.2707, 13.0827], // Chennai, distant city
    ];
    const frame = getReliveAdaptiveCameraFrame(stops, 0);
    expect(frame?.coordinates).toContain(stops[1]);
    expect(frame?.coordinates).not.toContain(stops[2]);
    expect(frame?.maxZoom).toBe(8.2);
  });
});
