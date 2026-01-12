type BlockListener = (blockedEmails: string[]) => void;

const normalizeEmail = (email: string | null | undefined) =>
  email?.trim().toLowerCase() ?? '';

const blockedLists: Record<string, Set<string>> = {};
const listeners: Record<string, BlockListener[]> = {};

const getBucket = (email: string) => {
  const key = normalizeEmail(email);
  if (!blockedLists[key]) {
    blockedLists[key] = new Set();
  }
  if (!listeners[key]) {
    listeners[key] = [];
  }
  return { key, banned: blockedLists[key] };
};

const notify = (owner: string) => {
  const bucket = listeners[owner];
  if (!bucket) return;
  const snapshot = Array.from(blockedLists[owner] ?? []).sort();
  bucket.forEach((listener) => listener(snapshot));
};

export const blockUser = (ownerEmail: string, targetEmail: string) => {
  const owner = normalizeEmail(ownerEmail);
  const target = normalizeEmail(targetEmail);
  if (!owner || !target) return;
  const { key, banned } = getBucket(owner);
  if (banned.has(target)) return;
  banned.add(target);
  notify(key);
};

export const unblockUser = (ownerEmail: string, targetEmail: string) => {
  const owner = normalizeEmail(ownerEmail);
  const target = normalizeEmail(targetEmail);
  if (!owner || !target) return;
  const { key, banned } = getBucket(owner);
  if (!banned.has(target)) return;
  banned.delete(target);
  notify(key);
};

export const isUserBlocked = (ownerEmail: string, targetEmail: string) => {
  const owner = normalizeEmail(ownerEmail);
  const target = normalizeEmail(targetEmail);
  if (!owner || !target) return false;
  const { banned } = getBucket(owner);
  return banned.has(target);
};

export const subscribeBlockedUsers = (ownerEmail: string, listener: BlockListener) => {
  const { key, banned } = getBucket(ownerEmail);
  const bucket = listeners[key];
  bucket.push(listener);
  listener(Array.from(banned).sort());
  return () => {
    const index = bucket.indexOf(listener);
    if (index >= 0) bucket.splice(index, 1);
  };
};

export const getBlockedUsersSnapshot = (ownerEmail: string) => {
  const { banned } = getBucket(ownerEmail);
  return Array.from(banned).sort();
};

export const purgeBlockedReferences = (email: string) => {
  const key = normalizeEmail(email);
  if (!key) return;
  const ownerBucket = blockedLists[key];
  if (ownerBucket) {
    ownerBucket.clear();
  }
  Object.keys(blockedLists).forEach((owner) => {
    blockedLists[owner].delete(key);
  });
  const bucket = listeners[key];
  if (bucket) {
    bucket.length = 0;
  }
};
