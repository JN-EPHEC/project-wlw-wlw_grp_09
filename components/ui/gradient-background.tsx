import { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

type GradientProps = {
  colors?: readonly [string, string?, string?];
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
  blur?: number;
};

const ensurePalette = (colors?: readonly [string, string?, string?]) => {
  const fallback: [string, string?, string?] = ['#7A5FFF', '#9374FF', '#F1B6FF'];
  const [a, b, c] = colors ?? fallback;
  return [a, b ?? a, c ?? b ?? a] as const;
};

export function GradientBackground({ colors, style, children, blur = 0.55 }: GradientProps) {
  const [base, mid, highlight] = ensurePalette(colors);

  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={[base, mid, highlight]}
        locations={[0, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'relative',
    overflow: 'hidden',
  },
});
