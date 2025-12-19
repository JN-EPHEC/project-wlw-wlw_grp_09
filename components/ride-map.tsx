import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import { RideMap as NativeRideMap } from './ride-map.native';
import { RideMap as WebRideMap } from './ride-map.web';

export type RideMapProps = Parameters<typeof NativeRideMap>[0];

export const RideMap: ComponentType<RideMapProps> =
  Platform.OS === 'web' ? (WebRideMap as ComponentType<RideMapProps>) : NativeRideMap;
