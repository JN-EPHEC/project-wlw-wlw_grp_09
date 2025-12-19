import { ReactNode } from 'react';
import { StyleSheet, StyleProp, ViewStyle } from 'react-native';

import { Gradients } from '@/app/ui/theme';
import { useAuthSession } from '@/hooks/use-auth-session';
import { GradientBackground } from './gradient-background';

type AppBackgroundProps = {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  colors?: readonly [string, string?, string?];
};

export function AppBackground({ children, style, colors }: AppBackgroundProps) {
  const session = useAuthSession();
  const fallbackColors = session.isDriver ? Gradients.driver : Gradients.background;
  return (
    <GradientBackground colors={colors ?? fallbackColors} style={[styles.base, style]}>
      {children}
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  base: {
    flex: 1,
  },
});
