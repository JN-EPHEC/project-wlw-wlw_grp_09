import { CSSProperties, memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { Ride } from '@/app/services/rides';
import { getCoordinates } from '@/app/services/distance';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { CAMPUS_LOCATIONS, findCampusLocation } from '@/constants/campuses';

type Props = {
  rides: Ride[];
  selectedCampus?: string | null;
};

type Coordinates = {
  latitude: number;
  longitude: number;
};

type Segment = {
  id: string;
  start: Coordinates;
  end: Coordinates;
  startLabel: string;
  endLabel: string;
  driver?: string;
  time?: string;
};

type GoogleMapsApi = any;

declare global {
  interface Window {
    google?: any;
    __campusRideGoogleMapsLoader?: Promise<GoogleMapsApi>;
  }
}

const GOOGLE_MAPS_API_KEY =
  process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY ?? 'AIzaSyCU9joaWe-_aSq4RMbqbLsrVi0pkC5iu8c';

const FALLBACK_SEGMENTS: Segment[] = [
  {
    id: 'fallback-1',
    start: { latitude: 50.8467, longitude: 4.3517 },
    end: { latitude: 50.8122, longitude: 4.3817 },
    startLabel: 'Grand-Place',
    endLabel: 'ULB Solbosch',
  },
  {
    id: 'fallback-2',
    start: { latitude: 50.8514, longitude: 4.4016 },
    end: { latitude: 50.6686, longitude: 4.6145 },
    startLabel: 'Parc du Cinquantenaire',
    endLabel: 'EPHEC Louvain-la-Neuve',
  },
  {
    id: 'fallback-3',
    start: { latitude: 50.8429, longitude: 4.3127 },
    end: { latitude: 50.8794, longitude: 4.7009 },
    startLabel: 'Gare du Midi',
    endLabel: 'Leuven',
  },
];

const loadGoogleMapsApi = () => {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('window unavailable'));
  }
  if (window.google && window.google.maps) {
    return Promise.resolve(window.google);
  }
  if (window.__campusRideGoogleMapsLoader) {
    return window.__campusRideGoogleMapsLoader;
  }
  window.__campusRideGoogleMapsLoader = new Promise<GoogleMapsApi>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}`;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve(window.google!);
    script.onerror = () => reject(new Error('Google Maps JS failed to load.'));
    document.head.appendChild(script);
  });
  return window.__campusRideGoogleMapsLoader;
};

const deriveSegments = (rides: Ride[]): Segment[] => {
  if (rides.length === 0) return FALLBACK_SEGMENTS;
  return rides.map((ride) => ({
    id: ride.id,
    start: getCoordinates(ride.depart),
    end: getCoordinates(ride.destination),
    startLabel: ride.depart,
    endLabel: ride.destination,
    driver: ride.driver,
    time: ride.time,
  }));
};

const computeCamera = (segments: Segment[]) => {
  if (segments.length === 0) {
    return { center: { lat: 50.8503, lng: 4.3517 }, zoom: 11 };
  }
  const lats = segments.flatMap((segment) => [segment.start.latitude, segment.end.latitude]);
  const lngs = segments.flatMap((segment) => [segment.start.longitude, segment.end.longitude]);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const center = {
    lat: (minLat + maxLat) / 2,
    lng: (minLng + maxLng) / 2,
  };
  const latitudeDelta = Math.max((maxLat - minLat) * 1.4, 0.02);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.4, 0.02);
  const delta = Math.max(latitudeDelta, longitudeDelta);
  const zoom = Math.max(5, Math.min(16, Math.log2(360 / delta)));

  return { center, zoom };
};

const RideMapWeb = ({ rides, selectedCampus }: Props) => {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{ markers: google.maps.Marker[]; polylines: google.maps.Polyline[] }>({
    markers: [],
    polylines: [],
  });
  const [error, setError] = useState<string | null>(null);

  const segments = useMemo(() => deriveSegments(rides), [rides]);
  const usingFallback = rides.length === 0;

  useEffect(() => {
    let isMounted = true;
    loadGoogleMapsApi()
      .then((google) => {
        if (!isMounted || !mapNode.current) return;
        const camera = computeCamera(segments);
        mapInstance.current = new google.maps.Map(mapNode.current, {
          center: camera.center,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
      })
      .catch(() => {
        if (isMounted) {
          setError("Impossible d'afficher Google Maps pour le moment.");
        }
      });
    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const map = mapInstance.current;
    const google = window.google;
    if (!map || !google) return;

    overlays.current.markers.forEach((marker) => marker.setMap(null));
    overlays.current.polylines.forEach((polyline) => polyline.setMap(null));
    overlays.current = { markers: [], polylines: [] };

    const camera = computeCamera(segments);
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);

    segments.forEach((segment) => {
      const path = [
        { lat: segment.start.latitude, lng: segment.start.longitude },
        { lat: segment.end.latitude, lng: segment.end.longitude },
      ];
      const polyline = new google.maps.Polyline({
        path,
        strokeColor: '#7A5FFF',
        strokeOpacity: 0.9,
        strokeWeight: 4,
        geodesic: true,
      });
      polyline.setMap(map);

      const start = new google.maps.Marker({
        position: path[0],
        title: segment.startLabel,
        label: 'A',
      });
      const end = new google.maps.Marker({
        position: path[1],
        title: segment.endLabel,
        label: 'B',
      });
      start.setMap(map);
      end.setMap(map);

      overlays.current.polylines.push(polyline);
      overlays.current.markers.push(start, end);
    });
    CAMPUS_LOCATIONS.forEach((campus) => {
      const isSelected =
        selectedCampus?.trim().toLowerCase() === campus.name.trim().toLowerCase();
      const marker = new google.maps.Marker({
        position: { lat: campus.latitude, lng: campus.longitude },
        title: campus.name,
        label: isSelected ? '★' : undefined,
        icon: isSelected
          ? {
              path: google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
              fillColor: '#7A5FFF',
              fillOpacity: 0.95,
              strokeColor: '#FFFFFF',
              strokeOpacity: 0.9,
              strokeWeight: 2,
              scale: 6,
            }
          : {
              path: google.maps.SymbolPath.CIRCLE,
              fillColor: '#1A73E8',
              fillOpacity: 0.9,
              strokeColor: '#FFFFFF',
              strokeOpacity: 0.9,
              strokeWeight: 2,
              scale: 6,
            },
      });
      marker.setMap(map);
      overlays.current.markers.push(marker);
    });
  }, [segments, selectedCampus]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map || !selectedCampus) return;
    const campus = findCampusLocation(selectedCampus);
    if (!campus) return;
    map.panTo({ lat: campus.latitude, lng: campus.longitude });
    const currentZoom = map.getZoom?.() ?? map.getZoom();
    if (!currentZoom || currentZoom < 13) {
      map.setZoom(13);
    }
  }, [selectedCampus]);

  return (
    <View style={styles.card}>
      <View style={styles.map}>
        <div ref={mapNode} style={mapSurfaceStyle} />
        {error ? (
          <View style={styles.overlay}>
            <Text style={styles.title}>Carte indisponible</Text>
            <Text style={styles.subtitle}>{error}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.caption}>
        <Text style={styles.captionTitle}>Carte Google Maps</Text>
        <Text style={styles.captionText}>
          {usingFallback
            ? 'Aucun trajet publié. Affichage d’un exemple autour de Bruxelles.'
            : 'Zoom et fais glisser pour explorer les trajets publiés vers ton campus.'}
        </Text>
      </View>
    </View>
  );
};

export const RideMap = memo(RideMapWeb);

const mapSurfaceStyle: CSSProperties = {
  height: '100%',
  width: '100%',
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
  },
  map: {
    height: 240,
    width: '100%',
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(12, 16, 28, 0.38)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.white,
    fontWeight: '700',
    fontSize: 16,
  },
  subtitle: {
    color: Colors.gray100,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  caption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.gray200,
    gap: Spacing.xs,
  },
  captionTitle: {
    fontWeight: '700',
    color: Colors.ink,
  },
  captionText: {
    color: Colors.gray600,
    fontSize: 12,
    lineHeight: 16,
  },
});
