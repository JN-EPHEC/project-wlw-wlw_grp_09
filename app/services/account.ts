import { clearRewardsForEmail } from './rewards';
import { clearWalletData } from './wallet';
import { purgeBlockedReferences } from './blocked-users';
import { purgeFeedbackForEmail } from './passenger-feedback';
import { purgeMessagesForEmail } from './messages';
import { purgeReportsForEmail } from './reports';
import { purgeReviewsForEmail } from './reviews';
import { purgeNotificationsForEmail } from './notifications';
import { purgePurchasesForEmail } from './passes';
import { purgeUserRides } from './rides';
import { clearDriverSecurity } from './security';

export const deleteAccountData = (email: string | null | undefined) => {
  if (!email) return;
  const normalized = email.trim().toLowerCase();
  clearWalletData(normalized);
  purgeUserRides(normalized);
  purgeMessagesForEmail(normalized);
  purgeReviewsForEmail(normalized);
  purgeFeedbackForEmail(normalized);
  purgeReportsForEmail(normalized);
  purgePurchasesForEmail(normalized);
  purgeNotificationsForEmail(normalized);
  purgeBlockedReferences(normalized);
  clearDriverSecurity(normalized);
  clearRewardsForEmail(normalized);
};
