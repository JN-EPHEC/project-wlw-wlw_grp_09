// app/sign-up.tsx
import { Redirect, router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";

import * as Auth from "./services/auth"; // <= on utilise ton service Firebase
import { useAuthSession } from "@/hooks/use-auth-session";
import { savePassenger } from "@/src/firestoreUsers";

import { AppBackground } from "@/components/ui/app-background";
import { GradientBackground } from "@/components/ui/gradient-background";
import { GradientButton } from "@/components/ui/gradient-button";
import { IconSymbol } from "@/components/ui/icon-symbol";
import PrivacyPolicyModal from "@/components/privacy-policy-modal";

import { Colors, Gradients, Radius, Spacing } from "./ui/theme";
import {
  isStrongPassword,
  isStudentEmail,
  sanitizeEmail,
  sanitizeName,
} from "./validators";

// --------------------------------------------------
// ÉCRAN D’INSCRIPTION
// --------------------------------------------------
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
  const [emailTouched, setEmailTouched] = useState(false);
  const [pwdTouched, setPwdTouched] = useState(false);
  const [pwdConfirmTouched, setPwdConfirmTouched] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // e-mail nettoyé
  const email = useMemo(() => sanitizeEmail(emailRaw), [emailRaw]);

  // Nom auto à partir de l’e-mail (ex: he123456 → “Étudiant CampusRide”)
  const formattedName = useMemo(() => {
    const raw = emailRaw.split("@")[0] ?? "";
    if (!raw.trim()) return "Étudiant CampusRide";
    return sanitizeName(raw.replace(/[._-]+/g, " "));
  }, [emailRaw]);

  const autoNames = useMemo(() => {
    const safe = formattedName.trim();
    if (!safe) {
      return { firstName: "Étudiant", lastName: "CampusRide" };
    }
    const [first, ...rest] = safe.split(/\s+/);
    const last = rest.join(" ").trim();
    return {
      firstName: first || "Étudiant",
      lastName: last || "CampusRide",
    };
  }, [formattedName]);

  // ---------------- VALIDATION ----------------
  const errors = useMemo(() => {
    const e: Record<string, string> = {};

    if (!email) e.email = "E-mail requis";
    else if (!isStudentEmail(email))
      e.email = "Utilise ton identifiant HE (ex. HE123456@students.ephec.be)";

    if (!pwd) {
      e.pwd = "Mot de passe requis";
    } else if (!isStrongPassword(pwd)) {
      e.pwd = "Min. 8 caractères, 1 chiffre, 1 majuscule.";
    }

    if (!pwdConfirm) e.pwdConfirm = "Confirme ton mot de passe";
    else if (pwdConfirm !== pwd) e.pwdConfirm = "Les mots de passe ne correspondent pas";

    if (!acceptTerms) e.terms = "Tu dois accepter les conditions d’utilisation";

    return e;
  }, [email, pwd, pwdConfirm, acceptTerms]);

  const isValid = Object.keys(errors).length === 0;

  // ---------------- NAVIGATION ----------------
  const goToSignIn = () => router.push("/sign-in");

  const goBack = () => {
    try {
      router.back();
    } catch {
      router.push("/welcome");
    }
  };

  const resumeVerification = () => {
    if (!session.email) return;
    router.push({ pathname: "/verify-email", params: { email: session.email } } as any);
  };

  const resetPendingAccount = () => {
    Auth.signOut();
    setEmailRaw("");
    setPwd("");
    setPwdConfirm("");
    setEmailTouched(false);
    setPwdTouched(false);
    setPwdConfirmTouched(false);
    setSubmitted(false);
  };

  const pendingVerification = !!(session.email && !session.verified);
  const showEmailError = (emailTouched || submitted) && !!errors.email;
  const showPwdError = (pwdTouched || submitted) && !!errors.pwd;
  const showPwdConfirmError = (pwdConfirmTouched || submitted) && !!errors.pwdConfirm;

  useEffect(() => {
    if (pendingVerification && !emailRaw && session.email) {
      setEmailRaw(session.email);
    }
  }, [pendingVerification, session.email, emailRaw]);

  if (session.email && session.verified) {
    return <Redirect href="/" />;
  }

  // ---------------- SUBMIT ----------------
  const onSubmit = async () => {
    setSubmitted(true);
    if (!isValid) {
      const firstError = Object.values(errors)[0] ?? "Vérifie tes informations.";
      return Alert.alert("Formulaire incomplet", firstError);
    }

    try {
      setLoading(true);

      // 1. Création du compte + enregistrement dans Firestore
      const snapshot = await Auth.createUser({
        name: formattedName,
        email,
        password: pwd,
        passwordConfirmation: pwdConfirm,
        avatarUrl: "",
        idCardUrl: "",
        studentCardUrl: "",
        wantsDriver: false,
        wantsPassenger: true,
      });

      await savePassenger({
        firstName: autoNames.firstName,
        lastName: autoNames.lastName,
        email,
        phone: "",
        campus: "",
      });

      // 2. Envoi de l’e-mail de vérification Firebase
      await Auth.sendVerificationEmail();

      // 3. Redirection vers l’écran de vérification
      router.push({
        pathname: "/verify-email",
        params: { email: snapshot.email },
      } as any);
    } catch (err: any) {
      console.error("Sign-up error", err);
      switch (err?.code) {
        case "EMAIL_IN_USE":
          Alert.alert(
            "E-mail déjà utilisé",
            "Un compte existe déjà avec cette adresse universitaire."
          );
          break;
        case "INVALID_PASSWORD":
          Alert.alert(
            "Mot de passe invalide",
            "Ton mot de passe doit respecter les règles de sécurité."
          );
          break;
        case "PASSWORD_MISMATCH":
          Alert.alert("Erreur", "Les mots de passe doivent être identiques.");
          break;
        default:
          Alert.alert(
            "Erreur",
            "Impossible de créer le compte pour le moment. Réessaie plus tard."
          );
      }
    } finally {
      setLoading(false);
    }
  };

  // ---------------- RENDER ----------------
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
          {/* HEADER / HERO */}
          <View style={styles.hero}>
            <Image
              source={require("@/assets/images/logo.png")}
              style={styles.heroLogo}
              resizeMode="contain"
            />
            <Text style={styles.heroTitle}>Bonjour</Text>
            <Text style={styles.heroSubtitle}>
              Crée ton compte pour rejoindre CampusRide et organiser tes trajets en toute sérénité.
            </Text>
          </View>

          {/* CARTE / FORMULAIRE */}
          <View style={styles.formWrapper}>
            <GradientBackground colors={Gradients.card} style={styles.card}>
              <View style={styles.cardHeader}>
                <Pressable style={styles.backButton} onPress={goBack} hitSlop={12}>
                  <IconSymbol
                    name="chevron.left.circle.fill"
                    size={40}
                    color={Colors.primary}
                  />
                </Pressable>
                <Text style={[styles.title, { color: Colors.ink }]}>Créer un compte</Text>
              </View>

              {pendingVerification && (
                <View style={styles.pendingBanner}>
                  <Text style={styles.pendingTitle}>Vérification en attente</Text>
                  <Text style={styles.pendingText}>
                    {`Un code a été envoyé à ${session.email}. Reprends la vérification ou change d’adresse si nécessaire.`}
                  </Text>
                  <GradientButton
                    title="Reprendre la vérification"
                    size="sm"
                    onPress={resumeVerification}
                    accessibilityRole="button"
                    style={styles.pendingButton}
                  />
                  <Pressable
                    onPress={resetPendingAccount}
                    style={styles.pendingLink}
                    hitSlop={10}
                  >
                    <Text style={styles.pendingLinkText}>
                      Changer d’adresse e-mail
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* EMAIL */}
              <View className="field-group" style={styles.fieldGroup}>
                <Text style={styles.label}>E-mail universitaire</Text>
                <TextInput
                  placeholder="HE123456@students.ephec.be"
                  value={emailRaw}
                  onChangeText={(value) => {
                    setEmailRaw(value);
                    if (!emailTouched) setEmailTouched(true);
                  }}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  inputMode="email"
                  style={[styles.input, showEmailError && styles.inputError]}
                  placeholderTextColor={Colors.gray500}
                  returnKeyType="next"
                />
                {showEmailError ? (
                  <Text style={styles.error}>{errors.email}</Text>
                ) : (
                  <Text style={styles.hint}>
                    Entre ton matricule HE suivi de @students.ephec.be
                  </Text>
                )}
              </View>

              {/* MOT DE PASSE */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Crée ton mot de passe</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    placeholder="Créer le mot de passe"
                    value={pwd}
                    onChangeText={(value) => {
                      setPwd(value);
                      if (!pwdTouched) setPwdTouched(true);
                    }}
                    secureTextEntry={!showPwd}
                    style={[
                      styles.input,
                      showPwdError && styles.inputError,
                      { paddingRight: 90 },
                    ]}
                    placeholderTextColor={Colors.gray500}
                    returnKeyType="done"
                  />
                  <Pressable
                    style={styles.togglePwd}
                    onPress={() => setShowPwd((s) => !s)}
                  >
                    <Ionicons
                      name={showPwd ? "eye-off" : "eye"}
                      size={20}
                      color={Colors.primary}
                    />
                  </Pressable>
                </View>
                {showPwdError ? (
                  <Text style={styles.error}>{errors.pwd}</Text>
                ) : null}
              </View>

              {/* CONFIRMATION MOT DE PASSE */}
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Confirme ton mot de passe</Text>
                <View style={styles.passwordWrapper}>
                  <TextInput
                    placeholder="Confirme le mot de passe"
                    value={pwdConfirm}
                    onChangeText={(value) => {
                      setPwdConfirm(value);
                      if (!pwdConfirmTouched) setPwdConfirmTouched(true);
                    }}
                    secureTextEntry={!showPwdConfirm}
                    style={[
                      styles.input,
                      showPwdConfirmError && styles.inputError,
                      { paddingRight: 90 },
                    ]}
                    placeholderTextColor={Colors.gray500}
                    autoCapitalize="none"
                  />
                  <Pressable
                    style={styles.togglePwd}
                    onPress={() => setShowPwdConfirm((s) => !s)}
                  >
                    <Ionicons
                      name={showPwdConfirm ? "eye-off" : "eye"}
                      size={20}
                      color={Colors.primary}
                    />
                  </Pressable>
                </View>
                {showPwdConfirmError ? (
                  <Text style={styles.error}>{errors.pwdConfirm}</Text>
                ) : null}
              </View>

              {/* CONDITIONS / RGPD */}
              <View style={styles.termsRow}>
                <Pressable
                  onPress={() => setAcceptTerms((prev) => !prev)}
                  style={[
                    styles.checkbox,
                    acceptTerms && styles.checkboxChecked,
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: acceptTerms }}
                >
                  {acceptTerms ? (
                    <Text style={styles.checkboxMark}>✓</Text>
                  ) : null}
                </Pressable>
                <Text
                  style={[
                    styles.termsText,
                    submitted && errors.terms && styles.termsTextError,
                  ]}
                >
                  J'accepte les{" "}
                  <Text
                    style={styles.termsLink}
                    onPress={() => setShowRgpd(true)}
                  >
                    conditions générales d'utilisation
                  </Text>{" "}
                  et la{" "}
                  <Text
                    style={styles.rgpdLink}
                    onPress={() => setShowRgpd(true)}
                  >
                    politique de confidentialité
                  </Text>
                  .
                </Text>
              </View>
              {submitted && errors.terms ? (
                <Text style={styles.error}>{errors.terms}</Text>
              ) : null}

              {/* MODAL RGPD */}
              <PrivacyPolicyModal
                visible={showRgpd}
                onClose={() => setShowRgpd(false)}
              />

              {/* CTA */}
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


// ---------------- STYLES (inchangés) ----------------
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: "transparent" },
  keyboard: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingVertical: Spacing.xl,
    paddingHorizontal: Spacing.md,
    gap: Spacing.xxl,
    alignItems: "stretch",
  },
  hero: {
    alignItems: "center",
    gap: Spacing.md,
    marginTop: Spacing.lg,
  },
  heroLogo: {
    width: 84,
    height: 84,
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
    flex: 1,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.12)",
    padding: 2,
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  card: {
    flex: 1,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 28,
    gap: 20,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(255,255,255,0.35)",
    backgroundColor: "transparent",
  },
  cardHeader: {
    width: "100%",
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
  },
  pendingBanner: {
    borderWidth: 1,
    borderColor: Colors.secondary,
    backgroundColor: Colors.secondaryLight,
    borderRadius: 16,
    padding: Spacing.md,
    gap: 8,
  },
  pendingTitle: {
    fontWeight: "800",
    color: Colors.ink,
    fontSize: 16,
  },
  pendingText: {
    color: Colors.gray700,
    fontSize: 13,
    lineHeight: 18,
  },
  pendingButton: {
    alignSelf: "stretch",
  },
  pendingLink: {
    alignSelf: "flex-start",
    paddingVertical: 4,
  },
  pendingLinkText: {
    color: Colors.primaryDark,
    fontWeight: "700",
    fontSize: 13,
    textDecorationLine: "underline",
  },
  backButton: {
    padding: 4,
  },
  title: { fontSize: 32, fontWeight: "800" },
  subtitle: { color: Colors.gray700, fontSize: 16, lineHeight: 22 },
  fieldGroup: {
    gap: 6,
    marginBottom: Spacing.md,
  },
  label: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.ink,
    textTransform: "uppercase",
  },
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
  togglePwd: {
    position: "absolute",
    right: 12,
    top: 12,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  error: { color: Colors.danger, fontSize: 12 },
  hint: { color: Colors.gray500, fontSize: 12 },
  passwordHint: {
    color: Colors.danger,
    fontSize: 12,
    marginTop: 4,
  },
  cta: { marginTop: 8 },
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
  rgpdLink: {
    color: Colors.primaryDark,
    fontWeight: "700",
    textDecorationLine: "underline",
  },
});
