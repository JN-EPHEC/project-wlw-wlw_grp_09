import { type PropsWithChildren } from 'react';
import { StyleSheet, View, type ViewProps } from 'react-native';

import { Colors, Spacing } from '@/app/ui/theme';

type WhiteRoundedContainerProps = PropsWithChildren<
  ViewProps & {
    /**
     * Horizontal spacing to keep the card away from screen edges.
     * Defaults to 16px to mirror the Profile screen block.
     */
    edgeSpacing?: number;
  }
>;

/**
 * WhiteRoundedContainer reproduces the primary white card used on the Profile screen.
 * It keeps the generous radius, padding, and subtle drop shadow consistent everywhere.
 */
export function WhiteRoundedContainer({
  children,
  style,
  edgeSpacing = 16,
  ...rest
}: WhiteRoundedContainerProps) {
  return (
    <View style={[styles.container, { marginHorizontal: edgeSpacing }, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignSelf: 'stretch',
    backgroundColor: Colors.white,
    borderRadius: 32,
    padding: Spacing.xl,
    shadowColor: '#310F4C',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 4,
  },
});
