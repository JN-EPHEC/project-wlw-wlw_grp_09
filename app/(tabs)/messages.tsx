import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { getAvatarUrl } from '@/app/ui/avatar';
import {
  ensureDemoThreads,
  markThreadAsRead,
  reportMessage,
  sendMessage as serviceSendMessage,
  subscribeMessages,
  subscribeThreads,
  type Message,
  type ThreadSnapshot,
} from '@/app/services/messages';

const C = Colors;

export default function MessagesScreen() {
  const session = useAuthSession();
  const { width } = useWindowDimensions();
  const isSplitLayout = width >= 960;
  const bottomInset = useTabBarInset(Spacing.lg);
  const [threads, setThreads] = useState<ThreadSnapshot[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');

  useEffect(() => {
    if (!session.email) return;
    ensureDemoThreads(session.email);
    const unsubscribe = subscribeThreads(session.email, (items) => {
      setThreads(items);
    });
    return unsubscribe;
  }, [session.email]);

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
    if (session.email) {
      markThreadAsRead(activeThreadId, session.email);
    }
    return unsubscribe;
  }, [activeThreadId, session.email]);

  useEffect(() => {
    if (!activeThreadId || !session.email) return;
    markThreadAsRead(activeThreadId, session.email);
  }, [messages.length, activeThreadId, session.email]);

  const selectThread = useCallback((id: string) => {
    setActiveThreadId(id);
  }, []);

  const activeThread = useMemo(
    () => threads.find((thread) => thread.id === activeThreadId) ?? null,
    [threads, activeThreadId]
  );

  const myEmail = session.email ?? '';
  const myEmailKey = myEmail.toLowerCase();

  const conversationPartner = activeThread
    ? activeThread.participants.find(
        (participant) => participant.email.toLowerCase() !== myEmailKey
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

  const userRole: 'passenger' | 'driver' =
    session.isDriver && !session.isPassenger ? 'driver' : 'passenger';
  const conversationGradient =
    userRole === 'passenger' ? ['#A474F9', '#E891C5'] : ['#F89B68', '#F89B68'];
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

  const handleReport = useCallback(
    (message: Message) => {
      if (!myEmail || !activeThreadId) return;
      const reasons = [
        { label: 'Spam ou publicité', value: 'spam' },
        { label: 'Comportement inapproprié', value: 'inappropriate' },
        { label: 'Demande hors CampusRide', value: 'off-platform' },
        { label: 'Autre', value: 'other' },
      ];
      Alert.alert(
        'Signaler ce message',
        'Sélectionne la raison du signalement. L’équipe CampusRide vérifiera rapidement.',
        [
          { text: 'Annuler', style: 'cancel' },
          ...reasons.map((reason) => ({
            text: reason.label,
            style: reason.value === 'other' ? 'destructive' : 'default',
            onPress: () => {
              reportMessage({
                threadId: activeThreadId,
                messageId: message.id,
                reporter: myEmail,
                reason: reason.value,
              });
              Alert.alert('Signalement envoyé', 'Merci, nous investiguons ce message.');
            },
          })),
        ]
      );
    },
    [activeThreadId, myEmail]
  );

  const getThreadPartnerLabel = (thread: ThreadSnapshot) => {
    const other =
      thread.participants.find((participant) => participant.email.toLowerCase() !== myEmailKey) ??
      thread.participants[0];
    return other?.name ?? other?.email ?? 'Conversation';
  };

  const getUnreadCount = (thread: ThreadSnapshot) => thread.unreadBy[myEmailKey] ?? 0;

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

  const renderThreadItem = ({ item }: { item: ThreadSnapshot }) => {
    const partner = getThreadPartnerLabel(item);
    const preview = item.lastMessage ?? 'Démarre la conversation';
    const unread = getUnreadCount(item);
    const isSelected = item.id === activeThreadId && (isSplitLayout || showConversationOnly);
    const timeLabel = formatRelativeLabel(item.lastMessageAt);
    const avatarUri = getAvatarUrl(partner ?? preview, 96);
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
      <Text style={styles.heading}>Messages</Text>
      <Text style={styles.subheading}>Vos conversations</Text>
      <GradientBackground colors={Gradients.card} style={styles.listCard}>
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          renderItem={renderThreadItem}
          contentContainerStyle={styles.threadListContent}
          ListEmptyComponent={() => (
            <View style={styles.emptyState}>
              <Text style={styles.emptyTitle}>Aucune conversation</Text>
              <Text style={styles.emptyDescription}>
                Réserve un trajet ou publie-en un pour démarrer un échange.
              </Text>
            </View>
          )}
          showsVerticalScrollIndicator={false}
        />
      </GradientBackground>
    </View>
  );

  const renderConversationView = () => (
    <GradientBackground colors={conversationGradient} style={styles.conversationCard}>
      {activeThread ? (
        <View style={styles.conversationWrapper}>
          <View style={styles.conversationHeader}>
            {!isSplitLayout ? (
              <Pressable
                onPress={() => setActiveThreadId(null)}
                accessibilityRole="button"
                style={styles.backButton}
              >
                <IconSymbol name="chevron.left" size={22} color="#FFFFFF" />
              </Pressable>
            ) : null}
            <Image source={{ uri: conversationPartnerAvatar }} style={styles.partnerAvatar} />
            <View style={styles.partnerMeta}>
              <Text style={styles.partnerName}>{conversationPartnerName}</Text>
              <Text style={styles.partnerStatus}>
                En ligne • {activeThread.routeLabel ?? 'Trajet CampusRide'}
              </Text>
            </View>
            <View style={styles.headerActions}>
              <Pressable accessibilityRole="button" style={styles.headerActionButton}>
                <IconSymbol name="phone.fill" size={18} color="#FFFFFF" />
              </Pressable>
              <Pressable accessibilityRole="button" style={styles.headerActionButton}>
                <IconSymbol name="ellipsis.circle" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
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
              const ownMessage = item.author.toLowerCase() === myEmailKey;
              const isLast = index === messages.length - 1;
              const statusLabel = ownMessage && isLast ? getMessageStatusLabel(item.receipts) : null;
              return (
                <View>
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
                      {!ownMessage ? (
                        <Pressable onPress={() => handleReport(item)} hitSlop={6}>
                          <Text style={styles.reportLink}>Signaler</Text>
                        </Pressable>
                      ) : null}
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
                placeholderTextColor="rgba(255,255,255,0.85)"
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
    </GradientBackground>
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
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1, paddingHorizontal: Spacing.lg },
  splitLayout: { flex: 1, flexDirection: 'row', gap: Spacing.lg },
  listSection: { flex: 1, gap: Spacing.sm },
  listSectionSplit: { flex: 0.9 },
  heading: { fontSize: 26, fontWeight: '800', color: C.white },
  subheading: { color: 'rgba(255,255,255,0.8)', fontSize: 14, marginBottom: Spacing.sm },
  listCard: {
    flex: 1,
    borderRadius: Radius.lg,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.1,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
  },
  threadListContent: { paddingVertical: Spacing.sm },
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
  conversationCard: {
    flex: 1,
    borderRadius: Radius.lg,
    padding: Spacing.lg,
    shadowColor: '#0B2545',
    shadowOpacity: 0.18,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
  },
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
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  partnerAvatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF' },
  partnerMeta: { flex: 1 },
  partnerName: { color: '#FFFFFF', fontSize: 18, fontWeight: '800' },
  partnerStatus: { color: 'rgba(255,255,255,0.9)', fontSize: 12 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  headerActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: { paddingBottom: Spacing.lg },
  daySeparator: { alignItems: 'center', marginVertical: Spacing.sm },
  daySeparatorText: {
    color: '#FFFFFF',
    fontSize: 12,
    paddingHorizontal: Spacing.md,
    paddingVertical: 4,
    borderRadius: Radius.pill,
    backgroundColor: 'rgba(255,255,255,0.25)',
    textTransform: 'capitalize',
  },
  messageBubble: {
    maxWidth: '85%',
    borderRadius: 20,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.xs,
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
    backgroundColor: '#FFFFFF',
  },
  messageText: { fontSize: 14, lineHeight: 20 },
  messageTextMine: { color: '#FFFFFF', fontWeight: '600' },
  messageTextOther: { color: C.gray700 },
  messageMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  messageMeta: { fontSize: 11, color: 'rgba(10, 18, 32, 0.6)' },
  reportLink: { fontSize: 11, color: C.danger, fontWeight: '700' },
  statusInline: {
    fontSize: 11,
    color: '#FFFFFF',
    alignSelf: 'flex-end',
    marginBottom: Spacing.sm,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
    marginTop: Spacing.md,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: Radius.pill,
  },
  inputField: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    color: '#FFFFFF',
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
  emptyConversationTitle: { color: '#FFFFFF', fontWeight: '800', fontSize: 18 },
  emptyConversationSubtitle: {
    color: 'rgba(255,255,255,0.9)',
    textAlign: 'center',
    fontSize: 13,
  },
});
