import { Redirect, router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Image, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import * as Auth from '@/app/services/auth';
import { useAuthSession } from '@/hooks/use-auth-session';
import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { pickProfileDocument, pickProfileImage } from '@/app/utils/image-picker';
import { getAvatarUrl } from '@/app/ui/avatar';

export default function ProfileWelcome() {
  const session = useAuthSession();
  const [avatarUri, setAvatarUri] = useState(session.avatarUrl ?? getAvatarUrl(session.email ?? '', 160));
  const [updating, setUpdating] = useState(false);

  if (!session.email) {
    return <Redirect href="/sign-in" />;
  }

  const firstName =
    session.name?.split(/\s+/)[0]?.replace(/^./, (c) => c.toUpperCase()) ||
    session.email.split('@')[0]?.replace(/^./, (c) => c.toUpperCase());

  const changeAvatar = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      const fromDocs = await pickProfileDocument();
      if (fromDocs) {
        await Auth.updateProfile(session.email!, { avatarUrl: fromDocs });
        setAvatarUri(fromDocs);
        return;
      }
      const gallery = await pickProfileImage();
      if (gallery) {
        await Auth.updateProfile(session.email!, { avatarUrl: gallery });
        setAvatarUri(gallery);
      }
    } finally {
      setUpdating(false);
    }
  };

  const removeAvatar = async () => {
    if (updating) return;
    setUpdating(true);
    try {
      await Auth.updateProfile(session.email!, { avatarUrl: '' });
      setAvatarUri(getAvatarUrl(session.email!, 160));
    } finally {
      setUpdating(false);
    }
  };

  return (
    <AppBackground colors={Gradients.twilight}>
      <SafeAreaView style={styles.safe}>
        <View style={styles.panel}>
          <View style={styles.avatarSection}>
            <Pressable onPress={changeAvatar} style={styles.avatarWrapper} disabled={updating}>
              <Image source={{ uri: avatarUri }} style={styles.avatar} />
            </Pressable>
            <Pressable
              style={[styles.changeButton, updating && styles.changeButtonDisabled]}
              onPress={changeAvatar}
              disabled={updating}
            >
              {updating ? <ActivityIndicator color="#fff" /> : <Text style={styles.changeLabel}>Changer</Text>}
            </Pressable>
            <Pressable onPress={removeAvatar} disabled={updating}>
              <Text style={styles.removeLink}>Supprimer la photo</Text>
            </Pressable>
          </View>

          <Text style={styles.greeting}>Bonjour {firstName}</Text>
          <Text style={styles.emailText}>{session.email}</Text>
          <Text style={styles.description}>
            Tu es actuellement passager sur CampusRide.{'\n'}Tu peux aussi devenir conducteur pour proposer des trajets.
          </Text>

          <View style={styles.roles}>
            <Pressable
              style={({ pressed }) => [
                styles.roleCard,
                pressed && styles.roleCardPressed,
                styles.passengerCard,
              ]}
              onPress={() => router.replace('/')}
            >
              <View style={[styles.iconBadge, styles.passengerIcon]}>
                <IconSymbol name="figure.wave" size={22} color={Colors.secondary} />
              </View>
              <View style={styles.roleTexts}>
                <Text style={styles.roleTitle}>Passager</Text>
                <Text style={styles.roleSubtitle}>Trouver un trajet</Text>
              </View>
            </Pressable>

            <Pressable
              style={({ pressed }) => [
                styles.roleCard,
                styles.driverCard,
                pressed && styles.driverCardPressed,
              ]}
              onPress={() => router.replace('/driver-verification')}
            >
              <View style={[styles.iconBadge, styles.driverIcon]}>
                <IconSymbol name="car.fill" size={24} color="#fff" />
              </View>
              <View style={styles.roleTexts}>
                <Text style={[styles.roleTitle, styles.driverTitle]}>Devenir Conducteur</Text>
                <Text style={[styles.roleSubtitle, styles.driverSubtitle]}>Proposer mes trajets</Text>
              </View>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, justifyContent: 'center', padding: Spacing.lg },
  panel: {
    borderRadius: 36,
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.xl,
    backgroundColor: '#fff',
    gap: Spacing.lg,
  },
  avatarSection: {
    alignItems: 'center',
    gap: Spacing.sm,
  },
  avatarWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: '#fff',
  },
  avatar: { width: '100%', height: '100%' },
  changeButton: {
    backgroundColor: '#1A1A1A',
    paddingHorizontal: 20,
    paddingVertical: 6,
    borderRadius: Radius.pill,
  },
  changeButtonDisabled: { opacity: 0.6 },
  changeLabel: { color: '#fff', fontWeight: '700' },
  removeLink: { color: Colors.danger, fontWeight: '700' },
  greeting: { fontSize: 30, fontWeight: '800', color: Colors.ink, textAlign: 'center' },
  emailText: { color: Colors.gray600, textAlign: 'center' },
  description: { textAlign: 'center', color: Colors.gray700, lineHeight: 22 },
  roles: { gap: Spacing.md },
  roleCard: {
    borderRadius: 26,
    borderWidth: 2,
    borderColor: Colors.secondary,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    backgroundColor: '#fff',
  },
  roleCardPressed: {
    transform: [{ scale: 0.98 }],
  },
  passengerCard: {
    borderColor: '#7A5FFF',
  },
  iconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengerIcon: {
    backgroundColor: 'rgba(122,95,255,0.08)',
  },
  roleTexts: { flex: 1 },
  roleTitle: { fontWeight: '800', color: Colors.ink, fontSize: 18 },
  roleSubtitle: { color: Colors.gray600, fontSize: 14 },
  driverCard: {
    backgroundColor: '#FF9353',
    borderColor: '#7A5FFF',
  },
  driverCardPressed: {
    opacity: 0.9,
    transform: [{ scale: 0.98 }],
  },
  driverIcon: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  driverTitle: {
    color: '#fff',
  },
  driverSubtitle: {
    color: '#fff',
  },
});
