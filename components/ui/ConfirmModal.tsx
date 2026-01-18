import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Colors, Radius, Shadows, Spacing } from '@/app/ui/theme';

type ConfirmModalProps = {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmDisabled?: boolean;
};

export function ConfirmModal({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  confirmDisabled = false,
}: ConfirmModalProps) {
  if (!visible) return null;
  return (
    <View style={styles.container}>
      <Pressable style={styles.backdrop} onPress={onCancel} />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.message}>{message}</Text>
        <View style={styles.actions}>
          <Pressable style={[styles.button, styles.cancelButton]} onPress={onCancel}>
            <Text style={styles.cancelText}>{cancelLabel}</Text>
          </Pressable>
          <Pressable
            style={[
              styles.button,
              styles.confirmButton,
              confirmDisabled && styles.disabledButton,
            ]}
            onPress={onConfirm}
            disabled={confirmDisabled}
          >
            <Text style={styles.confirmText}>{confirmLabel}</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  card: {
    width: '90%',
    maxWidth: 420,
    borderRadius: Radius['2xl'],
    backgroundColor: Colors.white,
    padding: Spacing.lg,
    gap: Spacing.sm,
    ...Shadows.card,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: Colors.ink,
  },
  message: {
    color: Colors.gray600,
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.sm,
    marginTop: Spacing.md,
  },
  button: {
    flex: 1,
    minWidth: 120,
    paddingVertical: Spacing.sm,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    backgroundColor: Colors.gray100,
  },
  confirmButton: {
    backgroundColor: Colors.primary,
  },
  cancelText: {
    color: Colors.gray800,
    fontWeight: '700',
  },
  confirmText: {
    color: Colors.white,
    fontWeight: '700',
  },
  disabledButton: {
    opacity: 0.6,
  },
});
