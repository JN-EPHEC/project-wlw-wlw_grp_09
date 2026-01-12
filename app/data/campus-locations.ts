export type CampusLocation = {
  name: string;
  icon: string;
  color: string;
  left: string;
  top: string;
  description: string;
};

export const CAMPUS_LOCATIONS: CampusLocation[] = [
  {
    name: 'EPHEC Woluwe',
    icon: 'house.fill',
    color: '#8F7FFE',
    left: '58%',
    top: '18%',
    description: 'Campus principal à Woluwe-Saint-Lambert.',
  },
  {
    name: 'EPHEC Delta',
    icon: 'graduationcap.fill',
    color: '#FFB26C',
    left: '18%',
    top: '60%',
    description: 'Campus Delta près de la gare.',
  },
  {
    name: 'EPHEC Louvain-la-Neuve',
    icon: 'graduationcap.fill',
    color: '#FF865F',
    left: '55%',
    top: '40%',
    description: 'Campus à Louvain-la-Neuve pour les Allers-retours.',
  },
  {
    name: 'EPHEC Schaerbeek',
    icon: 'doc.text',
    color: '#7ED0FF',
    left: '30%',
    top: '30%',
    description: 'Campus Schaerbeek, proche des transports en commun.',
  },
];
