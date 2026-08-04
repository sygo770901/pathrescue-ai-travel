'use client';

import {
  GoogleMap,
  InfoWindowF,
  MarkerF,
  PolylineF,
  useJsApiLoader,
} from '@react-google-maps/api';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { cn } from '@/lib/utils';
import type { NearbyPlace } from '@/services/mapService';
import type { TripGeneratorResponse } from '@/types/database';
import { makePlaceKey, type PlaceFocusTarget } from '@/utils/placeKey';

interface TripMapProps {
  trip: TripGeneratorResponse;
  selectedKey: string | null;
  /** Hover or selection highlight (marker scale) */
  highlightKey?: string | null;
  /** Explicit lat/lng focus — preferred over key lookup for panTo reliability */
  focusTarget?: PlaceFocusTarget | null;
  activeDay: number | 'all';
  nearbyPlaces?: NearbyPlace[];
  onSelect: (key: string, target: PlaceFocusTarget) => void;
}

const DAY_COLORS = ['#0f6b5c', '#d4572a', '#1d4e89', '#7a3e9d', '#b45309'];
const MAP_LIBRARIES: ('places' | 'geometry')[] = ['places'];

function dayColor(day: number): string {
  return DAY_COLORS[(day - 1) % DAY_COLORS.length];
}

type MapMarker = {
  key: string;
  day: number;
  theme: string;
  orderInDay: number;
  index: number;
  place_name: string;
  place_id?: string | null;
  latitude: number;
  longitude: number;
  time_slot: string;
};

function useTripMarkers(
  trip: TripGeneratorResponse,
  activeDay: number | 'all',
): MapMarker[] {
  return useMemo(() => {
    const markers: MapMarker[] = [];

    for (const day of trip.itinerary) {
      if (activeDay !== 'all' && day.day !== activeDay) continue;

      day.schedule.forEach((item, index) => {
        markers.push({
          key: makePlaceKey(day.day, index, item),
          day: day.day,
          theme: day.theme,
          orderInDay: index + 1,
          index,
          place_name: item.place_name,
          place_id: item.place_id,
          latitude: item.latitude,
          longitude: item.longitude,
          time_slot: item.time_slot,
        });
      });
    }

    return markers;
  }, [trip, activeDay]);
}

function markerToFocus(marker: MapMarker): PlaceFocusTarget {
  return {
    key: marker.key,
    day: marker.day,
    index: marker.index,
    latitude: marker.latitude,
    longitude: marker.longitude,
    place_name: marker.place_name,
    place_id: marker.place_id,
  };
}

function SchematicMap({
  trip,
  markers,
  selectedKey,
  activeDay,
  onSelect,
}: {
  trip: TripGeneratorResponse;
  markers: MapMarker[];
  selectedKey: string | null;
  activeDay: number | 'all';
  onSelect: (key: string, target: PlaceFocusTarget) => void;
}) {
  const bounds = useMemo(() => {
    if (markers.length === 0) {
      return { minLat: 0, maxLat: 1, minLng: 0, maxLng: 1 };
    }

    const lats = markers.map((m) => m.latitude);
    const lngs = markers.map((m) => m.longitude);
    let minLat = Math.min(...lats);
    let maxLat = Math.max(...lats);
    let minLng = Math.min(...lngs);
    let maxLng = Math.max(...lngs);

    if (maxLat - minLat < 0.008) {
      const mid = (minLat + maxLat) / 2;
      minLat = mid - 0.004;
      maxLat = mid + 0.004;
    }
    if (maxLng - minLng < 0.008) {
      const mid = (minLng + maxLng) / 2;
      minLng = mid - 0.004;
      maxLng = mid + 0.004;
    }

    const latPad = (maxLat - minLat) * 0.22;
    const lngPad = (maxLng - minLng) * 0.22;

    return {
      minLat: minLat - latPad,
      maxLat: maxLat + latPad,
      minLng: minLng - lngPad,
      maxLng: maxLng + lngPad,
    };
  }, [markers]);

  function project(lat: number, lng: number): { x: number; y: number } {
    const width = 1000;
    const height = 640;
    const padding = 48;
    const midLat = (bounds.minLat + bounds.maxLat) / 2;
    const lngScale = Math.cos((midLat * Math.PI) / 180);
    const geoWidth = Math.max((bounds.maxLng - bounds.minLng) * lngScale, 0.0001);
    const geoHeight = Math.max(bounds.maxLat - bounds.minLat, 0.0001);
    const drawWidth = width - padding * 2;
    const drawHeight = height - padding * 2;
    const scale = Math.min(drawWidth / geoWidth, drawHeight / geoHeight);
    const usedWidth = geoWidth * scale;
    const usedHeight = geoHeight * scale;
    const offsetX = (width - usedWidth) / 2;
    const offsetY = (height - usedHeight) / 2;

    return {
      x: offsetX + (lng - bounds.minLng) * lngScale * scale,
      y: offsetY + (bounds.maxLat - lat) * scale,
    };
  }

  const dayRoutes = useMemo(() => {
    const days =
      activeDay === 'all'
        ? trip.itinerary.map((d) => d.day)
        : [activeDay];

    return days
      .map((day) => {
        const dayMarkers = markers.filter((m) => m.day === day);
        if (dayMarkers.length < 2) return null;
        return {
          day,
          color: dayColor(day),
          points: dayMarkers
            .map((m) => {
              const { x, y } = project(m.latitude, m.longitude);
              return `${x},${y}`;
            })
            .join(' '),
        };
      })
      .filter(
        (route): route is { day: number; color: string; points: string } =>
          route !== null,
      );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markers, activeDay, trip.itinerary, bounds]);

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-2xl bg-[var(--map-bg)] sm:min-h-[360px]">
      <svg
        viewBox="0 0 1000 640"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label={`${trip.destination} 示意地圖`}
      >
        {dayRoutes.map((route) => (
          <polyline
            key={`route-${route.day}`}
            points={route.points}
            fill="none"
            stroke={route.color}
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity="0.9"
          />
        ))}
        {markers.map((marker) => {
          const { x, y } = project(marker.latitude, marker.longitude);
          const selected = selectedKey === marker.key;
          return (
            <g
              key={marker.key}
              transform={`translate(${x}, ${y})`}
              className="cursor-pointer"
              onClick={() => onSelect(marker.key, markerToFocus(marker))}
            >
              <circle
                r={selected ? 26 : 17}
                fill={selected ? '#d4572a' : dayColor(marker.day)}
                stroke="#f3f0e8"
                strokeWidth="3"
                className={selected ? 'animate-pulse' : undefined}
              />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#f3f0e8"
                fontSize="13"
                fontWeight="700"
              >
                {activeDay === 'all'
                  ? `${marker.day}.${marker.orderInDay}`
                  : marker.orderInDay}
              </text>
            </g>
          );
        })}
      </svg>
      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/85 px-3 py-1.5 text-xs text-[var(--ink-soft)]">
        示意路線圖（Google Maps 未載入）
      </div>
    </div>
  );
}

function GoogleTripMap({
  trip,
  markers,
  selectedKey,
  highlightKey,
  focusTarget,
  activeDay,
  nearbyPlaces,
  onSelect,
  apiKey,
}: {
  trip: TripGeneratorResponse;
  markers: MapMarker[];
  selectedKey: string | null;
  highlightKey: string | null;
  focusTarget?: PlaceFocusTarget | null;
  activeDay: number | 'all';
  nearbyPlaces: NearbyPlace[];
  onSelect: (key: string, target: PlaceFocusTarget) => void;
  apiKey: string;
}) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: 'pathrescue-google-maps',
    googleMapsApiKey: apiKey,
    libraries: MAP_LIBRARIES,
  });

  const mapRef = useRef<google.maps.Map | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [infoKey, setInfoKey] = useState<string | null>(null);
  const [bounceKey, setBounceKey] = useState<string | null>(null);
  const prevDayRef = useRef<number | 'all' | null>(null);
  const [initialCenter] = useState(() =>
    markers.length > 0
      ? { lat: markers[0].latitude, lng: markers[0].longitude }
      : { lat: 25.033, lng: 121.565 },
  );

  const dayPaths = useMemo(() => {
    const days =
      activeDay === 'all'
        ? trip.itinerary.map((d) => d.day)
        : [activeDay];

    return days
      .map((day) => {
        const dayMarkers = markers.filter((m) => m.day === day);
        if (dayMarkers.length < 2) return null;
        return {
          day,
          color: dayColor(day),
          path: dayMarkers.map((m) => ({
            lat: m.latitude,
            lng: m.longitude,
          })),
        };
      })
      .filter(
        (
          route,
        ): route is {
          day: number;
          color: string;
          path: Array<{ lat: number; lng: number }>;
        } => route !== null,
      );
  }, [markers, activeDay, trip.itinerary]);

  const fitBounds = useCallback((map: google.maps.Map, list: MapMarker[]) => {
    if (list.length === 0) return;

    if (list.length === 1) {
      map.setCenter({
        lat: list[0].latitude,
        lng: list[0].longitude,
      });
      map.setZoom(14);
      return;
    }

    const bounds = new google.maps.LatLngBounds();
    list.forEach((m) => {
      bounds.extend({ lat: m.latitude, lng: m.longitude });
    });
    map.fitBounds(bounds, 64);
  }, []);

  const focusPlace = useCallback((target: PlaceFocusTarget) => {
    if (!mapRef.current) return;
    mapRef.current.panTo({
      lat: target.latitude,
      lng: target.longitude,
    });
    mapRef.current.setZoom(16);
    setInfoKey(target.key);
    setBounceKey(target.key);
  }, []);

  const onLoad = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      setMapReady(true);
      prevDayRef.current = activeDay;
      fitBounds(map, markers);
    },
    // only initial markers for first paint; day changes handled separately
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fitBounds],
  );

  // Fit bounds ONLY when activeDay changes (not on every markers identity change)
  useEffect(() => {
    if (!mapReady || !mapRef.current) return;
    if (prevDayRef.current === activeDay) return;
    prevDayRef.current = activeDay;
    fitBounds(mapRef.current, markers);
  }, [activeDay, fitBounds, mapReady, markers]);

  // Focus by explicit coordinates — works in All Days and single-day views
  useEffect(() => {
    if (!mapReady || !focusTarget) return;
    focusPlace(focusTarget);
  }, [focusTarget, focusPlace, mapReady]);

  useEffect(() => {
    if (!bounceKey) return;
    const timer = window.setTimeout(() => setBounceKey(null), 1400);
    return () => window.clearTimeout(timer);
  }, [bounceKey]);

  // Keep info window in sync with selection
  useEffect(() => {
    if (selectedKey) setInfoKey(selectedKey);
  }, [selectedKey]);

  if (loadError) {
    return (
      <SchematicMap
        trip={trip}
        markers={markers}
        selectedKey={selectedKey}
        activeDay={activeDay}
        onSelect={onSelect}
      />
    );
  }

  if (!isLoaded) {
    return (
      <div className="flex h-full min-h-[280px] items-center justify-center rounded-2xl bg-[var(--map-bg)] text-sm text-[var(--ink-soft)] sm:min-h-[360px]">
        正在載入 Google 地圖…
      </div>
    );
  }

  const infoMarker = markers.find((m) => m.key === infoKey);

  return (
    <div className="relative h-full min-h-[280px] overflow-hidden rounded-2xl sm:min-h-[360px]">
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%', minHeight: 280 }}
        // Uncontrolled after load: controlled center/zoom would fight panTo/setZoom(16)
        {...(mapReady
          ? {}
          : { center: initialCenter, zoom: 13 })}
        onLoad={onLoad}
        options={{
          mapTypeControl: true,
          streetViewControl: false,
          fullscreenControl: true,
          zoomControl: true,
          clickableIcons: true,
          gestureHandling: 'greedy',
        }}
      >
        {dayPaths.map((route) => (
          <PolylineF
            key={`poly-${route.day}`}
            path={route.path}
            options={{
              strokeColor: route.color,
              strokeOpacity: 0.9,
              strokeWeight: 5,
            }}
          />
        ))}

        {markers.map((marker) => {
          const active =
            highlightKey === marker.key || selectedKey === marker.key;
          const label =
            activeDay === 'all'
              ? `${marker.day}.${marker.orderInDay}`
              : String(marker.orderInDay);

          return (
            <MarkerF
              key={marker.key}
              position={{ lat: marker.latitude, lng: marker.longitude }}
              title={marker.place_name}
              animation={
                bounceKey === marker.key
                  ? google.maps.Animation.BOUNCE
                  : undefined
              }
              label={{
                text: label,
                color: '#ffffff',
                fontWeight: '700',
                fontSize: '12px',
              }}
              icon={{
                path: google.maps.SymbolPath.CIRCLE,
                scale: active ? 16 : 11,
                fillColor: active ? '#d4572a' : dayColor(marker.day),
                fillOpacity: 1,
                strokeColor: '#f3f0e8',
                strokeWeight: active ? 3 : 2,
              }}
              zIndex={active ? 999 : marker.orderInDay}
              onClick={() => onSelect(marker.key, markerToFocus(marker))}
            />
          );
        })}

        {nearbyPlaces.map((place) => (
          <MarkerF
            key={`nearby-${place.place_id}`}
            position={{ lat: place.latitude, lng: place.longitude }}
            title={`${place.name}（${place.category}）`}
            icon={{
              path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              scale: 5,
              fillColor: '#1d4e89',
              fillOpacity: 1,
              strokeColor: '#ffffff',
              strokeWeight: 1,
            }}
            zIndex={500}
          />
        ))}

        {infoMarker && (
          <InfoWindowF
            position={{
              lat: infoMarker.latitude,
              lng: infoMarker.longitude,
            }}
            onCloseClick={() => setInfoKey(null)}
            options={{ pixelOffset: new google.maps.Size(0, -28) }}
          >
            <div className="max-w-[200px] p-1">
              <p className="text-xs text-slate-500">
                Day {infoMarker.day} · {infoMarker.time_slot}
              </p>
              <p className="mt-0.5 text-sm font-semibold text-slate-900">
                {infoMarker.place_name}
              </p>
            </div>
          </InfoWindowF>
        )}
      </GoogleMap>

      <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-white/90 px-3 py-1.5 text-xs text-[var(--ink-soft)] shadow-sm">
        {activeDay === 'all' ? '全部天數' : `第 ${activeDay} 天`} ·{' '}
        {markers.length} 個景點
        {nearbyPlaces.length > 0 ? ` · 順路 ${nearbyPlaces.length} 處` : ''}
      </div>

      <div className="absolute top-3 right-3">
        <span
          className={cn(
            'rounded-md bg-white/90 px-2 py-1 text-[11px] text-[var(--ink-soft)] shadow-sm',
          )}
        >
          點擊標記可對應行程卡片
        </span>
      </div>
    </div>
  );
}

export function TripMap({
  trip,
  selectedKey,
  highlightKey = null,
  focusTarget = null,
  activeDay,
  nearbyPlaces = [],
  onSelect,
}: TripMapProps) {
  const markers = useTripMarkers(trip, activeDay);
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim();
  const effectiveHighlight = highlightKey ?? selectedKey;

  if (!apiKey) {
    return (
      <SchematicMap
        trip={trip}
        markers={markers}
        selectedKey={effectiveHighlight}
        activeDay={activeDay}
        onSelect={onSelect}
      />
    );
  }

  return (
    <GoogleTripMap
      trip={trip}
      markers={markers}
      selectedKey={selectedKey}
      highlightKey={effectiveHighlight}
      focusTarget={focusTarget}
      activeDay={activeDay}
      nearbyPlaces={nearbyPlaces}
      onSelect={onSelect}
      apiKey={apiKey}
    />
  );
}
