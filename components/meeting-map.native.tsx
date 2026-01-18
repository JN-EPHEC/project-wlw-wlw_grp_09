import MapView, { Marker, PROVIDER_GOOGLE, Region } from 'react-native-maps';
import { memo, useMemo } from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Radius } from '@/app/ui/theme';
import { getCoordinates } from '@/app/services/distance';
import type { LatLng } from '@/app/services/location';

export type MeetingMapProps = {
  address?: string;
  latLng?: LatLng | null;
  style?: StyleProp<ViewStyle>;
};

const DEFAULT_REGION: Region = {
  latitude: 50.8503,
  longitude: 4.3517,
  latitudeDelta: 0.05,
  longitudeDelta: 0.05,
};

const mapProvider = Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined;

const MeetingMapNative = ({ address, latLng, style }: MeetingMapProps) => {
  const point = useMemo(() => {
    if (latLng?.lat != null && latLng?.lng != null) {
      return { latitude: latLng.lat, longitude: latLng.lng };
    }
    const coords = address ? getCoordinates(address) : undefined;
    const lat = coords && Number.isFinite(coords.latitude) ? coords.latitude : DEFAULT_REGION.latitude;
    const lng = coords && Number.isFinite(coords.longitude) ? coords.longitude : DEFAULT_REGION.longitude;
    return { latitude: lat, longitude: lng };
  }, [address, latLng]);

  const region = useMemo<Region>(
    () => ({
      latitude: point.latitude,
      longitude: point.longitude,
      latitudeDelta: 0.02,
      longitudeDelta: 0.02,
    }),
    [point.latitude, point.longitude]
  );

  return (
    <View style={[styles.card, style]}>
      <MapView
        style={styles.map}
        provider={mapProvider}
        region={region}
        showsCompass={false}
        showsPointsOfInterest={false}
        showsTraffic={false}
      >
        <Marker coordinate={point} title="Point de rencontre" description={address} />
      </MapView>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.gray200,
  },
  map: {
    width: '100%',
    height: '100%',
  },
});

export const MeetingMap = memo(MeetingMapNative);
