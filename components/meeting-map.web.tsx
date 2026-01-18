import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/app/ui/theme';
import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';
import type { LatLng } from '@/app/services/location';

export type MeetingMapProps = {
  address?: string;
  latLng?: LatLng | null;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_CENTER = { lat: 50.8503, lng: 4.3517 };

const MeetingMapWebComponent = ({ address, latLng, style }: MeetingMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedLatLng, setResolvedLatLng] = useState<LatLng | null>(() =>
    latLng?.lat != null && latLng?.lng != null ? { lat: latLng.lat, lng: latLng.lng } : null
  );

  useEffect(() => {
    if (latLng?.lat != null && latLng?.lng != null) {
      setResolvedLatLng({ lat: latLng.lat, lng: latLng.lng });
      return;
    }
    setResolvedLatLng(null);
  }, [latLng?.lat, latLng?.lng]);

  useEffect(() => {
    if (!address || address.trim().length < 3) return;
    let active = true;
    setError(null);
    loadGoogleMapsApi()
      .then((google) => {
        if (!active) return;
        const geocoder = new google.maps.Geocoder();
        geocoder.geocode({ address }, (results, status) => {
          if (!active) return;
          if (status !== 'OK' || !results?.[0]) return;
          const location = results[0].geometry.location;
          const lat = location.lat();
          const lng = location.lng();
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
          setResolvedLatLng({ lat, lng });
        });
      })
      .catch(() => {
        if (active) setError('Carte indisponible');
      });
    return () => {
      active = false;
    };
  }, [address]);

  const point = useMemo(
    () => ({
      lat: resolvedLatLng?.lat ?? DEFAULT_CENTER.lat,
      lng: resolvedLatLng?.lng ?? DEFAULT_CENTER.lng,
    }),
    [resolvedLatLng]
  );
  const title = useMemo(() => address ?? 'Point de rendez-vous', [address]);

  useEffect(() => {
    console.debug('[MeetingPoint]', { address, latLng, resolvedLatLng });
  }, [address, latLng, resolvedLatLng]);

  useEffect(() => {
    let active = true;
    loadGoogleMapsApi()
      .then((google) => {
        if (!active || !containerRef.current) return;
        const center = new google.maps.LatLng(point.lat, point.lng);
        mapRef.current = new google.maps.Map(containerRef.current, {
          center,
          zoom: 14,
          disableDefaultUI: true,
          zoomControl: true,
        });
        markerRef.current = new google.maps.Marker({
          map: mapRef.current,
          position: center,
          title,
          visible: Boolean(resolvedLatLng),
        });
        setError(null);
      })
      .catch(() => setError('Carte indisponible'));
    return () => {
      active = false;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
  }, [point.lat, point.lng, resolvedLatLng, title]);

  useEffect(() => {
    if (!mapRef.current) return;
    const google = window.google;
    if (!google) return;
    const center = new google.maps.LatLng(point.lat, point.lng);
    mapRef.current.setCenter(center);
    if (markerRef.current) {
      markerRef.current.setPosition(center);
      markerRef.current.setVisible(Boolean(resolvedLatLng));
    }
  }, [point.lat, point.lng, resolvedLatLng]);

  return (
    <View style={[styles.card, style]}>
      <div ref={containerRef} style={mapSurfaceStyle} />
      {error ? (
        <View style={styles.overlay}>
          <Text style={styles.overlayText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
};

const mapSurfaceStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray200,
    position: 'relative',
  },
  overlay: {
    position: 'absolute',
    inset: 0,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayText: {
    color: Colors.gray600,
    fontWeight: '700',
  },
});

export const MeetingMap = memo(MeetingMapWebComponent);
