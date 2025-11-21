// app/sign-up.tsx
import { Redirect, router } from "expo-router";
import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Auth from "./services/auth";
import { useAuthSession } from "@/hooks/use-auth-session";
import { AppBackground } from "@/components/ui/app-background";
import { GradientBackground } from "@/components/ui/gradient-background";
import { GradientButton } from "@/components/ui/gradient-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Colors, Gradients, Radius, Spacing } from "./ui/theme";
import { pickProfileImage, pickProfileDocument, pickKycImage } from "./utils/image-picker";
import { getSampleKycImage } from "./utils/sample-images";
import {
  isStrongPassword,
  isStudentEmail,
  sanitizeEmail,
  sanitizeName,
} from "./validators"; // 👈 IMPORTANT

export default function SignUp() {
  const session = useAuthSession();
  const [emailRaw, setEmailRaw] = useState("");
  const [pwd, setPwd] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [pwdConfirm, setPwdConfirm] = useState("");
  const [showPwdConfirm, setShowPwdConfirm] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showRgpd, setShowRgpd] = useState(false);

  const email = useMemo(() => sanitizeEmail(emailRaw), [emailRaw]);
  const formattedName = useMemo(() => {
    const raw = emailRaw.split("@")[0] ?? "";
    if (!raw.trim()) return "Étudiant CampusRide";
    return sanitizeName(raw.replace(/[._-]+/g, " "));
  }, [emailRaw]);
  const errors = useMemo(() => {
    const e: Record<string, string> = {};
    if (!email) e.email = "E-mail requis";
    else if (!isStudentEmail(email)) e.email = "Utilise ton identifiant HE (ex. HE123456@students.ephec.be)";
    if (!pwd) e.pwd = "Mot de passe requis";
    else if (!isStrongPassword(pwd)) e.pwd = "Min. 8 caractères, 1 chiffre, 1 majuscule";
    if (!pwdConfirm) e.pwdConfirm = "Confirme ton mot de passe";
    else if (pwdConfirm !== pwd) e.pwdConfirm = "Les mots de passe ne correspondent pas";
    if (!acceptTerms) e.terms = "Accepte les conditions RGPD pour continuer.";
    return e;
  }, [formattedName, email, pwd, pwdConfirm, acceptTerms]);

  const isValid = Object.keys(errors).length === 0;
  const goToSignIn = () => router.push("/sign-in");

  const onSubmit = async () => {
    if (!isValid) {
      const firstError = Object.values(errors)[0] ?? "Vérifie tes informations.";
      return Alert.alert("Formulaire incomplet", firstError);
    }
    try {
      setLoading(true);
      // Create user
      await Auth.createUser({
        name: formattedName,
        email,
        password: pwd,
        passwordConfirmation: pwdConfirm,
        avatarUrl: '',
        idCardUrl: '',
        studentCardUrl: '',
        wantsDriver: false,
        wantsPassenger: true,
      });
      // Send verification
      await Auth.sendVerificationEmail(email);
      // Navigate to verification screen
      router.push({ pathname: '/verify-email', params: { email } } as any);
    } catch (err: any) {
      if (err?.code === "EMAIL_IN_USE") {
        Alert.alert("E-mail déjà utilisé", "Un compte existe déjà avec cette adresse universitaire.");
      } else if (err?.code === "INVALID_NAME") {
        Alert.alert("Nom invalide", "Renseigne ton nom et prénom pour finaliser ton inscription.");
      } else if (err?.code === "INVALID_ADDRESS") {
        Alert.alert("Adresse invalide", "Indique une adresse postale complète (rue, numéro, ville).");
      } else if (err?.code === "INVALID_PASSWORD") {
        Alert.alert("Mot de passe invalide", "Ton mot de passe doit respecter les règles de sécurité.");
      } else if (err?.code === "PASSWORD_MISMATCH") {
        Alert.alert("Erreur", "Les mots de passe doivent être identiques.");
      } else {
        Alert.alert("Erreur", "Impossible de créer le compte pour le moment. Réessaie plus tard.");
      }
    } finally {
      setLoading(false);
    }
  };

  if (session.email && session.verified) {
    return <Redirect href="/" />;
  }

  if (session.email && !session.verified) {
    return <Redirect href={{ pathname: "/verify-email", params: { email: session.email } }} />;
  }

  return (
    <AppBackground style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.select({ ios: "padding", android: undefined })}
        style={styles.keyboard}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.hero}>
            <View style={styles.heroBadge}>
              <IconSymbol name="graduationcap.fill" size={18} color={Colors.secondary} />
              <IconSymbol name="car.fill" size={18} color={Colors.primary} />
            </View>
            <Text style={styles.heroTitle}>Bonjour</Text>
            <Text style={styles.heroSubtitle}>
              Crée ton compte pour rejoindre CampusRide et organiser tes trajets en toute sérénité.
            </Text>
          </View>

          <View style={styles.formWrapper}>
          <GradientBackground colors={Gradients.card} style={styles.card}>
          <Text style={[styles.title, { color: Colors.ink }]}>Créer un compte</Text>
          <Text style={styles.subtitle}>
            Accède aux trajets des étudiants, réserve en un clic et partage tes covoiturages en toute
            sécurité.
          </Text>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>E-mail universitaire</Text>
            <TextInput
              placeholder="HE123456@students.ephec.be"
              value={emailRaw}
              onChangeText={setEmailRaw}
              autoCapitalize="none"
              keyboardType="email-address"
              inputMode="email"
              style={[styles.input, errors.email && styles.inputError]}
              placeholderTextColor={Colors.gray500}
              returnKeyType="next"
            />
            {errors.email ? (
              <Text style={styles.error}>{errors.email}</Text>
            ) : (
              <Text style={styles.hint}>Entre ton matricule HE suivi de @students.ephec.be</Text>
            )}
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Créez mon mot de passe</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                placeholder="Créer le mot de passe"
                value={pwd}
                onChangeText={setPwd}
                secureTextEntry={!showPwd}
                style={[styles.input, errors.pwd && styles.inputError, { paddingRight: 90 }]}
                placeholderTextColor={Colors.gray500}
                returnKeyType="done"
              />
              <Pressable style={styles.togglePwd} onPress={() => setShowPwd((s) => !s)}>
                <Text style={styles.togglePwdText}>{showPwd ? "Masquer" : "Afficher"}</Text>
              </Pressable>
            </View>
            <Text style={styles.passwordHint}>* Min. 8 caractères, 1 chiffre, 1 majuscule</Text>
            {errors.pwd ? <Text style={styles.error}>{errors.pwd}</Text> : null}
          </View>
          <View style={styles.fieldGroup}>
            <Text style={styles.label}>Confirmez votre mot de passe</Text>
            <View style={styles.passwordWrapper}>
              <TextInput
                placeholder="Confirme le mot de passe"
                value={pwdConfirm}
                onChangeText={setPwdConfirm}
                secureTextEntry={!showPwdConfirm}
                style={[styles.input, errors.pwdConfirm && styles.inputError, { paddingRight: 90 }]}
                placeholderTextColor={Colors.gray500}
                autoCapitalize="none"
              />
              <Pressable style={styles.togglePwd} onPress={() => setShowPwdConfirm((s) => !s)}>
                <Text style={styles.togglePwdText}>{showPwdConfirm ? "Masquer" : "Afficher"}</Text>
              </Pressable>
            </View>
            {errors.pwdConfirm ? <Text style={styles.error}>{errors.pwdConfirm}</Text> : null}
          </View>

          <View style={styles.termsRow}>
            <Pressable
              onPress={() => setAcceptTerms((prev) => !prev)}
              style={[styles.checkbox, acceptTerms && styles.checkboxChecked]}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: acceptTerms }}
            >
              {acceptTerms ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </Pressable>
            <Text style={[styles.termsText, errors.terms && styles.termsTextError]}>
              Je confirme avoir lu et accepté le traitement de mes données dans le cadre du{' '}
              <Text style={styles.termsLink} onPress={() => setShowRgpd(true)}>
                RGPD (voir la politique complète)
              </Text>
              .
            </Text>
          </View>
          {errors.terms ? <Text style={styles.error}>{errors.terms}</Text> : null}

          <Modal
            visible={showRgpd}
            animationType="slide"
            transparent
            onRequestClose={() => setShowRgpd(false)}
          >
            <View style={styles.rgpdOverlay}>
              <View style={styles.rgpdCard}>
                <View style={styles.rgpdHeader}>
                  <View style={styles.rgpdBadge}>
                    <IconSymbol name="lock.shield.fill" size={18} color={Colors.primary} />
                    <Text style={styles.rgpdBadgeText}>Protection des données</Text>
                  </View>
                  <Pressable onPress={() => setShowRgpd(false)} hitSlop={12}>
                    <Text style={styles.rgpdClose}>Fermer</Text>
                  </Pressable>
                </View>
                <Text style={styles.rgpdTitle}>Politique RGPD CampusRide</Text>
                <Text style={styles.rgpdSubtitle}>
                  Voici l’essentiel sur la façon dont nous protégeons tes informations personnelles en Belgique.
                </Text>
                <ScrollView contentContainerStyle={styles.rgpdContent} showsVerticalScrollIndicator={false}>
                  {RGPD_SECTIONS.map((section) => (
                    <View key={section.title} style={styles.rgpdSection}>
                      <Text style={styles.rgpdSectionTitle}>{section.title}</Text>
                      <Text style={styles.rgpdText}>{section.body}</Text>
                    </View>
                  ))}
                </ScrollView>
                <Pressable style={styles.rgpdAction} onPress={() => setShowRgpd(false)}>
                  <Text style={styles.rgpdActionText}>J’ai compris</Text>
                </Pressable>
              </View>
            </View>
          </Modal>

          <GradientButton
            title="S’inscrire"
            onPress={onSubmit}
            disabled={!isValid || loading}
            style={styles.cta}
            textStyle={styles.ctaText}
            accessibilityRole="button"
            fullWidth
          >
            {loading ? <ActivityIndicator color="#fff" /> : null}
          </GradientButton>
          <Text style={styles.switchAuth}>
            Vous avez déjà un compte ?{" "}
            <Text style={styles.switchLink} onPress={goToSignIn}>
              Connectez-vous
            </Text>
          </Text>
          </GradientBackground>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </AppBackground>
  );
}

const RGPD_SECTIONS = [
  {
    title: '1. Responsable du traitement',
    body:
      "CampusRide SRL — Rue des Étudiants 42, 1050 Bruxelles, Belgique — assure la gestion de tes données. " +
      "Pour toute question ou exercice de droits, écris à privacy@campusride.app (notre délégué à la protection des données).",
  },
  {
    title: '2. Finalités et bases légales',
    body:
      "Nous traitons uniquement les informations nécessaires pour : (i) créer et gérer ton compte étudiant " +
      "(base contractuelle), (ii) vérifier ton identité et sécuriser les trajets (obligation légale/intérêt légitime), " +
      "(iii) mettre en relation conducteurs et passagers et gérer les paiements (exécution du contrat), " +
      "(iv) assurer l’assistance, la lutte contre la fraude et l’envoi de communications opt-in (intérêt légitime ou consentement).",
  },
  {
    title: '3. Données collectées',
    body:
      "Email universitaire, mot de passe, préférences conducteur/passager, trajets, avis, messages, historique wallet et, " +
      "lorsque tu décides de devenir conducteur vérifié, les documents nécessaires (carte d’identité, carte étudiante, permis, selfie).",
  },
  {
    title: '4. Destinataires et sous-traitants',
    body:
      "Seules nos équipes habilitées (support, modération, finance) et des prestataires européens conformes RGPD " +
      "(hébergement, email transactionnel, paiement, analytics) accèdent à tes données. Des clauses contractuelles strictes sont en place.",
  },
  {
    title: '5. Durées de conservation',
    body:
      "Compte inactif : anonymisation après 24 mois. Documents de vérification : suppression 24 mois après validation ou sur demande. " +
      "Logs techniques : 6 mois. Données comptables : 7 ans (obligation légale). Conversations et avis : conservés tant que le compte existe ou anonymisés sous 12 mois après suppression.",
  },
  {
    title: '6. Transferts hors UE',
    body:
      "Les serveurs sont en Europe. Si un transfert hors UE est nécessaire, nous utilisons les Clauses Contractuelles Types " +
      "et évaluons les garanties supplémentaires pour protéger tes données.",
  },
  {
    title: '7. Tes droits',
    body:
      "Accès, rectification, effacement, limitation, opposition, portabilité, retrait de consentement, directives post-mortem. " +
      "Réponse sous 30 jours : privacy@campusride.app. Tu peux aussi contacter l’Autorité de Protection des Données (APD) — Rue de la Presse 35, 1000 Bruxelles.",
  },
  {
    title: '8. Sécurité',
    body:
      "Chiffrement TLS/AES, contrôle d’accès strict, journalisation, revues régulières et plan de réponse aux incidents. " +
      "Toute violation pertinente est notifiée aux utilisateurs et à l’APD conformément aux articles 33 et 34 du RGPD.",
  },
  {
    title: '9. Public visé',
    body:
      "CampusRide est réservé aux étudiants majeurs. Toute inscription frauduleuse ou non autorisée est supprimée.",
  },
  {
    title: '10. Mises à jour',
    body:
      "Nous pouvons adapter cette politique (nouveaux services, obligations légales). Tu seras informé via l’app ou par email en cas de changement majeur. " +
      "Archive disponible sur demande.",
  },
];

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: 'transparent' },
  keyboard: { flex: 1 },
  scroll: { flexGrow: 1, padding: 28, paddingBottom: 40, gap: 24 },
  hero: {
    alignItems: "center",
    gap: 12,
    marginTop: Spacing.md,
  },
  heroBadge: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
    backgroundColor: "rgba(255,255,255,0.25)",
  },
  heroTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: Colors.white,
  },
  heroSubtitle: {
    color: Colors.white,
    textAlign: "center",
    lineHeight: 20,
  },
  formWrapper: {
    borderRadius: 28,
    backgroundColor: "rgba(255,255,255,0.15)",
    padding: 2,
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 10 },
  },
  card: {
    borderRadius: 22,
    padding: 24,
    gap: 18,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "transparent",
  },
  title: { fontSize: 28, fontWeight: "800" },
  subtitle: { color: Colors.gray700, fontSize: 14, lineHeight: 20 },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: "700", color: Colors.ink, textTransform: "uppercase" },
  input: {
    borderWidth: 1,
    borderColor: Colors.gray200,
    borderRadius: 12,
    padding: 14,
    fontSize: 16,
    backgroundColor: Colors.gray100,
    color: Colors.ink,
  },
  inputError: { borderColor: Colors.danger },
  passwordWrapper: { position: "relative" },
  togglePwd: { position: "absolute", right: 12, top: 12, paddingHorizontal: 8, paddingVertical: 6 },
  togglePwdText: { color: Colors.primary, fontSize: 13, fontWeight: "700" },
  error: { color: Colors.danger, fontSize: 12 },
  hint: { color: Colors.gray500, fontSize: 12 },
  passwordHint: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  cta: { marginTop: 12 },
  ctaText: { fontSize: 16, fontWeight: "800" },
  switchAuth: {
    marginTop: Spacing.md,
    textAlign: "center",
    color: Colors.gray600,
    fontSize: 13,
  },
  switchLink: {
    color: Colors.primary,
    fontWeight: "700",
  },
  termsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 8,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: Colors.gray300,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.gray100,
  },
  checkboxChecked: {
    borderColor: Colors.primary,
    backgroundColor: Colors.primaryLight,
  },
  checkboxMark: {
    color: Colors.primaryDark,
    fontWeight: "800",
    fontSize: 13,
  },
  termsText: {
    flex: 1,
    color: Colors.gray600,
    fontSize: 12,
    lineHeight: 16,
  },
  termsTextError: {
    color: Colors.danger,
  },
  termsLink: {
    color: Colors.primary,
    fontWeight: "700",
  },
  rgpdOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "flex-end",
    padding: Spacing.lg,
  },
  rgpdCard: {
    backgroundColor: Colors.card,
    borderRadius: 28,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.lg,
    paddingBottom: Spacing.xl,
    maxHeight: "85%",
    width: "100%",
    alignSelf: "center",
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
    gap: Spacing.md,
  },
  rgpdHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  rgpdBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.gray150,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.xs,
    borderRadius: Radius.pill,
  },
  rgpdBadgeText: {
    color: Colors.gray700,
    fontWeight: "700",
    fontSize: 12,
  },
  rgpdTitle: {
    fontSize: 20,
    fontWeight: "800",
    color: Colors.ink,
  },
  rgpdSubtitle: {
    color: Colors.gray600,
    lineHeight: 20,
    fontSize: 13,
  },
  rgpdClose: {
    color: Colors.primary,
    fontWeight: "700",
  },
  rgpdContent: {
    paddingVertical: Spacing.sm,
    gap: Spacing.md,
  },
  rgpdSection: {
    gap: Spacing.xs,
    marginBottom: Spacing.md,
  },
  rgpdSectionTitle: {
    fontWeight: "700",
    color: Colors.ink,
    fontSize: 15,
  },
  rgpdText: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.gray700,
  },
  rgpdAction: {
    marginTop: Spacing.sm,
    alignSelf: "stretch",
    backgroundColor: Colors.primary,
    borderRadius: Radius.pill,
    paddingVertical: Spacing.md,
    alignItems: "center",
  },
  rgpdActionText: {
    color: Colors.white,
    fontWeight: "700",
    fontSize: 15,
  },
});
