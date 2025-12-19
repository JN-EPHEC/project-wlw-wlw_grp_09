export type CampusLocation = {
  name: string;
  latitude: number;
  longitude: number;
  label?: string;
};

export const CAMPUS_LOCATIONS: CampusLocation[] = [
  {
    name: 'EPHEC Woluwe',
    label: 'Avenue Konrad Adenauer 3, 1200 Bruxelles',
    latitude: 50.8456,
    longitude: 4.4585,
  },
  {
    name: 'EPHEC Delta',
    label: 'Avenue Delta 5, 1050 Bruxelles',
    latitude: 50.8205,
    longitude: 4.4025,
  },
  {
    name: 'EPHEC Louvain-la-Neuve',
    label: 'Promenade de l’Alma 50, 1348 Ottignies-Louvain-la-Neuve',
    latitude: 50.6702,
    longitude: 4.6148,
  },
  {
    name: 'EPHEC Schaerbeek',
    label: 'Place de la Reine 1, 1030 Schaerbeek',
    latitude: 50.8726,
    longitude: 4.3816,
  },
  {
    name: 'ULB Solbosch',
    label: 'Avenue Franklin Roosevelt 50, 1050 Bruxelles',
    latitude: 50.8136,
    longitude: 4.3801,
  },
  {
    name: 'VUB Etterbeek',
    label: 'Pleinlaan 2, 1050 Bruxelles',
    latitude: 50.8229,
    longitude: 4.3959,
  },
  {
    name: 'UCLouvain Bruxelles Saint-Louis',
    label: 'Boulevard du Jardin Botanique 43, 1000 Bruxelles',
    latitude: 50.8544,
    longitude: 4.3606,
  },
  {
    name: 'UCLouvain Louvain-la-Neuve',
    label: 'Place de l’Université 1, 1348 Ottignies-Louvain-la-Neuve',
    latitude: 50.6685,
    longitude: 4.6155,
  },
  {
    name: 'UNamur',
    label: 'Rue de Bruxelles 61, 5000 Namur',
    latitude: 50.466,
    longitude: 4.861,
  },
];

export const findCampusLocation = (name: string | null | undefined) => {
  if (!name) return null;
  const normalized = name.trim().toLowerCase();
  return (
    CAMPUS_LOCATIONS.find((campus) => campus.name.trim().toLowerCase() === normalized) ?? null
  );
};
