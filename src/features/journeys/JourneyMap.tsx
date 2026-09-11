import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import type { Entry } from '../../types/domain';
import 'mapbox-gl/dist/mapbox-gl.css';

const MAPBOX_TOKEN = import.meta.env.VITE_MAPBOX_ACCESS_TOKEN;

type JourneyMapProps = {
  entries: Entry[];
  onViewEntry?: (entry: Entry) => void;
};

type MappedEntry = Entry & {
  location: NonNullable<Entry['location']>;
};

export function JourneyMap({
  entries,
  onViewEntry,
}: JourneyMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<mapboxgl.Map | null>(null);
  const markersRef = useRef<mapboxgl.Marker[]>([]);
  const [selectedEntry, setSelectedEntry] = useState<Entry | null>(null);

  const mappedEntries: MappedEntry[] = entries.filter(
    (entry): entry is MappedEntry =>
      Boolean(
        entry.location &&
          Number.isFinite(entry.location.latitude) &&
          Number.isFinite(entry.location.longitude),
      ),
  );

  useEffect(() => {
    if (!MAPBOX_TOKEN || !mapContainerRef.current) {
      return;
    }

    mapboxgl.accessToken = MAPBOX_TOKEN;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/dark-v11',
      center: [-79.6, 43.6],
      zoom: 2,
      attributionControl: true,
    });

    map.addControl(
      new mapboxgl.NavigationControl({
        showCompass: true,
        showZoom: true,
        visualizePitch: false,
      }),
      'top-right',
    );

    mapRef.current = map;

    map.on('load', () => {
      if (mappedEntries.length === 0) {
        return;
      }

      const bounds = new mapboxgl.LngLatBounds();

      mappedEntries.forEach((entry) => {
        const { latitude, longitude } = entry.location;

        bounds.extend([longitude, latitude]);

        const markerElement = document.createElement('button');
        markerElement.type = 'button';
        markerElement.className = 'journey-map-marker';
        markerElement.setAttribute(
          'aria-label',
          `View ${entry.title}`,
        );

        const markerInner = document.createElement('span');
        markerInner.className = 'journey-map-marker__inner';
        markerElement.appendChild(markerInner);

        markerElement.addEventListener('click', () => {
          setSelectedEntry(entry);

          map.flyTo({
            center: [longitude, latitude],
            zoom: Math.max(map.getZoom(), 11),
            duration: 700,
            essential: true,
          });
        });

        const marker = new mapboxgl.Marker({
          element: markerElement,
          anchor: 'center',
        })
          .setLngLat([longitude, latitude])
          .addTo(map);

        markersRef.current.push(marker);
      });

      if (mappedEntries.length === 1) {
        map.setCenter([
          mappedEntries[0].location.longitude,
          mappedEntries[0].location.latitude,
        ]);
        map.setZoom(12);
      } else {
        map.fitBounds(bounds, {
          padding: {
            top: 72,
            right: 72,
            bottom: 72,
            left: 72,
          },
          maxZoom: 13,
          duration: 700,
        });
      }
    });

    return () => {
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
  }, [entries, mappedEntries]);

  if (!MAPBOX_TOKEN) {
    return (
      <div className="journey-map journey-map--unavailable">
        <div className="journey-map__message">
          <p className="eyebrow">MAP</p>
          <h3>Maps aren't configured yet.</h3>
          <p>
            Add a Mapbox access token to enable the Journey map.
          </p>
        </div>
      </div>
    );
  }

  if (mappedEntries.length === 0) {
    return (
      <div className="journey-map journey-map--empty">
        <div className="journey-map__message">
          <span className="journey-map__empty-mark" aria-hidden="true">
            ◎
          </span>
          <p className="eyebrow">JOURNEY MAP</p>
          <h3>Your map is waiting for a place.</h3>
          <p>
            Add a location to a memory and it will appear here.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="journey-map">
      <div
        ref={mapContainerRef}
        className="journey-map__canvas"
        aria-label={`Map showing ${mappedEntries.length} ${
          mappedEntries.length === 1 ? 'memory' : 'memories'
        }`}
      />

      <div className="journey-map__legend" aria-live="polite">
        <span className="journey-map__legend-dot" aria-hidden="true" />
        <span>
          {mappedEntries.length}{' '}
          {mappedEntries.length === 1 ? 'memory' : 'memories'} mapped
        </span>
      </div>

      {selectedEntry?.location && (
        <div className="journey-map__selected">
          <button
            className="journey-map__selected-close"
            type="button"
            onClick={() => setSelectedEntry(null)}
            aria-label="Close selected memory"
          >
            ×
          </button>

          <p className="eyebrow">MEMORY</p>
          <h3>{selectedEntry.title}</h3>

          <p className="journey-map__selected-location">
            <span aria-hidden="true">◎</span>
            {selectedEntry.location.name}
          </p>

          {selectedEntry.location.address && (
            <p className="journey-map__selected-address">
              {selectedEntry.location.address}
            </p>
          )}

          {selectedEntry.highlight && (
            <p className="journey-map__selected-highlight">
              “{selectedEntry.highlight}”
            </p>
          )}

          <p className="journey-map__selected-note">
            This place is part of your Travel Lore.
          </p>

          {onViewEntry && (
            <button
              className="journey-map__selected-view"
              type="button"
              onClick={() => onViewEntry(selectedEntry)}
            >
              View memory <span aria-hidden="true">→</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
