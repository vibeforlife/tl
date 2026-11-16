import { useEffect, useMemo, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { RelivePlaybackEngine, RelivePlaybackSnapshot } from '../engine/relivePlaybackTypes';
import { RELIVE_MAP_CLUSTER_MAX_ZOOM, RELIVE_MAP_CLUSTER_RADIUS_PX } from '../reliveMapGeometry';
import {
  buildReliveContextRouteFeatures,
  buildReliveStopFeatures,
  buildReliveTravelledRouteFeatures,
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

// RELIVE_DIAGNOSTIC_INSTRUMENTATION_V1
const reliveDiag = (event: string, details: Record<string, unknown> = {}) => {
  console.info('[RELIVE-DIAG]', new Date().toISOString(), event, details);
};

const fitStopFrame = (
  map: mapboxgl.Map,
  coordinates: [number, number][],
  focusCoordinate: [number, number] | null,
  duration: number,
  maxZoom: number,
) => {
  reliveDiag('camera.fitStopFrame', {
    coordinates, focusCoordinate, duration, maxZoom,
    mapCenter: map.getCenter().toArray(), mapZoom: map.getZoom(),
    mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
  });
  if (!focusCoordinate || coordinates.length < 2) {
    fitStopOverview(map, coordinates, duration, maxZoom);
    return;
  }

  const focusIndex = coordinates.findIndex(
    ([longitude, latitude]) =>
      longitude === focusCoordinate[0] && latitude === focusCoordinate[1],
  );
  if (focusIndex < 0) {
    fitStopOverview(map, coordinates, duration, maxZoom);
    return;
  }

  // Use the neighbourhood to calculate a suitable zoom, but keep the active
  // Memory's pin as the camera centre instead of centring the cluster bounds.
  const unwrapped = getReliveUnwrappedStopCoordinates(coordinates);
  const bounds = unwrapped.reduce(
    (result, coordinate) => result.extend(coordinate),
    new mapboxgl.LngLatBounds(unwrapped[0], unwrapped[0]),
  );
  const compactMap = map.getContainer().clientHeight < 420;
  const padding = compactMap
    ? { top: 58, right: 34, bottom: 64, left: 34 }
    : { top: 105, right: 75, bottom: 145, left: 75 };
  const fittedCamera = map.cameraForBounds(bounds, { padding, maxZoom });
  const unwrappedFocus = unwrapped[focusIndex];

  map.easeTo({
    center: unwrappedFocus,
    zoom: fittedCamera?.zoom ?? maxZoom,
    pitch: 0,
    bearing: 0,
    duration,
    essential: true,
  });
};

const fitStopOverview = (
  map: mapboxgl.Map,
  coordinates: [number, number][],
  duration: number,
  maxZoom: number,
) => {
  reliveDiag('camera.fitStopOverview', {
    coordinates, duration, maxZoom,
    mapCenter: map.getCenter().toArray(), mapZoom: map.getZoom(),
    mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
  });
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
  const openingIdleHandlerRef = useRef<(() => void) | null>(null);
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
  const travelledRouteData = useMemo(
    () => buildReliveTravelledRouteFeatures(engine, routeProgressByLeg),
    [engine, routeProgressByLeg],
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
    map.on('moveend', () => reliveDiag('map.moveend', {
      center: map.getCenter().toArray(), zoom: map.getZoom(),
      bearing: map.getBearing(), pitch: map.getPitch(),
      mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
    }));
    map.on('resize', () => reliveDiag('map.resize', {
      center: map.getCenter().toArray(), zoom: map.getZoom(),
      mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
    }));

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
          rotationAlignment: 'viewport',
        }).setLngLat([0, 20]).addTo(map);
        carElement.style.display = 'none';
        setMapReadyVersion((version) => version + 1);
      } catch (error) {
        console.error('Unable to prepare the Relive map layers:', error);
        setMapError(true);
      }
    });

    const resizeObserver = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver((entries) => {
          const rect = entries[0]?.contentRect;
          reliveDiag('map.resizeObserver', {
            width: rect?.width, height: rect?.height,
            mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
            scene: document.querySelector('.relive-title-scene')?.className ?? null,
          });
          map.resize();
        })
      : null;
    if (containerRef.current && resizeObserver) resizeObserver.observe(containerRef.current);
    const handleResize = () => map.resize();
    window.addEventListener('resize', handleResize);

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      window.removeEventListener('resize', handleResize);
      map.off('error', handleMapError);
      if (openingIdleHandlerRef.current) {
        map.off('idle', openingIdleHandlerRef.current);
        openingIdleHandlerRef.current = null;
      }
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
      carElement.style.display = 'grid';
    } else {
      carElement.style.display = 'none';
    }
  }, [mapReadyVersion, snapshot.carCoordinate]);

  // Camera framing is deliberately independent of route reveal and car
  // interpolation. During an incoming leg we frame that leg; after arrival
  // (and for every subsequent Memory at the stop) we frame the local region.
  // The travelled route source continues to reveal from the canonical cursor.
  useEffect(() => {
    const map = mapRef.current;
    if (mapReadyVersion === 0 || !map) return;

    const cancelPendingOpeningOverview = () => {
      const pendingHandler = openingIdleHandlerRef.current;
      if (pendingHandler) {
        map.off('idle', pendingHandler);
        openingIdleHandlerRef.current = null;
      }
    };

    if (snapshot.scene.type === 'opening') {
      if (lastOpeningOverviewSceneRef.current !== snapshot.sceneIndex) {
        // A new opening scene supersedes any camera animation/listener left
        // over from a prior scene (for example, when replaying the Journey).
        cancelPendingOpeningOverview();
        map.stop();

        // Re-submit the complete stop collection, then wait for Mapbox to
        // process it before presenting the global overview.
        const stopSource = map.getSource('relive-memory-stops') as
          mapboxgl.GeoJSONSource | undefined;
        const openingSceneIndex = snapshot.sceneIndex;
        const handleOpeningIdle = () => {
          // Only the currently registered opening listener may move the camera.
          if (openingIdleHandlerRef.current !== handleOpeningIdle) return;
          if (lastOpeningOverviewSceneRef.current !== openingSceneIndex) {
            openingIdleHandlerRef.current = null;
            return;
          }
          if (!map.isSourceLoaded('relive-memory-stops')) {
            map.once('idle', handleOpeningIdle);
            return;
          }

          openingIdleHandlerRef.current = null;
          map.stop();
          fitStopOverview(map, stopCoordinates, 1500, 4.2);
          lastCameraTargetRef.current = 'global';
        };

        lastOpeningOverviewSceneRef.current = openingSceneIndex;
        lastClosingOverviewRef.current = false;
        openingIdleHandlerRef.current = handleOpeningIdle;
        map.once('idle', handleOpeningIdle);
        stopSource?.setData(stopData);
        map.triggerRepaint();
      }
      lastClosingOverviewRef.current = false;
      return;
    }

    // Remove the asynchronous opening callback before any later scene camera
    // is applied. A ref check alone does not unregister a pending Mapbox event.
    cancelPendingOpeningOverview();
    lastOpeningOverviewSceneRef.current = null;

    if (snapshot.scene.type === 'closing') {
      if (!lastClosingOverviewRef.current) {
        map.stop();
        fitStopOverview(map, stopCoordinates, 2100, 4.2);
        lastClosingOverviewRef.current = true;
        lastCameraTargetRef.current = 'global';
      }
      return;
    }

    lastClosingOverviewRef.current = false;

    reliveDiag('scene.transition', {
      sceneType: snapshot.scene.type, sceneIndex: snapshot.sceneIndex,
      sceneId: snapshot.scene.id, sceneProgress: snapshot.sceneProgress,
      activeStopIndex: snapshot.activeStopIndex, activeLegId: snapshot.activeLegId,
      stopCoordinates, stopMemoryCounts,
      sceneElement: document.querySelector('.relive-title-scene')?.className ?? null,
      stageSize: (() => {
        const r = document.querySelector('.relive-player__stage')?.getBoundingClientRect();
        return r ? { width: r.width, height: r.height, x: r.x, y: r.y } : null;
      })(),
      mapSize: [map.getContainer().clientWidth, map.getContainer().clientHeight],
    });
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
    reliveDiag('camera.plan', {
      key: plan.key, mode: plan.mode, coordinates: plan.coordinates,
      focusCoordinate: plan.focusCoordinate, maxZoom: plan.maxZoom,
      sceneType: snapshot.scene.type, sceneIndex: snapshot.sceneIndex,
      sceneProgress: snapshot.sceneProgress, activeStopIndex,
      activeLegId: snapshot.activeLegId,
    });

    // Stop any still-running overview/previous-scene animation before the
    // active Memory camera takes control.
    map.stop();
    if (plan.mode === 'transit') {
      fitStopOverview(map, plan.coordinates, 1250, plan.maxZoom);
    } else {
      fitStopFrame(map, plan.coordinates, plan.focusCoordinate, 1900, plan.maxZoom);
    }
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
    stopData,
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
