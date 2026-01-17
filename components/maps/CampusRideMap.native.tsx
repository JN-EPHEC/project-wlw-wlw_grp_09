import { memo, useEffect, useMemo, useState } from 'react';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { CAMPUS_LOCATIONS } from '@/constants/campuses';
import { getCoordinates } from '@/app/services/distance';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import type { CampusRideMapProps, Coordinates } from './types';
import {
  DEFAULT_HERO_REGION,
  HeroPreviewMarker,
  HERO_FALLBACK_POINTS,
  HERO_FALLBACK_SEGMENTS,
  computeRegionFromPoints,
  isValidHeroCoordinate,
  sanitizeHeroSegments,
  toHeroCoordinates,
} from './shared';

const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

const buildHeroSegment = (ride: CampusRideMapProps['rides'][number]) => ({
  id: ride.id,
  start: getCoordinates(ride.depart),
  end: getCoordinates(ride.destination),
  startLabel: ride.depart,
  endLabel: ride.destination,
});

const resolvePreviewLatLng = (coords?: Coordinates | null, fallback?: string | null) => {
  if (coords && isValidHeroCoordinate(coords)) {
    return { lat: coords.latitude, lng: coords.longitude };
  }
  if (fallback && fallback.trim()) {
    const resolved = getCoordinates(fallback);
    if (isValidHeroCoordinate(resolved)) {
      return { lat: resolved.latitude, lng: resolved.longitude };
    }
  }
  return null;
};

const regionEquals = (a: Region, b: Region) =>
  Math.abs(a.latitude - b.latitude) < 0.0001 &&
  Math.abs(a.longitude - b.longitude) < 0.0001 &&
  Math.abs(a.latitudeDelta - b.latitudeDelta) < 0.0001 &&
  Math.abs(a.longitudeDelta - b.longitudeDelta) < 0.0001;

const CampusRideMapNative = ({
  rides,
  depart,
  destination,
  originCoords,
  destinationCoords,
  fallbackSegmentsEnabled = true,
  variant = 'card',
  style,
}: CampusRideMapProps) => {
  const segments = useMemo(
    () => {
      const sanitized = sanitizeHeroSegments(rides.map((ride) => buildHeroSegment(ride)));
      if (sanitized.length > 0) return sanitized;
      return fallbackSegmentsEnabled ? HERO_FALLBACK_SEGMENTS : [];
    },
    [rides, fallbackSegmentsEnabled]
  );
  const previewOrigin = useMemo<HeroPreviewMarker | null>(() => {
    const position = resolvePreviewLatLng(originCoords, depart);
    if (!position) return null;
    return { position, label: depart?.trim() || 'Départ sélectionné', kind: 'origin' };
  }, [originCoords, depart]);
  const previewDestination = useMemo<HeroPreviewMarker | null>(() => {
    const position = resolvePreviewLatLng(destinationCoords, destination);
    if (!position) return null;
    return { position, label: destination?.trim() || 'Destination sélectionnée', kind: 'destination' };
  }, [destinationCoords, destination]);

  const boundingPoints = useMemo<Coordinates[]>(() => {
    const points: Coordinates[] = [];
    segments.forEach((segment) => {
      points.push({ latitude: segment.start.latitude, longitude: segment.start.longitude });
      points.push({ latitude: segment.end.latitude, longitude: segment.end.longitude });
    });
    if (previewOrigin) {
      points.push({ latitude: previewOrigin.position.lat, longitude: previewOrigin.position.lng });
    }
    if (previewDestination) {
      points.push({ latitude: previewDestination.position.lat, longitude: previewDestination.position.lng });
    }
    if (points.length === 0 && fallbackSegmentsEnabled) {
      points.push(...HERO_FALLBACK_POINTS);
    }
    return points;
  }, [segments, previewOrigin, previewDestination, fallbackSegmentsEnabled]);

  const [region, setRegion] = useState<Region>(() =>
    boundingPoints.length > 0 ? computeRegionFromPoints(boundingPoints) : DEFAULT_HERO_REGION
  );

  useEffect(() => {
    const nextRegion = boundingPoints.length > 0 ? computeRegionFromPoints(boundingPoints) : DEFAULT_HERO_REGION;
    setRegion((prev) => (regionEquals(prev, nextRegion) ? prev : nextRegion));
  }, [boundingPoints]);

  const previewPath = useMemo(() => {
    if (previewOrigin && previewDestination) {
      return [previewOrigin.position, previewDestination.position];
    }
    return null;
  }, [previewDestination, previewOrigin]);

  const mapView = (
    <View
      style={[
        styles.mapWrapper,
        variant === 'bare' && styles.mapWrapperBare,
        variant === 'bare' ? style : undefined,
      ]}
    >
      <MapView
        provider={mapProvider}
        style={[styles.map, variant === 'bare' && styles.mapBare]}
        initialRegion={region}
        region={region}
        onRegionChangeComplete={setRegion}
        pitchEnabled={false}
        showsPointsOfInterest={false}
        showsBuildings={false}
        showsCompass={false}
        showsTraffic={false}
        showsScale={false}
        toolbarEnabled={false}
      >
        {segments.map((segment) => (
          <Polyline
            key={`hero-${segment.id}`}
            coordinates={[
              { latitude: segment.start.latitude, longitude: segment.start.longitude },
              { latitude: segment.end.latitude, longitude: segment.end.longitude },
            ]}
            strokeColor={Colors.primary}
            strokeWidth={3}
            lineCap="round"
            lineJoin="round"
          />
        ))}
        {previewPath ? (
          <Polyline
            coordinates={previewPath.map((marker) => toHeroCoordinates(marker))}
            strokeColor={Colors.secondary}
            strokeWidth={2}
            lineDashPattern={[6, 6]}
          />
        ) : null}
        {previewOrigin ? (
          <Marker
            coordinate={toHeroCoordinates(previewOrigin.position)}
            title={previewOrigin.label}
            pinColor={Colors.secondary}
          />
        ) : null}
        {previewDestination ? (
          <Marker
            coordinate={toHeroCoordinates(previewDestination.position)}
            title={previewDestination.label}
            pinColor={Colors.primary}
          />
        ) : null}
        {CAMPUS_LOCATIONS.map((campus) => (
          <Marker
            key={`campus-${campus.name}`}
            coordinate={{ latitude: campus.latitude, longitude: campus.longitude }}
            title={campus.name}
            pinColor={Colors.gray400}
          />
        ))}
      </MapView>
    </View>
  );

  if (variant === 'bare') {
    return mapView;
  }

  return (
    <View style={[styles.card, style]}>
      {mapView}
      <View style={styles.caption}>
        <Text style={styles.captionTitle}>Carte interactive</Text>
        <Text style={styles.captionText}>
          {segments.length === 0
            ? 'Aucun trajet publié, regarde les campus autour de toi.'
            : 'Déplace et zoome pour explorer les trajets CampusRide.'}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
    backgroundColor: Colors.card,
  },
  caption: {
    borderTopWidth: 1,
    borderColor: Colors.gray200,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
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
  mapWrapper: {
    height: 280,
  },
  mapWrapperBare: {
    height: '100%',
  },
  map: {
    height: '100%',
    width: '100%',
  },
  mapBare: {
    height: '100%',
  },
});

export default memo(CampusRideMapNative);
