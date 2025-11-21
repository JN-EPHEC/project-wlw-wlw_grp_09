export type Area = {
  id: string;
  label: string;
  place: string;
  keywords?: string[];
};

export const AREAS: Area[] = [
  { id: 'etterbeek', label: 'Autour d’Etterbeek', place: 'Etterbeek' },
  { id: 'ixelles', label: 'Autour d’Ixelles', place: 'Ixelles' },
  { id: 'lln', label: 'Autour de Louvain-la-Neuve', place: 'EPHEC Louvain-la-Neuve', keywords: ['louvain-la-neuve', 'lln'] },
  { id: 'woluwe', label: 'Autour de Woluwé', place: 'EPHEC Woluwé', keywords: ['woluwe', 'woluwé'] },
];

export const MAX_RADIUS_KM = 30;

const normalise = (value: string) => value.trim().toLowerCase();

export const resolveAreaFromPlace = (place: string) => {
  const key = normalise(place);
  return AREAS.find((area) => {
    const placeKey = normalise(area.place);
    if (key.includes(placeKey)) return true;
    return area.keywords?.some((kw) => key.includes(normalise(kw))) ?? false;
  });
};
