const DISALLOWED_TERMS = [
  'idiot',
  'imbécile',
  'con',
  'conne',
  'stupide',
  'insulte',
  'merde',
  'pute',
  'bordel',
];

const normalize = (value: string) => value.trim().toLowerCase();

export const moderateComment = (raw: string | undefined | null) => {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const limited = trimmed.slice(0, 600);
  return DISALLOWED_TERMS.reduce((acc, term) => {
    const pattern = new RegExp(`\\b${term}\\b`, 'gi');
    return acc.replace(pattern, '***');
  }, limited);
};

export const containsBannedContent = (value: string | undefined | null) => {
  if (!value) return false;
  const normalized = normalize(value);
  return DISALLOWED_TERMS.some((term) => normalized.includes(term));
};
