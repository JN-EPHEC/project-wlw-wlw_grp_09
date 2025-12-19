import { ReactNode } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { Gradients } from '@/app/ui/theme';
import { GradientBackground } from './gradient-background';

type AppBackgroundProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: readonly [string, string?, string?];
};

export function AppBackground({ children, style, colors }: AppBackgroundProps) {
  return (
    <GradientBackground colors={colors ?? Gradients.background} style={[styles.base, style]}>
      {children}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
