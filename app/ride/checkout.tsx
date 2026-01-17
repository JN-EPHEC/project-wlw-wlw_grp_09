import { useLocalSearchParams, useRouter } from 'expo-router';
import { View, Text } from 'react-native';

import RideDetailScreen from './[id]';
import { AppBackground } from '@/components/ui/app-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';

const C = Colors;

export default function RideCheckoutScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ rideId?: string }>();
  const rideId = Array.isArray(params.rideId) ? params.rideId[0] : params.rideId;

  if (!rideId) {
    return (
      <AppBackground colors={Gradients.background}>
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            padding: Spacing.xl,
            gap: Spacing.sm,
          }}
        >
          <Text style={{ color: C.white, fontSize: 22, fontWeight: '700' }}>
            Trajet introuvable
          </Text>
          <Text style={{ color: C.gray200, textAlign: 'center' }}>
            Vérifie ton lien ou retourne à l’accueil pour choisir un trajet.
          </Text>
          <GradientButton
            title="Retour à l’accueil"
            variant="cta"
            onPress={() => router.push('/')}
            accessibilityRole="button"
            fullWidth
            size="sm"
            style={{ borderRadius: Radius['2xl'], marginTop: Spacing.md }}
          />
        </View>
      </AppBackground>
    );
  }

  return <RideDetailScreen mode="checkout" overrideRideId={rideId} />;
}
