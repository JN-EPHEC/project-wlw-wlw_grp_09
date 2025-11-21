import { Fragment, memo, useEffect, useMemo, useState } from 'react';
import MapView, { Marker, Polyline, Region, PROVIDER_GOOGLE } from 'react-native-maps';
import { StyleSheet, Text, View } from 'react-native';

import type { Ride } from '@/app/services/rides';
import { getCoordinates } from '@/app/services/distance';
import { Colors, Radius, Spacing } from '@/app/ui/theme';

type Props = {
  rides: Ride[];
};

type RideMapData = {
  ride: Ride;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
};

const DEFAULT_REGION: Region = {
  latitude: 50.8503,
  longitude: 4.3517,
  latitudeDelta: 0.35,
  longitudeDelta: 0.45,
};

const computeRegion = (data: RideMapData[]): Region => {
  if (data.length === 0) {
    return DEFAULT_REGION;
  }

  const lats = data.flatMap((item) => [item.origin.latitude, item.destination.latitude]);
  const lngs = data.flatMap((item) => [item.origin.longitude, item.destination.longitude]);

  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);

  const latitude = (minLat + maxLat) / 2;
  const longitude = (minLng + maxLng) / 2;
  const latitudeDelta = Math.max((maxLat - minLat) * 1.6, 0.1);
  const longitudeDelta = Math.max((maxLng - minLng) * 1.6, 0.1);

  return { latitude, longitude, latitudeDelta, longitudeDelta };
};

const FALLBACK_ROUTES = [
  {
    id: 'fallback-1',
    start: { latitude: 50.8467, longitude: 4.3517 },
    end: { latitude: 50.8122, longitude: 4.3817 },
    from: 'Grand-Place',
    to: 'ULB Solbosch',
  },
  {
    id: 'fallback-2',
    start: { latitude: 50.8514, longitude: 4.4016 },
    end: { latitude: 50.6686, longitude: 4.6145 },
    from: 'Parc du Cinquantenaire',
    to: 'EPHEC Louvain-la-Neuve',
  },
  {
    id: 'fallback-3',
    start: { latitude: 50.8429, longitude: 4.3127 },
    end: { latitude: 50.8794, longitude: 4.7009 },
    from: 'Gare du Midi',
    to: 'Leuven',
  },
];

const RideMapComponent = ({ rides }: Props) => {
  const mapped = useMemo<RideMapData[]>(() => {
    return rides.map((ride) => ({
      ride,
      origin: getCoordinates(ride.depart),
      destination: getCoordinates(ride.destination),
    }));
  }, [rides]);

  const showFallback = rides.length === 0;

  const [region, setRegion] = useState<Region>(() => computeRegion(mapped));

  const regionEquals = (a: Region, b: Region) =>
    Math.abs(a.latitude - b.latitude) < 0.0001 &&
    Math.abs(a.longitude - b.longitude) < 0.0001 &&
    Math.abs(a.latitudeDelta - b.latitudeDelta) < 0.0001 &&
    Math.abs(a.longitudeDelta - b.longitudeDelta) < 0.0001;

  useEffect(() => {
    const next = computeRegion(mapped);
    setRegion((prev) => {
      if (!prev || !regionEquals(prev, next)) {
        return next;
      }
      return prev;
    });
  }, [mapped]);

  return (
    <View style={styles.card}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
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
        {mapped.map(({ ride, origin, destination }) => (
          <Fragment key={ride.id}>
            <Polyline
              coordinates={[
                { latitude: origin.latitude, longitude: origin.longitude },
                { latitude: destination.latitude, longitude: destination.longitude },
              ]}
              strokeColor={Colors.primary}
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
            <Marker
              coordinate={origin}
              title={ride.depart}
              description={`Départ • ${ride.time}`}
              pinColor={Colors.secondary}
            />
            <Marker
              coordinate={destination}
              title={ride.destination}
              description={`Arrivée • ${ride.driver}`}
              pinColor={Colors.primary}
            />
          </Fragment>
        ))}
        {showFallback
          ? FALLBACK_ROUTES.map((route) => (
              <Fragment key={route.id}>
                <Polyline
                  coordinates={[route.start, route.end]}
                  strokeColor={Colors.secondary}
                  strokeWidth={3}
                  lineDashPattern={[6, 6]}
                />
                <Marker
                  coordinate={route.start}
                  title={route.from}
                  description="Point de départ (exemple)"
                  pinColor={Colors.secondary}
                />
                <Marker
                  coordinate={route.end}
                  title={route.to}
                  description="Destination (exemple)"
                  pinColor={Colors.primary}
                />
              </Fragment>
            ))
          : null}
      </MapView>
      <View style={styles.caption}>
        <Text style={styles.captionTitle}>Carte interactive</Text>
        <Text style={styles.captionText}>
          {showFallback
            ? 'Aperçu des trajets CampusRide autour de Bruxelles (exemple démo).'
            : 'Glisse et zoome pour explorer les trajets publiés autour de ton campus.'}
        </Text>
      </View>
    </View>
  );
};

export const RideMap = memo(RideMapComponent);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
  },
  map: {
    height: 240,
    width: '100%',
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
