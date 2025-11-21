const PALETTE = ['#FFE1D6', '#E3ECFB', '#DCFCE7', '#FDE68A', '#FBCFE8', '#E0E7FF'];

export const getAvatarColor = (value: string) => {
  const key = value.trim().toLowerCase();
  if (!key) return PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash << 5) - hash + key.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % PALETTE.length;
  return PALETTE[index];
};

const clampSize = (size: number) => Math.max(48, Math.min(256, Math.round(size)));

const PRESET_AVATARS: Record<string, string> = {
  'bilal.nasser@ephec.be': 'https://randomuser.me/api/portraits/men/52.jpg',
  'lina.dupont@ephec.be': 'https://randomuser.me/api/portraits/women/68.jpg',
  'eya.azouzi@ephec.be': 'https://randomuser.me/api/portraits/women/24.jpg',
};

const PRESET_BY_NAME: Record<string, string> = {
  bilal: 'https://randomuser.me/api/portraits/men/52.jpg',
  lina: 'https://randomuser.me/api/portraits/women/68.jpg',
  eya: 'https://randomuser.me/api/portraits/women/24.jpg',
};

export const getAvatarUrl = (value: string, size = 96) => {
  const seed = value.trim().toLowerCase() || 'campusride';
  const clampedSize = clampSize(size);
  const presetByEmail = PRESET_AVATARS[seed];
  if (presetByEmail) return `${presetByEmail}?size=${clampedSize}`;
  const firstToken = seed.split(/[@.\s]/)[0] ?? '';
  const presetByName = PRESET_BY_NAME[firstToken];
  if (presetByName) return `${presetByName}?size=${clampedSize}`;
  return `https://i.pravatar.cc/${clampedSize}?u=${encodeURIComponent(seed)}`;
};
