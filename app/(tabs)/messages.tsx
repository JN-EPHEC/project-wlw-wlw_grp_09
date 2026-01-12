import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams } from 'expo-router';

import { AppBackground } from '@/components/ui/app-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { WhiteRoundedContainer } from '@/components/ui/white-rounded-container';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { Colors, Radius, Spacing } from '@/app/ui/theme';
import { getAvatarUrl } from '@/app/ui/avatar';
import {
  ensureDemoThreads,
  markThreadAsRead,
  removeThread,
  sendMessage as serviceSendMessage,
  subscribeMessages,
  subscribeThreads,
  type Message,
  type ThreadSnapshot,
} from '@/app/services/messages';
import { createReport } from '@/app/services/reports';
import {
  blockUser,
  unblockUser,
} from '@/app/services/blocked-users';
import { useBlockedUsers } from '@/hooks/use-blocked-users';

const C = Colors;

export default function MessagesScreen() {
  const session = useAuthSession();
  const params = useLocalSearchParams<{ thread?: string }>();
  const { width } = useWindowDimensions();
  const isSplitLayout = width >= 960;
  const bottomInset = useTabBarInset(Spacing.lg);
  const threadOwnerEmail = session.email ?? 'demo@campusride.be';
  const [threads, setThreads] = useState<ThreadSnapshot[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [pendingThreadId, setPendingThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [optionsVisible, setOptionsVisible] = useState(false);

  useEffect(() => {
    ensureDemoThreads(threadOwnerEmail);
    const unsubscribe = subscribeThreads(threadOwnerEmail, (items) => {
      setThreads(items);
    });
    return unsubscribe;
  }, [threadOwnerEmail]);

  useEffect(() => {
    if (typeof params.thread === 'string' && params.thread.length > 0) {
      setPendingThreadId(params.thread);
    }
  }, [params.thread]);

  useEffect(() => {
    if (!pendingThreadId) return;
    const match = threads.find((thread) => thread.id === pendingThreadId);
    if (match) {
      setActiveThreadId(match.id);
      setPendingThreadId(null);
    }
  }, [pendingThreadId, threads]);

  useEffect(() => {
    if (!threads.length) {
      setActiveThreadId(null);
      return;
    }

    if (!isSplitLayout) {
      if (activeThreadId && !threads.some((thread) => thread.id === activeThreadId)) {
        setActiveThreadId(null);
      }
      return;
    }

    if (!activeThreadId || !threads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId, isSplitLayout]);

  useEffect(() => {
    if (!activeThreadId) {
      setMessages([]);
      return;
    }
    const unsubscribe = subscribeMessages(activeThreadId, (items) => {
      setMessages(items);
    });
    if (threadOwnerEmail) {
      markThreadAsRead(activeThreadId, threadOwnerEmail);
    }
    return unsubscribe;
  }, [activeThreadId, threadOwnerEmail]);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  useEffect(() => {
    if (!activeThreadId || !threadOwnerEmail) return;
    markThreadAsRead(activeThreadId, threadOwnerEmail);
  }, [messages.length, activeThreadId, threadOwnerEmail]);

  useEffect(() => {
    if (!activeThread) setOptionsVisible(false);
  }, [activeThread]);

  const selectThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const myEmail = session.email ?? '';
  const threadEmailKey = threadOwnerEmail.toLowerCase();

  const conversationPartner = activeThread
    ? activeThread.participants.find(
        (participant) => participant.email.toLowerCase() !== threadEmailKey
      ) ?? activeThread.participants[0]
    : null;
  const conversationPartnerName =
    conversationPartner?.name ?? conversationPartner?.email ?? 'Conversation';
  const conversationPartnerAvatar = useMemo(() => {
    if (conversationPartner?.email) {
      return getAvatarUrl(conversationPartner.email, 120);
    }
    return getAvatarUrl(conversationPartnerName, 120);
  }, [conversationPartner?.email, conversationPartnerName]);

  const blockedUsers = useBlockedUsers(session.email);
  const blockedSet = useMemo(() => new Set(blockedUsers), [blockedUsers]);
  const closeOptions = useCallback(() => setOptionsVisible(false), []);

  const partnerEmail = conversationPartner?.email ?? '';
  const partnerBlocked = partnerEmail
    ? blockedUsers.includes(partnerEmail.toLowerCase())
    : false;

  const handleViewProfile = useCallback(() => {
    closeOptions();
    Alert.alert('Profil utilisateur', `${conversationPartnerName} sera bientôt visible ici.`);
  }, [closeOptions, conversationPartnerName]);

  const handleReportUser = useCallback(() => {
    closeOptions();
    if (!session.email || !conversationPartner?.email) {
      Alert.alert('Signalement impossible', 'Participant introuvable.');
      return;
    }
    createReport({
      reporterEmail: session.email,
      targetEmail: conversationPartner.email,
      reason: 'inappropriate-behaviour',
      rideId: activeThread?.rideId ?? null,
      comment: `Signalement depuis la messagerie (${activeThread?.routeLabel ?? 'trajet'})`,
      metadata: {
        threadId: activeThread?.id,
      },
    });
    Alert.alert('Signalement envoyé', 'Notre équipe examinera rapidement cette demande.');
  }, [
    closeOptions,
    session.email,
    conversationPartner?.email,
    activeThread?.rideId,
    activeThread?.routeLabel,
    activeThread?.id,
  ]);

  const handleBlockUser = useCallback(() => {
    closeOptions();
    if (session.email && conversationPartner?.email) {
      blockUser(session.email, conversationPartner.email);
      Alert.alert(
        'Utilisateur bloqué',
        `${conversationPartnerName} ne peut plus t’envoyer de messages.`
      );
    }
  }, [closeOptions, conversationPartnerName, session.email, conversationPartner?.email]);

  const handleUnblockUser = useCallback(() => {
    closeOptions();
    if (session.email && conversationPartner?.email) {
      unblockUser(session.email, conversationPartner.email);
      Alert.alert('Utilisateur débloqué', `${conversationPartnerName} peut de nouveau te contacter.`);
    }
  }, [closeOptions, conversationPartnerName, session.email, conversationPartner?.email]);

  const handleDeleteConversation = useCallback(() => {
    if (!activeThread) return;
    closeOptions();
    Alert.alert(
      'Supprimer la conversation',
      'Tous les messages seront supprimés définitivement. Continuer ?',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: () => {
            try {
              removeThread(activeThread.id);
              setActiveThreadId(null);
              Alert.alert('Conversation supprimée', 'La conversation a été supprimée.');
            } catch (error) {
              const message =
                error instanceof Error ? error.message : 'Impossible de supprimer la conversation.';
              Alert.alert('Erreur', message);
            }
          },
        },
      ]
    );
  }, [activeThread, closeOptions]);

  const handleConversationOptions = useCallback(() => {
    if (!activeThread) return;
    setOptionsVisible(true);
  }, [activeThread]);

  const userRole: 'passenger' | 'driver' =
    session.isDriver && !session.isPassenger ? 'driver' : 'passenger';
  const bubbleAccent = userRole === 'passenger' ? '#F89B68' : '#A474F9';

  const sendMessage = useCallback(() => {
    const trimmed = draft.trim();
    if (!activeThreadId || !trimmed || !myEmail) return;
    try {
      serviceSendMessage({ threadId: activeThreadId, author: myEmail, body: trimmed });
      setDraft('');
    } catch (error) {
      Alert.alert(
        'Envoi impossible',
        error instanceof Error ? error.message : 'Impossible d’envoyer le message.'
      );
    }
  }, [activeThreadId, draft, myEmail]);

  const getMessageStatusLabel = useCallback((receipts: Message['receipts']) => {
    const values = Object.values(receipts ?? {});
    if (values.includes('seen')) return 'Vu';
    if (values.includes('received')) return 'Reçu';
    return 'Envoyé';
  }, []);

  const getThreadPartnerLabel = (thread: ThreadSnapshot) => {
    const other =
      thread.participants.find((participant) => participant.email.toLowerCase() !== threadEmailKey) ??
      thread.participants[0];
    return other?.name ?? other?.email ?? 'Conversation';
  };

  const getThreadPartnerKey = (thread: ThreadSnapshot) => {
    const other =
      thread.participants.find((participant) => participant.email.toLowerCase() !== threadEmailKey) ??
      thread.participants[0];
    return other?.email?.toLowerCase() ?? '';
  };

  const getUnreadCount = (thread: ThreadSnapshot) => thread.unreadBy[threadEmailKey] ?? 0;

  const formatRelativeLabel = (timestamp: number | null) => {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) {
      return date.toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
    }
    if (diffDays === 1) return 'Hier';
    if (diffDays < 7) return `Il y a ${diffDays} jours`;
    return date.toLocaleDateString('fr-BE', { day: 'numeric', month: 'short' });
  };

  const formatDayLabel = (timestamp: number) =>
    new Date(timestamp).toLocaleDateString('fr-BE', {
      weekday: 'long',
      day: 'numeric',
      month: 'short',
    });

  const showConversationOnly = !isSplitLayout && !!activeThreadId;

  const activeThreads = useMemo(
    () =>
      threads.filter((thread) => {
        const partnerKey = getThreadPartnerKey(thread);
        return partnerKey && !blockedSet.has(partnerKey);
      }),
    [threads, blockedSet]
  );

  const archivedThreads = useMemo(
    () =>
      threads.filter((thread) => {
        const partnerKey = getThreadPartnerKey(thread);
        return !!partnerKey && blockedSet.has(partnerKey);
      }),
    [threads, blockedSet]
  );

  useEffect(() => {
    if (!activeThread) return;
    const partner =
      activeThread.participants.find((participant) => participant.email.toLowerCase() !== threadEmailKey) ??
      activeThread.participants[0];
    const partnerKey = partner?.email?.toLowerCase() ?? '';
    if (!partnerKey || !blockedSet.has(partnerKey)) return;
    if (!isSplitLayout) {
      setActiveThreadId(null);
      return;
    }
    const nextActive = activeThreads[0];
    setActiveThreadId(nextActive ? nextActive.id : null);
  }, [activeThread, activeThreads, blockedSet, isSplitLayout, threadEmailKey]);

  const renderThreadItem = ({ item }: { item: ThreadSnapshot }) => {
    const partner = getThreadPartnerLabel(item);
    const preview = item.lastMessage ?? 'Démarre la conversation';
    const unread = getUnreadCount(item);
    const isSelected = item.id === activeThreadId && (isSplitLayout || showConversationOnly);
    const timeLabel = formatRelativeLabel(item.lastMessageAt);
    const avatarUri = getAvatarUrl(partner ?? preview, 96);
    const threadBlocked = blockedSet.has(getThreadPartnerKey(item));
    return (
      <Pressable
        onPress={() => selectThread(item.id)}
        style={[styles.threadCard, (unread > 0 || isSelected) && styles.threadCardActive]}
        accessibilityRole="button"
      >
        <Image source={{ uri: avatarUri }} style={styles.threadAvatar} />
        <View style={styles.threadInfo}>
          <View style={styles.threadHeaderRow}>
            <Text style={styles.threadName}>{partner}</Text>
            {timeLabel ? <Text style={styles.threadTime}>{timeLabel}</Text> : null}
          </View>
          {threadBlocked ? (
            <View style={styles.threadTag}>
              <Text style={styles.threadTagText}>Bloqué</Text>
            </View>
          ) : null}
          <Text style={styles.threadPreview} numberOfLines={1}>
            {preview}
          </Text>
        </View>
        {unread > 0 ? (
          <View style={styles.unreadTag}>
            <Text style={styles.unreadTagText}>{unread}</Text>
          </View>
        ) : null}
      </Pressable>
    );
  };

  const renderThreadList = () => (
    <View style={[styles.listSection, isSplitLayout && styles.listSectionSplit]}>
      <WhiteRoundedContainer edgeSpacing={Spacing.xl} style={styles.listCard}>
        <View style={styles.listHeader}>
          <Text style={styles.heading}>Messages</Text>
          <Text style={styles.subheading}>Vos conversations</Text>
        </View>
        <FlatList
          data={activeThreads}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderThreadItem}
          contentContainerStyle={styles.threadListContent}
          ListEmptyComponent={() =>
            archivedThreads.length > 0 ? null : (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>Aucune conversation</Text>
                <Text style={styles.emptyDescription}>
                  Réserve un trajet ou publie-en un pour démarrer un échange.
                </Text>
              </View>
            )
          }
          ListFooterComponent={
            archivedThreads.length > 0 ? (
              <View style={styles.archiveSection}>
                <Text style={styles.archiveTitle}>Conversations archivées</Text>
                {archivedThreads.map((thread, index) => (
                  <View key={thread.id}>
                    {renderThreadItem({ item: thread })}
                    {index < archivedThreads.length - 1 ? <View style={styles.separator} /> : null}
                  </View>
                ))}
              </View>
            ) : null
          }
          ListFooterComponentStyle={styles.archiveFooter}
          showsVerticalScrollIndicator={false}
        />
      </WhiteRoundedContainer>
    </View>
  );

  const renderConversationView = () => (
    <View
      style={[
        styles.conversationSection,
        isSplitLayout ? styles.conversationSectionSplit : styles.conversationSectionStandalone,
      ]}
    >
      <WhiteRoundedContainer edgeSpacing={Spacing.xl} style={styles.conversationCard}>
        {activeThread ? (
          <View style={styles.conversationWrapper}>
            <View style={styles.conversationHeader}>
              {!isSplitLayout ? (
                <Pressable
                  onPress={() => setActiveThreadId(null)}
                  accessibilityRole="button"
                  style={styles.backButton}
                >
                  <IconSymbol name="chevron.left" size={22} color={C.primary} />
                </Pressable>
              ) : null}
              <Image source={{ uri: conversationPartnerAvatar }} style={styles.partnerAvatar} />
              <View style={styles.partnerMeta}>
                <View style={styles.partnerNameRow}>
                  <Text style={styles.partnerName}>{conversationPartnerName}</Text>
                  {partnerBlocked ? (
                    <View style={styles.partnerBlocked}>
                      <IconSymbol name="slash.circle.fill" size={16} color={C.danger} />
                      <Text style={styles.partnerBlockedLabel}>Bloqué</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.partnerStatus}>
                  En ligne • {activeThread.routeLabel ?? 'Trajet CampusRide'}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                style={styles.headerActionButton}
                onPress={handleConversationOptions}
              >
                <IconSymbol name="ellipsis.vertical" size={20} color={C.primary} />
              </Pressable>
            </View>

            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.messageList}
              renderItem={({ item, index }) => {
                const prev = messages[index - 1];
                const showSeparator =
                  !prev ||
                  new Date(prev.sentAt).toDateString() !== new Date(item.sentAt).toDateString();
                const ownMessage = item.author.toLowerCase() === threadEmailKey;
                const isLast = index === messages.length - 1;
                const statusLabel =
                  ownMessage && isLast ? getMessageStatusLabel(item.receipts) : null;
                return (
                  <View style={styles.messageItem}>
                    {showSeparator ? (
                      <View style={styles.daySeparator}>
                        <Text style={styles.daySeparatorText}>{formatDayLabel(item.sentAt)}</Text>
                      </View>
                    ) : null}
                    <View
                      style={[
                        styles.messageBubble,
                        ownMessage ? styles.messageMine : styles.messageOther,
                        ownMessage && { backgroundColor: bubbleAccent },
                      ]}
                    >
                      <Text
                        style={[
                          styles.messageText,
                          ownMessage ? styles.messageTextMine : styles.messageTextOther,
                        ]}
                      >
                        {item.body}
                      </Text>
                      <View style={styles.messageMetaRow}>
                        <Text style={styles.messageMeta}>
                          {new Date(item.sentAt).toLocaleTimeString('fr-BE', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </View>
                    </View>
                    {ownMessage && statusLabel ? (
                      <Text style={styles.statusInline}>{statusLabel}</Text>
                    ) : null}
                  </View>
                );
              }}
            />

            <KeyboardAvoidingView
              behavior={Platform.select({ ios: 'padding', android: undefined })}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
            >
              <View style={styles.inputBar}>
                <TextInput
                  placeholder="Écris ton message…"
                  placeholderTextColor={C.gray400}
                  value={draft}
                  onChangeText={setDraft}
                  style={styles.inputField}
                  multiline
                />
                <Pressable
                  onPress={sendMessage}
                  disabled={!draft.trim()}
                  style={[styles.sendButton, !draft.trim() && styles.sendButtonDisabled]}
                  accessibilityRole="button"
                >
                  <IconSymbol name="paperplane.fill" size={18} color="#FFFFFF" />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
        ) : (
          <View style={styles.emptyConversation}>
            <Text style={styles.emptyConversationTitle}>Sélectionne une conversation</Text>
            <Text style={styles.emptyConversationSubtitle}>
              Choisis un conducteur ou un passager pour ouvrir la discussion.
            </Text>
          </View>
        )}
      </WhiteRoundedContainer>
    </View>
  );

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={[styles.safe, { paddingBottom: bottomInset }]}> 
        {isSplitLayout ? (
          <View style={styles.splitLayout}>
            {renderThreadList()}
            {renderConversationView()}
          </View>
        ) : showConversationOnly ? (
          renderConversationView()
        ) : (
          renderThreadList()
        )}
      </SafeAreaView>
      {optionsVisible ? (
        <Modal
          transparent
          animationType="fade"
          visible={optionsVisible}
          onRequestClose={closeOptions}
        >
          <View style={styles.optionsOverlay}>
            <Pressable style={styles.optionsBackdrop} onPress={closeOptions} />
              <View style={styles.optionsMenu}>
                <Text style={styles.optionsTitle}>Discussion</Text>
                <Pressable style={styles.optionsItem} onPress={handleViewProfile}>
                  <Text style={styles.optionsItemText}>Voir le profil</Text>
                  <IconSymbol name="chevron.right" size={16} color={C.gray400} />
                </Pressable>
                <View style={styles.optionsDivider} />
                <Pressable style={styles.optionsItem} onPress={handleReportUser}>
                  <Text style={[styles.optionsItemText, styles.optionsDestructive]}>
                    Signaler cet utilisateur
                  </Text>
                </Pressable>
                {partnerBlocked ? (
                  <Pressable style={styles.optionsItem} onPress={handleUnblockUser}>
                    <Text style={[styles.optionsItemText, styles.optionsDestructive]}>
                      Débloquer cet utilisateur
                    </Text>
                  </Pressable>
                ) : (
                  <Pressable style={styles.optionsItem} onPress={handleBlockUser}>
                    <Text style={[styles.optionsItemText, styles.optionsDestructive]}>
                      Bloquer cet utilisateur
                    </Text>
                  </Pressable>
                )}
                <View style={styles.optionsDivider} />
                <Pressable style={styles.optionsItem} onPress={handleDeleteConversation}>
                  <Text style={[styles.optionsItemText, styles.optionsDestructive]}>
                    Supprimer la conversation
                  </Text>
                </Pressable>
              </View>
            </View>
        </Modal>
      ) : null}
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1, paddingHorizontal: Spacing.lg },
  splitLayout: { flex: 1, flexDirection: 'row', gap: Spacing.lg },
  listSection: { flex: 1 },
  listSectionSplit: { flex: 0.9 },
  listHeader: { marginBottom: Spacing.md },
  heading: {
    fontSize: 32,
    fontWeight: '800',
    color: C.ink,
    letterSpacing: -0.5,
    textShadowColor: 'rgba(148,115,255,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  subheading: {
    color: C.gray500,
    fontSize: 15,
    marginTop: Spacing.xs,
    fontWeight: '600',
  },
  listCard: { flex: 1, marginVertical: Spacing.md },
  threadListContent: { paddingVertical: Spacing.sm },
  archiveSection: {
    marginTop: Spacing.lg,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.gray200,
    gap: Spacing.sm,
  },
  archiveTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: Colors.gray500,
  },
  archiveFooter: {
    paddingBottom: Spacing.lg,
  },
  separator: { height: Spacing.sm },
  threadCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.sm,
    borderRadius: Radius.lg,
    backgroundColor: 'rgba(248,248,255,0.8)',
    gap: Spacing.sm,
  },
  threadCardActive: {
    backgroundColor: 'rgba(250,230,255,0.95)',
    shadowColor: '#8C5CF5',
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  threadAvatar: { width: 48, height: 48, borderRadius: 24 },
  threadInfo: { flex: 1 },
  threadHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', gap: Spacing.xs },
  threadName: { fontSize: 15, fontWeight: '700', color: C.ink },
  threadTime: { fontSize: 12, color: C.gray500 },
  threadPreview: { fontSize: 13, color: C.gray600, marginTop: 2 },
  threadTag: {
    marginTop: Spacing.xs / 2,
    alignSelf: 'flex-start',
    backgroundColor: '#FFE8ED',
    borderRadius: Radius.xl,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs / 2,
    marginBottom: Spacing.xs / 2,
  },
  threadTagText: { color: '#C02424', fontWeight: '700', fontSize: 11 },
  unreadTag: {
    minWidth: 24,
    paddingHorizontal: Spacing.xs,
    paddingVertical: 2,
    borderRadius: Radius.pill,
    backgroundColor: Colors.primary,
    alignItems: 'center',
  },
  unreadTagText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  emptyState: { alignItems: 'center', paddingVertical: Spacing.xl, gap: Spacing.xs },
  emptyTitle: { fontWeight: '700', color: C.gray600 },
  emptyDescription: { color: C.gray500, textAlign: 'center', fontSize: 13 },
  conversationSection: { flex: 1 },
  conversationSectionSplit: { flex: 1 },
  conversationSectionStandalone: { flex: 1 },
  conversationCard: { flex: 1, marginVertical: Spacing.md },
  conversationWrapper: { flex: 1 },
  conversationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1ECFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF' },
  partnerMeta: {
    flex: 1,
  },
  partnerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
  },
  partnerName: {
    color: C.ink,
    fontSize: 18,
    fontWeight: '800',
  },
  partnerBlocked: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs / 2,
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: Radius.pill,
    paddingHorizontal: Spacing.xs,
    paddingVertical: Spacing.xs / 2,
  },
  partnerBlockedLabel: {
    color: C.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  partnerStatus: {
    color: C.gray500,
    fontSize: 12,
  },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1ECFF',
    borderWidth: 1,
    borderColor: 'rgba(122,95,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: { paddingBottom: Spacing.xl },
  messageItem: { marginBottom: Spacing.md },
  daySeparator: { alignItems: 'center', marginVertical: Spacing.md },
  daySeparatorText: {
    color: C.gray700,
    fontSize: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: '#F3EEFF',
    textTransform: 'capitalize',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 20,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: 0,
    shadowColor: '#0B2545',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 6 },
  },
  messageMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#F89B68',
  },
  messageOther: {
    alignSelf: 'flex-start',
    backgroundColor: '#F5F2FF',
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageTextMine: { color: '#FFFFFF', fontWeight: '600' },
  messageTextOther: { color: C.gray700 },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: 6,
  },
  messageMeta: { fontSize: 11, color: 'rgba(10, 18, 32, 0.6)' },
  statusInline: {
    fontSize: 11,
    color: C.gray500,
    alignSelf: 'flex-end',
    marginBottom: Spacing.sm,
    marginTop: Spacing.xs,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: '#F1ECFF',
    borderRadius: Radius.pill,
  },
  inputField: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    color: C.ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FF8347',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: { opacity: 0.5 },
  emptyConversation: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.sm,
    paddingHorizontal: Spacing.xl,
  },
  emptyConversationTitle: { color: C.ink, fontWeight: '800', fontSize: 18 },
  emptyConversationSubtitle: {
    color: C.gray600,
    textAlign: 'center',
    fontSize: 13,
  },
  optionsOverlay: {
    flex: 1,
    paddingHorizontal: Spacing.xl,
    paddingTop: Spacing.xxl,
    justifyContent: 'flex-start',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(12, 6, 31, 0.25)',
  },
  optionsBackdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  optionsMenu: {
    width: 240,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    padding: Spacing.md,
    gap: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.12,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
  },
  optionsTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: C.gray500,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  optionsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: Spacing.xs,
  },
  optionsItemText: {
    fontSize: 15,
    color: C.ink,
    fontWeight: '600',
  },
  optionsDivider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(10, 22, 50, 0.08)',
  },
  optionsDestructive: {
    color: C.danger,
  },
});
