import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { memo, useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Colors } from '@/app/ui/theme';

type RatingStarsProps = {
  value: number;
  max?: number;
  size?: number;
  color?: string;
  inactiveColor?: string;
  editable?: boolean;
  onChange?: (rating: number) => void;
  accessibilityLabel?: string;
};

const MAX_STARS = 5;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const buildFractions = (value: number, max: number) => {
  const clamped = clamp(value, 0, max);
  return Array.from({ length: max }).map((_, index) => {
    const filled = clamp(clamped - index, 0, 1);
    return filled;
  });
};

function RatingStarsComponent({
  value,
  max = MAX_STARS,
  size = 20,
  color = Colors.primary,
  inactiveColor = Colors.gray400,
  editable = false,
  onChange,
  accessibilityLabel = 'Note',
}: RatingStarsProps) {
  const fractions = useMemo(() => buildFractions(value, max), [value, max]);

  const handleChange = (next: number) => {
    if (!editable || !onChange) return;
    const rounded = Math.round(next);
    const clamped = clamp(rounded, 1, max);
    onChange(clamped);
  };

  return (
    <View style={[styles.container, { height: size }]}>
      {fractions.map((fill, index) => (
        <View
          key={index}
          style={[
            styles.starContainer,
            { width: size, height: size, marginRight: index === max - 1 ? 0 : size * 0.15 },
          ]}
          accessibilityRole={editable ? 'adjustable' : undefined}
          accessibilityLabel={`${accessibilityLabel} ${index + 1}`}
        >
          <MaterialIcons name="star-border" size={size} color={inactiveColor} />
          <View
            pointerEvents="none"
            style={[
              styles.starFill,
              {
                width: size * fill,
                height: size,
              },
            ]}
          >
            <MaterialIcons name="star" size={size} color={color} />
          </View>
          {editable ? (
            <Pressable style={styles.hitbox} onPress={() => handleChange(index + 1)}>
              <View />
            </Pressable>
          ) : null}
        </View>
      ))}
    </View>
  );
}

export const RatingStars = memo(RatingStarsComponent);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  starContainer: {
    position: 'relative',
    justifyContent: 'center',
  },
  starFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    overflow: 'hidden',
  },
  hitbox: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
});
