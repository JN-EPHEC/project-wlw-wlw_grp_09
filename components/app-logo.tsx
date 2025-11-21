import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Colors } from '@/app/ui/theme';

type Props = {
  size?: number;
  showWordmark?: boolean;
  align?: 'left' | 'center';
  taglineColor?: string;
};

const AppLogoComponent = ({
  size = 64,
  showWordmark = false,
  align = 'left',
  taglineColor = Colors.gray500,
}: Props) => {
  const unit = size / 10;

  const iconWidth = 8 * unit;
  const hatSide = 6 * unit;
  const hatBandHeight = 1.2 * unit;
  const pinDiameter = 2.8 * unit;
  const pinTailHeight = 2.1 * unit;
  const carHeight = 4.2 * unit;
  const wheelSize = 1.9 * unit;

  const iconHeight =
    hatSide * 0.7 +
    hatBandHeight +
    pinDiameter +
    pinTailHeight +
    carHeight +
    wheelSize * 0.4;

  const bodyTop = hatSide * 0.7 + hatBandHeight + pinDiameter + pinTailHeight - carHeight * 0.12;

  return (
    <View style={[styles.row, align === 'center' && { justifyContent: 'center' }]}> 
      <View style={[styles.icon, { width: iconWidth, height: iconHeight }]}> 
        <View
          style={[
            styles.hatTop,
            {
              width: hatSide,
              height: hatSide,
              left: (iconWidth - hatSide) / 2,
            },
          ]}
        />
        <View
          style={[
            styles.hatBand,
            {
              width: hatSide * 0.66,
              height: hatBandHeight,
              top: hatSide * 0.55,
              left: (iconWidth - hatSide * 0.66) / 2,
            },
          ]}
        />
        <View
          style={[
            styles.tassel,
            {
              width: unit * 0.5,
              height: hatBandHeight * 2.1,
              top: hatSide * 0.55,
              left: (iconWidth + hatSide) / 2 - unit * 0.45,
            },
          ]}
        />
        <View
          style={[
            styles.pinHead,
            {
              width: pinDiameter,
              height: pinDiameter,
              top: hatSide * 0.7 + hatBandHeight * 0.6,
              left: (iconWidth - pinDiameter) / 2,
            },
          ]}
        />
        <View
          style={[
            styles.pinTail,
            {
              top: hatSide * 0.7 + hatBandHeight * 0.6 + pinDiameter - 1,
              left: (iconWidth - pinDiameter) / 2,
              borderLeftWidth: pinDiameter / 2,
              borderRightWidth: pinDiameter / 2,
              borderTopWidth: pinTailHeight,
            },
          ]}
        />

        <View
          style={[
            styles.carBody,
            {
              width: iconWidth,
              height: carHeight,
              top: bodyTop,
            },
          ]}
        >
          <View
            style={[
              styles.carCab,
              {
                height: carHeight * 0.55,
                top: carHeight * 0.05,
                left: iconWidth * 0.12,
                right: iconWidth * 0.12,
              },
            ]}
          />
          <View
            style={[
              styles.window,
              {
                width: iconWidth * 0.28,
                height: carHeight * 0.4,
                left: iconWidth * 0.18,
              },
            ]}
          />
          <View
            style={[
              styles.window,
              {
                width: iconWidth * 0.28,
                height: carHeight * 0.4,
                right: iconWidth * 0.18,
              },
            ]}
          />
          <View
            style={[
              styles.headlight,
              {
                width: unit * 1.1,
                height: unit * 1.1,
                left: iconWidth * 0.12,
                bottom: carHeight * 0.18,
              },
            ]}
          />
          <View
            style={[
              styles.headlight,
              {
                width: unit * 1.1,
                height: unit * 1.1,
                right: iconWidth * 0.12,
                bottom: carHeight * 0.18,
              },
            ]}
          />
        </View>

        <View
          style={[
            styles.wheel,
            {
              width: wheelSize,
              height: wheelSize,
              top: bodyTop + carHeight - wheelSize * 0.45,
              left: iconWidth * 0.12,
            },
          ]}
        />
        <View
          style={[
            styles.wheel,
            {
              width: wheelSize,
              height: wheelSize,
              top: bodyTop + carHeight - wheelSize * 0.45,
              right: iconWidth * 0.12,
            },
          ]}
        />
      </View>

      {showWordmark ? (
        <View style={styles.texts}>
          <Text style={styles.wordmark}>CampusRide</Text>
          <Text style={[styles.tagline, { color: taglineColor }]}>
            Partage tes trajets étudiants
          </Text>
        </View>
      ) : null}
    </View>
  );
};

export const AppLogo = memo(AppLogoComponent);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  icon: {
    position: 'relative',
  },
  hatTop: {
    position: 'absolute',
    backgroundColor: Colors.secondary,
    borderRadius: 14,
    transform: [{ rotate: '45deg' }],
  },
  hatBand: {
    position: 'absolute',
    backgroundColor: Colors.ink,
    borderRadius: 999,
  },
  tassel: {
    position: 'absolute',
    backgroundColor: Colors.secondary,
    borderRadius: 999,
  },
  pinHead: {
    position: 'absolute',
    backgroundColor: Colors.primary,
    borderRadius: 999,
  },
  pinTail: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: Colors.primary,
  },
  carBody: {
    position: 'absolute',
    backgroundColor: Colors.secondary,
    borderRadius: 24,
  },
  carCab: {
    position: 'absolute',
    backgroundColor: Colors.secondary,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  window: {
    position: 'absolute',
    backgroundColor: Colors.gray100,
    borderRadius: 18,
  },
  headlight: {
    position: 'absolute',
    backgroundColor: Colors.primaryLight,
    borderRadius: 999,
  },
  wheel: {
    position: 'absolute',
    backgroundColor: Colors.gray200,
    borderRadius: 999,
    borderWidth: 3,
    borderColor: Colors.gray700,
  },
  texts: {
    gap: 4,
  },
  wordmark: {
    fontWeight: '800',
    fontSize: 22,
    color: Colors.ink,
  },
  tagline: {
    fontSize: 12,
    color: Colors.gray500,
  },
});
