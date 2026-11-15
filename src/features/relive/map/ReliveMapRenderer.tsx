import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { RelivePlaybackEngine, RelivePlaybackSnapshot } from '../engine/relivePlaybackTypes';
import { RELIVE_MAP_CLUSTER_MAX_ZOOM, RELIVE_MAP_CLUSTER_RADIUS_PX } from '../reliveMapGeometry';
import {
  buildReliveContextRouteFeatures,
  buildReliveStopFeatures,
  buildReliveTravelledRouteFeatures,
  getReliveSnapshotCarBearing,
  getReliveUnwrappedStopCoordinates,
} from './reliveMapData';
import { getReliveCameraPlan } from './reliveCamera';

import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

type Props = {
  engine: RelivePlaybackEngine;
  snapshot: RelivePlaybackSnapshot;
};

const EMPTY_COLLECTION: GeoJSON.FeatureCollection = {
  type: 'FeatureCollection',
  features: [],
};

const addReliveLayers = (map: mapboxgl.Map) => {
  map.addSource('relive-route-context', {
    type: 'geojson',
    data: EMPTY_COLLECTION,
  });
  map.addLayer({
    id: 'relive-route-context-line',
    type: 'line',
    source: 'relive-route-context',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#7bded3',
      'line-width': 1.8,
      'line-opacity': 0.42,
      'line-dasharray': [0.7, 2.1],
    },
  });

  map.addSource('relive-route-travelled', {
    type: 'geojson',
    data: EMPTY_COLLECTION,
  });
  map.addLayer({
    id: 'relive-route-travelled-glow',
    type: 'line',
    source: 'relive-route-travelled',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#6fe3d4',
      'line-width': 8,
      'line-blur': 5,
      'line-opacity': 0.28,
      'line-dasharray': [0.7, 2.1],
    },
  });
  map.addLayer({
    id: 'relive-route-travelled-line',
    type: 'line',
    source: 'relive-route-travelled',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': '#e8c18b',
      'line-width': 2.8,
      'line-opacity': 0.98,
      'line-dasharray': [0.7, 2.1],
    },
  });

  map.addSource('relive-memory-stops', {
    type: 'geojson',
    data: EMPTY_COLLECTION,
    cluster: true,
    clusterRadius: RELIVE_MAP_CLUSTER_RADIUS_PX,
    clusterMaxZoom: RELIVE_MAP_CLUSTER_MAX_ZOOM,
    clusterProperties: {
      memoryCount: ['+', ['get', 'memoryCount']],
      hasActive: ['max', ['get', 'isActive']],
    },
  });
  map.addLayer({
    id: 'relive-stop-cluster-glow',
    type: 'circle',
    source: 'relive-memory-stops',
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'memoryCount'], 1, 15, 5, 18, 12, 22],
      'circle-color': ['case', ['>', ['get', 'hasActive'], 0], '#e7b978', '#28bdb1'],
      'circle-blur': 0.72,
      'circle-opacity': 0.48,
    },
  });
  map.addLayer({
    id: 'relive-stop-clusters',
    type: 'circle',
    source: 'relive-memory-stops',
    filter: ['has', 'point_count'],
    paint: {
      'circle-radius': ['interpolate', ['linear'], ['get', 'memoryCount'], 1, 11, 5, 15, 12, 18],
      'circle-color': ['case', ['>', ['get', 'hasActive'], 0], '#e7b978', '#082e35'],
      'circle-opacity': 0.96,
      'circle-stroke-width': ['case', ['>', ['get', 'hasActive'], 0], 2.5, 1.5],
      'circle-stroke-color': ['case', ['>', ['get', 'hasActive'], 0], '#fff0cf', '#78e7dc'],
    },
  });
  map.addLayer({
    id: 'relive-stop-cluster-count',
    type: 'symbol',
    source: 'relive-memory-stops',
    filter: ['has', 'point_count'],
    layout: {
      'text-field': ['concat', '×', ['to-string', ['get', 'memoryCount']]],
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 11,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': ['case', ['>', ['get', 'hasActive'], 0], '#182124', '#d7fff8'] },
  });
  map.addLayer({
    id: 'relive-stop-single-glow',
    type: 'circle',
    source: 'relive-memory-stops',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['case', ['>', ['get', 'isActive'], 0], 19, 13],
      'circle-color': ['case', ['>', ['get', 'isActive'], 0], '#e7b978', '#28bdb1'],
      'circle-blur': 0.75,
      'circle-opacity': ['case', ['>', ['get', 'isActive'], 0], 0.62, 0.22],
    },
  });
  map.addLayer({
    id: 'relive-stop-single',
    type: 'circle',
    source: 'relive-memory-stops',
    filter: ['!', ['has', 'point_count']],
    paint: {
      'circle-radius': ['case', ['>', ['get', 'isActive'], 0], 13, 9],
      'circle-color': ['case', ['>', ['get', 'isActive'], 0], '#e7b978', '#082e35'],
      'circle-stroke-width': ['case', ['>', ['get', 'isActive'], 0], 2.5, 1.5],
      'circle-stroke-color': ['case', ['>', ['get', 'isActive'], 0], '#fff0cf', '#78e7dc'],
      'circle-opacity': 0.97,
    },
  });
  map.addLayer({
    id: 'relive-stop-single-label',
    type: 'symbol',
    source: 'relive-memory-stops',
    filter: ['!', ['has', 'point_count']],
    layout: {
      'text-field': [
        'case',
        ['>', ['get', 'memoryCount'], 1],
        ['to-string', ['get', 'memoryCount']],
        ['to-string', ['get', 'memoryNumber']],
      ],
      'text-font': ['DIN Pro Bold', 'Arial Unicode MS Bold'],
      'text-size': 9,
      'text-allow-overlap': true,
    },
    paint: { 'text-color': ['case', ['>', ['get', 'isActive'], 0], '#182124', '#d7fff8'] },
  });
};

const fitStopOverview = (
  map: mapboxgl.Map,
  coordinates: [number, number][],
  duration: number,
  maxZoom: number,
) => {
  if (coordinates.length === 0) {
    map.easeTo({ center: [0, 20], zoom: 1.4, pitch: 0, bearing: 0, duration });
    return;
  }
  const unwrapped = getReliveUnwrappedStopCoordinates(coordinates);
  if (unwrapped.length === 1) {
    map.easeTo({
      center: unwrapped[0],
      zoom: maxZoom,
      pitch: 0,
      bearing: 0,
      duration,
      essential: true,
    });
    return;
  }
  const bounds = unwrapped.reduce(
    (result, coordinate) => result.extend(coordinate),
    new mapboxgl.LngLatBounds(unwrapped[0], unwrapped[0]),
  );
  const compactMap = map.getContainer().clientHeight < 420;
  map.fitBounds(bounds, {
    padding: compactMap
      ? { top: 58, right: 34, bottom: 64, left: 34 }
      : { top: 105, right: 75, bottom: 145, left: 75 },
    maxZoom,
    duration,
    pitch: 0,
    bearing: 0,
    essential: true,
  });
};

export function ReliveMapRenderer({ engine, snapshot }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const carMarkerRef = useRef<mapboxgl.Marker | null>(null);
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const [mapError, setMapError] = useState(false);
  const lastCameraTargetRef = useRef<string | null>(null);
  const lastOpeningOverviewSceneRef = useRef<number | null>(null);
  const lastClosingOverviewRef = useRef(false);

  const stopData = useMemo(
    () => buildReliveStopFeatures(engine, snapshot.activeStopIndex),
    [engine, snapshot.activeStopIndex],
  );
  const contextRouteData = useMemo(
    () => buildReliveContextRouteFeatures(engine),
    [engine],
  );
  const routeProgressByLeg = snapshot.routeProgressByLeg;
  const activeLegId = snapshot.activeLegId;
  const travelledRouteData = useMemo(
    () => buildReliveTravelledRouteFeatures(engine, routeProgressByLeg),
    [engine, routeProgressByLeg],
  );
  const carBearing = useMemo(
    () => getReliveSnapshotCarBearing(engine, activeLegId, routeProgressByLeg),
    [engine, activeLegId, routeProgressByLeg],
  );
  const stops = useMemo(
    () => engine.journeyModel?.stops ?? [],
    [engine.journeyModel],
  );
  const stopCoordinates = useMemo(
    () => stops.map((stop) => stop.coordinate),
    [stops],
  );
  const stopMemoryCounts = useMemo(
    () => stops.map((stop) => stop.entryIds.length),
    [stops],
  );

  // The map is created once for this player session. Playback updates only
  // replace GeoJSON source data and move the existing marker.
  useEffect(() => {
    if (!MAPBOX_TOKEN || !containerRef.current || mapRef.current) return;

    // Reset per-instance camera state. This also keeps React Strict Mode's
    // setup/cleanup/setup cycle from carrying readiness or camera state over.
    lastCameraTargetRef.current = null;
    lastOpeningOverviewSceneRef.current = null;
    lastClosingOverviewRef.current = false;

    mapboxgl.accessToken = MAPBOX_TOKEN;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({
        container: containerRef.current,
        style: 'mapbox://styles/mapbox/dark-v11',
        projection: 'mercator',
        renderWorldCopies: false,
        center: [0, 20],
        zoom: 1.4,
        pitch: 0,
        attributionControl: true,
        cooperativeGestures: true,
        fadeDuration: 350,
      });
    } catch (error) {
      console.error('Unable to initialize the Relive map:', error);
      setMapError(true);
      return;
    }

    mapRef.current = map;
    let disposed = false;
    const handleMapError = (event: { error: Error }) => {
      console.error('Relive map error:', event.error);
      if (!map.isStyleLoaded()) setMapError(true);
    };
    map.on('error', handleMapError);

    map.once('load', () => {
      if (disposed || mapRef.current !== map) return;
      try {
        addReliveLayers(map);
        const carElement = document.createElement('div');
        carElement.className = 'relive-car-marker';
        carElement.setAttribute('aria-label', 'Journey progress');
        carElement.textContent = '🚗';
        carMarkerRef.current = new mapboxgl.Marker({
          element: carElement,
          anchor: 'center',
          rotationAlignment: 'map',
        }).setLngLat([0, 20]).addTo(map);
        carElement.style.display = 'none';
        setMapReadyVersion((version) => version + 1);
      } catch (error) {
        console.error('Unable to prepare the Relive map layers:', error);
        setMapError(true);
      }
    });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => map.resize())
      : null;
    if (containerRef.current && resizeObserver) resizeObserver.observe(containerRef.current);
    const handleResize = () => map.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      map.off('error', handleMapError);
      carMarkerRef.current?.remove();
      carMarkerRef.current = null;
      map.remove();
      if (mapRef.current === map) mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map || !map.isStyleLoaded()) return;
    const source = map.getSource('relive-memory-stops') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(stopData);
  }, [mapReadyVersion, stopData]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map || !map.isStyleLoaded()) return;
    const source = map.getSource('relive-route-context') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(contextRouteData);
  }, [mapReadyVersion, contextRouteData]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map || !map.isStyleLoaded()) return;
    const source = map.getSource('relive-route-travelled') as mapboxgl.GeoJSONSource | undefined;
    source?.setData(travelledRouteData);
  }, [mapReadyVersion, travelledRouteData]);

  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map) return;
    const marker = carMarkerRef.current;
    const carElement = marker?.getElement();
    if (!marker || !carElement) return;

    if (snapshot.carCoordinate) {
      marker.setLngLat(snapshot.carCoordinate);
      if (carBearing !== null) marker.setRotation(carBearing);
      carElement.style.display = 'grid';
    } else {
      carElement.style.display = 'none';
    }
  }, [mapReadyVersion, snapshot.carCoordinate, carBearing]);

  // Camera framing is deliberately independent of route reveal and car
  // interpolation. During an incoming leg we frame that leg; after arrival
  // (and for every subsequent Memory at the stop) we frame the local region.
  // The travelled route source continues to reveal from the canonical cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map) return;

    if (snapshot.scene.type === 'opening') {
      if (lastOpeningOverviewSceneRef.current !== snapshot.sceneIndex) {
        fitStopOverview(map, stopCoordinates, 1500, 4.2);
        lastOpeningOverviewSceneRef.current = snapshot.sceneIndex;
        lastCameraTargetRef.current = 'global';
      }
      lastClosingOverviewRef.current = false;
      return;
    }

    if (snapshot.scene.type === 'closing') {
      lastOpeningOverviewSceneRef.current = null;
      if (!lastClosingOverviewRef.current) {
        fitStopOverview(map, stopCoordinates, 2100, 4.2);
        lastClosingOverviewRef.current = true;
        lastCameraTargetRef.current = 'global';
      }
      return;
    }

    lastOpeningOverviewSceneRef.current = null;
    lastClosingOverviewRef.current = false;

    const activeStopIndex = snapshot.activeStopIndex;
    if (activeStopIndex < 0 || activeStopIndex >= stops.length) return;

    const activeLeg = snapshot.activeLegId
      ? engine.journeyModel?.legs.find((leg) => leg.id === snapshot.activeLegId) ?? null
      : null;
    const plan = getReliveCameraPlan(
      stopCoordinates,
      activeStopIndex,
      activeLeg,
      snapshot.sceneProgress,
      stopMemoryCounts,
    );
    if (!plan || lastCameraTargetRef.current === plan.key) return;

    fitStopOverview(map, plan.coordinates, plan.mode === 'transit' ? 1250 : 1900, plan.maxZoom);
    lastCameraTargetRef.current = plan.key;
  }, [
    engine,
    mapReadyVersion,
    snapshot.scene.type,
    snapshot.sceneIndex,
    snapshot.sceneProgress,
    snapshot.activeStopIndex,
    snapshot.activeLegId,
    stopCoordinates,
    stopMemoryCounts,
    stops.length,
  ]);

  return (
    <div className={`relive-map${mapError ? ' relive-map--error' : ''}`}>
      <div className="relive-map__canvas" ref={containerRef} />
      {!MAPBOX_TOKEN && (
        <div className="relive-map__fallback">
          <span>THE JOURNEY ATLAS</span>
          <i>Mapbox access token not configured</i>
        </div>
      )}
      {MAPBOX_TOKEN && mapError && (
        <div className="relive-map__fallback">
          <span>THE JOURNEY ATLAS</span>
          <i>The map could not be loaded. Your memories are still available.</i>
        </div>
      )}
      <div className="relive-map__atmosphere" />
      <div className="relive-map__vignette" />
      <div className="relive-map__label">
        <span className="relive-live-dot" /> THE JOURNEY ATLAS
      </div>
      <div className="relive-map__count">
        <strong>{stops.length}</strong> PLACES MAPPED
      </div>
    </div>
  );
}
