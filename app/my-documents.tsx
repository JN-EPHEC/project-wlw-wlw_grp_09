import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import { Colors, Gradients, Radius, Shadows, Spacing } from '@/app/ui/theme';
import { GradientBackground } from '@/components/ui/gradient-background';
import { HeaderBackButton } from '@/components/ui/header-back-button';
import { DocumentRow } from '@/components/documents/document-row';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { pickProfileDocument } from '@/app/utils/image-picker';
import { useAuthSession } from '@/hooks/use-auth-session';
import { SharedDocumentKey, useDocumentStore } from '@/hooks/use-document-store';

export default function MyDocumentsScreen() {
  const router = useRouter();
  const session = useAuthSession();
  const backgroundColors = session.isDriver ? Gradients.driver : Gradients.twilight;
  const { documents: storedDocuments, setDocumentEntry } = useDocumentStore();

  type PreviewPayload = {
    title: string;
    url: string;
    sideKey: SharedDocumentKey;
    onReplace?: () => void;
  };
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [loadingDocument, setLoadingDocument] = useState<'licenseRecto' | 'licenseVerso' | null>(
    null
  );

  const openPreview = useCallback((payload: PreviewPayload) => {
    setLoadingPreview(true);
    setPreview(payload);
  }, []);

  const closePreview = () => {
    setPreview(null);
    setLoadingPreview(false);
  };

  const handlePickDocument = useCallback(
    async (key: 'licenseRecto' | 'licenseVerso') => {
      setLoadingDocument(key);
      try {
        const uri = await pickProfileDocument();
        if (uri) {
          const name =
            key === 'licenseRecto'
              ? 'Permis de conduire — Recto'
              : 'Permis de conduire — Verso';
          setDocumentEntry(key, { uri, name });
        }
      } finally {
        setLoadingDocument((current) => (current === key ? null : current));
      }
    },
    [setDocumentEntry]
  );

  const { licenseRecto, licenseVerso, studentCard } = storedDocuments;

  const documentRows = useMemo(
    () => [
      {
        key: 'license-front',
        title: 'Permis de conduire — Recto',
        subtitle: 'Recto du permis',
        icon: 'doc.text',
        hasDocument: Boolean(licenseRecto?.uri),
        statusText: licenseRecto ? 'Document enregistré' : undefined,
        actionLoading: loadingDocument === 'licenseRecto',
        onAdd: licenseRecto ? undefined : () => handlePickDocument('licenseRecto'),
        onPreview: licenseRecto
          ? () =>
              openPreview({
                title: 'Permis de conduire — Recto',
                url: licenseRecto.uri,
                sideKey: 'licenseRecto',
                onReplace: () => handlePickDocument('licenseRecto'),
              })
          : undefined,
      },
      {
        key: 'license-back',
        title: 'Permis de conduire — Verso',
        subtitle: 'Verso du permis',
        icon: 'doc.text',
        hasDocument: Boolean(licenseVerso?.uri),
        statusText: licenseVerso ? 'Document enregistré' : undefined,
        actionLoading: loadingDocument === 'licenseVerso',
        onAdd: licenseVerso ? undefined : () => handlePickDocument('licenseVerso'),
        onPreview: licenseVerso
          ? () =>
              openPreview({
                title: 'Permis de conduire — Verso',
                url: licenseVerso.uri,
                sideKey: 'licenseVerso',
                onReplace: () => handlePickDocument('licenseVerso'),
              })
          : undefined,
      },
      {
        key: 'student-card',
        title: 'Carte étudiant',
        subtitle: 'Carte liée à ton profil',
        icon: 'graduationcap.fill',
        hasDocument: Boolean(studentCard?.uri),
        statusText: studentCard ? 'Enregistrée' : undefined,
        onPreview: studentCard
          ? () =>
              openPreview({
                title: 'Carte étudiant',
                url: studentCard.uri,
                sideKey: 'studentCard',
              })
          : undefined,
        missingText: 'Ajout via Compléter mon profil',
      },
    ],
    [handlePickDocument, licenseRecto, licenseVerso, loadingDocument, openPreview, studentCard]
  );

  return (
    <GradientBackground colors={backgroundColors} style={styles.gradient}>
      <SafeAreaView style={styles.safe}>
        <ScrollView
          contentContainerStyle={styles.container}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topBar}>
            <HeaderBackButton onPress={() => router.push('/profile')} />
            <Text style={styles.topBarTitle}>Mes documents</Text>
          </View>
          <View style={styles.headerCard}>
            <View style={styles.headerIcon}>
              <IconSymbol name="shield.fill" size={22} color="#fff" />
            </View>
            <Text style={styles.headerTitle}>Mes documents</Text>
            <Text style={styles.headerDescription}>
              Visionne tes documents enregistrés et garde un œil sur leurs statuts.
            </Text>
          </View>
          <View style={[styles.card, styles.documentsCard]}>
            <Text style={styles.sectionTitle}>Documents enregistrés</Text>
            {documentRows.map((doc) => (
              <DocumentRow
                key={doc.key}
                title={doc.title}
                subtitle={doc.subtitle}
                icon={doc.icon}
                hasDocument={doc.hasDocument}
                statusText={doc.statusText}
                onPreview={doc.onPreview}
                missingText={doc.missingText}
              />
            ))}
          </View>
        </ScrollView>
        <Modal visible={Boolean(preview)} animationType="fade" transparent>
          <View style={styles.previewOverlay}>
            <View style={styles.previewContent}>
              <View style={styles.previewHeader}>
                <Text style={styles.previewTitle}>{preview?.title}</Text>
                <Pressable onPress={closePreview} style={styles.previewClose}>
                  <IconSymbol name="xmark" size={20} color={Colors.gray700} />
                </Pressable>
              </View>
              <View style={styles.previewBody}>
                {loadingPreview && <ActivityIndicator color={Colors.primary} size="large" />}
                {preview?.url ? (
                  <Image
                    source={{ uri: preview.url }}
                    style={styles.previewImage}
                    resizeMode="contain"
                    onLoadEnd={() => setLoadingPreview(false)}
                  />
                ) : (
                  <Text style={styles.previewError}>Aucun document disponible.</Text>
                )}
              </View>
              {preview?.onReplace ? (
                <Pressable
                  style={styles.previewReplaceButton}
                  onPress={preview.onReplace}
                  disabled={loadingDocument === preview.sideKey}
                  android_ripple={{ color: Colors.primaryLight }}
                >
                  {loadingDocument === preview.sideKey ? (
                    <ActivityIndicator color="#fff" size="small" />
                  ) : (
                    <Text style={styles.previewReplaceLabel}>Remplacer</Text>
                  )}
                </Pressable>
              ) : null}
              <Pressable style={styles.previewCloseButton} onPress={closePreview}>
                <Text style={styles.previewCloseLabel}>Fermer</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    </GradientBackground>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  safe: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  container: {
    flexGrow: 1,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.lg,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  topBarTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  headerCard: {
    borderRadius: 24,
    padding: Spacing.lg,
    backgroundColor: '#FFF4F0',
    gap: Spacing.sm,
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.primary,
  },
  headerDescription: {
    color: Colors.gray600,
    lineHeight: 20,
  },
  card: {
    borderRadius: 24,
    padding: Spacing.lg,
    backgroundColor: '#fff',
    gap: Spacing.md,
    ...Shadows.card,
  },
  documentsCard: {
    gap: Spacing.sm,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  previewOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.lg,
  },
  previewContent: {
    width: '100%',
    borderRadius: 24,
    backgroundColor: '#fff',
    overflow: 'hidden',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  previewTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: Colors.ink,
  },
  previewClose: {
    padding: Spacing.xs,
  },
  previewBody: {
    width: '100%',
    height: 320,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F5F5FB',
    borderRadius: 18,
    overflow: 'hidden',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewReplaceButton: {
    alignSelf: 'stretch',
    backgroundColor: Colors.accent,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: Spacing.sm,
  },
  previewReplaceLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  previewCloseButton: {
    alignSelf: 'stretch',
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: 12,
    alignItems: 'center',
  },
  previewCloseLabel: {
    color: '#fff',
    fontWeight: '700',
  },
  previewError: {
    color: Colors.gray500,
    textAlign: 'center',
  },
});
