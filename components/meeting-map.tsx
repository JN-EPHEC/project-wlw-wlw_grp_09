import type { ComponentType } from 'react';
import { Platform } from 'react-native';

import type { MeetingMapProps as NativeProps } from './meeting-map.native';
import { MeetingMap as NativeMeetingMap } from './meeting-map.native';
import { MeetingMap as WebMeetingMap } from './meeting-map.web';

export type MeetingMapProps = NativeProps;

export const MeetingMap: ComponentType<MeetingMapProps> =
  Platform.OS === 'web' ? (WebMeetingMap as ComponentType<MeetingMapProps>) : NativeMeetingMap;
