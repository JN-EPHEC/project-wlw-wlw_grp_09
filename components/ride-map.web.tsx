import { memo } from 'react';
import { ImageBackground, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/app/ui/theme';
import type { Ride } from '@/app/services/rides';

type Props = {
  rides: Ride[];
};

const RideMapWeb = ({ rides }: Props) => {
  const hasRides = rides.length > 0;
  const backgroundUri =
    'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Brussels_City_Center_Map.png/800px-Brussels_City_Center_Map.png';

  return (
    <View style={styles.card}>
      <ImageBackground
        style={styles.map}
        source={{ uri: backgroundUri }}
        resizeMode="cover"
      >
        <View style={styles.overlay}>
          <Text style={styles.title}>Carte interactive</Text>
          <Text style={styles.subtitle}>
            {hasRides
              ? 'Ouvre CampusRide sur mobile pour suivre les trajets en temps réel.'
              : 'Exemple de carte autour de Bruxelles. Publie un trajet pour la rendre dynamique !'}
          </Text>
        </View>
      </ImageBackground>
      <View style={styles.caption}>
        <Text style={styles.captionTitle}>Trajets en temps réel</Text>
        <Text style={styles.captionText}>
          L’expérience carte est optimisée pour les apps iOS/Android. Sur web, la liste reste
          entièrement disponible.
        </Text>
      </View>
    </View>
  );
};

export const RideMap = memo(RideMapWeb);

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.gray200,
    overflow: 'hidden',
  },
  map: {
    height: 240,
    width: '100%',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16, 32, 48, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.xl,
    gap: Spacing.sm,
  },
  title: {
    color: Colors.ink,
    fontWeight: '700',
    fontSize: 16,
  },
  subtitle: {
    color: Colors.gray600,
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  caption: {
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.md,
    borderTopWidth: 1,
    borderColor: Colors.gray200,
    gap: Spacing.xs,
  },
  captionTitle: {
    fontWeight: '700',
    color: Colors.ink,
  },
  captionText: {
    color: Colors.gray600,
    fontSize: 12,
    lineHeight: 16,
  },
});
