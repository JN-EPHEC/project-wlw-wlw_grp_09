import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/app/ui/theme';
import { loadGoogleMapsApi } from '@/app/services/google-maps-loader';
import { getCoordinates } from '@/app/services/distance';

export type MeetingMapProps = {
  address: string;
  style?: StyleProp<ViewStyle>;
};

const MeetingMapWebComponent = ({ address, style }: MeetingMapProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const [error, setError] = useState<string | null>(null);

  const point = useMemo(() => {
    const coords = getCoordinates(address);
    const lat = Number.isFinite(coords.latitude) ? coords.latitude : 50.8503;
    const lng = Number.isFinite(coords.longitude) ? coords.longitude : 4.3517;
    return { lat, lng };
  }, [address]);

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
          title: address,
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
  }, [address, point.lat, point.lng]);

  useEffect(() => {
    if (!mapRef.current || !markerRef.current) return;
    const google = window.google;
    if (!google) return;
    const center = new google.maps.LatLng(point.lat, point.lng);
    mapRef.current.setCenter(center);
    markerRef.current.setPosition(center);
  }, [point.lat, point.lng]);

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
