import { Colors } from '@/app/ui/theme';

const C = Colors;

export const formatOptions = [
  'Banner horizontal (99€/mois)',
  'Banner carré (149€/mois)',
  'Package premium (299€/mois)',
];

export const budgetOptions = ['Starter (50-150€/mois)', 'Boost (150-300€/mois)', 'Scale (300-500€/mois)'];

export const steps = [
  'Nous recevons votre demande',
  'Notre équipe analyse vos besoins',
  'Vous recevez un devis personnalisé sous 48h',
  'Nous planifions ensemble votre campagne',
];

export const confirmationTiles = [
  {
    title: 'Demande reçue',
    description: 'Votre demande a été transmise à notre équipe commerciale',
    icon: 'checkmark.seal.fill' as const,
    tint: C.success,
  },
  {
    title: 'Email de confirmation',
    description: 'Vérifiez votre boîte mail pour la confirmation',
    icon: 'envelope.fill' as const,
    tint: C.secondaryDark,
  },
  {
    title: 'Réponse sous 48h',
    description: 'Notre équipe vous enverra un devis personnalisé',
    icon: 'calendar',
    tint: C.primary,
  },
];
