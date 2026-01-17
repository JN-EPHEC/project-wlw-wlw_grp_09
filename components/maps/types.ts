import type { StyleProp, ViewStyle } from 'react-native';
import type { Ride } from '@/app/services/rides';
import type { LatLng } from '@/app/services/location';

export type Coordinates = { latitude: number; longitude: number };

export type CampusRideMapProps = {
  rides: Ride[];
  depart?: string | null;
  destination?: string | null;
  originCoords?: Coordinates | null;
  destinationCoords?: Coordinates | null;
  originLatLng?: LatLng | null;
  destinationLatLng?: LatLng | null;
  fallbackSegmentsEnabled?: boolean;
  variant?: 'card' | 'bare';
  style?: StyleProp<ViewStyle>;
};
