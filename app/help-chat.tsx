import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Colors, Gradients, Radius, Spacing } from '@/app/ui/theme';
import { AppBackground } from '@/components/ui/app-background';
import { GradientBackground } from '@/components/ui/gradient-background';
import { IconSymbol } from '@/components/ui/icon-symbol';

type Author = 'assistant' | 'user';

type Message = {
  id: string;
  author: Author;
  body: string;
  timestamp: number;
};

const C = Colors;
const R = Radius;

const now = () => Date.now();

const seededMessages: Message[] = [
  {
    id: 'm-1',
    author: 'assistant',
    body: 'Salut 👋 Je suis Léa, ton assistante CampusRide. Comment puis-je t’aider aujourd’hui ?',
    timestamp: now() - 1000 * 30,
  },
  {
    id: 'm-2',
    author: 'assistant',
    body: 'Tu peux me poser des questions sur les trajets, la vérification conducteur ou ton compte.',
    timestamp: now() - 1000 * 25,
  },
];

const smartReplies = ['Statut de mon compte', 'Problème de réservation', 'Contacter un humain'];

const buildAssistantResponse = (prompt: string): string => {
  const normalized = prompt.trim().toLowerCase();
  if (!normalized) {
    return 'Peux-tu me donner quelques détails supplémentaires ?';
  }
  if (normalized.includes('statut') || normalized.includes('compte')) {
    return 'Ton compte est vérifié côté passager. Souhaites-tu que je vérifie aussi ta progression conducteur ?';
  }
  if (normalized.includes('reservation') || normalized.includes('réservation') || normalized.includes('trajet')) {
    return 'Je peux te guider pour retrouver ta réservation : ouvre l’onglet “Mes trajets” puis sélectionne le trajet souhaité. Tu veux que je t’envoie toutes les étapes ?';
  }
  if (normalized.includes('humain') || normalized.includes('agent') || normalized.includes('assist')) {
    return 'Pas de souci ! Je viens d’alerter notre équipe support. Un agent humain te répondra très vite dans ce chat.';
  }
  if (normalized.includes('verif') || normalized.includes('permis')) {
    return 'Pour finaliser ta vérification, assure-toi d’avoir importé ton permis (recto / verso) ainsi qu’une photo de ton véhicule. Tu veux que je t’envoie le lien direct ?';
  }
  return "Merci pour ton message ! Je regarde ça… Peux-tu m'en dire un peu plus pour que je t'oriente correctement ?";
};

export default function HelpChatScreen() {
  const [messages, setMessages] = useState<Message[]>(seededMessages);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages.length]);

  const quickReplies = useMemo(() => smartReplies, []);

  const appendMessage = (author: Author, body: string) => {
    setMessages((prev) => [
      ...prev,
      {
        id: `${author}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        author,
        body,
        timestamp: Date.now(),
      },
    ]);
  };

  const sendMessage = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    appendMessage('user', trimmed);
    setInput('');
    setTyping(true);
    setTimeout(() => {
      appendMessage('assistant', buildAssistantResponse(trimmed));
      setTyping(false);
    }, 900);
  };

  const useQuickReply = (value: string) => {
    setInput(value);
    setTimeout(sendMessage, 10);
  };

  return (
    <AppBackground colors={Gradients.background}>
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={24}
        >
          <GradientBackground colors={Gradients.card} style={styles.header}>
            <Pressable style={styles.backButton} onPress={() => router.back()}>
              <IconSymbol name="chevron.left" size={20} color={C.primary} />
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>Assistante CampusRide</Text>
              <Text style={styles.headerSubtitle}>Disponible 24h/24</Text>
            </View>
            <View style={styles.statusDot} />
          </GradientBackground>

          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.messages}
            showsVerticalScrollIndicator={false}
          >
            {messages.map((message) => (
              <View
                key={message.id}
                style={[
                  styles.messageBubble,
                  message.author === 'assistant'
                    ? styles.assistantBubble
                    : styles.userBubble,
                ]}
              >
                {message.author === 'assistant' ? (
                  <Text style={styles.assistantLabel}>Léa</Text>
                ) : null}
                <Text
                  style={[
                    styles.messageText,
                    message.author === 'assistant' ? styles.assistantText : styles.userText,
                  ]}
                >
                  {message.body}
                </Text>
              </View>
            ))}
            {typing ? (
              <View style={[styles.messageBubble, styles.assistantBubble]}>
                <Text style={[styles.messageText, styles.assistantText]}>…</Text>
              </View>
            ) : null}
          </ScrollView>

          <View style={styles.quickReplies}>
            {quickReplies.map((reply) => (
              <Pressable
                key={reply}
                style={styles.quickReplyChip}
                onPress={() => useQuickReply(reply)}
              >
                <Text style={styles.quickReplyText}>{reply}</Text>
              </Pressable>
            ))}
          </View>

          <View style={styles.inputBar}>
            <TextInput
              placeholder="Écris ton message…"
              placeholderTextColor={C.gray500}
              value={input}
              onChangeText={setInput}
              style={styles.input}
              multiline
            />
            <Pressable
              style={[styles.sendButton, !input.trim() && styles.sendButtonDisabled]}
              onPress={sendMessage}
              disabled={!input.trim()}
            >
              <IconSymbol name="paperplane.fill" size={20} color="#fff" />
            </Pressable>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </AppBackground>
  );
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
  },
  flex: {
    flex: 1,
    padding: Spacing.lg,
    gap: Spacing.md,
  },
  header: {
    borderRadius: R.lg,
    padding: Spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    shadowColor: '#0B2545',
    shadowOpacity: 0.07,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,131,71,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: C.ink,
  },
  headerSubtitle: {
    color: C.gray600,
    fontSize: 12,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#4CC38A',
  },
  messages: {
    flexGrow: 1,
    gap: Spacing.sm,
    paddingVertical: Spacing.md,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: Spacing.md,
    borderRadius: 18,
    borderBottomLeftRadius: 6,
    gap: 4,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(248,249,255,0.95)',
    borderWidth: 1,
    borderColor: 'rgba(21,23,43,0.08)',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: C.primary,
    borderBottomRightRadius: 6,
  },
  assistantLabel: {
    color: C.gray500,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  assistantText: {
    color: C.ink,
  },
  userText: {
    color: '#fff',
  },
  quickReplies: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  quickReplyChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.6)',
  },
  quickReplyText: {
    color: '#fff',
    fontWeight: '600',
    fontSize: 12,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: Spacing.sm,
    backgroundColor: '#fff',
    borderRadius: R.lg,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    shadowColor: '#0B2545',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    fontSize: 14,
    color: C.ink,
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonDisabled: {
    opacity: 0.4,
  },
});
