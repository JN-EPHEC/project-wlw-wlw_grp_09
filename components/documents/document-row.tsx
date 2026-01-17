import { ActivityIndicator, Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { Colors, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { IconSymbol } from '@/components/ui/icon-symbol';

export type DocumentRowProps = {
  title: string;
  subtitle?: string;
  icon?: Parameters<typeof IconSymbol>[0]['name'];
  hasDocument: boolean;
  statusText?: string;
  missingText?: string;
  addLabel?: string;
  actionLoading?: boolean;
  onAdd?: () => void;
  onPreview?: () => void;
  style?: ViewStyle;
};

export function DocumentRow({
  title,
  subtitle,
  icon,
  hasDocument,
  statusText,
  missingText,
  addLabel = 'Ajouter',
  actionLoading,
  onAdd,
  onPreview,
  style,
}: DocumentRowProps) {
  const showPreview = hasDocument && typeof onPreview === 'function';
  return (
    <View style={[styles.documentRow, style]}>
      <View style={styles.documentRowContent}>
        {icon ? (
          <View style={styles.documentIcon}>
            <IconSymbol name={icon} size={20} color={Colors.primary} />
          </View>
        ) : null}
        <View style={styles.documentTexts}>
          <Text style={styles.documentTitle}>{title}</Text>
          {subtitle ? <Text style={styles.documentSubtitle}>{subtitle}</Text> : null}
          {statusText ? <Text style={styles.documentStatus}>{statusText}</Text> : null}
        </View>
        {hasDocument ? (
          <Pressable
            style={({ pressed }) => [
              styles.documentBadge,
              pressed ? styles.documentBadgePressed : null,
            ]}
            onPress={showPreview ? onPreview : undefined}
            disabled={!showPreview}
            android_ripple={{ color: Colors.successLight }}
          >
            <Text style={styles.documentBadgeText}>V</Text>
          </Pressable>
        ) : null}
      </View>
      {!hasDocument ? (
        <View style={styles.documentActionRow}>
          {onAdd ? (
            <Pressable
              style={[
                styles.documentAction,
                styles.documentAddAction,
              ]}
              onPress={onAdd}
              disabled={Boolean(actionLoading)}
              android_ripple={{ color: Colors.accentSoft }}
            >
              {actionLoading ? (
                <ActivityIndicator color={Colors.primary} size="small" />
              ) : (
                <Text style={styles.documentAddLabel}>{addLabel}</Text>
              )}
            </Pressable>
          ) : missingText ? (
            <Text style={styles.documentMissingNotice}>{missingText}</Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  documentRow: {
    borderRadius: 16,
    padding: Spacing.md,
    backgroundColor: '#fff',
    gap: Spacing.sm,
    ...Shadows.card,
  },
  documentRowContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.md,
  },
  documentIcon: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadows.card,
  },
  documentTexts: {
    flex: 1,
  },
  documentTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.ink,
  },
  documentSubtitle: {
    fontSize: 12,
    color: Colors.gray500,
    marginTop: 2,
  },
  documentStatus: {
    fontSize: 11,
    color: Colors.success,
    marginTop: 4,
  },
  documentBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: Colors.success,
    alignItems: 'center',
    justifyContent: 'center',
  },
  documentBadgePressed: {
    opacity: 0.8,
  },
  documentBadgeText: {
    color: '#fff',
    fontWeight: '800',
  },
  documentActionRow: {
    marginTop: Spacing.sm,
  },
  documentAction: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  documentAddAction: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  documentAddLabel: {
    color: Colors.accent,
    fontWeight: '700',
    fontSize: 14,
  },
  documentMissingNotice: {
    color: Colors.gray500,
    fontSize: 12,
  },
});
