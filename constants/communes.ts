export const BRUSSELS_COMMUNES = [
  'Anderlecht',
  'Auderghem',
  'Berchem-Sainte-Agathe',
  'Bruxelles-Ville',
  'Etterbeek',
  'Evere',
  'Forest',
  'Ganshoren',
  'Ixelles',
  'Jette',
  'Koekelberg',
  'Molenbeek-Saint-Jean',
  'Saint-Gilles',
  'Saint-Josse-ten-Noode',
  'Schaerbeek',
  'Uccle',
  'Watermael-Boitsfort',
  'Woluwe-Saint-Lambert',
  'Woluwe-Saint-Pierre',
] as const;

export type BrusselsCommune = (typeof BRUSSELS_COMMUNES)[number];
