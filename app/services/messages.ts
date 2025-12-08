// app/services/messages.ts
// In-memory messaging service with basic XOR "encryption", realtime listeners
// and notification hooks for the demo app.

import { pushNotification } from '@/app/services/notifications';

export type ThreadParticipant = {
  email: string;
  name?: string;
  role: 'driver' | 'passenger';
};

export type Message = {
  id: string;
  threadId: string;
  author: string;
  cipherBody: string;
  body: string;
  sentAt: number;
  reports: { reporter: string; reason: string; reportedAt: number }[];
  receipts: Record<string, 'sent' | 'received' | 'seen'>;
};

export type Thread = {
  id: string;
  rideId: string;
  routeLabel: string;
  createdAt: number;
  updatedAt: number;
  participants: ThreadParticipant[];
  unreadBy: Record<string, number>;
};

export type ThreadSnapshot = Thread & { lastMessage: string | null; lastMessageAt: number | null };

type ThreadListener = (threads: ThreadSnapshot[]) => void;
type MessageListener = (messages: Message[]) => void;

const SECRET = 'campusride-messaging-secret';

const threads: Record<string, Thread> = {};
const messages: Record<string, Message[]> = {};
const threadListeners: Record<string, ThreadListener[]> = {};
const messageListeners: Record<string, MessageListener[]> = {};

const seenSeedFor: Set<string> = new Set();

const randomId = () => Math.random().toString(36).slice(2, 10);

const encrypt = (value: string) => {
  const key = SECRET;
  const bytes = Array.from(value).map((char, index) => {
    const keyCode = key.charCodeAt(index % key.length);
    return char.charCodeAt(0) ^ keyCode;
  });
  return bytes.map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

const decrypt = (cipher: string) => {
  const key = SECRET;
  const bytes = cipher.match(/.{1,2}/g) ?? [];
  return bytes
    .map((hex, index) => {
      const value = parseInt(hex, 16);
      const keyCode = key.charCodeAt(index % key.length);
      return String.fromCharCode(value ^ keyCode);
    })
    .join('');
};

const cloneMessage = (message: Message): Message => ({
  ...message,
  reports: message.reports.map((report) => ({ ...report })),
  receipts: { ...message.receipts },
});

const cloneThread = (thread: Thread): Thread => ({
  ...thread,
  participants: thread.participants.map((p) => ({ ...p })),
  unreadBy: { ...thread.unreadBy },
});

const notifyThreadListeners = (email: string) => {
  const key = email.toLowerCase();
  const listeners = threadListeners[key];
  if (!listeners || listeners.length === 0) return;
  const snapshots = listThreadsForEmail(email);
  listeners.forEach((listener) => listener(snapshots));
};

const notifyMessageListeners = (threadId: string) => {
  const listeners = messageListeners[threadId];
  if (!listeners || listeners.length === 0) return;
  const list = messages[threadId] ?? [];
  const clones = list.map(cloneMessage);
  listeners.forEach((listener) => listener(clones));
};

const listThreadsForEmail = (email: string): ThreadSnapshot[] => {
  const key = email.toLowerCase();
  const relevant = Object.values(threads).filter((thread) =>
    thread.participants.some((participant) => participant.email.toLowerCase() === key)
  );
  return relevant
    .map((thread) => {
      const threadMessages = messages[thread.id] ?? [];
      const lastMessage = threadMessages[threadMessages.length - 1] ?? null;
      return {
        ...cloneThread(thread),
        lastMessage: lastMessage ? decrypt(lastMessage.cipherBody) : null,
        lastMessageAt: lastMessage?.sentAt ?? null,
      };
    })
    .sort((a, b) => (b.lastMessageAt ?? b.updatedAt) - (a.lastMessageAt ?? a.updatedAt));
};

export const subscribeThreads = (email: string, listener: ThreadListener) => {
  const key = email.toLowerCase();
  if (!threadListeners[key]) threadListeners[key] = [];
  threadListeners[key].push(listener);
  listener(listThreadsForEmail(email));
  return () => {
    const bucket = threadListeners[key];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const subscribeMessages = (threadId: string, listener: MessageListener) => {
  if (!messageListeners[threadId]) messageListeners[threadId] = [];
  messageListeners[threadId].push(listener);
  const list = messages[threadId] ?? [];
  listener(list.map(cloneMessage));
  return () => {
    const bucket = messageListeners[threadId];
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const createThread = ({
  rideId,
  routeLabel,
  participants,
}: {
  rideId: string;
  routeLabel: string;
  participants: ThreadParticipant[];
}) => {
  const id = `thread-${rideId}`;
  if (threads[id]) return threads[id];
  const now = Date.now();
  const thread: Thread = {
    id,
    rideId,
    routeLabel,
    createdAt: now,
    updatedAt: now,
    participants: participants.map((p) => ({ ...p })),
    unreadBy: participants.reduce<Record<string, number>>((acc, participant) => {
      acc[participant.email.toLowerCase()] = 0;
      return acc;
    }, {}),
  };
  threads[id] = thread;
  messages[id] = [];
  thread.participants.forEach((participant) => notifyThreadListeners(participant.email));
  return thread;
};

export const sendMessage = ({
  threadId,
  author,
  body,
}: {
  threadId: string;
  author: string;
  body: string;
}) => {
  const trimmed = body.trim();
  if (!trimmed) throw new Error('EMPTY_MESSAGE');
  const thread = threads[threadId];
  if (!thread) throw new Error('THREAD_NOT_FOUND');
  const now = Date.now();
  const cipherBody = encrypt(trimmed);
  const message: Message = {
    id: randomId(),
    threadId,
    author,
    cipherBody,
    body: trimmed,
    sentAt: now,
    reports: [],
    receipts: {},
  };
  if (!messages[threadId]) messages[threadId] = [];
  messages[threadId].push(message);
  thread.updatedAt = now;
  const authorKey = author.toLowerCase();
  thread.unreadBy[authorKey] = 0;
  thread.participants.forEach((participant) => {
    const emailKey = participant.email.toLowerCase();
    if (emailKey === authorKey) return;
    message.receipts[emailKey] = 'received';
    thread.unreadBy[emailKey] = (thread.unreadBy[emailKey] ?? 0) + 1;
    pushNotification({
      to: participant.email,
      title: 'Nouveau message',
      body: trimmed.length > 72 ? `${trimmed.slice(0, 69)}…` : trimmed,
      metadata: { threadId, rideId: thread.rideId },
    });
    notifyThreadListeners(participant.email);
  });
  notifyThreadListeners(author);
  notifyMessageListeners(threadId);
  return message;
};

export const markThreadAsRead = (threadId: string, email: string) => {
  const thread = threads[threadId];
  if (!thread) return;
  const key = email.toLowerCase();
  if (thread.unreadBy[key] !== undefined) {
    thread.unreadBy[key] = 0;
  }
  const list = messages[threadId];
  if (list && list.length) {
    list.forEach((message) => {
      if (message.receipts[key] && message.receipts[key] !== 'seen') {
        message.receipts[key] = 'seen';
      }
    });
    notifyMessageListeners(threadId);
  }
  notifyThreadListeners(email);
};

export const reportMessage = ({
  threadId,
  messageId,
  reporter,
  reason,
}: {
  threadId: string;
  messageId: string;
  reporter: string;
  reason: string;
}) => {
  const list = messages[threadId];
  if (!list) throw new Error('THREAD_NOT_FOUND');
  const message = list.find((item) => item.id === messageId);
  if (!message) throw new Error('MESSAGE_NOT_FOUND');
  message.reports.push({ reporter, reason, reportedAt: Date.now() });
  notifyMessageListeners(threadId);
  return message;
};

export const hasThreadBetween = (rideId: string) => {
  const id = `thread-${rideId}`;
  return !!threads[id];
};

export const ensureDemoThreads = (email: string) => {
  const key = email.toLowerCase();
  if (seenSeedFor.has(key)) return;
  seenSeedFor.add(key);

  const sampleThreads: {
    rideId: string;
    route: string;
    participants: ThreadParticipant[];
    messages: { author: string; body: string; offsetHours: number }[];
  }[] = [
    {
      rideId: 'ride-etterbeek-lln',
      route: 'Etterbeek → EPHEC LLN',
      participants: [
        { email: key, name: 'Toi', role: 'driver' },
        { email: 'amelie@students.ephec.be', name: 'Amélie', role: 'passenger' },
      ],
      messages: [
        { author: 'amelie@students.ephec.be', body: 'Hello ! Je peux embarquer ma valise cabine ?', offsetHours: -6 },
        { author: key, body: 'Oui bien sûr, je te garde la place arrière gauche.', offsetHours: -6 + 0.05 },
        { author: 'amelie@students.ephec.be', body: 'Merci ! On se retrouve sur le parking vélo.', offsetHours: -5.5 },
        { author: key, body: 'Parfait, j’y serai 10 minutes avant.', offsetHours: -5.25 },
      ],
    },
    {
      rideId: 'ride-woluwe-etterbeek',
      route: 'Woluwe → Etterbeek',
      participants: [
        { email: key, name: 'Toi', role: 'passenger' },
        { email: 'louis@students.ephec.be', name: 'Louis', role: 'driver' },
      ],
      messages: [
        { author: key, body: 'Salut Louis, est-ce que je peux prendre la place fenêtre ?', offsetHours: -12 },
        { author: 'louis@students.ephec.be', body: 'Yes, tu peux te mettre à l’arrière droite 👍', offsetHours: -12 + 0.15 },
        { author: key, body: 'Top, je passerai prendre un café en route.', offsetHours: -11.5 },
        { author: 'louis@students.ephec.be', body: 'Préviens-moi si tu es en avance 😉', offsetHours: -11.45 },
      ],
    },
    {
      rideId: 'ride-campus-tour',
      route: 'EPHEC LLN → Mons Expo',
      participants: [
        { email: key, name: 'Toi', role: 'passenger' },
        { email: 'charlotte@campusride.be', name: 'Charlotte', role: 'driver' },
      ],
      messages: [
        { author: 'charlotte@campusride.be', body: 'Hey ! Départ à 14h20 pile, ça te convient ?', offsetHours: -30 },
        { author: key, body: "Oui ça marche, je finis mon cours à 14h, je te rejoins direct.", offsetHours: -29.8 },
        { author: 'charlotte@campusride.be', body: 'Super, ramène ton badge étudiant pour le parking.', offsetHours: -29.75 },
        { author: key, body: 'Merci du rappel 🙌', offsetHours: -29.7 },
        { author: 'charlotte@campusride.be', body: 'Je t’enverrai ma plaque dans le chat plus tard.', offsetHours: -24 },
        { author: key, body: 'Reçu, à tout à l’heure !', offsetHours: -23.5 },
      ],
    },
  ];

  sampleThreads.forEach((entry) => {
    const thread = createThread({
      rideId: entry.rideId,
      routeLabel: entry.route,
      participants: entry.participants,
    });
    const now = Date.now();
    entry.messages.forEach((sample) => {
      const sentAt = now + sample.offsetHours * 60 * 60 * 1000;
      const message: Message = {
        id: randomId(),
        threadId: thread.id,
        author: sample.author,
        cipherBody: encrypt(sample.body),
        body: sample.body,
        sentAt,
        reports: [],
        receipts: thread.participants.reduce<Record<string, 'sent' | 'received' | 'seen'>>(
          (acc, participant) => {
            const participantKey = participant.email.toLowerCase();
            if (participantKey === sample.author.toLowerCase()) return acc;
            acc[participantKey] = sentAt < now ? 'seen' : 'received';
            return acc;
          },
          {}
        ),
      };
      if (!messages[thread.id]) messages[thread.id] = [];
      messages[thread.id].push(message);
    });
    messages[thread.id].sort((a, b) => a.sentAt - b.sentAt);
    thread.updatedAt = messages[thread.id][messages[thread.id].length - 1]?.sentAt ?? thread.createdAt;
    thread.participants.forEach((participant) => notifyThreadListeners(participant.email));
    notifyMessageListeners(thread.id);
  });
};
