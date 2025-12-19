import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { PRIVACY_POLICY_SECTIONS, PRIVACY_POLICY_UPDATED_AT } from '@/constants/privacy-policy';

type PrivacyPolicyModalProps = {
  visible: boolean;
  onClose: () => void;
};

const C = Colors;

export const PrivacyPolicyModal = ({ visible, onClose }: PrivacyPolicyModalProps) => (
  <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
    <View style={styles.overlay}>
      <View style={styles.card}>
        <View style={styles.header}>
          <View style={styles.badge}>
            <IconSymbol name="lock.shield.fill" size={18} color={C.primary} />
            <Text style={styles.badgeText}>Protection des données</Text>
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.closeText}>Fermer</Text>
          </Pressable>
        </View>
        <Text style={styles.title}>Politique RGPD CampusRide</Text>
        <Text style={styles.meta}>Dernière mise à jour : {PRIVACY_POLICY_UPDATED_AT}</Text>
        <Text style={styles.subtitle}>
          Voici l’essentiel sur la façon dont nous protégeons tes informations personnelles en Belgique.
        </Text>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {PRIVACY_POLICY_SECTIONS.map((section) => (
            <View key={section.title} style={styles.section}>
              <Text style={styles.sectionTitle}>{section.title}</Text>
              <Text style={styles.sectionBody}>{section.body}</Text>
            </View>
          ))}
        </ScrollView>
        <Pressable style={styles.action} onPress={onClose}>
          <Text style={styles.actionText}>J’ai compris</Text>
        </Pressable>
      </View>
    </View>
  </Modal>
);

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    padding: Spacing.lg,
  },
  card: {
    backgroundColor: C.card,
    borderRadius: Radius['2xl'],
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: '85%',
    width: '100%',
    alignSelf: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    gap: Spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    backgroundColor: C.gray150,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  badgeText: {
    color: C.gray700,
    fontWeight: '700',
    fontSize: 12,
  },
  closeText: {
    color: C.primary,
    fontWeight: '700',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: C.ink,
  },
  meta: {
    color: C.gray500,
    fontSize: 12,
  },
  subtitle: {
    color: C.gray600,
    lineHeight: 20,
    fontSize: 13,
  },
  content: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontWeight: '700',
    color: C.ink,
    fontSize: 15,
  },
  sectionBody: {
    fontSize: 14,
    lineHeight: 20,
    color: C.gray700,
  },
  action: {
    marginTop: Spacing.sm,
    alignSelf: 'stretch',
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: 'center',
  },
  actionText: {
    color: C.white,
    fontWeight: '700',
    fontSize: 15,
  },
});

export default PrivacyPolicyModal;
