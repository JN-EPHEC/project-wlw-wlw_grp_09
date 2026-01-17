import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import type { CampusRideMapProps } from './types';
import type { LatLng } from '@/app/services/location';

const DEFAULT_CENTER: LatLng = { lat: 50.8503, lng: 4.3517 };

const DESTINATION_PIN_SVG =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="32" height="48" viewBox="0 0 32 48"><path fill="%23D93025" stroke="%23A52714" stroke-width="2" d="M16 1C8.82 1 3 6.82 3 14c0 9.5 13 24 13 24s13-14.5 13-24C29 6.82 23.18 1 16 1z"/><circle cx="16" cy="15" r="6" fill="%23FFFFFF"/></svg>';
const DESTINATION_PIN_SIZE = { width: 32, height: 48 };

const mapSurfaceStyle: CSSProperties = {
  width: '100%',
  height: '100%',
};

const computeCameraFromPoints = (points: LatLng[]) => {
  const lats = points.map((point) => point.lat);
  const lngs = points.map((point) => point.lng);
  const center = {
    lat: (Math.min(...lats) + Math.max(...lats)) / 2,
    lng: (Math.min(...lngs) + Math.max(...lngs)) / 2,
  };
  const latitudeDelta = Math.max((Math.max(...lats) - Math.min(...lats)) * 1.3, 0.02);
  const longitudeDelta = Math.max((Math.max(...lngs) - Math.min(...lngs)) * 1.3, 0.02);
  const delta = Math.max(latitudeDelta, longitudeDelta);
  const zoom = Math.max(5, Math.min(15, Math.log2(360 / delta)));
  return { center, zoom };
};

const isValidLatLng = (value?: LatLng | null): value is LatLng =>
  !!value && Number.isFinite(value.lat) && Number.isFinite(value.lng);

const CampusRideMapWeb = ({
  depart,
  destination,
  originLatLng,
  destinationLatLng,
  variant = 'card',
  style,
}: CampusRideMapProps) => {
  const originMarker = useMemo(() => {
    if (!isValidLatLng(originLatLng)) return null;
    return { position: originLatLng, label: depart?.trim() || 'Départ sélectionné' };
  }, [originLatLng, depart]);
  const destinationMarker = useMemo(() => {
    if (!isValidLatLng(destinationLatLng)) return null;
    return {
      position: destinationLatLng,
      label: destination?.trim() || 'Destination sélectionnée',
    };
  }, [destinationLatLng, destination]);

  const cameraPoints = useMemo(() => {
    const points: LatLng[] = [];
    if (originMarker) points.push(originMarker.position);
    if (destinationMarker) points.push(destinationMarker.position);
    return points;
  }, [originMarker, destinationMarker]);
  const camera = useMemo(() => {
    if (cameraPoints.length > 0) {
      return computeCameraFromPoints(cameraPoints);
    }
    return computeCameraFromPoints([DEFAULT_CENTER]);
  }, [cameraPoints]);

  const mapNode = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const directionsServiceRef = useRef<google.maps.DirectionsService | null>(null);
  const directionsRendererRef = useRef<google.maps.DirectionsRenderer | null>(null);
  const originMarkerRef = useRef<google.maps.Marker | null>(null);
  const destinationMarkerRef = useRef<google.maps.Marker | null>(null);
  const polylineRef = useRef<google.maps.Polyline | null>(null);
  const infoOverlayRef = useRef<google.maps.OverlayView | null>(null);
  const routeRequestIdRef = useRef(0);
  const [mapReady, setMapReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [routePath, setRoutePath] = useState<LatLng[] | null>(null);
  const [routeDistanceKm, setRouteDistanceKm] = useState<number | null>(null);
  const [routeDurationMin, setRouteDurationMin] = useState<number | null>(null);

  useEffect(() => {
    console.debug('[Map] originLatLng', originLatLng);
    console.debug('[Map] destinationLatLng', destinationLatLng);
  }, [originLatLng, destinationLatLng]);

  useEffect(() => {
    let active = true;
    const initialize = async () => {
      try {
        const google = await loadGoogleMapsApi();
        if (!active || !mapNode.current || !google?.maps) return;
        const mapInstance = new google.maps.Map(mapNode.current, {
          center: DEFAULT_CENTER,
          zoom: camera.zoom,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
        });
        mapRef.current = mapInstance;
        originMarkerRef.current = new google.maps.Marker({
          map: mapInstance,
          icon: {
            path: google.maps.SymbolPath.CIRCLE,
            fillColor: '#1A73E8',
            fillOpacity: 0.95,
            strokeColor: '#FFFFFF',
            strokeOpacity: 0.9,
            strokeWeight: 2,
            scale: 7,
          },
          visible: false,
        });
        destinationMarkerRef.current = new google.maps.Marker({
          map: mapInstance,
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
          visible: false,
        });
        directionsServiceRef.current = new google.maps.DirectionsService();
        directionsRendererRef.current = new google.maps.DirectionsRenderer({
          suppressMarkers: true,
          preserveViewport: true,
        });
        directionsRendererRef.current.setMap(mapInstance);
        setMapReady(true);
        setError(null);
      } catch (initError) {
        console.warn('[Map] init error', initError);
        if (active) {
          setError('Impossible d’afficher Google Maps pour le moment.');
        }
      }
    };
    initialize();
    return () => {
      active = false;
      originMarkerRef.current?.setMap(null);
      originMarkerRef.current = null;
      destinationMarkerRef.current?.setMap(null);
      destinationMarkerRef.current = null;
      polylineRef.current?.setMap(null);
      polylineRef.current = null;
      if (infoOverlayRef.current) {
        infoOverlayRef.current.setMap(null);
        infoOverlayRef.current = null;
      }
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
      directionsServiceRef.current = null;
      routeRequestIdRef.current = 0;
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!map || !mapReady || !google?.maps) {
      return;
    }
    const originValid = !!originLatLng && isValidLatLng(originLatLng);
    const destinationValid = !!destinationLatLng && isValidLatLng(destinationLatLng);

    if (originValid) {
      const marker = originMarkerRef.current;
      marker?.setPosition(originLatLng as LatLng);
      marker?.setTitle(originMarker?.label ?? 'Départ sélectionné');
      marker?.setVisible(true);
    } else {
      originMarkerRef.current?.setVisible(false);
    }
    if (destinationValid) {
      const marker = destinationMarkerRef.current;
      marker?.setPosition(destinationLatLng as LatLng);
      marker?.setTitle(destinationMarker?.label ?? 'Destination sélectionnée');
      marker?.setVisible(true);
    } else {
      destinationMarkerRef.current?.setVisible(false);
    }

    if (!originValid || !destinationValid) {
      routeRequestIdRef.current++;
      directionsRendererRef.current?.setDirections({ routes: [] } as any);
      setRoutePath(null);
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      if (originValid) {
        map.setCenter(originLatLng as LatLng);
        map.setZoom(13);
      } else if (destinationValid) {
        map.setCenter(destinationLatLng as LatLng);
        map.setZoom(13);
      }
      return;
    }

    const renderer = directionsRendererRef.current;
    const service = directionsServiceRef.current;
    if (!service || !renderer) {
      return;
    }

    const requestId = ++routeRequestIdRef.current;
    console.debug('[Map] route request', requestId);
    setRoutePath(null);
    setRouteDistanceKm(null);
    setRouteDurationMin(null);
    renderer.setDirections({ routes: [] } as any);

    const originPosition = new google.maps.LatLng(originLatLng!.lat, originLatLng!.lng);
    const destinationPosition = new google.maps.LatLng(
      destinationLatLng!.lat,
      destinationLatLng!.lng
    );

    try {
      service.route(
        {
          origin: originPosition,
          destination: destinationPosition,
          travelMode: google.maps.TravelMode.DRIVING,
          provideRouteAlternatives: false,
        },
        (response, status) => {
          console.debug('[Map] directions status', status);
          if (requestId !== routeRequestIdRef.current) return;
          if (status === 'OK' && response?.routes?.length) {
            const route = response.routes[0];
            const overview = route.overview_path ?? [];
            const path =
              overview.length > 0
                ? overview.map((point) => ({ lat: point.lat(), lng: point.lng() }))
                : [];
            const leg = route.legs?.[0];
            const distanceKm = leg?.distance?.value
              ? Math.round((leg.distance.value / 1000) * 10) / 10
              : null;
            const durationMin = leg?.duration?.value
              ? Math.round(leg.duration.value / 60)
              : null;
            setRoutePath(path.length > 0 ? path : null);
            setRouteDistanceKm(distanceKm);
            setRouteDurationMin(durationMin);
            renderer.setDirections(response);
            return;
          }
          renderer.setDirections({ routes: [] } as any);
          setRoutePath(null);
          setRouteDistanceKm(null);
          setRouteDurationMin(null);
        }
      );
    } catch (routeError) {
      if (requestId !== routeRequestIdRef.current) return;
      renderer.setDirections({ routes: [] } as any);
      setRoutePath(null);
      setRouteDistanceKm(null);
      setRouteDurationMin(null);
      console.warn('[Map] directions error', routeError);
    }
  }, [
    mapReady,
    originLatLng,
    destinationLatLng,
    originMarker,
    destinationMarker,
  ]);

  useEffect(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!map || !google?.maps) return;
    if (polylineRef.current) {
      polylineRef.current.setMap(null);
      polylineRef.current = null;
    }
    if (infoOverlayRef.current) {
      infoOverlayRef.current.setMap(null);
      infoOverlayRef.current = null;
    }

    const path = routePath && routePath.length > 0 ? routePath : null;
    const hasRouteInfo =
      path && path.length > 0 && routeDistanceKm != null && routeDurationMin != null;
    if (!hasRouteInfo || !path) {
      return;
    }
    const infoPolyline = new google.maps.Polyline({
      path,
      strokeColor: '#1A73E8',
      strokeOpacity: 0.85,
      strokeWeight: 4,
      geodesic: true,
    });
    infoPolyline.setMap(map);
    polylineRef.current = infoPolyline;

    const midpoint = path[Math.floor(path.length / 2)];
    const durationLabel = `${Math.max(1, Math.round(routeDurationMin))} min`;
    const distanceLabel = `${routeDistanceKm.toFixed(1)} km`;
    const bubbleContent =
      `<div style="position:relative;display:inline-flex;align-items:center;font-size:13px;font-weight:700;color:#111;">` +
      `<div style="width:0;height:0;border-top:7px solid transparent;border-bottom:7px solid transparent;` +
      `border-right:9px solid #fff;box-shadow:1px 0 1px rgba(0,0,0,0.12);margin-right:-1px;"></div>` +
      `<span style="background:#fff;border:2px solid #dcdcdc;border-radius:18px;padding:6px 12px;` +
      `box-shadow:0 2px 6px rgba(0,0,0,0.15);display:flex;flex-direction:column;align-items:center;gap:2px;line-height:1.1;">` +
      `<span style="font-weight:700;">${durationLabel}</span>` +
      `<span style="font-size:11px;font-weight:600;color:#4B5563;">${distanceLabel}</span>` +
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
      const pos = projection.fromLatLngToDivPixel(
        new google.maps.LatLng(midpoint.lat, midpoint.lng)
      );
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
    infoOverlayRef.current = overlay;
  }, [mapReady, routePath, routeDistanceKm, routeDurationMin]);

  useEffect(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!map || !google?.maps) return;
    map.setCenter(camera.center);
    map.setZoom(camera.zoom);
  }, [camera.center.lat, camera.center.lng, camera.zoom, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const google = window.google;
    if (!mapReady || !map || !google?.maps) return;
    if (originMarker && destinationMarker) {
      const latitudes = [originMarker.position.lat, destinationMarker.position.lat];
      const longitudes = [originMarker.position.lng, destinationMarker.position.lng];
      const boundsLiteral = {
        north: Math.max(...latitudes),
        south: Math.min(...latitudes),
        east: Math.max(...longitudes),
        west: Math.min(...longitudes),
      };
      map.fitBounds(boundsLiteral, { top: 40, right: 40, bottom: 40, left: 40 });
      return;
    }
    const singleMarker = originMarker || destinationMarker;
    if (singleMarker) {
      map.panTo(singleMarker.position);
      map.setZoom(15);
    }
  }, [mapReady, originMarker, destinationMarker]);

  const wrapperStyle: StyleProp<ViewStyle> = [
    styles.mapWrapper,
    variant === 'bare' && styles.mapWrapperBare,
    style,
  ];

  return (
    <View style={wrapperStyle}>
      <div ref={mapNode} style={mapSurfaceStyle} />
      {error ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayTitle}>Carte indisponible</Text>
          <Text style={styles.overlaySubtitle}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  mapWrapper: {
    height: 280,
    position: 'relative',
    borderRadius: Radius.xl,
    overflow: 'hidden',
  },
  mapWrapperBare: {
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.md,
  },
  overlayTitle: {
    fontWeight: '700',
    color: Colors.ink,
    marginBottom: 4,
  },
  overlaySubtitle: {
    color: Colors.gray600,
    fontSize: 12,
    textAlign: 'center',
  },
});

export default CampusRideMapWeb;
