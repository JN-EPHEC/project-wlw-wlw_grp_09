import { useBottomTabBarHeight } from '@react-navigation/bottom-tabs';
import { useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Spacing } from '@/app/ui/theme';

export function useTabBarInset(extra = 0) {
  const tabBarHeight = useBottomTabBarHeight();
  const { bottom } = useSafeAreaInsets();
  return useMemo(
    () => tabBarHeight + Math.max(bottom, Spacing.md) + extra,
    [tabBarHeight, bottom, extra]
  );
}
