import { CSSProperties, memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import type { Ride } from '@/app/services/rides';
import { getCoordinates, getDistanceKm, getDurationMinutes } from '@/app/services/distance';
import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';
import { Colors, Radius, Spacing } from '@/app/ui/theme';

type Props = {
  rides: Ride[];
  selectedCampus?: string | null;
  previewDepart?: string | null;
  previewDestination?: string | null;
  variant?: 'card' | 'bare';
  style?: StyleProp<ViewStyle>;
};

type LatLng = {
  lat: number;
  lng: number;
};

type PreviewMarker = {
  position: LatLng;
  label: string;
  kind: 'origin' | 'destination';
};

const DESTINATION_PIN_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="%23D93025" stroke="%23A52714" stroke-width="2" d="M16 1C8.82 1 3 6.82 3 14c0 9.5 13 24, 13 24s13-14.5 13-24C29 6.82 23.18 1 16 1z"/><circle cx="16" cy="15" r="6" fill="%23FFFFFF"/></svg>';
const DESTINATION_PIN_SIZE = { width: 24, height: 36 };

const computeCameraFromPoints = (points: LatLng[]) => {
  if (points.length === 0) {
    return { center: { lat: 50.8503, lng: 4.3517 }, zoom: 11 };
  }
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
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

const RideMapWeb = ({
  rides: _rides,
  selectedCampus: _selectedCampus,
  previewDepart,
  previewDestination,
  variant = 'card',
  style,
}: Props) => {
  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapInstance = useRef<google.maps.Map | null>(null);
  const overlays = useRef<{
    markers: google.maps.Marker[];
    polylines: google.maps.Polyline[];
    infoWindows: google.maps.OverlayView[];
  }>({
    markers: [],
    polylines: [],
    infoWindows: [],
  });
  const geocoderRef = useRef<google.maps.Geocoder | null>(null);
  const directionsRef = useRef<google.maps.DirectionsService | null>(null);
  const lastDirectionsRequestId = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [previewMarkers, setPreviewMarkers] = useState<{ start: PreviewMarker | null; end: PreviewMarker | null }>({
    start: null,
    end: null,
  });
  const [previewPath, setPreviewPath] = useState<LatLng[] | null>(null);

  const hasPreviewInput = Boolean(previewDepart?.trim()) || Boolean(previewDestination?.trim());
  const cameraPoints = useMemo(() => {
    if (previewPath && previewPath.length > 0) return previewPath;
    const points: LatLng[] = [];
    if (previewMarkers.start) points.push(previewMarkers.start.position);
    if (previewMarkers.end) points.push(previewMarkers.end.position);
    return points;
  }, [previewMarkers.end, previewMarkers.start, previewPath]);

  useEffect(() => {
    let isMounted = true;
    loadGoogleMapsApi()
      .then((google) => {
        if (!isMounted || !mapNode.current) return;
        const camera = computeCameraFromPoints(cameraPoints);
        mapInstance.current = new google.maps.Map(mapNode.current, {
          center: camera.center,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
        setMapReady(true);
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
    const google = window.google;
    if (!mapReady || !google) {
      if (!hasPreviewInput) {
        setPreviewMarkers({ start: null, end: null });
      }
      return;
    }

    const clean = (value?: string | null) => (value && value.trim().length ? value.trim() : null);
    const originLabel = clean(previewDepart);
    const destinationLabel = clean(previewDestination);

    if (!originLabel && !destinationLabel) {
      setPreviewMarkers({ start: null, end: null });
      return;
    }

    let cancelled = false;

    const geocodeAddress = (address: string): Promise<LatLng> =>
      new Promise((resolve) => {
        try {
          if (!geocoderRef.current) {
            geocoderRef.current = new google.maps.Geocoder();
          }
          const geocoder = geocoderRef.current;
          geocoder!.geocode({ address }, (results, status) => {
            if (status === 'OK' && results && results[0] && results[0].geometry.location) {
              const loc = results[0].geometry.location;
              const lat = Number(loc.lat());
              const lng = Number(loc.lng());
              if (Number.isFinite(lat) && Number.isFinite(lng)) {
                resolve({ lat, lng });
                return;
              }
            } else {
              const fallback = getCoordinates(address);
              resolve({ lat: fallback.latitude, lng: fallback.longitude });
              return;
            }
            const fallback = getCoordinates(address);
            resolve({ lat: fallback.latitude, lng: fallback.longitude });
          });
        } catch {
          const fallback = getCoordinates(address);
          resolve({ lat: fallback.latitude, lng: fallback.longitude });
        }
      });

    (async () => {
      const [startPosition, endPosition] = await Promise.all([
        originLabel ? geocodeAddress(originLabel) : Promise.resolve<LatLng | null>(null),
        destinationLabel ? geocodeAddress(destinationLabel) : Promise.resolve<LatLng | null>(null),
      ]);
      if (cancelled) return;
      const safeStart =
        startPosition && Number.isFinite(startPosition.lat) && Number.isFinite(startPosition.lng)
          ? startPosition
          : null;
      const safeEnd =
        endPosition && Number.isFinite(endPosition.lat) && Number.isFinite(endPosition.lng)
          ? endPosition
          : null;
      setPreviewMarkers({
        start: safeStart ? { position: safeStart, label: originLabel!, kind: 'origin' } : null,
        end: safeEnd ? { position: safeEnd, label: destinationLabel!, kind: 'destination' } : null,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [hasPreviewInput, mapReady, previewDepart, previewDestination]);

  useEffect(() => {
    const google = window.google;
    const map = mapInstance.current;
    const origin = previewMarkers.start?.position ?? null;
    const destination = previewMarkers.end?.position ?? null;
    if (!mapReady || !google || !map || !origin || !destination) {
      setPreviewPath(null);
      return;
    }
    if (!directionsRef.current) {
      directionsRef.current = new google.maps.DirectionsService();
    }
    const requestId = ++lastDirectionsRequestId.current;
    try {
      directionsRef.current.route(
        {
          origin,
          destination,
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        },
        (response, status) => {
          if (requestId !== lastDirectionsRequestId.current) return;
          if (status === 'OK' && response?.routes?.length) {
            const overview = response.routes[0].overview_path ?? [];
            if (overview.length > 0) {
              const path = overview.map((point) => ({ lat: point.lat(), lng: point.lng() }));
              setPreviewPath(path);
              return;
            }
          }
          setPreviewPath(null);
        }
      );
    } catch (routeError) {
      if (requestId === lastDirectionsRequestId.current) {
        console.warn('Directions request failed', routeError);
        setPreviewPath(null);
      }
    }
  }, [mapReady, previewMarkers.end, previewMarkers.start]);

  useEffect(() => {
    const map = mapInstance.current;
    const google = window.google;
    if (!map || !google) return;

    overlays.current.markers.forEach((marker) => marker.setMap(null));
    overlays.current.polylines.forEach((polyline) => polyline.setMap(null));
    overlays.current.infoWindows.forEach((info) => info.setMap(null));
    overlays.current = { markers: [], polylines: [], infoWindows: [] };

    const camera = computeCameraFromPoints(cameraPoints);
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);

    if (previewPath && previewPath.length > 0) {
      const previewPolyline = new google.maps.Polyline({
        path: previewPath,
        strokeColor: '#1A73E8',
        strokeOpacity: 0.95,
        strokeWeight: 5,
      });
      previewPolyline.setMap(map);
      overlays.current.polylines.push(previewPolyline);
    } else if (previewMarkers.start && previewMarkers.end) {
      const polyline = new google.maps.Polyline({
        path: [previewMarkers.start.position, previewMarkers.end.position],
        strokeColor: '#1A73E8',
        strokeOpacity: 0.85,
        strokeWeight: 4,
        geodesic: true,
      });
      polyline.setMap(map);
      overlays.current.polylines.push(polyline);
    }

    const createOriginMarker = (marker: PreviewMarker) =>
      new google.maps.Marker({
        position: marker.position,
        title: marker.label,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          fillColor: '#1A73E8',
          fillOpacity: 0.95,
          strokeColor: '#FFFFFF',
          strokeOpacity: 0.9,
          strokeWeight: 2,
          scale: 7,
        },
      });

    const createDestinationMarker = (marker: PreviewMarker) =>
      new google.maps.Marker({
        position: marker.position,
        title: marker.label,
        icon: {
          url: DESTINATION_PIN_SVG,
          scaledSize: new google.maps.Size(
            DESTINATION_PIN_SIZE.width,
            DESTINATION_PIN_SIZE.height
          ),
          anchor: new google.maps.Point(
            DESTINATION_PIN_SIZE.width / 2,
            DESTINATION_PIN_SIZE.height
          ),
        },
        zIndex: 1000,
      });

    if (previewMarkers.start) {
      const marker = createOriginMarker(previewMarkers.start);
      marker.setMap(map);
      overlays.current.markers.push(marker);
    }
    if (previewMarkers.end) {
      const marker = createDestinationMarker(previewMarkers.end);
      marker.setMap(map);
      overlays.current.markers.push(marker);
    }

    if (previewMarkers.start && previewMarkers.end) {
      const durationMinutes = getDurationMinutes(
        previewMarkers.start.label,
        previewMarkers.end.label
      );
      if (durationMinutes && Number.isFinite(durationMinutes)) {
        const distanceKm = getDistanceKm(
          previewMarkers.start.label,
          previewMarkers.end.label
        );
        const distanceLabel =
          Number.isFinite(distanceKm) && distanceKm > 0 ? `${distanceKm.toFixed(1)} km` : null;
        const midpoint = (() => {
          if (previewPath && previewPath.length > 0) {
            const midIndex = Math.floor(previewPath.length / 2);
            return previewPath[midIndex];
          }
          return {
            lat: (previewMarkers.start.position.lat + previewMarkers.end.position.lat) / 2,
            lng: (previewMarkers.start.position.lng + previewMarkers.end.position.lng) / 2,
          };
        })();
        const bubbleContent =
          `<div style="position:relative;display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:#111;">` +
          `<div style="width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;` +
          `border-right:9px solid #fff;box-shadow:1px 0 1px rgba(0,0,0,0.12);margin-right:-1px;"></div>` +
          `<span style="background:#fff;border:2px solid #dcdcdc;border-radius:18px;padding:6px 12px;` +
          `box-shadow:0 2px 6px rgba(0,0,0,0.15);display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.1;">` +
          `<span style="font-weight:700;">${durationMinutes} min</span>` +
          (distanceLabel
            ? `<span style="font-size:11px;font-weight:600;color:#4B5563;">${distanceLabel}</span>`
            : '') +
          `</span>` +
          `</div>`;
        const infoWindowDiv = document.createElement('div');
        infoWindowDiv.innerHTML = bubbleContent;
        const overlay = new google.maps.OverlayView();
        overlay.onAdd = function () {
          const pane = this.getPanes()?.floatPane;
          if (!pane) return;
          pane.appendChild(infoWindowDiv);
        };
        overlay.draw = function () {
          const projection = this.getProjection();
          if (!projection) return;
          const pos = projection.fromLatLngToDivPixel(new google.maps.LatLng(midpoint.lat, midpoint.lng));
          if (pos) {
            infoWindowDiv.style.position = 'absolute';
            infoWindowDiv.style.transform = 'translate(10px, -50%)';
            infoWindowDiv.style.left = `${pos.x}px`;
            infoWindowDiv.style.top = `${pos.y}px`;
          }
        };
        overlay.onRemove = function () {
          if (infoWindowDiv.parentNode) {
            infoWindowDiv.parentNode.removeChild(infoWindowDiv);
          }
        };
        overlay.setMap(map);
        overlays.current.infoWindows.push(overlay);
      }
    }

    // Campus markers intentionally removed per request.
  }, [
    cameraPoints,
    mapReady,
    previewMarkers.end,
    previewMarkers.start,
    previewPath,
  ]);

  const mapView = (
    <View style={[styles.map, variant === 'bare' && styles.mapBare, variant === 'bare' && style]}>
      <div ref={mapNode} style={mapSurfaceStyle} />
      {error ? (
        <View style={styles.overlay}>
          <Text style={styles.title}>Carte indisponible</Text>
          <Text style={styles.subtitle}>{error}</Text>
        </View>
      ) : null}
    </View>
  );

  if (variant === 'bare') {
    return mapView;
  }

  return (
    <View style={[styles.card, style]}>
      {mapView}
      <View style={styles.caption}>
        <Text style={styles.captionTitle}>Carte Google Maps</Text>
        <Text style={styles.captionText}>
          {previewMarkers.start && previewMarkers.end
            ? 'Aperçu de ton trajet sélectionné.'
            : 'Choisis un départ et une destination pour afficher ton trajet.'}
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
  mapBare: {
    height: 320,
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
