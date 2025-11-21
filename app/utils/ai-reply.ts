import type { Review } from '@/app/services/reviews';

const niceReplyTemplates = [
  "Merci beaucoup pour ce retour positif ! Ravi d’avoir pu t’emmener à bon port 🚗",
  "Merci pour ta confiance, au plaisir de te revoir sur un prochain trajet !",
  "Super feedback, ça motive à continuer dans cette direction 🙌",
  "Tes mots font plaisir, merci d’avoir partagé ce moment de route !",
];

const neutralReplyTemplates = [
  "Merci pour ton message ! Je reste preneur de suggestions pour rendre le trajet encore plus agréable.",
  "Merci pour ton retour. N’hésite pas à me dire comment améliorer l’expérience la prochaine fois.",
  "Merci pour ton avis, je suis à l’écoute pour rendre la prochaine course au top !",
];

const improvementReplyTemplates = [
  "Merci pour ton honnêteté. Je prends note et ferai mieux sur le prochain trajet.",
  "Je suis désolé que l’expérience n’ait pas été parfaite. Merci pour ton retour, il m’aide à m’améliorer.",
  "Merci pour ce retour constructif, je vais corriger le tir dès le prochain trajet.",
  "Merci d’avoir pris le temps de m’expliquer, je vais ajuster pour la prochaine fois.",
];

const shuffle = <T,>(items: T[]) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

const suggestionPool = (review: Review | null) => {
  if (!review) return [];
  if (review.rating >= 4.5) {
    return niceReplyTemplates;
  }
  if (review.rating >= 3) {
    return neutralReplyTemplates;
  }
  return improvementReplyTemplates;
};

export const buildSmartReplies = (review: Review | null, count = 3) => {
  const pool = suggestionPool(review);
  if (!pool.length) return [];
  return shuffle(pool).slice(0, Math.min(count, pool.length));
};

export const buildSmartReply = (review: Review | null) => buildSmartReplies(review, 1)[0] ?? '';
