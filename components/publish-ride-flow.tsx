import { ReactNode, useState } from 'react';
import {
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from 'react-native';

import { Colors, Radius, Spacing } from '@/app/ui/theme';

type FlowScreen =
  | 'welcome'
  | 'signup'
  | 'verification'
  | 'activated'
  | 'complete-profile'
  | 'role-choice'
  | 'driver-security'
  | 'account-complete'
  | 'home'
  | 'profile';

type FlowName = {
  firstName: string;
  lastName: string;
};

type FlowProps = {
  style?: StyleProp<ViewStyle>;
};

type SlideProps = {
  title: string;
  description: string;
  children?: ReactNode;
  primaryLabel: string;
  onPrimary: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
};

const flowOrder: FlowScreen[] = [
  'welcome',
  'signup',
  'verification',
  'activated',
  'complete-profile',
  'role-choice',
  'driver-security',
  'account-complete',
  'home',
  'profile',
];

export function PublishRideFlowPreview({ style }: FlowProps) {
  const [currentScreen, setCurrentScreen] = useState<FlowScreen>('welcome');
  const [userRole, setUserRole] = useState<'passenger' | 'driver'>('passenger');
  const [userName, setUserName] = useState<FlowName>({ firstName: 'Eva', lastName: 'AZOUZI' });

  const progressIndex = flowOrder.indexOf(currentScreen);
  const goTo = (screen: FlowScreen) => setCurrentScreen(screen);
  const goBack = () => {
    if (progressIndex <= 0) return;
    setCurrentScreen(flowOrder[progressIndex - 1]);
  };

  const updateFirstName = (firstName: string) => setUserName((prev) => ({ ...prev, firstName }));
  const updateLastName = (lastName: string) => setUserName((prev) => ({ ...prev, lastName }));
  const canGoBack = progressIndex > 0;
  const commonSecondary = canGoBack ? { secondaryLabel: 'Retour', onSecondary: goBack } : {};

  let slide: ReactNode = null;
  switch (currentScreen) {
    case 'welcome':
      slide = (
        <FlowSlide
          title="Bienvenue sur CampusRide"
          description="Découvre en accéléré les étapes avant de publier un trajet."
          primaryLabel="Commencer"
          onPrimary={() => goTo('signup')}
        >
          <Text style={styles.slideHint}>Interface mobile simulée 360×640 px</Text>
        </FlowSlide>
      );
      break;
    case 'signup':
      slide = (
        <FlowSlide
          title="Créer un compte"
          description="Inscris-toi avec ton e-mail étudiant et sécurise l’accès à l’app."
          primaryLabel="Vérifier mon e-mail"
          onPrimary={() => goTo('verification')}
          {...commonSecondary}
        />
      );
      break;
    case 'verification':
      slide = (
        <FlowSlide
          title="Vérification en cours"
          description="Un code arrive dans ta boîte mail. Entre-le pour activer ton accès."
          primaryLabel="J’ai reçu le code"
          onPrimary={() => goTo('activated')}
          {...commonSecondary}
        />
      );
      break;
    case 'activated':
      slide = (
        <FlowSlide
          title="Compte activé"
          description="Tout est prêt pour compléter ton profil conducteur."
          primaryLabel="Compléter mon profil"
          onPrimary={() => goTo('complete-profile')}
          {...commonSecondary}
        />
      );
      break;
    case 'complete-profile':
      slide = (
        <FlowSlide
          title="Profil conducteur"
          description="Renseigne ton identité pour rassurer les passagers."
          primaryLabel="Enregistrer"
          onPrimary={() => goTo('role-choice')}
          {...commonSecondary}
        >
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={userName.firstName}
              onChangeText={updateFirstName}
              placeholder="Prénom"
              placeholderTextColor={Colors.gray400}
            />
            <TextInput
              style={styles.input}
              value={userName.lastName}
              onChangeText={updateLastName}
              placeholder="Nom"
              placeholderTextColor={Colors.gray400}
            />
          </View>
        </FlowSlide>
      );
      break;
    case 'role-choice':
      slide = (
        <FlowSlide
          title="Choisis ton rôle"
          description="Tu peux être passager, conducteur ou les deux."
          primaryLabel="Continuer"
          onPrimary={() => goTo('driver-security')}
          {...commonSecondary}
        >
          <View style={styles.roleSelector}>
            {(['passenger', 'driver'] as const).map((role) => {
              const active = userRole === role;
              return (
                <Pressable
                  key={role}
                  style={[styles.rolePill, active && styles.rolePillActive]}
                  onPress={() => setUserRole(role)}
                >
                  <Text style={[styles.rolePillText, active && styles.rolePillTextActive]}>
                    {role === 'passenger' ? 'Passager' : 'Conducteur'}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </FlowSlide>
      );
      break;
    case 'driver-security':
      slide = (
        <FlowSlide
          title="Sécurité conducteur"
          description="Ajoute ton permis et ton véhicule pour publier tes trajets."
          primaryLabel="Envoyer mes documents"
          onPrimary={() => goTo('account-complete')}
          {...commonSecondary}
        >
          <Text style={styles.slideHint}>Pièce d’identité + permis + carte grise</Text>
        </FlowSlide>
      );
      break;
    case 'account-complete':
      slide = (
        <FlowSlide
          title="Compte prêt"
          description="Toutes les vérifications sont validées. Tu peux publier ton premier trajet."
          primaryLabel="Accéder au tableau de bord"
          onPrimary={() => goTo('home')}
          {...commonSecondary}
        />
      );
      break;
    case 'home':
      slide = (
        <FlowSlide
          title="Accueil conducteur"
          description={`Bonjour ${userName.firstName}, mode ${userRole === 'driver' ? 'conducteur' : 'passager'} activé.`}
          primaryLabel="Voir mon profil"
          onPrimary={() => goTo('profile')}
          {...commonSecondary}
        >
          <Text style={styles.slideHint}>Notifications, wallet et trajets récents s’affichent ici.</Text>
        </FlowSlide>
      );
      break;
    case 'profile':
      slide = (
        <FlowSlide
          title="Profil complet"
          description={`${userName.firstName} ${userName.lastName} peut désormais publier un trajet et gérer ses rôles.`}
          primaryLabel="Rejouer le parcours"
          onPrimary={() => goTo('welcome')}
          secondaryLabel="Retour accueil"
          onSecondary={() => goTo('home')}
        />
      );
      break;
    default:
      slide = null;
  }

  return (
    <View style={[styles.container, style]}>
      <View style={styles.headerSection}>
        <Text style={styles.sectionTitle}>Parcours “Publier un trajet”</Text>
        <Text style={styles.sectionSubtitle}>
          Visualise les écrans clés avant de proposer ton trajet aux autres étudiants.
        </Text>
      </View>
      <View style={styles.phoneShell}>
        <View style={styles.progressRow}>
          <Text style={styles.progressLabel}>Étape {progressIndex + 1}</Text>
          <Text style={styles.progressTotal}>/{flowOrder.length}</Text>
        </View>
        {slide}
      </View>
    </View>
  );
}

function FlowSlide({ title, description, children, primaryLabel, onPrimary, secondaryLabel, onSecondary }: SlideProps) {
  return (
    <View style={styles.slideContainer}>
      <Text style={styles.slideTitle}>{title}</Text>
      <Text style={styles.slideDescription}>{description}</Text>
      {children ? <View style={styles.slideContent}>{children}</View> : null}
      <View style={styles.slideActions}>
        {onSecondary ? (
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={onSecondary}>
            <Text style={styles.secondaryButtonLabel}>{secondaryLabel ?? 'Retour'}</Text>
          </Pressable>
        ) : null}
        <Pressable style={[styles.button, styles.primaryButton]} onPress={onPrimary}>
          <Text style={styles.primaryButtonLabel}>{primaryLabel}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: Spacing.md,
  },
  headerSection: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: Colors.ink,
  },
  sectionSubtitle: {
    color: Colors.gray600,
    lineHeight: 20,
  },
  phoneShell: {
    alignSelf: 'center',
    width: 320,
    maxWidth: '100%',
    minHeight: 520,
    borderRadius: 28,
    padding: Spacing.lg,
    backgroundColor: Colors.card,
    shadowColor: 'rgba(15, 23, 42, 0.2)',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 12 },
    elevation: 8,
    gap: Spacing.md,
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.xs,
  },
  progressLabel: {
    fontWeight: '700',
    color: Colors.secondary,
  },
  progressTotal: {
    color: Colors.gray500,
    fontWeight: '600',
  },
  slideContainer: {
    flex: 1,
    gap: Spacing.md,
    justifyContent: 'center',
  },
  slideTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: Colors.ink,
    textAlign: 'center',
  },
  slideDescription: {
    textAlign: 'center',
    color: Colors.gray600,
    lineHeight: 20,
  },
  slideContent: {
    gap: Spacing.sm,
  },
  slideHint: {
    textAlign: 'center',
    color: Colors.gray500,
    fontSize: 12,
  },
  slideActions: {
    gap: Spacing.sm,
  },
  button: {
    borderRadius: Radius.md,
    paddingVertical: Spacing.sm,
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: Colors.primary,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontWeight: '800',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    backgroundColor: Colors.gray100,
  },
  secondaryButtonLabel: {
    color: Colors.gray700,
    fontWeight: '700',
  },
  inputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.sm,
    paddingVertical: Spacing.xs,
    color: Colors.ink,
    backgroundColor: '#fff',
  },
  roleSelector: {
    flexDirection: 'row',
    gap: Spacing.sm,
    justifyContent: 'center',
  },
  rolePill: {
    flex: 1,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.sm,
    borderWidth: 1,
    borderColor: Colors.gray200,
    alignItems: 'center',
  },
  rolePillActive: {
    backgroundColor: Colors.secondaryLight,
    borderColor: Colors.secondary,
  },
  rolePillText: {
    fontWeight: '700',
    color: Colors.gray600,
  },
  rolePillTextActive: {
    color: Colors.secondaryDark,
  },
});
