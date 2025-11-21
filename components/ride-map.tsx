import { Platform } from 'react-native';

import { RideMap as NativeRideMap } from './ride-map.native';
import { RideMap as WebRideMap } from './ride-map.web';

export const RideMap = Platform.OS === 'web' ? WebRideMap : NativeRideMap;
