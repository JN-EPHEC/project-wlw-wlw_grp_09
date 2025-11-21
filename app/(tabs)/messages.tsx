import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';

import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { GradientButton } from '@/components/ui/gradient-button';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { useAuthSession } from '@/hooks/use-auth-session';
import { useTabBarInset } from '@/hooks/use-tab-bar-inset';
import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
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
  const isCompact = width < 840;
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
    if (!activeThreadId || !threads.some((thread) => thread.id === activeThreadId)) {
      setActiveThreadId(threads[0].id);
    }
  }, [threads, activeThreadId]);

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

  const getThreadBadge = (thread: ThreadSnapshot) => {
    const other =
      thread.participants.find((participant) => participant.email.toLowerCase() !== myEmailKey) ??
      thread.participants[0];
    if (!other) return '';
    return other.role === 'driver' ? 'Conducteur' : other.role === 'passenger' ? 'Passager' : '';
  };

  const getUnreadCount = (thread: ThreadSnapshot) => thread.unreadBy[myEmailKey] ?? 0;

  const formatPreviewTime = (timestamp: number | null) => {
    if (!timestamp) return null;
    return new Date(timestamp).toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <AppBackground style={styles.screen}>
      <SafeAreaView style={[styles.safe, { paddingBottom: bottomInset }]}>
        <View style={styles.header}>
          <Text style={styles.title}>Messagerie</Text>
          <Text style={styles.subtitle}>
            Organise tes trajets sans partager ton numéro : toutes les conversations restent sur
            CampusRide. Tout échange en dehors de l’app est contraire aux règles et peut entraîner
            une suspension.
          </Text>
          <Text style={styles.identity}>Connecté en tant que {session.name ?? session.email ?? 'toi'}.</Text>
          {isCompact ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.threadChipRow}
            >
              {threads.map((thread) => {
                const selected = thread.id === activeThreadId;
                const unread = getUnreadCount(thread);
                return (
                  <Pressable
                    key={thread.id}
                    onPress={() => selectThread(thread.id)}
                    style={[styles.threadChip, selected && styles.threadChipSelected]}
                  >
                    <Text style={[styles.threadChipLabel, selected && styles.threadChipLabelSelected]}>
                      {getThreadPartnerLabel(thread)}
                    </Text>
                    {unread > 0 ? (
                      <View style={styles.threadChipBadge}>
                        <Text style={styles.threadChipBadgeText}>{unread}</Text>
                      </View>
                    ) : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          ) : null}
        </View>
        <View style={[styles.content, isCompact && styles.contentCompact]}>
          <GradientBackground
            colors={Gradients.card}
            style={[styles.threadList, isCompact && styles.threadListCompact]}
          >
            <FlatList
              data={threads}
              keyExtractor={(item) => item.id}
              ItemSeparatorComponent={() => <View style={styles.threadSeparator} />}
              contentContainerStyle={styles.threadListContent}
              showsVerticalScrollIndicator={!isCompact}
              renderItem={({ item }) => {
                const selected = item.id === activeThreadId;
                const partner = getThreadPartnerLabel(item);
                const badge = getThreadBadge(item);
                const unread = getUnreadCount(item);
                const timeLabel = formatPreviewTime(item.lastMessageAt);
                const preview = item.lastMessage ?? 'Soyez le premier à écrire';
                return (
                  <Pressable
                    onPress={() => selectThread(item.id)}
                    style={[
                      styles.threadItem,
                      selected && styles.threadItemSelected,
                      isCompact && styles.threadItemCompact,
                    ]}
                  >
                    <View style={styles.threadHeader}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.threadPartner}>{partner}</Text>
                        {badge ? <Text style={styles.threadBadge}>{badge}</Text> : null}
                      </View>
                      {timeLabel ? <Text style={styles.threadTime}>{timeLabel}</Text> : null}
                      {unread > 0 ? (
                        <View style={styles.unreadBadge}>
                          <Text style={styles.unreadText}>{unread}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={styles.threadRoute}>{item.routeLabel}</Text>
                    <Text style={styles.threadPreview} numberOfLines={1}>
                      {preview}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </GradientBackground>

          <GradientBackground
            colors={Gradients.card}
            style={[styles.conversation, isCompact && styles.conversationCompact]}
          >
            {activeThread ? (
              <>
                <View style={styles.conversationHeader}>
                  <IconSymbol name="bubble.left.and.bubble.right.fill" size={18} color={C.primary} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.conversationPartner}>{getThreadPartnerLabel(activeThread)}</Text>
                    <Text style={styles.conversationRoute}>{activeThread.routeLabel}</Text>
                  </View>
                </View>
                <FlatList
                  data={messages}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  contentContainerStyle={styles.messageList}
                  renderItem={({ item, index }) => {
                    const ownMessage = item.author.toLowerCase() === myEmailKey;
                    const isLast = index === messages.length - 1;
                    const statusLabel =
                      ownMessage && isLast ? getMessageStatusLabel(item.receipts) : null;
                    return (
                      <View
                        style={[
                          styles.messageBubble,
                          ownMessage ? styles.messageMine : styles.messageOther,
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
                        <View style={styles.messageFooter}>
                          <Text style={styles.messageMeta}>
                            {new Date(item.sentAt).toLocaleTimeString('fr-BE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </Text>
                          {!ownMessage ? (
                            <Pressable onPress={() => handleReport(item)} hitSlop={8}>
                              <Text style={styles.reportLink}>Signaler</Text>
                            </Pressable>
                          ) : null}
                        </View>
                        {statusLabel ? (
                          <Text
                            style={[
                              styles.messageStatus,
                              statusLabel === 'Vu' && styles.messageStatusSeen,
                            ]}
                          >
                            {statusLabel}
                          </Text>
                        ) : null}
                      </View>
                    );
                  }}
                />
                <KeyboardAvoidingView
                  behavior={Platform.select({ ios: 'padding', android: undefined })}
                  keyboardVerticalOffset={Platform.OS === 'ios' ? 96 : 0}
                >
                  <View style={styles.composer}>
                    <TextInput
                      placeholder="Écris ton message…"
                      placeholderTextColor={C.gray500}
                      value={draft}
                      onChangeText={setDraft}
                      style={styles.input}
                      multiline
                      autoCorrect
                      autoCapitalize="sentences"
                    />
                    <GradientButton
                      title="Envoyer"
                      onPress={sendMessage}
                      disabled={!draft.trim()}
                      style={styles.sendButton}
                    />
                  </View>
                </KeyboardAvoidingView>
              </>
            ) : (
              <View style={styles.emptyConversation}>
                <Text style={styles.emptyTitle}>Aucune conversation</Text>
                <Text style={styles.emptyDescription}>
                  Réserve un trajet ou publie-en un pour commencer à discuter avec la communauté.
                </Text>
              </View>
            )}
          </GradientBackground>
        </View>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  safe: { flex: 1 },
  header: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg, gap: Spacing.sm },
  title: { fontSize: 24, fontWeight: '800', color: C.ink },
  subtitle: { color: C.white, fontSize: 13, lineHeight: 18 },
  identity: { color: C.white, fontSize: 12 },
  threadChipRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    paddingVertical: Spacing.sm,
  },
  threadChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: Spacing.sm,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: 'rgba(122,95,255,0.25)',
    backgroundColor: 'rgba(255,255,255,0.6)',
  },
  threadChipSelected: {
    backgroundColor: C.primaryLight,
    borderColor: C.primary,
  },
  threadChipLabel: { fontSize: 12, color: C.gray700, fontWeight: '600' },
  threadChipLabelSelected: { color: C.primaryDark },
  threadChipBadge: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  threadChipBadgeText: { color: '#fff', fontSize: 10, fontWeight: '700' },
  content: {
    flex: 1,
    flexDirection: 'row',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  contentCompact: {
    flexDirection: 'column',
  },
  threadList: {
    width: 280,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.md,
    gap: Spacing.md,
  },
  threadListCompact: {
    width: '100%',
    maxHeight: 260,
  },
  threadListContent: { paddingBottom: Spacing.sm },
  threadSeparator: { height: 1, backgroundColor: 'rgba(0,0,0,0.05)', marginVertical: Spacing.xs },
  threadItem: { gap: 6, paddingVertical: Spacing.xs, paddingHorizontal: 2 },
  threadItemCompact: { paddingHorizontal: Spacing.sm },
  threadItemSelected: {
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: Radius.md,
    padding: Spacing.sm,
  },
  threadHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm },
  threadPartner: { fontWeight: '700', color: C.ink },
  threadBadge: { color: C.gray500, fontSize: 11, marginTop: 2 },
  threadTime: { color: C.gray500, fontSize: 11, marginRight: Spacing.xs },
  unreadBadge: {
    backgroundColor: C.primary,
    borderRadius: Radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  unreadText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  threadRoute: { color: C.gray500, fontSize: 12 },
  threadPreview: { color: C.gray600, fontSize: 12 },
  conversation: {
    flex: 1,
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
    padding: Spacing.lg,
    gap: Spacing.lg,
  },
  conversationCompact: {
    width: '100%',
    minHeight: 260,
  },
  conversationHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  conversationPartner: { fontWeight: '700', color: C.ink, fontSize: 16 },
  conversationRoute: { color: C.gray600, fontSize: 12 },
  messageList: {
    paddingBottom: Spacing.sm,
  },
  messageBubble: {
    maxWidth: '80%',
    borderRadius: 14,
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
    marginBottom: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 4 },
  },
  messageMine: { alignSelf: 'flex-end', backgroundColor: C.primaryLight },
  messageOther: { alignSelf: 'flex-start', backgroundColor: 'rgba(255,255,255,0.8)' },
  messageText: { fontSize: 13, lineHeight: 18 },
  messageTextMine: { color: C.primaryDark, fontWeight: '600' },
  messageTextOther: { color: C.gray700 },
  messageFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  messageMeta: { fontSize: 11, color: 'rgba(16,32,48,0.45)' },
  messageStatus: { fontSize: 11, color: C.gray600, marginTop: 4, alignSelf: 'flex-end' },
  messageStatusSeen: { color: C.success },
  reportLink: { fontSize: 11, color: C.danger, fontWeight: '700' },
  composer: {
    flexDirection: 'row',
    gap: Spacing.sm,
    alignItems: 'flex-end',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: Spacing.sm,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: C.gray300,
    padding: Spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.85)',
    color: C.ink,
  },
  sendButton: { alignSelf: 'flex-end', minWidth: 96 },
  emptyConversation: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.sm },
  emptyTitle: { fontWeight: '700', color: C.gray600 },
  emptyDescription: { color: C.gray500, fontSize: 12, textAlign: 'center', paddingHorizontal: Spacing.xl },
});
